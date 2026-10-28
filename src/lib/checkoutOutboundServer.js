import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { createHmac } from 'node:crypto'
import { isInternalAccessWebhook, webhookBody } from './checkoutWebhookPayload.js'

export function publicIPv4(address) {
  const parts = String(address).split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b, c] = parts
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
}

export async function sendWebhook(urlValue, payload, secret, deliveryId, resolver = lookup) {
  const url = new URL(urlValue)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('invalid_destination')
  const addresses = await resolver(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(row => !publicIPv4(row.address))) throw new Error('invalid_destination')
  const body = JSON.stringify(payload)
  if (Buffer.byteLength(body) > 65536) throw new Error('payload_too_large')
  // Fixa o IP validado na conexão, mantém TLS/SNI pelo domínio e recusa redirects.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'POST', agent: false, signal: AbortSignal.timeout(8000),
      lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address: addresses[0].address, family: 4 }]) : callback(null, addresses[0].address, 4),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Webhook-Id': deliveryId, 'X-Webhook-Signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` },
    }, response => {
      response.resume()
      resolve(response.statusCode)
    })
    req.on('error', reject)
    req.end(body)
  })
}

export async function processOutboundWebhooks(db, { sender = sendWebhook, env = process.env, now = Date.now() } = {}) {
  if (env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED !== 'true') return { disabled: true, sent: 0 }
  const mode = env.VERCEL_ENV === 'production' ? 'live' : 'test'
  const result = await db.from('webhook_deliveries').select('id,webhook_id,status,attempts,payload,outbound_webhooks!inner(active)').eq('outbound_webhooks.active', true).eq('payload->>environment', mode).in('status', ['pending', 'retry']).lte('next_attempt_at', new Date(now).toISOString()).order('next_attempt_at').limit(3)
  if (result.error) throw new Error('outbound_queue_unavailable')
  let sent = 0
  for (const row of result.data || []) {
    const hook = await db.from('outbound_webhooks').select('url,secret,active,payload_format,product_ids').eq('id', row.webhook_id).maybeSingle()
    if (hook.error || !hook.data?.active) continue
    if (isInternalAccessWebhook(hook.data.url)) continue
    // Nunca entrega um evento de teste a um destino real, nem um evento antigo de origem desconhecida.
    const mode = row.payload?.environment
    const live = mode === 'live' && env.VERCEL_ENV === 'production' && env.PAGARME_BASE_URL === 'https://api.pagar.me/core/v5'
    const test = mode === 'test' && env.VERCEL_ENV !== 'production' && env.CHECKOUT_OUTBOUND_TEST_ENABLED === 'true' && env.PAGARME_BASE_URL === 'https://sdx-api.pagar.me/core/v5'
    if (!live && !test) continue
    const claimed = await db.from('webhook_deliveries').update({ status: 'processing', attempts: row.attempts + 1 }).eq('id', row.id).eq('status', row.status).eq('attempts', row.attempts).select('id')
    if (claimed.error || !claimed.data?.length) continue
    let code = null
    try { code = await sender(hook.data.url, webhookBody(row.payload, hook.data.payload_format || 'native', env.GURU_ACCOUNT_TOKEN, hook.data.product_ids), hook.data.secret, row.id) } catch { /* Não salva respostas, URLs ou segredos em logs. */ }
    const ok = code >= 200 && code < 300
    const attempts = row.attempts + 1
    const update = ok ? { status: 'delivered', delivered_at: new Date(now).toISOString(), response_status: code, response_body: null } : { status: attempts >= 8 ? 'failed' : 'retry', response_status: code, response_body: null, next_attempt_at: new Date(now + Math.min(86400, 300 * 2 ** Math.min(attempts - 1, 9)) * 1000).toISOString() }
    const saved = await db.from('webhook_deliveries').update(update).eq('id', row.id).eq('status', 'processing').eq('attempts', attempts)
    if (saved.error) throw new Error('outbound_receipt_unavailable')
    if (ok) sent++
  }
  return { disabled: false, sent }
}
