import { after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'
import { isInternalAccessWebhook } from '@/lib/checkoutWebhookPayload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

async function getContext(request, context) {
  const db = checkoutAdminClient()
  if (!await autorizarAdmin(request, db)) return { error: reply({ error: 'Acesso restrito ao administrador.' }, 401) }
  const { id } = await context.params
  if (!UUID.test(id || '')) return { error: reply({ error: 'Venda inválida.' }, 400) }
  const { data: order, error } = await db.from('orders').select('id,status').eq('id', id).maybeSingle()
  if (error || !order) return { error: reply({ error: 'Venda não encontrada.' }, 404) }
  return { db, order }
}

const select = 'id,webhook_id,event_type,order_id,status,attempts,response_status,created_at,delivered_at,next_attempt_at,outbound_webhooks(name,active,url)'

export async function GET(request, context) {
  const { db, order, error } = await getContext(request, context)
  if (error) return error
  const { data, error: readError } = await db.from('webhook_deliveries').select(select)
    .eq('order_id', order.id).order('created_at', { ascending: false }).limit(100)
  if (readError) return reply({ error: 'Não foi possível consultar os envios da venda.' }, 503)
  return reply({ paid: order.status === 'paid', deliveries: (data || []).map(row => ({
    id: row.id, webhook_id: row.webhook_id, event_type: row.event_type,
    name: row.outbound_webhooks?.name || 'Webhook', active: Boolean(row.outbound_webhooks?.active),
    internal: isInternalAccessWebhook(row.outbound_webhooks?.url),
    status: row.status, attempts: row.attempts, response_status: row.response_status,
    created_at: row.created_at, delivered_at: row.delivered_at, next_attempt_at: row.next_attempt_at,
  })) })
}

export async function POST(request, context) {
  const { db, order, error } = await getContext(request, context)
  if (error) return error
  if (order.status !== 'paid') return reply({ error: 'Somente vendas aprovadas podem reenviar eventos de pagamento.' }, 409)
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 1024) return reply({ error: 'Solicitação excede o limite.' }, 413)
  let body
  try { body = JSON.parse(raw) } catch { return reply({ error: 'Solicitação inválida.' }, 400) }
  if (!UUID.test(body?.delivery_id || '') || body.confirm !== true) return reply({ error: 'Confirme o destino antes de reenviar.' }, 400)

  const { data: original, error: readError } = await db.from('webhook_deliveries')
    .select('id,webhook_id,event_type,order_id,subscription_id,payload,outbound_webhooks(name,active,url)')
    .eq('id', body.delivery_id).eq('order_id', order.id).maybeSingle()
  if (readError || !original) return reply({ error: 'Webhook não encontrado para esta venda.' }, 404)
  if (!original.outbound_webhooks?.active || isInternalAccessWebhook(original.outbound_webhooks?.url)) {
    return reply({ error: 'Este webhook está pausado ou é interno. Não será reenviado.' }, 409)
  }
  if (original.event_type !== 'order.paid' || original.payload?.event !== 'order.paid' || original.payload?.environment !== 'live') {
    return reply({ error: 'Este envio não corresponde a uma compra aprovada em produção.' }, 409)
  }
  // Evita múltiplos cliques enquanto um reenvio anterior aguarda execução.
  const { data: recent } = await db.from('webhook_deliveries').select('id,status,created_at')
    .eq('order_id', order.id).eq('webhook_id', original.webhook_id).eq('event_type', 'order.paid')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false }).limit(5)
  if ((recent || []).some(row => ['pending','retry','processing'].includes(row.status))) {
    return reply({ error: 'Já existe um envio pendente deste webhook. Consulte o status antes de reenviar.' }, 409)
  }
  const { data: delivery, error: insertError } = await db.from('webhook_deliveries').insert({
    webhook_id: original.webhook_id, event_type: 'order.paid', order_id: order.id,
    subscription_id: original.subscription_id, payload: original.payload,
    status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(),
  }).select('id').single()
  if (insertError || !delivery) return reply({ error: 'Não foi possível agendar o reenvio.' }, 503)
  await db.from('webhook_events').insert({
    pagarme_event_id: `webhook-admin:${randomUUID()}`,
    type: 'checkout.webhook.admin',
    payload: { action: 'manual_resend', order_id: order.id, original_delivery_id: original.id,
      delivery_id: delivery.id, webhook_id: original.webhook_id },
    processed_at: new Date().toISOString(), error: null,
  })
  after(async () => {
    try { await processOutboundWebhooks(db) }
    catch { console.error('checkout outbound: reenvio permanece na fila') }
  })
  return reply({ ok: true, queued: true, delivery_id: delivery.id, destination: original.outbound_webhooks.name }, 202)
}
