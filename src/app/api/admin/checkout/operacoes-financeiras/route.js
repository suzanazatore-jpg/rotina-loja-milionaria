import {randomUUID} from 'node:crypto'
import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {reverseOrderAccess} from '@/lib/checkoutAccessServer'
import {pagarme,PaymentError,gatewayConfiguration} from '@/lib/pagarme'
import {UUID} from '@/lib/checkoutWebhookSettings'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const read=async query=>{const {data,error}=await query;if(error)throw new PaymentError('Falha ao consultar o registro administrativo.',503);return data}

async function recordProviderState(db,order,status,action){
  if (!['refunded','chargedback'].includes(status)) throw new PaymentError('Situação financeira não confirmada pela operadora.',409)
  await read(db.from('orders').update({status}).eq('id',order.id).eq('pagarme_charge_id',order.pagarme_charge_id))
  const reversal=await reverseOrderAccess(db,order.id)
  await read(db.from('webhook_events').insert({
    pagarme_event_id:`admin-finance:${action}:${order.id}:${randomUUID()}`,
    type:`checkout.admin.${action}`,
    payload:{order_id:order.id,pagarme_charge_id:order.pagarme_charge_id,confirmed_status:status},
    processed_at:new Date().toISOString()
  }))
  return reversal
}
export async function POST(request){
  try{
    const db=checkoutAdminClient()
    if (!(await autorizarAdmin(request,db))) return reply({error:'Acesso restrito.'},403)
    if (request.headers.get('origin')!==new URL(request.url).origin) return reply({error:'Origem inválida.'},403)
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Formato inválido.'},415)
    const raw=await request.text()
    if(Buffer.byteLength(raw)>2048)return reply({error:'Solicitação muito grande.'},413)
    let input
    try{input=JSON.parse(raw)}catch{return reply({error:'Dados inválidos.'},400)}
    if (!UUID.test(input?.order_id)||!['refund','verify_chargeback'].includes(input?.action)) return reply({error:'Operação inválida.'},400)
    if(input.action==='refund'&&input.confirmation!=='REEMBOLSAR')return reply({error:'Digite REEMBOLSAR para confirmar a devolução integral.'},400)
    const order=await read(db.from('orders').select('id,status,total_cents,pagarme_charge_id,pagarme_order_id,paid_at').eq('id',input.order_id).maybeSingle())
    if(!order?.pagarme_charge_id||!order.pagarme_order_id)return reply({error:'Venda sem cobrança verificável na Pagar.me.'},409)
    if(!/^ch_[a-zA-Z0-9_-]+$/.test(order.pagarme_charge_id))return reply({error:'Identificador da cobrança inválido.'},409)
    const gateway=gatewayConfiguration()
    if(gateway.base!=='https://api.pagar.me/core/v5')return reply({error:'Operação financeira disponível apenas em produção.'},409)
    const charge=await pagarme(`/charges/${order.pagarme_charge_id}`)
    if(charge.id!==order.pagarme_charge_id||(charge.order?.id&&charge.order.id!==order.pagarme_order_id))return reply({error:'Cobrança remota não corresponde ao pedido.'},409)
    if(input.action==='verify_chargeback'){
      if(charge.status!=='chargedback')return reply({error:'A Pagar.me não confirma chargeback nesta cobrança. Nenhum status foi alterado.',provider_status:charge.status},409)
      if(order.status==='chargedback')return reply({ok:true,status:'chargedback',already_confirmed:true})
      const reversal=await recordProviderState(db,order,'chargedback','chargeback_verified')
      return reply({ok:true,status:'chargedback',...reversal})
    }
    if(charge.status==='refunded'){
      if(order.status!=='refunded')await recordProviderState(db,order,'refunded','refund_verified')
      return reply({ok:true,status:'refunded',already_refunded:true})
    }
    if(order.status!=='paid'||!order.paid_at||charge.status!=='paid'||Number(charge.amount)!==order.total_cents)
      return reply({error:'Venda não elegível para estorno integral ou valor divergente; nenhuma cobrança foi alterada.'},409)
    // Bloqueio contra repetições, inclusive quando o provedor responde com timeout.
    const marker=`admin-refund:${order.id}`
    const receipt=await db.from('webhook_events').insert({pagarme_event_id:marker,type:'checkout.admin.refund_requested',payload:{order_id:order.id,charge_id:order.pagarme_charge_id,amount_cents:order.total_cents},error:'processing'})
    if(receipt.error){
      if(receipt.error.code==='23505')return reply({error:'Reembolso já solicitado. Confira primeiro o status da cobrança na Pagar.me.'},409)
      throw new PaymentError('Não foi possível registrar a solicitação com segurança.',503)
    }
    await pagarme(`/charges/${order.pagarme_charge_id}`,{method:'DELETE',body:{amount:order.total_cents}})
    const verified=await pagarme(`/charges/${order.pagarme_charge_id}`)
    if(verified.status!=='refunded'){
      await read(db.from('webhook_events').update({error:'awaiting_provider_confirmation'}).eq('pagarme_event_id',marker))
      return reply({ok:true,status:'pending',message:'Solicitação enviada. A confirmação do reembolso ainda depende da Pagar.me.'},202)
    }
    const reversal=await recordProviderState(db,order,'refunded','refund_confirmed')
    await read(db.from('webhook_events').update({processed_at:new Date().toISOString(),error:null}).eq('pagarme_event_id',marker))
    return reply({ok:true,status:'refunded',...reversal})
  }catch(error){
    return reply({error:error instanceof PaymentError?error.message:'Não foi possível concluir a operação financeira. Confira a cobrança na Pagar.me antes de tentar novamente.'},error.status||500)
  }
}
