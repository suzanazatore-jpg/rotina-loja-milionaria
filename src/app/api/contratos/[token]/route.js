import { NextResponse } from 'next/server'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { ContractError, viewContract, requestContractCode, signContract, downloadSignedPdf } from '@/lib/contractsServer'
import { scheduleContractCompletion } from '@/lib/contractCompletionServer'

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
    await scheduleContractCompletion(db, result.contract_id)
    const state = await viewContract(db, token, meta(request))
    return json({ signed: true, already: result.already, has_pdf: state.has_pdf, access_status: state.access_status })
  } catch (error) { return fail(error) }
}
