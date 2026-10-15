import { reverseOrderAccess } from '@/lib/checkoutAccessServer'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { reconcileSubscriptionCharge } from '@/lib/checkoutPaymentsServer'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'
import { reconcileWebhookResource } from '@/lib/checkoutWebhookServer'

export const runtime = 'nodejs'
function authorized(request) {
  const secret = process.env.PAGARME_WEBHOOK_SECRET
  const expected = secret ? [Buffer.from(`Bearer ${secret}`), Buffer.from(`Basic ${Buffer.from(`pagarme:${secret}`).toString('base64')}`)] : []
  const actual = Buffer.from(request.headers.get('authorization') || '')
  return expected.some(value => actual.length === value.length && timingSafeEqual(actual, value))
}
export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  let db, eventId
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 262144) return NextResponse.json({ error: 'Evento excede o limite.' }, { status: 413 })
    let event
    try { event = JSON.parse(text) } catch { return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 }) }
    if (!event || typeof event !== 'object' || !/^hook_[a-zA-Z0-9]+$/.test(event.id || '') || typeof event.type !== 'string' || !/^[a-z_]+\.[a-z_]+$/.test(event.type) || typeof event.data?.id !== 'string' || !/^[a-zA-Z0-9_]{1,100}$/.test(event.data.id)) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 })
    db = checkoutAdminClient()
    eventId = event.id
    const registered = await db.from('webhook_events').upsert({ pagarme_event_id: event.id, type: event.type, payload: { resource_id: event.data.id } }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true })
    if (registered.error) throw registered.error
    const { data: stored, error: readError } = await db.from('webhook_events').select('processed_at,type,payload').eq('pagarme_event_id', event.id).single()
    if (readError) throw readError
    if (stored.type !== event.type || stored.payload?.resource_id !== event.data.id) throw new Error('Evento conflitante.')
    if (stored.processed_at) return NextResponse.json({ received: true })
    const order = await reconcileWebhookResource(db, event, { reconcileSubscriptionCharge })
    if (order?.status === 'paid') {
      await fulfillPaidOrder(db, order.order_id)
      await deliverPaidConversion(db, order.order_id)
    }
    if (order && ['refunded','chargedback'].includes(order.status)) await reverseOrderAccess(db, order.order_id)
    const { error } = await db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null }).eq('pagarme_event_id', event.id)
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch {
    if (db && eventId) {
      try { await db.from('webhook_events').update({ error: 'reconciliation_pending' }).eq('pagarme_event_id', eventId).is('processed_at', null) } catch { /* O HTTP 503 continua solicitando reenvio. */ }
    }
    return NextResponse.json({ error: 'Não foi possível conciliar o evento. Reenvie o webhook.' }, { status: 503 })
  }
}
