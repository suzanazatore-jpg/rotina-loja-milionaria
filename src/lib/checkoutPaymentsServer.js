import { randomUUID } from 'node:crypto'
import { PaymentError, calculatePayment, normalizeCustomer, cardReference, orderPayload, confirmedOrderState, pagarme, digest } from './pagarme.js'

async function result(query) {
  const { data, error } = await query
  if (error) throw new PaymentError('Não foi possível atualizar o registro do checkout.', 500)
  return data
}

export async function createPayment(db, input, key) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key || '')) throw new PaymentError('Informe uma chave única de idempotência (16–100 caracteres).')
  if (input.bumps?.length) throw new PaymentError('Adicionais serão conectados após a validação do pagamento principal.')
  const offer = await result(db.from('offers').select('*').eq('id', input.offer_id).single())
  const product = await result(db.from('products').select('*').eq('id', offer.product_id).single())
  if (!product.plan_id) throw new PaymentError('Vincule um plano do app antes de vender o produto.')
  const customer = normalizeCustomer(input.customer)
  const installments = input.installments ?? 1
  const amount = calculatePayment(offer, product, input.payment_method, installments)
  const card = input.payment_method === 'credit_card' ? cardReference(input) : null
  if (input.payment_method === 'pix' && (input.card || input.card_number || input.cvv)) throw new PaymentError('Não envie dados de cartão.')
  // A impressão digital impede que a mesma chave cobre outra oferta, valor ou cliente.
  const fingerprint = digest({ offer: offer.id, customer, payment_method: input.payment_method, installments, amount, card })
  const eventId = `checkout:${key}`
  let order = await result(db.from('orders').select('*').eq('event_id', eventId).maybeSingle())
  if (order) {
    if (!order.pagarme_order_id && Date.now() - new Date(order.created_at).getTime() > 23 * 3600000) throw new PaymentError('Pedido antigo sem confirmação. Concilie antes de tentar nova cobrança.', 409)
    const saved = await result(db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${key}`).maybeSingle())
    if (saved?.payload?.fingerprint !== fingerprint) throw new PaymentError('Esta chave já foi usada com outros dados.', 409)
    if (order.pagarme_order_id) return syncPayment(db, order.id)
    if (product.type === 'subscription') {
      const sub = await result(db.from('subscriptions').select('*').eq('origin_order_id', order.id).maybeSingle())
      if (sub) return { order_id: order.id, subscription: sub, status: order.status }
    }
  } else {
    const localCustomer = await result(db.from('customers').upsert({ email: customer.email, name: customer.name, document: customer.document, phone: `55${customer.phones.mobile_phone.area_code}${customer.phones.mobile_phone.number}` }, { onConflict: 'email' }).select('id').single())
    // A chave única no banco e a idempotência do gateway protegem tentativas concorrentes.
    const inserted = await db.from('orders').insert({ id: randomUUID(), event_id: eventId, customer_id: localCustomer.id, offer_id: offer.id, payment_method: input.payment_method, installments, ...amount }).select('*').single()
    if (inserted.error?.code === '23505') throw new PaymentError('Pedido em processamento. Repita com a mesma chave.', 409)
    if (inserted.error) throw new PaymentError('Não foi possível registrar o pedido.', 500)
    order = inserted.data
    await result(db.from('webhook_events').insert({ pagarme_event_id: `request:${key}`, type: 'checkout.request', payload: { fingerprint }, processed_at: new Date().toISOString() }))
    await result(db.from('order_items').insert({ order_id: order.id, product_id: product.id, offer_id: offer.id, kind: 'main', price_cents: amount.subtotal_cents }))
  }
  const metadata = { local_order_id: order.id, offer_id: offer.id }
  if (product.type === 'subscription') {
    const planBody = { name: `${product.name} — ${offer.name}`.slice(0,64), currency: 'BRL', interval: offer.billing_interval, interval_count: offer.billing_interval_count, billing_type: 'prepaid', payment_methods: ['credit_card'], installments: [1], trial_period_days: offer.trial_days || 0, items: [{ name: product.name.slice(0,64), quantity: 1, pricing_scheme: { scheme_type: 'unit', price: offer.price_cents } }] }
    const plan = await pagarme('/plans', { method: 'POST', body: planBody, idempotencyKey: `plan-${digest(planBody)}` })
    const remote = await pagarme('/subscriptions', { method: 'POST', idempotencyKey: order.id, body: { code: order.id, plan_id: plan.id, payment_method: 'credit_card', customer, ...card, installments: 1, metadata } })
    const subscription = await result(db.from('subscriptions').upsert({ customer_id: order.customer_id, offer_id: offer.id, origin_order_id: order.id, pagarme_subscription_id: remote.id, status: remote.status === 'canceled' ? 'canceled' : 'active', current_period_end: remote.current_cycle?.end_at || null }, { onConflict: 'pagarme_subscription_id' }).select('*').single())
    // Assinatura ativa NÃO prova que a primeira cobrança foi paga.
    return { order_id: order.id, subscription, status: 'pending' }
  }
  const remote = await pagarme('/orders', { method: 'POST', idempotencyKey: order.id, body: orderPayload(order, offer, product, customer, card) })
  const update = confirmedOrderState(remote, { ...order, email: customer.email })
  await result(db.from('orders').update(update).eq('id', order.id))
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
