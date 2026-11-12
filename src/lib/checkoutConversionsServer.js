import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { purchaseAnalytics } from './checkoutAnalytics.js'

const hash = value => createHash('sha256').update(value).digest('hex')
export function matchingIdentifiers(input = {}) {
  const output = {}
  if (!input || typeof input !== 'object') return output
  for (const key of ['fbc', 'fbp']) if (typeof input[key] === 'string' && /^fb\.\d\.\d{10,13}\.[A-Za-z0-9._-]{1,350}$/.test(input[key])) output[key] = input[key]
  if (typeof input.client_ip_address === 'string' && isIP(input.client_ip_address)) output.client_ip_address = input.client_ip_address
  if (typeof input.client_user_agent === 'string' && input.client_user_agent.trim()) output.client_user_agent = input.client_user_agent.slice(0, 512)
  return output
}
export function purchaseRequestContext(request, input = {}, now = Date.now()) {
  const headers = request.headers
  const identifiers = matchingIdentifiers({
    client_ip_address: (headers.get('x-forwarded-for') || headers.get('x-real-ip') || '').split(',')[0].trim(),
    client_user_agent: headers.get('user-agent'),
    ...matchingIdentifiers({ fbc: input?.fbc, fbp: input?.fbp }),
  })
  const cookies = headers.get('cookie') || ''
  for (const key of ['fbc', 'fbp']) {
    const value = cookies.split(';').map(part => part.trim()).find(part => part.startsWith(`_${key}=`))?.slice(5)
    if (matchingIdentifiers({ [key]: value })[key]) identifiers[key] = value
  }
  if (/^[A-Za-z0-9_-]{1,350}$/.test(input?.fbclid || '') && Number.isSafeInteger(input?.click_time) && input.click_time <= now && input.click_time > now - 90 * 86400000) identifiers.fbc = `fb.1.${input.click_time}.${input.fbclid}`
  // Never use the payment webhook's IP or user agent as the buyer's identity.
  return identifiers
}
// A new paid purchase is reported independently of optional browser cookies.
// Keep the actual preference unchanged; do not invent cookie identifiers.
export function purchaseTracking({ pixelId, gatewayBase, sourceUrl, preference, identifiers = {} }) {
  return {
    policy: 'payment_approved_v2',
    consent: preference === 'granted' ? true : preference === 'denied' ? false : null,
    identifiers: preference === 'denied' ? {} : matchingIdentifiers(identifiers),
    pixel_id: pixelId, gateway_base: gatewayBase, source_url: sourceUrl,
  }
}
export function purchaseTrackingAllowed(tracking) {
  // Preserve historical eligibility. Only new v2 purchases use approval alone.
  return tracking?.policy === 'payment_approved_v2' || (tracking?.consent !== false && (tracking?.consent === true || tracking?.policy === 'payment_approved_v1'))
}
export function conversionConfiguration(pixelId, env = process.env) {
  if (!/^\d{5,30}$/.test(pixelId || '') || pixelId !== env.META_CAPI_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN) return null
  const version = env.META_GRAPH_API_VERSION || 'v25.0'
  if (!/^v\d{2}\.0$/.test(version)) return null
  const live = env.VERCEL_ENV === 'production' && env.CHECKOUT_CAPI_ENABLED === 'true' && env.PAGARME_BASE_URL === 'https://api.pagar.me/core/v5'
  const test = env.VERCEL_ENV !== 'production' && env.CHECKOUT_CAPI_TEST_ENABLED === 'true' && env.PAGARME_BASE_URL === 'https://sdx-api.pagar.me/core/v5' && /^[A-Za-z0-9_-]{1,100}$/.test(env.META_CAPI_TEST_EVENT_CODE || '')
  return live || test ? { version, token: env.META_CAPI_ACCESS_TOKEN, testCode: test ? env.META_CAPI_TEST_EVENT_CODE : null } : null
}
export function conversionEvent(order, snapshot, customer, now = Date.now()) {
  const purchase = purchaseAnalytics(order, snapshot?.items)
  const time = Math.floor(new Date(order.paid_at).getTime() / 1000)
  if (!purchase || !purchaseTrackingAllowed(snapshot?.tracking) || !Number.isFinite(time) || time > now / 1000 || time < now / 1000 - 7 * 86400) return null
  const email = String(customer?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  let phone = String(customer?.phone || '').replace(/\D/g, '')
  if ([10, 11].includes(phone.length)) phone = '55' + phone
  const user_data = { ...matchingIdentifiers(snapshot.tracking.identifiers), em: [hash(email)] }
  if (/^55\d{10,11}$/.test(phone)) user_data.ph = [hash(phone)]
  if (order.customer_id) user_data.external_id = [hash(String(order.customer_id))]
  return { event_name: 'Purchase', event_id: purchase.event_id, event_time: time, action_source: 'website', event_source_url: snapshot.tracking.source_url, user_data, custom_data: { currency: 'BRL', value: purchase.total_cents / 100, order_id: order.id, content_type: 'product', content_ids: purchase.items.map(item => item.item_id), contents: purchase.items.map(item => ({ id: item.item_id, quantity: 1, item_price: item.price_cents / 100 })) } }
}
export async function sendConversion(config, pixelId, event, fetcher = fetch) {
  const response = await fetcher(`https://graph.facebook.com/${config.version}/${pixelId}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: config.token, data: [event], ...(config.testCode ? { test_event_code: config.testCode } : {}) }), signal: AbortSignal.timeout(10000) })
  const receipt = await response.json()
  if (!response.ok || receipt.events_received !== 1) throw new Error('Conversão não confirmada pela Meta.')
}
// Analytics nunca interrompe a cobrança ou a liberação de acesso. Erros não guardam respostas nem tokens.
export async function deliverPaidConversion(db, orderId, { queueOnly = false } = {}) {
  const marker = `capi:${orderId}`
  try {
    const { data: order, error } = await db.from('orders').select('id,event_id,status,paid_at,total_cents,customer_id').eq('id', orderId).single()
    if (error || order?.status !== 'paid' || !order.event_id?.startsWith('checkout:')) return { status: 'skipped' }
    const saved = await db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${order.event_id.slice(9)}`).maybeSingle()
    if (saved.error) return { status: 'pending' }
    const snapshot = saved.data?.payload
    const pixelId = snapshot?.tracking?.pixel_id
    if (!purchaseTrackingAllowed(snapshot?.tracking) || snapshot.tracking.gateway_base !== process.env.PAGARME_BASE_URL) return { status: 'disabled' }
    // Persist a recoverable item even when a token is temporarily unavailable.
    const config = conversionConfiguration(pixelId)
    const queueConfig = conversionConfiguration(pixelId, { ...process.env, META_CAPI_ACCESS_TOKEN: 'configuration-check-only' })
    if (!queueConfig) return { status: 'disabled' }
    const customer = await db.from('customers').select('email,phone').eq('id', order.customer_id).single()
    if (customer.error) return { status: 'pending' }
    const event = conversionEvent(order, snapshot, customer.data)
    if (!event) return { status: 'skipped' }
    const inserted = await db.from('webhook_events').upsert({ pagarme_event_id: marker, type: 'checkout.capi', payload: { order_id: order.id, pixel_id: pixelId, event_id: event.event_id, mode: queueConfig.testCode ? 'test' : 'live' }, error: 'retry' }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true })
    if (inserted.error) return { status: 'pending' }
    if (queueOnly) return { status: 'queued' }
    if (!config) return { status: 'pending' }
    const lease = new Date().toISOString()
    const claimed = await db.from('webhook_events').update({ error: 'processing', received_at: lease }).eq('pagarme_event_id', marker).eq('error', 'retry').is('processed_at', null).select('id,payload')
    if (claimed.error || !claimed.data?.length) return { status: 'recorded' }
    const payload = claimed.data[0].payload || {}
    if (payload.next_attempt_at && new Date(payload.next_attempt_at).getTime() > Date.now()) {
      await db.from('webhook_events').update({ error: 'retry' }).eq('pagarme_event_id', marker).eq('error', 'processing').eq('received_at', lease)
      return { status: 'scheduled' }
    }
    const attempts = (Number(payload.attempts) || 0) + 1
    const attemptPayload = { ...payload, attempts, last_attempt_at: new Date().toISOString(), next_attempt_at: new Date(Date.now() + Math.min(86400, 300 * 2 ** (attempts - 1)) * 1000).toISOString() }
    const recorded = await db.from('webhook_events').update({ payload: attemptPayload }).eq('pagarme_event_id', marker).eq('error', 'processing').eq('received_at', lease)
    if (recorded.error) return { status: 'review_required' }
    try {
      await sendConversion(config, pixelId, event)
      const done = await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('pagarme_event_id', marker).eq('error', 'processing').eq('received_at', lease).select('id')
      return { status: done.error || !done.data?.length ? 'review_required' : 'sent' }
    } catch {
      await db.from('webhook_events').update({ error: attempts >= 8 ? 'review_required' : 'retry', received_at: new Date().toISOString() }).eq('pagarme_event_id', marker).eq('error', 'processing').eq('received_at', lease).is('processed_at', null)
      return { status: 'pending' }
    }
  } catch { return { status: 'pending' } }
}

