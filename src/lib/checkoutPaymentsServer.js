import { randomUUID } from 'node:crypto'
import { PaymentError, normalizeCustomer, cardReference, orderPayload, confirmedOrderState, pagarme, digest, subscriptionPlanPayload } from './pagarme.js'

import { loadOrderBumps, buildCheckoutCart, normalizeBumpSelection } from './checkoutCart.js'

async function result(query) {
  const { data, error } = await query
  if (error) throw new PaymentError('Não foi possível atualizar o registro do checkout.', 500)
  return data
}

function orderItemRecords(orderId, items) {
  return items.map(item => {
    const hash = digest([orderId, item.offer_id])
    const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`
    return { id, order_id: orderId, product_id: item.product_id, offer_id: item.offer_id, kind: item.kind, price_cents: item.subtotal_cents }
  })
}

export async function createPayment(db, input, key, tracking = null, { requireAddress = true } = {}) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key || '')) throw new PaymentError('Informe uma chave única de idempotência (16–100 caracteres).')
  const selection = normalizeBumpSelection(input.bumps)
  const offer = await result(db.from('offers').select('*').eq('id', input.offer_id).single())
  const product = await result(db.from('products').select('*').eq('id', offer.product_id).single())
  if ((product.marketplace_id || 'pagarme') !== 'pagarme') throw new PaymentError('Marketplace ainda não disponível para pagamentos.')
  if (!product.plan_id) throw new PaymentError('Vincule um plano do app antes de vender o produto.')
  const customer = normalizeCustomer(input.customer, { requireAddress: input.payment_method !== 'pix' || requireAddress })
  const billingAddress = { ...customer.address }
  for (const [field, limit] of [['street', 128], ['number', 32], ['district', 64]]) {
    const value = input.customer?.address?.[field]
    if (typeof value === 'string' && value.trim()) billingAddress[field] = value.trim().slice(0, limit)
  }
  const installments = input.installments ?? 1
  const available = selection.length ? await loadOrderBumps(db, offer.id) : []
  const { items, amount } = buildCheckoutCart(offer, product, available, selection, input.payment_method, installments)
  const card = input.payment_method === 'credit_card' ? cardReference(input) : null
  if (input.payment_method === 'pix' && (input.card || input.card_number || input.cvv)) throw new PaymentError('Não envie dados de cartão.')
  // A impressão digital impede que a mesma chave cobre outra oferta, valor ou cliente.
  const fingerprint = digest({ offer: offer.id, customer, payment_method: input.payment_method, installments, amount, card, items })
  const eventId = `checkout:${key}`
  let order = await result(db.from('orders').select('*').eq('event_id', eventId).maybeSingle())
  if (order) {
    if (!order.pagarme_order_id && Date.now() - new Date(order.created_at).getTime() > 23 * 3600000) throw new PaymentError('Pedido antigo sem confirmação. Concilie antes de tentar nova cobrança.', 409)
    const saved = await result(db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${key}`).maybeSingle())
    if (saved?.payload?.fingerprint !== fingerprint) throw new PaymentError('Esta chave já foi usada com outros dados.', 409)
    const existingItems = await result(db.from('order_items').select('offer_id,product_id,kind').eq('order_id', order.id))
    if (!existingItems?.length) await result(db.from('order_items').upsert(orderItemRecords(order.id, items), { onConflict: 'id', ignoreDuplicates: true }))
    else if (existingItems.length !== items.length || items.some(item => !existingItems.some(saved => saved.offer_id === item.offer_id && saved.product_id === item.product_id && saved.kind === item.kind))) throw new PaymentError('Os itens do pedido não correspondem à compra.', 409)
    if (order.pagarme_order_id) return syncPayment(db, order.id)
    if (product.type === 'subscription') {
      const sub = await result(db.from('subscriptions').select('*').eq('origin_order_id', order.id).maybeSingle())
      if (sub) return { order_id: order.id, subscription: sub, status: order.status }
    }
  } else {
    await result(db.from('customers').upsert({ email: customer.email, name: customer.name, document: customer.document, phone: `55${customer.phones.mobile_phone.area_code}${customer.phones.mobile_phone.number}`, billing_address: billingAddress }, { onConflict: 'email' }))
    const localCustomer = await result(db.from('customers').select('id').eq('email', customer.email).single())
    // A chave única no banco e a idempotência do gateway protegem tentativas concorrentes.
    const inserted = await db.from('orders').insert({ id: randomUUID(), event_id: eventId, customer_id: localCustomer.id, offer_id: offer.id, payment_method: input.payment_method, installments, ...amount }).select('*').single()
    if (inserted.error?.code === '23505') throw new PaymentError('Pedido em processamento. Repita com a mesma chave.', 409)
    if (inserted.error) throw new PaymentError('Não foi possível registrar o pedido.', 500)
    order = inserted.data
    await result(db.from('webhook_events').insert({ pagarme_event_id: `request:${key}`, type: 'checkout.request', payload: { fingerprint, items, tracking, gateway_base: process.env.PAGARME_BASE_URL || 'https://sdx-api.pagar.me/core/v5' }, processed_at: new Date().toISOString() }))
    await result(db.from('order_items').upsert(orderItemRecords(order.id, items), { onConflict: 'id', ignoreDuplicates: true }))
  }
  let gatewayCustomer = customer
  let gatewayCard = card
  if (card) {
    const local = await result(db.from('customers').select('id,pagarme_customer_id').eq('id', order.customer_id).single())
    let customerId = local.pagarme_customer_id
    if (!customerId) {
      const created = await pagarme('/customers', { method: 'POST', body: customer, idempotencyKey: `customer-${local.id}` })
      customerId = created.id
      await result(db.from('customers').update({ pagarme_customer_id: customerId }).eq('id', local.id))
    }
    // Carteira do gateway aceita o token com endereço; PAN e CVV nunca chegam aqui.
    const walletCard = await pagarme(`/customers/${customerId}/cards`, { method: 'POST', idempotencyKey: `card-${order.id}`, body: { token: card.card_token, billing_address: billingAddress } })
    gatewayCard = { card_id: walletCard.id }
    gatewayCustomer = { id: customerId }
  }
  const metadata = { local_order_id: order.id, offer_id: offer.id }
  if (product.type === 'subscription') {
    const planBody = subscriptionPlanPayload(offer, product)
    const plan = await pagarme('/plans', { method: 'POST', body: planBody, idempotencyKey: `plan-${digest(planBody)}` })
    const remote = await pagarme('/subscriptions', { method: 'POST', idempotencyKey: order.id, body: { code: order.id, plan_id: plan.id, payment_method: 'credit_card', customer_id: gatewayCustomer.id, ...gatewayCard, installments: 1, metadata } })
    const subscription = await result(db.from('subscriptions').upsert({ customer_id: order.customer_id, offer_id: offer.id, origin_order_id: order.id, pagarme_subscription_id: remote.id, status: remote.status === 'canceled' ? 'canceled' : 'active', current_period_end: remote.current_cycle?.end_at || null }, { onConflict: 'pagarme_subscription_id' }).select('*').single())
    // Assinatura ativa NÃO prova que a primeira cobrança foi paga.
    return { order_id: order.id, subscription, status: 'pending' }
  }
  const remote = await pagarme('/orders', { method: 'POST', idempotencyKey: order.id, body: orderPayload(order, offer, product, gatewayCustomer, gatewayCard, items) })
  const update = confirmedOrderState(remote, { ...order, email: customer.email })
  const saved = await result(db.from('orders').update(update).eq('id', order.id).is('pagarme_order_id', null).select('id'))
  // Um webhook pode ter conciliado antes de a resposta da criação chegar.
  if (!saved?.length) return syncPayment(db, order.id)
  return { order_id: order.id, ...update }
}

