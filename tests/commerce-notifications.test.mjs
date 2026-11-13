import test from 'node:test'
import assert from 'node:assert/strict'
import { notifyPaidOrder, notifyGuruCommerce } from '../src/lib/commerceNotificationsServer.js'
import { commerceNotice, installationMessage, whatsappNumber, SALES_RECIPIENTS } from '../src/lib/commerceNotices.js'

function fixture(status = 'paid', renewal = false) {
  const tables = {
    orders: [{ id: 'order', status, paid_at: '2026-11-14T12:00:00Z', offer_id: 'offer', customer_id: 'customer', total_cents: 79700, parent_order_id: renewal ? 'origin' : null }],
    commerce_notification_config: [{ id: true, activated_at: '2026-11-13T12:00:00Z' }],
    customers: [{ id: 'customer', profile_id: 'student', name: 'Ana Maria', email: 'ana@example.com' }],
    offers: [{ id: 'offer', product: { name: 'Clube da Loja Lucrativa' } }], order_items: [], user_notifications: [], webhook_events: [],
  }
  return { tables, from(table) {
    let filters = [], values, options
    const q = {
      select() { return q }, eq(k, v) { filters.push(row => row[k] === v); return q },
      single() { q.one = true; return q }, maybeSingle() { q.one = true; return q },
      upsert(v, o) { values = v; options = o; return q },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (!tables[table]) throw Error('Unexpected table ' + table)
        if (values) {
          const keys = options.onConflict.split(',')
          if (!tables[table].some(row => keys.every(key => row[key] === values[key]))) tables[table].push(values)
        }
        const rows = tables[table].filter(row => filters.every(f => f(row)))
        return { data: q.one ? rows[0] || null : rows, error: null }
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
