import { NextResponse } from 'next/server'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { ContractError, viewContract, requestContractCode, signContract, finalizeSignedContract, downloadSignedPdf, logContractEvent } from '@/lib/contractsServer'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
const meta = request => ({ ip: (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || null, userAgent: request.headers.get('user-agent') })
const fail = error => error instanceof ContractError ? json({ error: error.message }, error.status) : json({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' }, 503)

export async function GET(request, context) {
  const { token } = await context.params
  const db = checkoutAdminClient()
  try {
    if (new URL(request.url).searchParams.get('pdf') === '1') {
      const pdf = await downloadSignedPdf(db, token)
      return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="contrato-assinado.pdf"', 'Cache-Control': 'no-store' } })
    }
    return json(await viewContract(db, token, meta(request)))
  } catch (error) { return fail(error) }
}

export async function POST(request, context) {
  const { token } = await context.params
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Origem inválida.' }, 403)
  let body
  try { body = await request.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }
  const db = checkoutAdminClient()
  try {
    if (body?.action === 'code') return json(await requestContractCode(db, token, body.channel, meta(request)))
    if (body?.action !== 'sign') return json({ error: 'Ação inválida.' }, 400)
    const result = await signContract(db, token, body, meta(request))
    if (!result.already) {
      // A assinatura já está gravada; PDF e liberação podem ser refeitos pelo painel se falharem aqui.
      try { await finalizeSignedContract(db, result.contract_id) } catch { await logContractEvent(db, result.contract_id, 'pdf_failed') }
      try {
        const access = await fulfillPaidOrder(db, result.order_id)
        await db.from('contracts').update({ fulfillment_status: access.fulfillment }).eq('id', result.contract_id)
        await logContractEvent(db, result.contract_id, 'access_released', { detail: { fulfillment: access.fulfillment, email: access.email_status || null } })
      } catch {
        await db.from('contracts').update({ fulfillment_status: 'retry' }).eq('id', result.contract_id)
        await logContractEvent(db, result.contract_id, 'access_failed')
      }
    }
    return json({ signed: true, already: result.already })
  } catch (error) { return fail(error) }
}
