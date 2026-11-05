import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { validId } from '@/lib/centralRecords'
import { saleContext, saleAction } from '@/lib/saleOperations'
import { PaymentError, pagarme } from '@/lib/pagarme'

const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
async function handle(request, { params }, write) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return reply({ error: 'Acesso restrito.' }, 401)
    const { id } = await params
    if (!validId(id)) return reply({ error: 'Venda inválida.' }, 400)
    if (!write) {
      const ctx = await saleContext(db, id)
      if (new URL(request.url).searchParams.get('detail') !== 'gateway') return reply(ctx.view)
      if (!ctx.order.pagarme_charge_id) return reply({})
      const charge = await pagarme('/charges/' + ctx.order.pagarme_charge_id)
      if (charge.id !== ctx.order.pagarme_charge_id) return reply({ error: 'Cobrança divergente.' }, 409)
      const t = charge.last_transaction || {},
        card = t.card || {}
      return reply({
        name: t.acquirer_name,
        tid: t.acquirer_tid,
        code: t.acquirer_return_code,
        message: t.acquirer_message,
        start: t.created_at,
        end: t.updated_at,
        canceled: charge.canceled_at,
        brand: card.brand,
        last4: card.last_four_digits,
        qr: t.qr_code,
        expires: t.expires_at,
        document: t.document_number,
      })
    }
    if (
      request.headers.get('origin') !== new URL(request.url).origin ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply({ error: 'Origem ou formato inválido.' }, 403)
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 12000) return reply({ error: 'Dados excedem o limite.' }, 413)
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return reply({ error: 'Dados inválidos.' }, 400)
    }
    if (!validId(body?.requestId)) return reply({ error: 'Solicitação inválida.' }, 400)
    return reply({ message: await saleAction(db, await saleContext(db, id), body) })
  } catch (e) {
    return reply(
      {
        error:
          e instanceof PaymentError
            ? e.message
            : 'Não foi possível concluir a operação. Consulte a auditoria.',
      },
      e instanceof PaymentError ? e.status : 503,
    )
  }
}
export const GET = (request, context) => handle(request, context, false)
export const POST = (request, context) => handle(request, context, true)
