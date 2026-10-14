import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { createPayment, syncPayment } from '@/lib/checkoutPaymentsServer'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
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
    const fulfillment = output.status === 'paid' ? await fulfillPaidOrder(db, output.order_id) : {}
    return NextResponse.json({ ...output, ...fulfillment }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : 'Não foi possível processar o pagamento.' }, { status: error.status || 500 })
  }
}
