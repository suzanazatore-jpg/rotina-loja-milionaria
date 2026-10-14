import { createHash } from 'node:crypto'

export class PaymentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

export function gatewayConfiguration(env = process.env) {
  const key = env.PAGARME_SECRET_KEY
  const base = env.PAGARME_BASE_URL || 'https://sdx-api.pagar.me/core/v5'
  if (!key) throw new PaymentError('Pagar.me não configurado.', 503)
  if (!['https://sdx-api.pagar.me/core/v5', 'https://api.pagar.me/core/v5'].includes(base)) throw new PaymentError('Ambiente Pagar.me inválido.', 503)
  if (base.includes('sdx-api') && !key.startsWith('sk_test_')) throw new PaymentError('Use uma chave de teste no sandbox.', 503)
  if (!base.includes('sdx-api') && (env.CHECKOUT_LIVE_ENABLED !== 'true' || !key.startsWith('sk_live_'))) throw new PaymentError('Pagamentos reais ainda não habilitados.', 503)
  return { base, key }
}

export async function pagarme(path, { method = 'GET', body, idempotencyKey } = {}, fetcher = fetch) {
  const { base, key } = gatewayConfiguration()
  if (!/^\/(orders|subscriptions|plans|charges|customers)(\/[a-zA-Z0-9_-]+)?(\/cards)?$/.test(path)) throw new PaymentError('Recurso inválido.')
  const response = await fetcher(`${base}${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/json', 'User-Agent': 'suzana-checkout/1.0', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  if (!response.ok) throw new PaymentError('Pagar.me não concluiu a operação. Confira a configuração ou os dados de pagamento.', response.status >= 500 ? 502 : 400)
  return result
}

export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

export function calculatePayment(offer, product, method, installments = 1) {
  if (!offer.active || !product.active) throw new PaymentError('Oferta indisponível.')
  if (!offer.payment_methods?.includes(method)) throw new PaymentError('Forma de pagamento indisponível.')
  if (!Number.isInteger(installments) || installments < 1 || installments > (offer.max_installments || 1)) throw new PaymentError('Parcelamento inválido.')
  if ((method === 'pix' || product.type === 'subscription') && installments !== 1) throw new PaymentError('Esta cobrança não permite parcelamento.')
  if (product.type === 'subscription' && method !== 'credit_card') throw new PaymentError('Assinatura exige cartão.')
  const subtotal = offer.price_cents
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw new PaymentError('Preço inválido.')
  const discount = method === 'pix' ? Math.round(subtotal * Number(offer.pix_discount_pct || 0) / 100) : 0
  let total = subtotal - discount
  const rate = Number(offer.monthly_interest_pct || 0) / 100
  if (method === 'credit_card' && installments > offer.free_installments && rate > 0) {
    const factor = (1 + rate) ** installments
    total = Math.ceil(subtotal * rate * factor / (factor - 1)) * installments
  }
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647) throw new PaymentError('Total inválido.')
  return { subtotal_cents: subtotal, discount_cents: discount, interest_cents: total - subtotal + discount, total_cents: total }
}

export function normalizeCustomer(input) {
  const email = String(input?.email || '').trim().toLowerCase()
  const name = String(input?.name || '').trim()
  const document = String(input?.document || '').replace(/\D/g, '')
  let phone = String(input?.phone || '').replace(/\D/g, '')
  if (phone.startsWith('55') && phone.length > 11) phone = phone.slice(2)
  const address = input?.address || {}
  if (!name || name.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || ![11,14].includes(document.length) || ![10,11].includes(phone.length)) throw new PaymentError('Informe nome, email, CPF/CNPJ e telefone válidos.')
  if (!address.line_1 || !address.zip_code || !address.city || !/^[A-Z]{2}$/.test(address.state || '')) throw new PaymentError('Informe o endereço de cobrança completo.')
  return { name, email, document, type: document.length === 11 ? 'individual' : 'company', document_type: document.length === 11 ? 'CPF' : 'CNPJ', phones: { mobile_phone: { country_code: '55', area_code: phone.slice(0,2), number: phone.slice(2) } }, address: { country: 'BR', state: address.state, city: String(address.city).slice(0,64), zip_code: String(address.zip_code).replace(/\D/g, ''), line_1: String(address.line_1).slice(0,256), ...(address.line_2 ? { line_2: String(address.line_2).slice(0,128) } : {}) } }
}

export function cardReference(input) {
  // Nunca aceite PAN, CVV ou um card_id arbitrário enviado pelo navegador.
  if (input?.card || input?.card_number || input?.cvv || input?.card_id || !/^token_[a-zA-Z0-9]+$/.test(input?.card_token || '')) throw new PaymentError('Informe apenas o token seguro do cartão.')
  return { card_token: input.card_token }
}

export function orderPayload(order, offer, product, customer, card, cartItems) {
  const payment = order.payment_method === 'pix'
    ? { payment_method: 'pix', amount: order.total_cents, pix: { expires_in: 3600 } }
    : { payment_method: 'credit_card', amount: order.total_cents, credit_card: { ...card, installments: order.installments, operation_type: 'auth_and_capture', statement_descriptor: 'SUZANA ZATORRE' } }
  return { code: order.id, ...(customer.id ? { customer_id: customer.id } : { customer }), closed: true, items: cartItems ? cartItems.map(item => ({ code: item.product_id, description: item.name.slice(0,256), amount: item.total_cents, quantity: 1 })) : [{ code: product.id, description: product.name.slice(0,256), amount: order.total_cents, quantity: 1 }], payments: [payment], metadata: { local_order_id: order.id, offer_id: offer.id } }
}

export function confirmedOrderState(remote, expected) {
  if (remote.code !== expected.id || remote.amount !== expected.total_cents || remote.customer?.email?.toLowerCase() !== expected.email) throw new PaymentError('Confirmação não corresponde ao pedido.', 409)
  const charge = remote.charges?.[0]
  const state = charge?.status || remote.status
  const status = ({ paid: 'paid', failed: 'failed', canceled: 'canceled', refunded: 'refunded', chargedback: 'chargedback', pending: 'waiting_payment', processing: 'waiting_payment' })[state] || 'pending'
  return { status, pagarme_order_id: remote.id, pagarme_charge_id: charge?.id || null, ...(status === 'paid' ? { paid_at: charge?.paid_at || expected.paid_at || remote.updated_at || new Date().toISOString() } : {}), ...(expected.payment_method === 'pix' ? { pix_qr_code: charge?.last_transaction?.qr_code || null, pix_expires_at: charge?.last_transaction?.expires_at || null } : {}) }
}
