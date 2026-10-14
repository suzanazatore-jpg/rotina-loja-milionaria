import { createHash } from 'node:crypto'
import { purchaseAnalytics } from './checkoutAnalytics.js'

const hash = value => createHash('sha256').update(value).digest('hex')
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
  if (!purchase || snapshot?.tracking?.consent !== true || !Number.isFinite(time) || time > now / 1000 || time < now / 1000 - 7 * 86400) return null
  const email = String(customer?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return { event_name: 'Purchase', event_id: purchase.event_id, event_time: time, action_source: 'website', event_source_url: snapshot.tracking.source_url, user_data: { em: [hash(email)] }, custom_data: { currency: 'BRL', value: purchase.total_cents / 100, order_id: order.id, content_type: 'product', content_ids: purchase.items.map(item => item.item_id), contents: purchase.items.map(item => ({ id: item.item_id, quantity: 1, item_price: item.price_cents / 100 })) } }
}
export async function sendConversion(config, pixelId, event, fetcher = fetch) {
  const response = await fetcher(`https://graph.facebook.com/${config.version}/${pixelId}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: config.token, data: [event], ...(config.testCode ? { test_event_code: config.testCode } : {}) }), signal: AbortSignal.timeout(10000) })
  const receipt = await response.json()
  if (!response.ok || receipt.events_received !== 1) throw new Error('Conversão não confirmada pela Meta.')
}
// Analytics nunca interrompe a cobrança ou a liberação de acesso. Erros não guardam respostas nem tokens.
export async function deliverPaidConversion(db, orderId) {
  const marker = `capi:${orderId}`
  try {
    const { data: order, error } = await db.from('orders').select('id,event_id,status,paid_at,total_cents,customer_id').eq('id', orderId).single()
    if (error || order?.status !== 'paid' || !order.event_id?.startsWith('checkout:')) return { status: 'skipped' }
    const saved = await db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${order.event_id.slice(9)}`).maybeSingle()
    if (saved.error) return { status: 'pending' }
    const snapshot = saved.data?.payload
    const pixelId = snapshot?.tracking?.pixel_id
    const config = conversionConfiguration(pixelId)
    if (!config || snapshot.tracking.consent !== true || snapshot.tracking.gateway_base !== process.env.PAGARME_BASE_URL) return { status: 'disabled' }
    const customer = await db.from('customers').select('email').eq('id', order.customer_id).single()
    if (customer.error) return { status: 'pending' }
    const event = conversionEvent(order, snapshot, customer.data)
    if (!event) return { status: 'skipped' }
    const inserted = await db.from('webhook_events').upsert({ pagarme_event_id: marker, type: 'checkout.capi', payload: { order_id: order.id, pixel_id: pixelId, event_id: event.event_id, mode: config.testCode ? 'test' : 'live' }, error: 'retry' }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true })
    if (inserted.error) return { status: 'pending' }
    const claimed = await db.from('webhook_events').update({ error: 'processing' }).eq('pagarme_event_id', marker).eq('error', 'retry').is('processed_at', null).select('id')
    if (claimed.error || !claimed.data?.length) return { status: 'recorded' }
    try {
      await sendConversion(config, pixelId, event)
      const done = await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('pagarme_event_id', marker)
      return { status: done.error ? 'review_required' : 'sent' }
    } catch {
      await db.from('webhook_events').update({ error: 'retry' }).eq('pagarme_event_id', marker).is('processed_at', null)
      return { status: 'pending' }
    }
  } catch { return { status: 'pending' } }
}