// Reconcile only new approval-policy purchases, within a bounded recent window.
// Older snapshots are never rewritten or replayed on the basis of missing data.
export async function reconcileMissingConversions(db, deliver = deliverPaidConversion, now = Date.now()) {
  if (!conversionConfiguration(process.env.META_CAPI_PIXEL_ID, { ...process.env, META_CAPI_ACCESS_TOKEN: 'configuration-check-only' })) return { disabled: true, checked: 0, queued: 0 }
  const orders = await db.from('orders').select('id,event_id').eq('status', 'paid').like('event_id', 'checkout:%').gte('paid_at', new Date(now - 24 * 3600000).toISOString()).lte('paid_at', new Date(now).toISOString()).order('paid_at', { ascending: false }).limit(100)
  if (orders.error) throw new Error('Não foi possível conferir compras sem conversão.')
  if (!orders.data?.length) return { disabled: false, checked: 0, queued: 0 }
  const markers = orders.data.map(order => `capi:${order.id}`)
  const requests = orders.data.map(order => `request:${order.event_id.slice(9)}`)
  const recorded = await db.from('webhook_events').select('pagarme_event_id,payload').in('pagarme_event_id', [...markers, ...requests])
  if (recorded.error) throw new Error('Não foi possível conferir recibos de conversão.')
  const saved = new Map((recorded.data || []).map(row => [row.pagarme_event_id, row]))
  const missing = orders.data.filter(order => !saved.has(`capi:${order.id}`) && saved.get(`request:${order.event_id.slice(9)}`)?.payload?.tracking?.policy === 'payment_approved_v2').slice(0, 4)
  let queued = 0
  for (const order of missing) {
    const result = await deliver(db, order.id, { queueOnly: true })
    if (result.status === 'queued') queued++
  }
  return { disabled: false, checked: orders.data.length, queued }
}