export async function syncPayment(db, id) {
  const order = await result(db.from('orders').select('*').eq('id', id).single())
  if (!order.pagarme_order_id) return { order_id: id, status: order.status }
  const customer = await result(db.from('customers').select('email').eq('id', order.customer_id).single())
  const remote = await pagarme(`/orders/${order.pagarme_order_id}`)
  const update = confirmedOrderState(remote, { ...order, email: customer.email })
  await result(db.from('orders').update(update).eq('id', id))
  return { order_id: id, ...update }
}

export async function manageSubscription(db, id, cancel = false) {
  const subscription = await result(db.from('subscriptions').select('*').eq('id', id).single())
  const remote = await pagarme(`/subscriptions/${subscription.pagarme_subscription_id}`, { method: cancel ? 'DELETE' : 'GET' })
  if (remote.id !== subscription.pagarme_subscription_id) throw new PaymentError('Assinatura não corresponde ao cadastro.', 409)
  const status = remote.status === 'canceled' ? 'canceled' : remote.status === 'active' ? 'active' : subscription.status
  return result(db.from('subscriptions').update({ status, current_period_end: remote.current_cycle?.end_at || subscription.current_period_end, canceled_at: remote.canceled_at || null }).eq('id', id).select('*').single())
}

export async function reconcileSubscriptionCharge(db, charge) {
  const subscriptionId = charge.invoice?.subscription_id || charge.invoice?.subscription?.id
  if (!subscriptionId) throw new PaymentError('Cobrança sem vínculo verificável com assinatura.', 409)
  const remote = await pagarme(`/subscriptions/${subscriptionId}`)
  const subscription = await result(db.from('subscriptions').select('*').eq('pagarme_subscription_id', subscriptionId).single())
  const origin = await result(db.from('orders').select('*').eq('id', subscription.origin_order_id).single())
  const customer = await result(db.from('customers').select('email').eq('id', subscription.customer_id).single())
  if (remote.code !== origin.id || charge.customer?.email?.toLowerCase() !== customer.email || remote.customer?.email?.toLowerCase() !== customer.email || charge.amount !== origin.total_cents) throw new PaymentError('Cobrança não corresponde à assinatura.', 409)
  const state = ({ paid: 'paid', failed: 'failed', canceled: 'canceled', refunded: 'refunded', chargedback: 'chargedback', pending: 'waiting_payment', processing: 'waiting_payment' })[charge.status] || 'pending'
  const update = { status: state, pagarme_charge_id: charge.id, ...(state === 'paid' ? { paid_at: charge.paid_at || charge.updated_at } : {}) }
  let order = await result(db.from('orders').select('*').eq('event_id', `cycle:${charge.id}`).maybeSingle())
  if (!order && (!origin.pagarme_charge_id || origin.pagarme_charge_id === charge.id)) {
    const claimed = await result(db.from('orders').update(update).eq('id', origin.id).or(`pagarme_charge_id.is.null,pagarme_charge_id.eq.${charge.id}`).select('*'))
    order = claimed?.[0]
  }
  if (!order) {
    const inserted = await db.from('orders').upsert({ customer_id: origin.customer_id, offer_id: origin.offer_id, parent_order_id: origin.id, event_id: `cycle:${charge.id}`, payment_method: 'credit_card', installments: 1, subtotal_cents: origin.subtotal_cents, total_cents: charge.amount, ...update }, { onConflict: 'event_id', ignoreDuplicates: true })
    if (inserted.error) throw new PaymentError('Falha ao registrar ciclo.', 500)
    order = await result(db.from('orders').select('*').eq('event_id', `cycle:${charge.id}`).single())
  }
  await result(db.from('orders').update(update).eq('id', order.id))
  await result(db.from('subscriptions').update({ status: remote.status === 'canceled' ? 'canceled' : state === 'failed' ? 'past_due' : 'active', current_period_end: remote.current_cycle?.end_at || null, canceled_at: remote.canceled_at || null }).eq('id', subscription.id))
  return { order_id: order.id, ...update }
}
