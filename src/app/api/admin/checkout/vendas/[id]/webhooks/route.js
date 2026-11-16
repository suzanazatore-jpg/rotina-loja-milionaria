import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { isInternalAccessWebhook } from '@/lib/checkoutWebhookPayload'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'

export const runtime = 'nodejs'
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

async function readEligible(db, orderId) {
  const { data: order, error: orderError } = await db.from('orders').select('id,status').eq('id', orderId).maybeSingle()
  if (orderError) throw new Error('Não foi possível consultar a venda.')
  if (!order) return { found: false, paid: false, deliveries: [] }
  if (order.status !== 'paid') return { found: true, paid: false, deliveries: [] }
  const { data: rows, error } = await db.from('webhook_deliveries')
    .select('id,webhook_id,event_type,status,created_at,payload,outbound_webhooks!inner(id,name,url,active)')
    .eq('order_id', orderId).eq('event_type', 'order.paid')
    .eq('outbound_webhooks.active', true).order('created_at', { ascending: false }).limit(250)
  if (error) throw new Error('Não foi possível consultar os webhooks da venda.')
  const seen = new Set()
  const deliveries = (rows || []).filter(row => {
    if (seen.has(row.webhook_id)) return false
    if (row.payload?.environment !== 'live' || row.payload?.order?.id !== orderId ||
        row.payload?.order?.status !== 'paid' || row.payload?.event !== 'order.paid' ||
        !row.outbound_webhooks?.active || isInternalAccessWebhook(row.outbound_webhooks.url)) return false
    seen.add(row.webhook_id)
    return true
  }).map(row => ({
    id: row.id, webhook_id: row.webhook_id, name: row.outbound_webhooks.name,
    active: true, internal: false, event_type: row.event_type, status: row.status,
  }))
  return { found: true, paid: true, deliveries }
}

async function authorize(request, db) {
  if (!await autorizarAdmin(request, db)) return response({ error: 'Acesso restrito.' }, 401)
  if (process.env.VERCEL_ENV !== 'production' ||
      process.env.PAGARME_BASE_URL !== 'https://api.pagar.me/core/v5' ||
      process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED !== 'true')
    return response({ error: 'Reenvio não habilitado no ambiente de produção.' }, 503)
  return null
}

export async function GET(request, context) {
  try {
    const { id } = await context.params
    if (!UUID.test(id || '')) return response({ error: 'Venda inválida.' }, 400)
    const db = checkoutAdminClient()
    const forbidden = await authorize(request, db)
    if (forbidden) return forbidden
    const state = await readEligible(db, id)
    if (!state.found) return response({ error: 'Venda não encontrada.' }, 404)
    return response({ paid: state.paid, deliveries: state.deliveries })
  } catch {
    return response({ error: 'Não foi possível consultar o serviço de vendas.' }, 503)
  }
}

function resendDeliveryId(requestId, sourceId) {
  const hash = createHash('sha256').update(`sale-resend:${requestId}:${sourceId}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function POST(request, context) {
  try {
    const { id } = await context.params
    if (!UUID.test(id || '')) return response({ error: 'Venda inválida.' }, 400)
    const db = checkoutAdminClient()
    const forbidden = await authorize(request, db)
    if (forbidden) return forbidden
    if (request.headers.get('origin') !== 'https://rotina.suzanazatorre.com.br')
      return response({ error: 'Origem inválida.' }, 403)
    if (!request.headers.get('content-type')?.startsWith('application/json') ||
        Number(request.headers.get('content-length') || 0) > 4096)
      return response({ error: 'Solicitação inválida.' }, 400)
    const input = await request.json()
    if (input?.confirm !== true || !UUID.test(input.delivery_id || '') ||
        !UUID.test(input.request_id || '')) return response({ error: 'Seleção de webhook inválida.' }, 400)

    const state = await readEligible(db, id)
    if (!state.paid) return response({ error: 'Apenas vendas aprovadas podem reenviar webhooks.' }, 409)
    const chosen = state.deliveries.find(row => row.id === input.delivery_id)
    if (!chosen) return response({ error: 'Webhook não pertence às integrações ativas desta venda.' }, 409)

    const { data: source, error: sourceError } = await db.from('webhook_deliveries')
      .select('id,webhook_id,event_type,subscription_id,payload').eq('id', chosen.id)
      .eq('order_id', id).single()
    if (sourceError || !source) throw new Error('Não foi possível consultar a entrega original.')
    const newId = resendDeliveryId(input.request_id, chosen.id)
    const now = new Date().toISOString()
    const queued = await db.from('webhook_deliveries').upsert({
      id: newId, webhook_id: source.webhook_id, order_id: id,
      event_type: source.event_type, subscription_id: source.subscription_id,
      status: 'pending', attempts: 0, next_attempt_at: now,
      payload: { ...source.payload, id: newId, created_at: now },
    }, { onConflict: 'id', ignoreDuplicates: true })
    if (queued.error) throw new Error('Não foi possível enfileirar o reenvio.')
    after(async () => {
      try { await processOutboundWebhooks(db, { deliveryIds: [newId] }) }
      catch { console.error('sale_webhook_resend_pending') }
    })
    return response({ state: 'queued', delivery_id: newId })
  } catch {
    return response({ error: 'Não foi possível preparar o reenvio do webhook.' }, 503)
  }
}
