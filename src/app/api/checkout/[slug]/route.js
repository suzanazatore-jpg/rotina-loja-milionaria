import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadCheckoutOffer, checkoutTestConfiguration } from '@/lib/checkoutPublicServer'
import { signCheckoutSession, readCheckoutSession, safeCheckoutRedirect } from '@/lib/checkoutSession'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { createPayment } from '@/lib/checkoutPaymentsServer'
import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'
import { purchaseAnalytics } from '@/lib/checkoutAnalytics'
import { PaymentError } from '@/lib/pagarme'

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
  if (order.status === 'paid') {
    const { data, error } = await db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${session.key}`).maybeSingle()
    if (!error) purchase = purchaseAnalytics(order, data?.payload?.items)
  }
  return { purchase, status: order.status, total_cents: order.total_cents, payment_method: order.payment_method, installments: order.installments, pix_code: order.pix_qr_code, pix_expires_at: order.pix_expires_at, redirect_url: safeCheckoutRedirect(loaded.config, order.status, order.payment_method) }
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
    if (!checkoutTestConfiguration().ready) throw new PaymentError('Checkout em preparação. Pagamentos ainda não disponíveis.', 503)
    // Durante homologação só o administrador pode iniciar pagamentos sandbox.
    if (!(await autorizarAdmin(request, db))) throw new PaymentError('Este checkout está em teste administrativo.', 401)
    if (input.action === 'start') {
      if (!session) store.set(name, signCheckoutSession(loaded.offer.id, secret()), { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: `/api/checkout/${slug}`, maxAge: 1800 })
      return response({ ready: true })
    }
    if (input.action !== 'pay' || !session) throw new PaymentError('Inicie uma sessão válida antes do pagamento.', 401)
    // Não permita alterar oferta nem aceitar dados abertos do cartão no endpoint público.
    const allowed = new Set(['action','customer','payment_method','installments','card_token','bumps','marketing_consent'])
    if (Object.keys(input).some(key => !allowed.has(key))) throw new PaymentError('Dados de pagamento inválidos.')
    const payment = await createPayment(db, { offer_id: loaded.offer.id, customer: input.customer, payment_method: input.payment_method, installments: input.installments, card_token: input.card_token, bumps: input.bumps }, session.key, input.marketing_consent === true ? { consent: true, gateway_base: process.env.PAGARME_BASE_URL, pixel_id: loaded.config.meta_pixel_id, source_url: `${new URL(request.url).origin}/checkout/${encodeURIComponent(slug)}` } : null)
    if (payment.status === 'paid') {
      await fulfillPaidOrder(db, payment.order_id)
      await deliverPaidConversion(db, payment.order_id)
    }
    return response(await readStatus(db, loaded, session))
  } catch (error) { return response({ error: error instanceof PaymentError ? error.message : 'Não foi possível processar o checkout.' }, error.status || 500) }
}
