import { confirmedOrderState, pagarme, PaymentError } from './pagarme.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const pending = () => new PaymentError('Registro local ainda não disponível para conciliação.', 503)
async function checked(query) {
  const { data, error } = await query
  if (error) throw pending()
  return data
}

async function reconcileOrder(db, id, gateway) {
  if (!/^or_[a-zA-Z0-9]+$/.test(id || '')) throw pending()
  const remote = await gateway(`/orders/${id}`)
  if (remote.id !== id || !uuid.test(remote.code || '')) throw pending()
  let order = await checked(db.from('orders').select('*').eq('pagarme_order_id', id).maybeSingle())
  // O código vem da consulta autenticada à Pagar.me, nunca do corpo do webhook.
  if (!order) order = await checked(db.from('orders').select('*').eq('id', remote.code).maybeSingle())
  if (!order || !order.event_id?.startsWith('checkout:') || (order.pagarme_order_id && order.pagarme_order_id !== id)) throw pending()
  const customer = await checked(db.from('customers').select('email').eq('id', order.customer_id).single())
  if (!customer) throw pending()
  const update = confirmedOrderState(remote, { ...order, email: customer.email })
  let query = db.from('orders').update(update).eq('id', order.id)
  query = order.pagarme_order_id ? query.eq('pagarme_order_id', id) : query.is('pagarme_order_id', null)
  const updated = await checked(query.select('id'))
  if (!updated?.length) throw pending()
  return { order_id: order.id, ...update }
}

export async function reconcileWebhookResource(db, event, { gateway = pagarme, reconcileSubscriptionCharge } = {}) {
  if (event.type.startsWith('order.')) return reconcileOrder(db, event.data.id, gateway)
  if (event.type.startsWith('charge.')) {
    if (!/^ch_[a-zA-Z0-9]+$/.test(event.data.id)) throw pending()
    const charge = await gateway(`/charges/${event.data.id}`)
    if (charge.id !== event.data.id) throw pending()
    if (charge.invoice?.subscription_id || charge.invoice?.subscription?.id) {
      if (!reconcileSubscriptionCharge) throw pending()
      return reconcileSubscriptionCharge(db, charge)
    }
    if (!charge.order?.id) throw pending()
    return reconcileOrder(db, charge.order.id, gateway)
  }
  if (event.type.startsWith('subscription.')) {
    if (!/^sub_[a-zA-Z0-9]+$/.test(event.data.id)) throw pending()
    const remote = await gateway(`/subscriptions/${event.data.id}`)
    if (remote.id !== event.data.id) throw pending()
    const subscription = await checked(db.from('subscriptions').select('id,status').eq('pagarme_subscription_id', remote.id).maybeSingle())
    if (!subscription) throw pending()
    const status = remote.status === 'canceled' ? 'canceled' : remote.status === 'active' ? 'active' : subscription.status
    const updated = await checked(db.from('subscriptions').update({ status, current_period_end: remote.current_cycle?.end_at || null, canceled_at: remote.canceled_at || null }).eq('id', subscription.id).select('id'))
    if (!updated?.length) throw pending()
  }
  return null
}
