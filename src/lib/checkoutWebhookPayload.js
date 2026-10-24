// Credenciais são acrescentadas na entrega, nunca gravadas na fila.
export function isInternalAccessWebhook(value) {
  try {
    const url = new URL(value)
    return url.pathname.replace(/\/$/, '') === '/api/webhook-guru' && (url.hostname === 'rotina.suzanazatorre.com.br' || url.hostname.startsWith('rotina-loja-milionaria') && url.hostname.endsWith('.vercel.app'))
  } catch { return false }
}

export function webhookBody(payload, format = 'native', token, productIds = null) {
  if (format === 'native') return payload
  if (format !== 'guru') throw new Error('unsupported_payload_format')
  if (!token) throw new Error('integration_token_missing')
  const money = cents => Number.isSafeInteger(cents) ? cents / 100 : null
  const producer = { name: 'Suzana Zatorre Educacional Ltda', marketplace_id: '1708027285', contact_email: null }
  const order = payload.order || {}, customer = payload.customer || {}, subscription = payload.subscription || {}
  const subscriptionEvent = payload.event?.startsWith('subscription.')
  const status = ({ 'order.created': 'waiting_payment', 'order.paid': 'approved', 'order.failed': 'refused', 'order.refunded': 'refunded', 'order.chargedback': 'chargedback', 'subscription.active': 'active', 'subscription.created': 'pending', 'subscription.renewed': 'active', 'subscription.past_due': 'past_due', 'subscription.canceled': 'canceled' })[payload.event]
  if (!status || !order.id || !customer.email || !payload.items?.length) throw new Error('incomplete_integration_payload')
  const phone = String(customer.phone || '').replace(/\D/g, '')
  const localPhone = phone.startsWith('55') && phone.length >= 12 ? phone.slice(2) : phone
  const address = customer.billing_address || {}
  const contact = { id: customer.id || null, name: customer.name, email: customer.email, doc: customer.document || '', phone_local_code: '55', phone_number: localPhone, address: address.street || address.line_1 || '', address_number: address.number || '', address_district: address.district || '', address_comp: address.line_2 || '', address_city: address.city || '', address_state: address.state || '', address_state_full_name: address.state || '', address_country: address.country || 'BR', address_zip_code: address.zip_code || '' }
  const items = payload.items.map(item => ({ id: String(item.product_code), marketplace_id: String(item.product_code), internal_id: item.product_id, marketplace_name: 'pagarme2', name: item.product_name, image_url: item.image_url || '', producer, qty: 1, type: 'product', unit_value: money(item.price_cents), total_value: money(item.price_cents), offer: { id: item.guru_offer_id || item.offer_id, internal_id: item.offer_id, name: item.offer_name || '' } }))
  if (items.some(item => !/^\d+$/.test(item.id) || item.total_value === null)) throw new Error('incomplete_product_mapping')
  const matches = item => !productIds || productIds.includes(item.product_id)
  let primaryIndex = payload.items.findIndex(item => item.kind === 'main' && matches(item))
  if (primaryIndex < 0) primaryIndex = payload.items.findIndex(matches)
  if (primaryIndex < 0) throw new Error('product_filter_mismatch')
  const primary = items[primaryIndex]
  const paid = order.status === 'paid' && Boolean(order.paid_at)
  if (payload.event === 'subscription.active' && (!paid || subscription.status !== 'active')) throw new Error('subscription_not_confirmed')
  const dates = { created_at: order.created_at || payload.created_at, ordered_at: order.created_at || payload.created_at, confirmed_at: order.paid_at || null, updated_at: payload.created_at, canceled_at: subscription.canceled_at || null, next_cycle_at: subscription.current_period_end || null }
  const payment = { id: order.id, marketplace_id: order.pagarme_charge_id || order.pagarme_order_id || order.id, marketplace_name: 'pagarme2', currency: 'BRL', method: order.payment_method, gross: money(order.subtotal_cents), discount_value: money(order.discount_cents), total: money(order.total_cents), net: null, affiliate_value: null, installments: { qty: order.installments || 1, value: money(Math.round(order.total_cents / (order.installments || 1))), interest: money(order.interest_cents) } }
  return { id: subscriptionEvent ? subscription.id || payload.subscription_id : order.id, event_id: payload.id, event: payload.event, environment: payload.environment, source_system: 'central_vendas', webhook_type: subscriptionEvent ? 'subscription' : 'transaction', status, type: 'producer', contact, subscriber: subscriptionEvent ? contact : undefined, product: primary, is_order_bump: payload.items[primaryIndex].kind === 'bump' ? 1 : 0, products: items, items, payment, dates,
    current_invoice: subscriptionEvent ? { id: order.id, status: paid ? 'paid' : order.status, value: order.total_cents, paid_at: order.paid_at || null, product_id: items[0].id, offer_id: items[0].offer.id } : undefined,
    last_status: subscriptionEvent ? status : undefined, subscription: subscriptionEvent ? { id: subscription.id || payload.subscription_id, marketplace_id: subscription.pagarme_subscription_id || null, product_id: items[0].id, status, next_cycle_at: dates.next_cycle_at } : [], affiliations: [], source: payload.source || {}, api_token: token }
}
