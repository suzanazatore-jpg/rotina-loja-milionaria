import { processOutboundWebhooks } from './checkoutOutboundServer.js'

// Apenas os webhooks do BotConversa que identificam a compra precisam preceder
// a mensagem de acesso. Outros destinos continuam na fila independente.
export function isProductTagDestination(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'new-backend.botconversa.com.br' &&
      url.pathname.startsWith('/api/v1/webhooks-automation/catch/')
  } catch { return false }
}

export async function ensureProductIdentification(db, orderId, { dispatch = processOutboundWebhooks } = {}) {
  // Todos os dados vêm da compra aprovada no servidor; nunca do navegador.
  const items = await db.from('order_items').select('product_id').eq('order_id', orderId)
  if (items.error || !Array.isArray(items.data) || !items.data.length) return { ready: false, reason: 'items_unavailable' }
  const purchased = new Set(items.data.map(item => item.product_id))
  const hooks = await db.from('outbound_webhooks').select('id,url,events,product_ids,active').eq('active', true)
  if (hooks.error || !Array.isArray(hooks.data)) return { ready: false, reason: 'hooks_unavailable' }
  const relevant = hooks.data.filter(hook =>
    hook.active && isProductTagDestination(hook.url) &&
    Array.isArray(hook.events) && hook.events.includes('order.paid') &&
    (hook.product_ids == null || hook.product_ids.some(productId => purchased.has(productId)))
  )
  if (!relevant.length) return { ready: true, reason: 'no_product_tag_hook' }

  const expected = relevant.map(hook => hook.id)
  const receipts = await db.from('webhook_deliveries')
    .select('id,webhook_id,status')
    .eq('order_id', orderId).eq('event_type', 'order.paid').in('webhook_id', expected)
  if (receipts.error || !Array.isArray(receipts.data)) return { ready: false, reason: 'receipts_unavailable' }
  if (!expected.every(id => receipts.data.some(receipt => receipt.webhook_id === id))) {
    return { ready: false, reason: 'product_tag_not_queued' }
  }
  const incomplete = receipts.data.filter(receipt => receipt.status !== 'delivered')
  if (incomplete.length) {
    // A fila continua como retentativa. Este envio prioritário usa as mesmas
    // proteções de idempotência, autenticação, ambiente e status do worker.
    try { await dispatch(db, { deliveryIds: incomplete.slice(0, 15).map(receipt => receipt.id) }) } catch { /* Fica na fila para retentativa. */ }
  }
  const final = await db.from('webhook_deliveries')
    .select('id,webhook_id,status')
    .eq('order_id', orderId).eq('event_type', 'order.paid').in('webhook_id', expected)
  if (final.error || !Array.isArray(final.data)) return { ready: false, reason: 'confirmation_unavailable' }
  return expected.every(id => final.data.some(receipt => receipt.webhook_id === id && receipt.status === 'delivered'))
    ? { ready: true, reason: 'product_tag_accepted' }
    : { ready: false, reason: 'product_tag_pending' }
}
