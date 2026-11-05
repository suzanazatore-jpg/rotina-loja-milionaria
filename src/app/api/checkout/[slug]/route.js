import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadCheckoutOffer, checkoutPaymentConfiguration } from '@/lib/checkoutPublicServer'
import { CHECKOUT_SESSION_MAX_AGE, signCheckoutSession, readCheckoutSession, safeCheckoutRedirect } from '@/lib/checkoutSession'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { createPayment } from '@/lib/checkoutPaymentsServer'
import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'
import { purchaseAnalytics } from '@/lib/checkoutAnalytics'
import { PaymentError } from '@/lib/pagarme'
import { validateCheckoutForm, checkoutExpired } from '@/lib/checkoutSettings'
import { signingUrl } from '@/lib/contractsServer'
import { contractCheckoutStatus } from '@/lib/contractCheckoutStatus'

export const runtime = 'nodejs'
const secret = () => process.env.CHECKOUT_SESSION_SECRET
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function checkout(request, context) {
  const { slug } = await context.params
  const db = checkoutAdminClient()
  const loaded = await loadCheckoutOffer(slug, db)
  if (!loaded) throw new PaymentError('Oferta indisponível.', 404)
  const store = await cookies()
  const name = `sz_checkout_${loaded.offer.id}`
  const session = readCheckoutSession(store.get(name)?.value, loaded.offer.id, secret())
  return { db, loaded, store, name, session, slug }
}
async function readStatus(db, loaded, session) {
  const { data: order, error } = await db.from('orders').select('id,event_id,paid_at,status,total_cents,payment_method,installments,pix_qr_code,pix_expires_at').eq('event_id', `checkout:${session.key}`).eq('offer_id', loaded.offer.id).maybeSingle()
  if (error) throw new PaymentError('Não foi possível consultar o pagamento.', 503)
  if (!order) return { status: 'not_started' }
  let purchase = null
  let fulfillment = 'waiting_payment'
  let progress = { contract_required: false, contract: null, blocked: false }
  if (order.status === 'paid') {
    const { data, error } = await db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${session.key}`).maybeSingle()
    if (error) throw new PaymentError('Não foi possível consultar os dados da compra.', 503)
    purchase = purchaseAnalytics(order, data?.payload?.items)
    const access = await db.from('webhook_events').select('processed_at').eq('pagarme_event_id', `access:${order.id}`).maybeSingle()
    if (access.error) throw new PaymentError('Não foi possível consultar a entrega.', 503)
    const isReservation = (process.env.CHECKOUT_RESERVATION_OFFER_IDS || '').split(',').map(id => id.trim()).includes(loaded.offer.id) && !loaded.product.plan_id
    let reservationProcessed = false
    if (isReservation) {
      const reservation = await db.from('webhook_events').select('processed_at').eq('pagarme_event_id', `reservation:${order.id}`).maybeSingle()
      if (reservation.error) throw new PaymentError('Não foi possível consultar a reserva.', 503)
      reservationProcessed = Boolean(reservation.data?.processed_at)
    }
    fulfillment = isReservation ? reservationProcessed ? 'completed' : 'pending' : access.data?.processed_at ? 'completed' : 'pending'
    const stored = await db.from('contracts').select('id,status,fields,fulfillment_status,signed_pdf_path').eq('order_id', order.id).maybeSingle()
    if (stored.error) throw new PaymentError('Não foi possível consultar a próxima etapa da compra.', 503)
    progress = contractCheckoutStatus(stored.data, data?.payload?.contract_policy?.contract || loaded.config.contract, stored.data ? signingUrl(stored.data.id) : null)
  }
  return { purchase, fulfillment, reservation: !loaded.product.plan_id && (process.env.CHECKOUT_RESERVATION_OFFER_IDS || '').split(',').map(id => id.trim()).includes(loaded.offer.id), status: order.status, contract_required: progress.contract_required, contract: progress.contract, total_cents: order.total_cents, payment_method: order.payment_method, installments: order.installments, pix_code: order.pix_qr_code, pix_expires_at: order.pix_expires_at, redirect_url: progress.blocked || (order.status === 'paid' && fulfillment !== 'completed') ? null : safeCheckoutRedirect(loaded.config, order.status, order.payment_method) }
}
export async function GET(request, context) {
  try {
    const { db, loaded, session } = await checkout(request, context)
    if (!session) throw new PaymentError('Sessão de compra inválida ou expirada.', 401)
    return response(await readStatus(db, loaded, session))
  } catch (error) { return response({ error: error instanceof PaymentError ? error.message : 'Não foi possível consultar o checkout.' }, error.status || 500) }
}
export async function POST(request, context) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new PaymentError('Origem inválida.', 403)
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PaymentError('Formato inválido.', 415)
    const text = await request.text()
    if (Buffer.byteLength(text) > 16384) throw new PaymentError('Dados excedem o limite.', 413)
    const input = JSON.parse(text)
    const { db, loaded, store, name, session, slug } = await checkout(request, context)
    if (checkoutExpired(loaded.config)) throw new PaymentError('O prazo desta oferta foi encerrado.', 410)
    const paymentConfig = checkoutPaymentConfiguration(loaded)
    if (!paymentConfig.ready) throw new PaymentError('Checkout em preparação. Pagamentos ainda não disponíveis.', 503)
    if (paymentConfig.adminOnly && !(await autorizarAdmin(request, db))) throw new PaymentError(paymentConfig.mode === 'live' ? 'Compra de validação: entre com a conta administrativa para continuar.' : 'Este checkout está em teste administrativo.', 401)
    if (input.action === 'start') {
      if (!session) store.set(name, signCheckoutSession(loaded.offer.id, secret()), { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: `/api/checkout/${slug}`, maxAge: CHECKOUT_SESSION_MAX_AGE })
      return response({ ready: true })
    }
    if (input.action !== 'pay' || !session) throw new PaymentError('Inicie uma sessão válida antes do pagamento.', 401)
    if (input.payment_method === 'credit_card' && !paymentConfig.publicKey) throw new PaymentError('Pagamento por cartão em preparação.', 503)
    if (paymentConfig.mode === 'live' && input.bumps?.length) throw new PaymentError('Itens adicionais ainda não estão habilitados nesta validação.', 400)
    // Não permita alterar oferta nem aceitar dados abertos do cartão no endpoint público.
    const allowed = new Set(['action','customer','payment_method','installments','card_token','bumps','marketing_consent','email_confirmation','terms_accepted','privacy_accepted'])
    if (Object.keys(input).some(key => !allowed.has(key))) throw new PaymentError('Dados de pagamento inválidos.')
    try { validateCheckoutForm(loaded.config,input) } catch(error) { throw new PaymentError(error.message,400) }
    if (loaded.config.require_terms || loaded.config.require_privacy) {
      const {error} = await db.from('webhook_events').upsert({pagarme_event_id:`checkout-form:${session.key}`,type:'checkout.form.accepted',payload:{offer_id:loaded.offer.id,terms_url:loaded.config.terms_url,privacy_url:loaded.config.privacy_url,terms_accepted:input.terms_accepted===true,privacy_accepted:input.privacy_accepted===true},processed_at:new Date().toISOString()},{onConflict:'pagarme_event_id',ignoreDuplicates:true})
      if(error) throw new PaymentError('Não foi possível registrar o aceite. Tente novamente.',503)
    }
    const payment = await createPayment(db, { offer_id: loaded.offer.id, customer: input.customer, payment_method: input.payment_method, installments: input.installments, card_token: input.card_token, bumps: input.bumps }, session.key, input.marketing_consent === true ? { consent: true, gateway_base: process.env.PAGARME_BASE_URL, pixel_id: loaded.config.meta_pixel_id, source_url: `${new URL(request.url).origin}/checkout/${encodeURIComponent(slug)}` } : null, { requireAddress: loaded.config.layout!=='guru' && loaded.config.form_profile !== 'compact' })
    if (payment.status === 'paid') {
      // O pagamento já ocorreu. Uma falha de entrega não pode sugerir nova cobrança.
      try { await fulfillPaidOrder(db, payment.order_id) } catch { /* O webhook e a conciliação administrativa podem repetir a entrega. */ }
      await deliverPaidConversion(db, payment.order_id)
    }
    return response(await readStatus(db, loaded, session))
  } catch (error) { return response({ error: error instanceof PaymentError ? error.message : 'Não foi possível processar o checkout.' }, error.status || 500) }
}
