import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { syncPayment, reconcileSubscriptionCharge } from '@/lib/checkoutPaymentsServer'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'
import { pagarme } from '@/lib/pagarme'

export const runtime = 'nodejs'
function authorized(request) {
  const secret = process.env.PAGARME_WEBHOOK_SECRET
  const expected = secret ? [Buffer.from(`Bearer ${secret}`), Buffer.from(`Basic ${Buffer.from(`pagarme:${secret}`).toString('base64')}`)] : []
  const actual = Buffer.from(request.headers.get('authorization') || '')
  return expected.some(value => actual.length === value.length && timingSafeEqual(actual, value))
}
export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  try {
    const event = await request.json()
    if (!/^hook_[a-zA-Z0-9]+$/.test(event.id || '') || !event.type || !event.data?.id) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 })
    const db = checkoutAdminClient()
    const registered = await db.from('webhook_events').upsert({ pagarme_event_id: event.id, type: event.type, payload: { resource_id: event.data.id } }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true })
    if (registered.error) throw registered.error
    const { data: stored, error: readError } = await db.from('webhook_events').select('processed_at').eq('pagarme_event_id', event.id).single()
    if (readError) throw readError
    if (stored.processed_at) return NextResponse.json({ received: true })
    let orderId
    let reconciled
    if (event.type.startsWith('order.')) {
      const { data, error } = await db.from('orders').select('id').eq('pagarme_order_id', event.data.id).maybeSingle()
      if (error) throw error
      orderId = data?.id
    } else if (event.type.startsWith('charge.')) {
      // O payload recebido nunca é usado como prova de pagamento.
      const charge = await pagarme(`/charges/${event.data.id}`)
      if (charge.order?.id) {
        const { data, error } = await db.from('orders').select('id').eq('pagarme_order_id', charge.order.id).maybeSingle()
        if (error) throw error
        orderId = data?.id
      }
      if (charge.invoice?.subscription_id || charge.invoice?.subscription?.id) {
        reconciled = await reconcileSubscriptionCharge(db, charge)
        orderId = reconciled.order_id
      }
    } else if (event.type.startsWith('subscription.')) {
      const remote = await pagarme(`/subscriptions/${event.data.id}`)
      const { error } = await db.from('subscriptions').update({ status: remote.status === 'canceled' ? 'canceled' : 'active', current_period_end: remote.current_cycle?.end_at || null, canceled_at: remote.canceled_at || null }).eq('pagarme_subscription_id', remote.id)
      if (error) throw error
    }
    if (orderId) {
      const order = reconciled || await syncPayment(db, orderId)
      if (order.status === 'paid') {
        await fulfillPaidOrder(db, orderId)
        await deliverPaidConversion(db, orderId)
      }
    }
    const { error } = await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('pagarme_event_id', event.id)
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Não foi possível conciliar o evento. Reenvie o webhook.' }, { status: 503 })
  }
}
