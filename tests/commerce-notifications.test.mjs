import test from 'node:test'
import assert from 'node:assert/strict'
import { notifyPaidOrder, notifyGuruCommerce, processCommercePush } from '../src/lib/commerceNotificationsServer.js'
import { commerceNotice, installationMessage, whatsappNumber, SALES_RECIPIENTS } from '../src/lib/commerceNotices.js'
import { installationAccountStatus, formatInstallationPhone } from '../src/lib/appInstallationStatus.js'
import { sendInstallationWhatsappBatch } from '../src/lib/appInstallationBulkServer.js'
import { installationReport, installationReportUser } from '../src/lib/appInstallationReportServer.js'

function fixture(status = 'paid', renewal = false) {
  const tables = {
    orders: [{ id: 'order', status, paid_at: '2026-11-14T12:00:00Z', offer_id: 'offer', customer_id: 'customer', total_cents: 79700, parent_order_id: renewal ? 'origin' : null }],
    commerce_notification_config: [{ id: true, activated_at: '2026-11-13T12:00:00Z' }],
    customers: [{ id: 'customer', profile_id: 'student', name: 'Ana Maria', email: 'ana@example.com' }],
    offers: [{ id: 'offer', product: { name: 'Clube da Loja Lucrativa' } }], order_items: [], user_notifications: [], webhook_events: [], perfis: [], app_user_activity: [], push_subscriptions: [], commerce_push_deliveries: [],
  }
  return { tables, from(table) {
    let filters = [], values, options, mutation, offset = 0, end = Infinity
    const q = {
      select() { return q }, eq(k, v) { filters.push(row => row[k] === v); return q },
      in(k, values) { filters.push(row => values.includes(row[k])); return q },
      insert(v) { values = v; options = { onConflict: 'id' }; return q },
      not(k, _op, v) { filters.push(row => (row[k] ?? null) !== v); return q },
      gte(k, v) { filters.push(row => row[k] >= v); return q },
      lte(k, v) { filters.push(row => row[k] <= v); return q },
      lt(k, v) { filters.push(row => row[k] < v); return q },
      order() { return q }, range(a, b) { offset = a; end = b + 1; return q }, limit(n) { end = n; return q },
      update(v) { mutation = v; return q },
      single() { q.one = true; return q }, maybeSingle() { q.one = true; return q },
      upsert(v, o) { values = v; options = o; return q },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (!tables[table]) throw Error('Unexpected table ' + table)
        if (values) {
          const keys = options.onConflict.split(',')
          for (const value of Array.isArray(values) ? values : [values]) if (!tables[table].some(row => keys.every(key => value[key] !== undefined && row[key] === value[key]))) tables[table].push({ id: `${table}-${tables[table].length}`, sent_at: new Date().toISOString(), created_at: new Date().toISOString(), ...(table === 'commerce_push_deliveries' ? { status: 'pending', attempts: 0, next_attempt_at: new Date(0).toISOString() } : {}), ...value })
        }
        const rows = tables[table].filter(row => filters.every(f => f(row))).slice(offset, end)
        if (mutation) rows.forEach(row => Object.assign(row, mutation))
        return { data: structuredClone(q.one ? rows[0] || null : rows), error: null }
      }).then(resolve, reject) },
    }
    return q
  } }
}
test('confirmed sale reaches exactly the two verified accounts once despite retries', async () => {
  const saved = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production'
  try {
    const db = fixture()
    await Promise.all([notifyPaidOrder(db, 'order'), notifyPaidOrder(db, 'order')])
    assert.deepEqual(db.tables.user_notifications.map(row => row.user_id), SALES_RECIPIENTS)
    assert.equal(db.tables.user_notifications.length, 2)
    assert.match(db.tables.user_notifications[0].body, /Ana • Clube da Loja Lucrativa • R\$\s797,00/)
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})
test('push retries only failed devices; repeated workers do not resend successful deliveries', async () => {
  const saved = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production'
  try {
    const db = fixture()
    await notifyPaidOrder(db, 'order')
    db.tables.push_subscriptions.push(...SALES_RECIPIENTS.map((user_id, i) => ({ id: `device${i}`, user_id, active: true, endpoint: `https://push.example/${i}`, p256dh: 'key', auth: 'auth' })))
    const calls = []
    let fail = true
    const send = async sub => { calls.push(sub.endpoint); if (sub.endpoint.endsWith('/1') && fail) throw Error('temporary') }
    const first = await processCommercePush(db, send)
    assert.deepEqual(first, { sent: 1, failed: 1 })
    await processCommercePush(db, send)
    assert.equal(calls.length, 2)
    fail = false
    const retry = db.tables.commerce_push_deliveries.find(row => row.status === 'pending')
    retry.next_attempt_at = new Date(0).toISOString()
    await processCommercePush(db, send); await processCommercePush(db, send)
    assert.deepEqual(calls, ['https://push.example/0','https://push.example/1','https://push.example/1'])
    assert.ok(db.tables.commerce_push_deliveries.every(row => row.status === 'sent'))
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})
test('renewal notifies student and owners; first or additional purchase does not claim renewal', async () => {
  const saved = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production'
  try {
    const db = fixture('paid', true)
    await notifyPaidOrder(db, 'order'); await notifyPaidOrder(db, 'order')
    assert.equal(db.tables.user_notifications.length, 3)
    assert.match(db.tables.user_notifications.find(row => row.user_id === 'student').title, /Plano renovado/)
    assert.match(db.tables.user_notifications[0].title, /Renovação aprovada/)
    const sale = fixture(); await notifyPaidOrder(sale, 'order')
    assert.equal(sale.tables.user_notifications.some(row => row.user_id === 'student'), false)
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})
test('unpaid, historical and preview orders cannot notify', async () => {
  const saved = process.env.VERCEL_ENV
  try {
    process.env.VERCEL_ENV = 'production'
    for (const status of ['pending','waiting_payment','failed','refunded','chargedback']) {
      const db = fixture(status); await notifyPaidOrder(db, 'order'); assert.equal(db.tables.user_notifications.length, 0)
    }
    const db = fixture(); db.tables.orders[0].paid_at = '2026-11-12T00:00:00Z'
    await notifyPaidOrder(db, 'order'); assert.equal(db.tables.user_notifications.length, 0)
    process.env.VERCEL_ENV = 'preview'
    assert.equal((await notifyPaidOrder({ from() { throw Error('Must not read') } }, 'order')).status, 'preview_disabled')
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})
test('messages fit app limits and installation guide includes both operating systems', () => {
  const notice = commerceNotice({ total_cents: 999999999, parent_order_id: 'x' }, { name: 'A'.repeat(300) }, 'P'.repeat(500), true)
  assert.ok(notice.title.length <= 80); assert.ok(notice.body.length <= 240)
  const guide = installationMessage('Ana Maria')
  assert.match(guide, /Olá, Ana!/); assert.match(guide, /Android/); assert.match(guide, /iPhone/); assert.match(guide, /ícone criado/)
  assert.equal(whatsappNumber('(84) 99663-3020'), '5584996633020'); assert.equal(whatsappNumber('123'), null)
})
test('legacy Guru paid invoice is deduplicated and first invoice retry cannot become a renewal', async () => {
  const saved = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production'
  try {
    const db = fixture()
    const payload = { webhook_type: 'subscription', last_status: 'active', current_invoice: { id: 'invoice1', status: 'paid', value: 10000 }, subscriber: { name: 'Bia' }, product: { name: 'Assinatura' } }
    await notifyGuruCommerce(db, payload, 'student', false)
    await notifyGuruCommerce(db, payload, 'student', true)
    assert.equal(db.tables.user_notifications.length, 2)
    payload.current_invoice.id = 'invoice2'
    await notifyGuruCommerce(db, payload, 'student', true)
    assert.equal(db.tables.user_notifications.length, 5)
    assert.match(db.tables.user_notifications.at(-1).title, /Plano renovado/)
    payload.current_invoice.status = 'pending'; payload.current_invoice.id = 'invoice3'
    await notifyGuruCommerce(db, payload, 'student', true)
    assert.equal(db.tables.user_notifications.length, 5)
    payload.current_invoice.status = 'paid'; payload.source_system = 'central_vendas'
    await notifyGuruCommerce(db, payload, 'student', true)
    assert.equal(db.tables.user_notifications.length, 5)
  } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved }
})
test('installation report lists active students only and authorizes only the verified owners', async () => {
  const db = fixture()
  db.tables.profiles = [
    { id: 'active', role: 'student', status: 'active', name: 'Ativa' },
    { id: 'blocked', role: 'student', status: 'blocked', name: 'Bloqueada' },
    { id: 'admin', role: 'admin', status: 'active', name: 'Admin' },
  ]
  db.tables.app_installations = []; db.tables.app_install_reminders = []
  assert.deepEqual((await installationReport(db)).map(row => row.id), ['active'])
  const request = new Request('https://example.com', { headers: { authorization: 'Bearer verified-token' } })
  for (const id of SALES_RECIPIENTS) {
    db.auth = { getUser: async () => ({ data: { user: { id, email: 'owner@example.com' } } }) }
    assert.equal((await installationReportUser(request, db)).id, id)
  }
  db.auth = { getUser: async () => ({ data: { user: { id: 'student', email: 'student@example.com', user_metadata: { role: 'admin' } } } }) }
  assert.equal(await installationReportUser(request, db), null)
  assert.equal(await installationReportUser(new Request('https://example.com'), db), null)
})
test('financial eligibility excludes expired, overdue and refunded access without assuming unknown payment', () => {
  const profile = { status: 'active' }
  for (const status_assinatura of ['atrasado', 'reembolsado', 'cancelado', 'inadimplente']) assert.equal(installationAccountStatus(profile, { status_assinatura }, '2026-11-13').active, false)
  assert.equal(installationAccountStatus(profile, { status_assinatura: 'ativo', acesso_expira_em: '2026-11-12' }, '2026-11-13').active, false)
  assert.equal(installationAccountStatus(profile, { status_assinatura: 'ativo', acesso_expira_em: '2026-11-13' }, '2026-11-13').active, true)
  assert.equal(installationAccountStatus(profile, { status_assinatura: null }, '2026-11-13').financial_status, 'Sem informação')
  assert.equal(installationAccountStatus(profile, { status_assinatura: 'ativo' }, '2026-11-13').financial_status, 'Em dia')
  assert.equal(formatInstallationPhone('5584996633020'), '(84) 99663-3020')
})
test('WhatsApp batch contains only selected eligible people and duplicate sends are skipped', async () => {
  const previous = process.env.PABBLY_CAMPANHA_WEBHOOK_URL
  process.env.PABBLY_CAMPANHA_WEBHOOK_URL = 'https://example.com/test-hook'
  try {
    const db = fixture()
    const [selected, unrelated] = SALES_RECIPIENTS
    db.tables.profiles = [
      { id: selected, role: 'student', status: 'active', name: 'Selecionado', phone: '84996633020' },
      { id: unrelated, role: 'student', status: 'active', name: 'Não selecionada', phone: '84988199174' },
    ]
    db.tables.app_installations = []; db.tables.app_install_reminders = []
    const bodies = []
    const send = async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true } }
    const first = await sendInstallationWhatsappBatch(db, { id: 'admin' }, [selected], send)
    assert.equal(first.accepted, 1)
    assert.deepEqual(bodies[0].destinatarios.map(person => person.id), [selected])
    assert.equal(db.tables.app_install_reminders[0].channel, 'whatsapp')
    const again = await sendInstallationWhatsappBatch(db, { id: 'admin' }, [selected], send)
    assert.equal(again.accepted, 0); assert.equal(bodies.length, 1)
    db.tables.app_installations.push({ user_id: unrelated, evidence: 'admin_confirmed', confirmed_at: new Date().toISOString() })
    const installed = await sendInstallationWhatsappBatch(db, { id: 'admin' }, [unrelated], send)
    assert.equal(installed.accepted, 0); assert.equal(bodies.length, 1)
  } finally { if (previous === undefined) delete process.env.PABBLY_CAMPANHA_WEBHOOK_URL; else process.env.PABBLY_CAMPANHA_WEBHOOK_URL = previous }
})
