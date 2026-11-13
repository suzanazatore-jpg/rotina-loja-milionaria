import { notifyPaidOrder, processCommercePush } from '@/lib/commerceNotificationsServer'
import { after } from 'next/server'
import { reverseOrderAccess } from '@/lib/checkoutAccessServer'
import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { createPayment, syncPayment } from '@/lib/checkoutPaymentsServer'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'
import { gatewayConfiguration, PaymentError } from '@/lib/pagarme'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
    gatewayConfiguration()
    if (Number(request.headers.get('content-length') || 0) > 16384) throw new PaymentError('Dados excedem o limite.', 413)
    const input = await request.json()
    const output = input.action === 'sync'
      ? await syncPayment(db, input.order_id)
      : await createPayment(db, input, request.headers.get('idempotency-key'))
    after(async () => { try { await processCommercePush(db) } catch { console.error('commerce_push_pending') } })
    const steps = output.status === 'paid' ? await Promise.allSettled([
      Promise.resolve().then(() => fulfillPaidOrder(db, output.order_id)),
      Promise.resolve().then(() => deliverPaidConversion(db, output.order_id)),
      Promise.resolve().then(() => notifyPaidOrder(db, output.order_id)),
    ]) : null
    const fulfillment = steps?.[0].status === 'fulfilled' ? steps[0].value : steps ? { fulfillment: 'pending' } : {}
    const reversal = ['refunded','chargedback'].includes(output.status) ? await reverseOrderAccess(db, output.order_id) : {}
    const conversion = steps?.[1].status === 'fulfilled' ? steps[1].value : { status: steps ? 'pending' : 'skipped' }
    return NextResponse.json({ ...output, ...fulfillment, ...reversal, conversion }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : 'Não foi possível processar o pagamento.' }, { status: error.status || 500 })
  }
}
