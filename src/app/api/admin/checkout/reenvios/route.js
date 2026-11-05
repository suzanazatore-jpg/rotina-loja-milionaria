import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { UUID } from '@/lib/checkoutWebhookSettings'
import { isInternalAccessWebhook } from '@/lib/checkoutWebhookPayload'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control':'no-store'}})
const checked = async query => { const result = await query; if (result.error) throw new Error('Falha ao consultar os dados do webhook.'); return result.data }
async function sale(db, id) {
  const order = await checked(db.from('orders').select('id,status,paid_at,offer_id,event_id,customer_id').eq('id',id).maybeSingle())
  if (!order) return null
  const items = await checked(db.from('order_items').select('product_id').eq('order_id',id))
  const offer = await checked(db.from('offers').select('product_id').eq('id',order.offer_id).maybeSingle())
  const products = [...new Set([...items.map(item=>item.product_id),offer?.product_id].filter(Boolean))]
  return {order,products}
}
async function hooksFor(db, products) {
  const rows = await checked(db.from('outbound_webhooks').select('id,name,events,product_ids,active,url,payload_format').order('created_at',{ascending:false}))
  return rows.filter(h=>h.active && !isInternalAccessWebhook(h.url) && h.events?.includes('order.paid') && (!h.product_ids || h.product_ids.some(p=>products.includes(p))))
    .map(({id,name,payload_format})=>({id,name,payload_format}))
}
export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return json({error:'Acesso restrito.'},401)
    const url = new URL(request.url), orderId = url.searchParams.get('order_id')
    if (!UUID.test(orderId)) return json({error:'Venda inválida.'},400)
    const record = await sale(db,orderId)
    if (!record) return json({error:'Venda não encontrada.'},404)
    const requestedDelivery = url.searchParams.get('delivery_id')
    if (requestedDelivery) {
      if (!UUID.test(requestedDelivery)) return json({error:'Envio inválido.'},400)
      const delivery = await checked(db.from('webhook_deliveries').select('id,webhook_id,event_type,status,attempts,response_status,created_at,delivered_at,payload').eq('id',requestedDelivery).eq('order_id',orderId).maybeSingle())
      if (!delivery) return json({error:'Envio não encontrado.'},404)
      const hook = await checked(db.from('outbound_webhooks').select('name').eq('id',delivery.webhook_id).maybeSingle())
      return json({delivery,webhook_name:hook?.name || 'Integração removida'})
    }
    const hooks = await hooksFor(db,record.products)
    const deliveries = await checked(db.from('webhook_deliveries').select('id,webhook_id,event_type,status,attempts,response_status,created_at,delivered_at,next_attempt_at,payload').eq('order_id',orderId).order('created_at',{ascending:false}).limit(150))
    // A URL e os segredos do destino jamais são enviados ao navegador.
    return json({hooks,enabled:process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED === 'true',deliveries:deliveries.map(({payload,...d})=>({...d,environment:payload?.environment || 'unknown'}))})
  } catch {return json({error:'Não foi possível carregar os envios.'},500)}
}
export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return json({error:'Acesso restrito.'},401)
    if (request.headers.get('origin')!==new URL(request.url).origin) return json({error:'Origem inválida.'},403)
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Formato inválido.'},415)
    const raw = await request.text()
    if (Buffer.byteLength(raw)>4096) return json({error:'Seleção muito grande.'},413)
    let input
    try {input=JSON.parse(raw)} catch {return json({error:'Seleção inválida.'},400)}
    const orderId=input?.order_id, ids=input?.webhook_ids
    if (!UUID.test(orderId)||!Array.isArray(ids)||!ids.length||ids.length>15||new Set(ids).size!==ids.length||ids.some(id=>!UUID.test(id))) return json({error:'Selecione até 15 webhooks válidos.'},400)
    const record=await sale(db,orderId)
    if (!record) return json({error:'Venda não encontrada.'},404)
    if (record.order.status!=='paid'||!record.order.paid_at) return json({error:'Só é possível reenviar eventos de compras aprovadas.'},409)
    const enabled=process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED==='true'
    if (!enabled) return json({error:'Disparos reais estão pausados no servidor. Nenhuma mensagem foi enviada.'},409)
    const eligible=await hooksFor(db,record.products)
    if (ids.some(id=>!eligible.some(h=>h.id===id))) return json({error:'Webhook inativo ou incompatível com este produto.'},409)
    const prior=await checked(db.from('webhook_deliveries').select('id,webhook_id,payload,status,attempts').eq('order_id',orderId).eq('event_type','order.paid').order('created_at',{ascending:false}).limit(100))
    const source=prior.find(item=>item.payload?.event==='order.paid' && ['live','test'].includes(item.payload?.environment))
    if (!source) return json({error:'Payload original da venda indisponível. Reenvio bloqueado para não transmitir dados incompletos.'},409)
    const currentEnv=process.env.VERCEL_ENV==='production'?'live':'test'
    if (source.payload.environment!==currentEnv) return json({error:'O ambiente desta venda não corresponde ao ambiente do servidor.'},409)
    const queued=[]
    for (const webhookId of ids) {
      const existing=prior.find(item=>item.webhook_id===webhookId && ['pending','retry','processing'].includes(item.status))
      if (existing) { queued.push({webhook_id:webhookId,id:existing.id,already_queued:true});continue }
      const deliveryId=randomUUID()
      const inserted=await checked(db.from('webhook_deliveries').insert({
        id:deliveryId,webhook_id:webhookId,order_id:orderId,event_type:'order.paid',
        status:'pending',attempts:0,next_attempt_at:new Date().toISOString(),
        payload:{...source.payload,id:deliveryId,created_at:new Date().toISOString()}
      }).select('id').single())
      queued.push({webhook_id:webhookId,id:inserted.id,already_queued:false})
    }
    await checked(db.from('webhook_events').insert({pagarme_event_id:`manual-webhook:${randomUUID()}`,type:'checkout.webhook.manual',payload:{order_id:orderId,webhook_ids:ids,delivery_ids:queued.map(q=>q.id)},processed_at:new Date().toISOString()}))
    after(async()=>{try{await processOutboundWebhooks(db)}catch{console.error('checkout manual webhook: fila pendente')}})
    return json({ok:true,queued})
  } catch {return json({error:'Não foi possível preparar o reenvio. Nenhuma confirmação de entrega foi registrada.'},500)}
}
