import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {UUID} from '@/lib/checkoutWebhookSettings'
import {notifyAccessPabbly} from '@/lib/checkoutAccessPabblyServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})

export async function POST(request){
  const db=checkoutAdminClient()
  if (!(await autorizarAdmin(request,db))) return response({error:'Acesso restrito.'},403)
  if (request.headers.get('origin')!==new URL(request.url).origin) return response({error:'Origem inválida.'},403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({error:'Formato inválido.'},415)
  try {
    const {order_id}=await request.json()
    if (!UUID.test(order_id)) return response({error:'Venda inválida.'},400)
    const {data:order,error:orderError}=await db.from('orders').select('id,customer_id,offer_id,status,paid_at').eq('id',order_id).maybeSingle()
    if (orderError || !order) return response({error:'Venda não encontrada.'},404)
    if (order.status!=='paid' || !order.paid_at) return response({error:'Somente vendas aprovadas.'},409)
    const {data:access,error:accessError}=await db.from('webhook_events').select('processed_at').eq('pagarme_event_id',`access:${order_id}`).maybeSingle()
    if (accessError || !access?.processed_at) return response({error:'Liberação de acesso não confirmada.'},409)
    const {data:customer,error:customerError}=await db.from('customers').select('id,name,email,phone,profile_id').eq('id',order.customer_id).maybeSingle()
    if (customerError || !customer?.profile_id) return response({error:'Aluna sem acesso vinculado.'},409)
    const {data:offer}=await db.from('offers').select('name').eq('id',order.offer_id).maybeSingle()
    // Não reseta senhas: a aluna recebe um link seguro para defini-la caso não lembre.
    const result=await notifyAccessPabbly(db,{order,customer,productName:offer?.name,password:null})
    const descriptions={accepted_by_pabbly:'Pabbly recebeu as instruções de acesso.',already_sent:'Este acesso já foi encaminhado ao Pabbly.',in_progress:'Envio em andamento.'}
    if (result.status==='accepted_by_pabbly' || result.status==='already_sent' || result.status==='in_progress')
      return response({ok:true,status:result.status,message:descriptions[result.status]})
    return response({error:'Não foi possível encaminhar o acesso ao Pabbly.',status:result.status},503)
  }catch{return response({error:'Falha ao encaminhar o acesso.'},500)}
}