export async function retryConversions(db, deliver = deliverPaidConversion, now = Date.now()) {
  if (!conversionConfiguration(process.env.META_CAPI_PIXEL_ID)) return { disabled: true, checked: 0, sent: 0 }
  // A terminated invocation must not own a conversion indefinitely. Never
  // recover an active lease or exceed the attempt cap after a crashed send.
  const stale = await db.from('webhook_events').select('pagarme_event_id,payload,received_at').eq('type', 'checkout.capi').eq('error', 'processing').is('processed_at', null).lte('received_at', new Date(now - 10 * 60000).toISOString()).limit(20)
  if (stale.error) throw new Error('Não foi possível consultar conversões interrompidas.')
  for (const row of stale.data || []) {
    const recovered = await db.from('webhook_events').update({ error: Number(row.payload?.attempts) >= 8 ? 'review_required' : 'retry' }).eq('pagarme_event_id', row.pagarme_event_id).eq('error', 'processing').eq('received_at', row.received_at).is('processed_at', null)
    if (recovered.error) throw new Error('Não foi possível recuperar a conversão interrompida.')
  }
  const { data, error } = await db.from('webhook_events').select('pagarme_event_id,payload').eq('type', 'checkout.capi').eq('error', 'retry').is('processed_at', null).order('received_at', { ascending: true }).limit(100)
  if (error) throw new Error('Não foi possível consultar a fila de conversões.')
  const due = (data || []).filter(row => !row.payload?.next_attempt_at || new Date(row.payload.next_attempt_at).getTime() <= now).slice(0, 4)
  let sent = 0
  for (const row of due) {
    const id = row.payload?.order_id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '') || row.pagarme_event_id !== `capi:${id}`) {
      await db.from('webhook_events').update({ error: 'review_required' }).eq('pagarme_event_id', row.pagarme_event_id).eq('error', 'retry')
      continue
    }
    const result = await deliver(db, id)
    if (result.status === 'sent') sent++
    if (result.status === 'skipped') await db.from('webhook_events').update({ error: 'ineligible' }).eq('pagarme_event_id', row.pagarme_event_id).eq('error', 'retry')
  }
  return { disabled: false, checked: due.length, sent }
}
