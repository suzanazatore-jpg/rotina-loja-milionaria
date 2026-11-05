import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { GET as readRecord } from '../registros/route'
import { autorizarAdmin, checkoutAdminClient, ADMIN_EMAIL } from '@/lib/checkoutAdminServer'
import { invoiceToken, validateInvoice, validateBuyer, auditEvent, redactAudit } from '@/lib/saleDetail'
import { validId } from '@/lib/centralRecords'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'
import { syncPayment } from '@/lib/checkoutPaymentsServer'
import { reverseOrderAccess } from '@/lib/checkoutAccessServer'
import { pagarme } from '@/lib/pagarme'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'
import { sendContractInvite, sendSignedContractCopies } from '@/lib/contractsServer'

export const runtime='nodejs'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
async function checked(q){const {data,error}=await q;if(error)throw new Error('Não foi possível consultar ou salvar os dados da venda.');return data}
const providerTitles={'order.paid':'Pagamento aprovado','charge.paid':'Cobrança aprovada','order.created':'Pedido recebido pelo Pagar.me','charge.created':'Cobrança criada','order.payment_failed':'Pagamento recusado','charge.payment_failed':'Cobrança recusada','charge.refunded':'Reembolso registrado','charge.chargedback':'Contestação registrada'}
const stateLabels={pending:'Na fila',retry:'Nova tentativa pendente',processing:'Processando',delivered:'Entregue',failed:'Falha'}
const actionTitles={sync:'Atualização de Status da Venda',buyer:'Comprador atualizado',invoice:'Nota fiscal informada',resend:'Reenvio solicitado',refund:'Reembolso solicitado',chargeback:'Venda marcada como Chargeback'}
async function load(db,id){return checked(db.from('orders').select('*,customer:customers(*),offer:offers(*,product:products(*))').eq('id',id).single())}
async function adminEvents(db,id){return checked(db.from('webhook_events').select('id,type,payload,received_at,processed_at,error').eq('type','central.sale.action').eq('payload->>order_id',id).order('received_at',{ascending:false}).limit(250))}
export async function GET(request){try{
 const db=checkoutAdminClient();if(!await autorizarAdmin(request,db))return reply({error:'Acesso restrito.'},401)
 const id=new URL(request.url).searchParams.get('id');if(!validId(id))return reply({error:'Venda inválida.'},400)
 const url=new URL(request.url);url.pathname='/api/admin/checkout/registros';url.search=new URLSearchParams({entity:'vendas',id}).toString()
 const original=await readRecord(new Request(url,{headers:request.headers}));if(!original.ok)return original
 const data=await original.json(),order=await load(db,id),actions=await adminEvents(db,id)
 const buyer=actions.find(e=>e.processed_at&&e.payload.action==='buyer')?.payload.buyer
 if(buyer)data.customer={...data.customer,...buyer}
 const invoice=actions.find(e=>e.processed_at&&e.payload.action==='invoice')?.payload.invoice || null
 const deliveries=await checked(db.from('webhook_deliveries').select('id,event_type,status,attempts,payload,response_status,created_at,delivered_at,webhook_id').eq('order_id',id).order('created_at',{ascending:false}).limit(250))
 const hooks=deliveries.length?await checked(db.from('outbound_webhooks').select('id,name,active').in('id',[...new Set(deliveries.map(d=>d.webhook_id))])):[]
 const resourceIds=[order.pagarme_order_id,order.pagarme_charge_id].filter(Boolean)
 const provider=resourceIds.length?await checked(db.from('webhook_events').select('id,type,payload,received_at,processed_at,error').in('payload->>resource_id',resourceIds).order('received_at',{ascending:false}).limit(250)):[]
 let lastTransaction=provider.map(e=>e.payload?.data?.last_transaction || e.payload?.data?.charges?.[0]?.last_transaction).find(Boolean) || {}
 let paymentError=null
 if(new URL(request.url).searchParams.get('payment')==='1'&&/^ch_[a-zA-Z0-9]+$/.test(order.pagarme_charge_id || '')){
   try{const remote=await pagarme(`/charges/${order.pagarme_charge_id}`);if(remote.id!==order.pagarme_charge_id||remote.amount!==order.total_cents||remote.order?.id!==order.pagarme_order_id)throw new Error('Cobrança divergente.');const t=remote.last_transaction || {};lastTransaction={acquirer_name:t.acquirer_name,acquirer_tid:t.acquirer_tid,acquirer_return_code:t.acquirer_return_code,acquirer_message:t.acquirer_message,acquirer_auth_code:t.acquirer_auth_code,created_at:t.created_at,updated_at:t.updated_at,card:t.card?{brand:t.card.brand,last_four_digits:t.card.last_four_digits}:null}}
   catch{paymentError='Não foi possível consultar os detalhes no Pagar.me. Os dados locais foram preservados.'}
 }
 const events=[...data.activity.events.filter(e=>!String(e.id).startsWith('delivery:')&&!provider.some(p=>p.id===e.id)),...provider.map(e=>auditEvent({...e,title:providerTitles[e.type] || 'Informação Recebida do Pagar.me',error:e.error==='reconciliation_pending'?'Aguardando conciliação':e.error?'Falha no processamento':null})),...actions.map(e=>auditEvent({...e,title:actionTitles[e.payload.action] || e.type})),...deliveries.map(e=>({id:`delivery:${e.id}`,title:e.status==='delivered'?'Webhook Enviado':'Webhook registrado',at:e.delivered_at || e.created_at,description:`${hooks.find(h=>h.id===e.webhook_id)?.name || 'Webhook'} · ${stateLabels[e.status] || 'Em processamento'} · ${e.attempts} tentativa(s)`,json:redactAudit({event:e.event_type,status:e.status,attempts:e.attempts,response_status:e.response_status,payload:e.payload}),created_at:e.created_at,finished_at:e.delivered_at}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)))
 const aliases=await checked(db.from('checkout_offer_links').select('path').eq('offer_id',order.offer_id).limit(1))
 const token=invoiceToken(id,process.env.CHECKOUT_SESSION_SECRET)
 const contract=data.contract
 return reply({...data,record:{...data.record,pix_qr_code:order.pix_qr_code,pix_expires_at:order.pix_expires_at},activity:{...data.activity,events},invoice,payment_details_loaded:new URL(request.url).searchParams.get('payment')==='1',payment_error:paymentError,transaction:redactAudit(lastTransaction),payment_path:aliases[0]?.path?`/p/${aliases[0].path}`:null,invoice_path:token?`/compra/${token}`:null,capabilities:{area:process.env.CHECKOUT_FULFILLMENT_ENABLED==='true'&&order.status==='paid',contracts:process.env.CONTRACTS_ENABLED==='true'&&Boolean(contract)&&order.status==='paid',emails:Boolean(process.env.BREVO_API_KEY)&&order.status==='paid',webhooks:process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED==='true'&&deliveries.some(d=>hooks.some(h=>h.id===d.webhook_id&&h.active)),refund:order.status==='paid'&&Boolean(order.pagarme_charge_id),chargeback:order.status==='paid'},actions:actions.map(e=>({action:e.payload.action,at:e.processed_at,result:e.payload.result}))})
}catch{return reply({error:'Não foi possível carregar os detalhes da venda.'},500)}}
export async function POST(request){let db,marker,payload;try{
 db=checkoutAdminClient();if(!await autorizarAdmin(request,db))return reply({error:'Acesso restrito.'},401)
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origem inválida.'},403)
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Formato inválido.'},415)
 const raw=await request.text();if(Buffer.byteLength(raw)>16000)return reply({error:'Dados excedem o limite.'},413)
 const input=JSON.parse(raw);if(!validId(input.id)||!Object.hasOwn(actionTitles,input.action))return reply({error:'Ação inválida.'},400)
 const order=await load(db,input.id),key=request.headers.get('idempotency-key');if(!validId(key))return reply({error:'Identificador da operação inválido.'},400)
 marker=`sale-action:${key}`;payload={order_id:order.id,action:input.action,actor:ADMIN_EMAIL,infrastructure:{ip:request.headers.get('x-forwarded-for')?.split(',')[0] || null,user_agent:request.headers.get('user-agent')?.slice(0,500) || null}}
 if(input.action==='invoice')payload.invoice=validateInvoice(input.invoice)
 if(input.action==='buyer')payload.buyer=validateBuyer(input.buyer)
 if(['refund','chargeback'].includes(input.action)){if(!String(input.reason || '').trim() || input.reason.length>1000)throw new Error('Informe um motivo de até 1.000 caracteres.');payload.reason=input.reason.trim();if(order.status!=='paid')throw new Error('Esta ação exige uma venda aprovada.')}
 const created=await db.from('webhook_events').insert({pagarme_event_id:marker,type:'central.sale.action',payload,error:'processing'})
 if(created.error){if(created.error.code==='23505'){const existing=await checked(db.from('webhook_events').select('payload,processed_at,error').eq('pagarme_event_id',marker).single());if(existing.payload.order_id!==order.id||existing.payload.action!==input.action)return reply({error:'Identificador já utilizado.'},409);return existing.processed_at?reply({ok:true,result:existing.payload.result}):reply({error:'A operação já foi recebida. Confira a auditoria antes de repetir.'},409)}throw new Error('Não foi possível registrar a operação.')}
 let result={}
 if(input.action==='buyer' && input.update_contact){const {company_name,...customer}=payload.buyer;await checked(db.from('customers').update(customer).eq('id',order.customer_id).select('id').single());result.contact_updated=true}
 if(input.action==='sync'){result=await syncPayment(db,order.id);if(result.status==='paid')result={...result,...await fulfillPaidOrder(db,order.id)};if(['refunded','chargedback'].includes(result.status))result={...result,...await reverseOrderAccess(db,order.id)}}
 if(input.action==='refund'){if(!/^ch_[a-zA-Z0-9]+$/.test(order.pagarme_charge_id || ''))throw new Error('Cobrança não disponível.');const remote=await pagarme(`/charges/${order.pagarme_charge_id}`);if(remote.id!==order.pagarme_charge_id||remote.amount!==order.total_cents||remote.order?.id!==order.pagarme_order_id)throw new Error('A cobrança não corresponde à venda.');await pagarme(`/charges/${order.pagarme_charge_id}`,{method:'DELETE',body:{amount:order.total_cents,reason:'4000'},idempotencyKey:marker});result=await syncPayment(db,order.id);if(['refunded','chargedback'].includes(result.status))result={...result,...await reverseOrderAccess(db,order.id)}}
 if(input.action==='chargeback'){const rows=await checked(db.from('orders').update({status:'chargedback'}).eq('id',order.id).eq('status','paid').select('id'));if(!rows.length)throw new Error('O status mudou. Atualize a venda.');result=await reverseOrderAccess(db,order.id)}
 if(input.action==='resend'){
   const channels=[...new Set(input.channels || [])];if(!channels.length||channels.some(c=>!['area','contracts','webhooks','emails'].includes(c)))throw new Error('Selecione uma integração disponível.')
   result={};for(const channel of channels){try{
    if(channel==='area'){if(order.status!=='paid'||process.env.CHECKOUT_FULFILLMENT_ENABLED!=='true')throw new Error('Área de membros indisponível.');const access=await fulfillPaidOrder(db,order.id);result.area=access.fulfillment}
    if(channel==='emails'){
      if(order.status!=='paid'||!process.env.BREVO_API_KEY)throw new Error('Email transacional indisponível.')
      const token=invoiceToken(order.id,process.env.CHECKOUT_SESSION_SECRET)
      if(!token)throw new Error('Link da venda não configurado.')
      const base=(process.env.CONTRACTS_APP_URL || 'https://rotina.suzanazatorre.com.br').replace(/\/$/,'')
      const link=`${base}/compra/${token}`
      const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':process.env.BREVO_API_KEY},signal:AbortSignal.timeout(15000),body:JSON.stringify({sender:{name:'Suzana Zatorre',email:'suporte@suzanazatorre.com.br'},to:[{email:order.customer.email,name:order.customer.name}],subject:'Confirmação da sua compra — Suzana Zatorre',textContent:`Seu pagamento foi confirmado. Acompanhe sua compra em: ${link}\n\nSe o seu produto exige contrato, a liberação depende da assinatura.`,headers:{'X-Mailin-custom':marker}})})
      if(!response.ok)throw new Error('O serviço de email não aceitou o envio.')
      result.emails={state:'accepted'}
    }
    if(channel==='contracts'){if(process.env.CONTRACTS_ENABLED!=='true'||order.status!=='paid')throw new Error('Contratos indisponíveis.');const c=await checked(db.from('contracts').select('*').eq('order_id',order.parent_order_id || order.id).single());result.contracts=c.status==='signed'?await sendSignedContractCopies(db,c.id,{occurrence:key}):await sendContractInvite(db,c,order.customer,'reminder',{occurrence:key})}
    if(channel==='webhooks'){
      if(process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED!=='true')throw new Error('Envio de webhooks pausado.')
      const rows=await checked(db.from('webhook_deliveries').select('webhook_id,event_type,subscription_id,payload,outbound_webhooks!inner(active)').eq('order_id',order.id).eq('outbound_webhooks.active',true).order('created_at',{ascending:false}))
      const seen=new Set();const latest=rows.filter(e=>{if(e.payload?.order?.status!==order.status||seen.has(e.webhook_id))return false;seen.add(e.webhook_id);return true});if(!latest.length)throw new Error('Nenhum webhook corresponde ao status atual.');
      for(const row of latest){const deliveryId=randomUUID();await checked(db.from('webhook_deliveries').insert({id:deliveryId,webhook_id:row.webhook_id,event_type:row.event_type,order_id:order.id,subscription_id:row.subscription_id,payload:{...row.payload,id:deliveryId,created_at:new Date().toISOString()}}))}
      result.webhooks={state:'queued',count:latest.length};after(async()=>{try{await processOutboundWebhooks(db)}catch{console.error('sale resend: queue pending')}})
    }
   }catch(e){result[channel]={state:'failed',message:e.message}}}
 }
 await checked(db.from('webhook_events').update({payload:{...payload,result},processed_at:new Date().toISOString(),error:null}).eq('pagarme_event_id',marker))
 return reply({ok:true,result})
}catch(error){if(db&&marker&&payload)await db.from('webhook_events').update({error:'action_failed'}).eq('pagarme_event_id',marker).is('processed_at',null);return reply({error:error.message || 'Não foi possível concluir a operação.'},400)}}
