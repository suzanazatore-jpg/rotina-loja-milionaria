import { measurementAllowed } from './checkoutAnalytics.js'
export function purchaseAuditRows(orders, snapshots, deliveries, gatewayBase) {
  const requests = new Map(snapshots.map(row => [row.pagarme_event_id, row.payload]))
  const recorded = new Set(deliveries.filter(row => row.type === 'checkout.capi').map(row => row.payload?.order_id))
  return orders.flatMap(order => {
    if (recorded.has(order.id) || !order.event_id?.startsWith('checkout:')) return []
    const snapshot = requests.get('request:' + order.event_id.slice(9))
    if (!snapshot || (snapshot.gateway_base || snapshot.tracking?.gateway_base) !== gatewayBase) return []
    const status = !measurementAllowed(snapshot.tracking)
      ? 'Não enviado: sem autorização de rastreamento registrada'
      : 'Sem confirmação de envio: verificar configuração e processamento'
    return [{ event: 'Purchase', date: order.paid_at, order: order.id, status }]
  })
}
