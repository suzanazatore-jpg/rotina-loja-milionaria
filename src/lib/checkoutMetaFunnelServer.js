import { createHash } from 'node:crypto'
import { sendConversion } from './checkoutConversionsServer.js'

// Callers derive the ID and event name from a signed visit or a verified gateway response.
export async function deliverFunnelEvent(db, config, pixel, event) {
  const key = 'meta:' + event.event_id
  const payload = { event_name: event.event_name, event_id: event.event_id, pixel_id: pixel, mode: config.testCode ? 'test' : 'live' }
  const saved = await db.from('webhook_events').insert({ pagarme_event_id: key, type: 'checkout.meta.funnel', payload, error: 'processing' })
  if (saved.error?.code === '23505') return
  if (saved.error) throw new Error('Registro da conversão indisponível.')
  try {
    await sendConversion(config, pixel, event)
  } catch {
    await db.from('webhook_events').update({ error: 'delivery_failed' }).eq('pagarme_event_id', key)
    throw new Error('Envio da conversão não confirmado.')
  }
  const result = await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('pagarme_event_id', key)
  if (result.error) throw new Error('Confirmação pendente.')
}

export function funnelEvent(name, id, url, identifiers, product, visitId) {
  return {
    event_name: name, event_id: id, event_time: Math.floor(Date.now() / 1000),
    action_source: 'website', event_source_url: url,
    user_data: { ...identifiers, external_id: [createHash('sha256').update(visitId).digest('hex')] },
    custom_data: { content_type: 'product', content_ids: [product.id] },
  }
}
