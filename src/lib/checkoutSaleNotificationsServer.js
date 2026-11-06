// Envio separado do checkout: erros de email/WhatsApp nunca cancelam uma compra.
// Os dois interruptores do servidor começam desligados por padrão.
const fmt=(cents)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((cents||0)/100)
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash?u.href:null}catch{return null}}
export function saleDeliveryReady(env=process.env){
 return {
  email:Boolean(env.BREVO_API_KEY),
  whatsapp:Boolean(safeUrl(env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_URL)&&env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_TOKEN)
 }
}
export async function sendSaleNotification(recipient,sale,env=process.env,fetcher=fetch){
 const approved=sale.event_type==='order_paid'
 const title=sale.event_type==='test'?'TESTE de notificação':approved?'Venda aprovada':'Venda criada'
 const message=[title,'Rotina da Loja Milionária',`Pedido: ${sale.order_id}`,`Produto: ${sale.name||'Compra'}`,`Valor: ${fmt(sale.amount_cents)}`,`Cliente: ${sale.customer||'Não informado'}`,`Pagamento: ${sale.method||'Não informado'}`,...(sale.link?[`Consultar venda: ${sale.link}`]:[])].join('\n')
 if(recipient.channel==='email'){
  if(!saleDeliveryReady(env).email)throw new Error('email_not_configured')
  const result=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:'suporte@suzanazatorre.com.br',name:'Suzana Zatorre'},to:[{email:recipient.destination}],subject:`[Rotina] ${title}`,textContent:message})})
  if(!result.ok)throw new Error('brevo_http_'+result.status)
  const body=await result.json().catch(()=>({}))
  return {status:'sent',provider:'brevo',provider_message_id:typeof body.messageId==='string'?body.messageId:null}
 }
 if(recipient.channel==='whatsapp'){
  const url=safeUrl(env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_URL)
  if(!url||!env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_TOKEN)throw new Error('whatsapp_not_configured')
  const result=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({schema_version:1,evento:'checkout_sale_notification',delivery_id:sale.delivery_id||'test',phone:recipient.destination,message,order_id:sale.order_id,sale_event:sale.event_type})})
  if(!result.ok)throw new Error('whatsapp_http_'+result.status)
  return {status:'sent',provider:'whatsapp_webhook',provider_message_id:null}
 }
 throw new Error('invalid_channel')
}
export async function processSaleNotifications(db,{env=process.env,send=sendSaleNotification}={}){
 if(env.CHECKOUT_SALES_NOTIFICATIONS_ENABLED!=='true')return {disabled:true,processed:0}
 const status=await db.from('checkout_notification_event_settings').select('event_type').eq('enabled',true)
 if(status.error)throw new Error('sale_events_unavailable')
 const enabled=new Set((status.data||[]).map(item=>item.event_type))
 if(!enabled.size)return {disabled:false,processed:0}
 const queued=await db.from('checkout_notification_deliveries').select('id,order_id,recipient_id,event_type,status,attempts').in('status',['queued','failed']).order('created_at').limit(10)
 if(queued.error)throw new Error('sale_queue_unavailable')
 let processed=0
 for(const item of queued.data||[]){
  if(!enabled.has(item.event_type)||item.attempts>=3)continue
  const claimed=await db.from('checkout_notification_deliveries').update({status:'sending',attempts:item.attempts+1,updated_at:new Date().toISOString()}).eq('id',item.id).eq('status',item.status).eq('attempts',item.attempts).select('id')
  if(claimed.error||!claimed.data?.length)continue
  try{
   const [recipient,order]=await Promise.all([
    db.from('checkout_notification_recipients').select('*').eq('id',item.recipient_id).single(),
    db.from('orders').select('id,offer_id,customer_id,total_cents,payment_method,created_at,paid_at').eq('id',item.order_id).single()
   ])
   if(recipient.error||order.error||!recipient.data?.enabled)throw new Error('recipient_or_order_unavailable')
   const [customer,offer]=await Promise.all([
    db.from('customers').select('name').eq('id',order.data.customer_id).single(),
    db.from('offers').select('name').eq('id',order.data.offer_id).single()
   ])
   const sale={event_type:item.event_type,delivery_id:item.id,order_id:item.order_id,name:offer.data?.name||'Oferta',customer:customer.data?.name||'Cliente',method:order.data.payment_method,amount_cents:order.data.total_cents,link:`https://rotina.suzanazatorre.com.br/admin/checkout/vendas/${item.order_id}`}
   const sent=await send(recipient.data,sale,env)
   const result=await db.from('checkout_notification_deliveries').update({status:'sent',provider_message_id:sent.provider_message_id||null,sent_at:new Date().toISOString(),error_message:null,updated_at:new Date().toISOString()}).eq('id',item.id).eq('status','sending')
   if(result.error)throw new Error('receipt_unavailable')
   processed++
  }catch(error){
   // Pode haver aceite pelo provedor seguido de falha no recibo; não reenviar cegamente após o limite.
   await db.from('checkout_notification_deliveries').update({status:'failed',error_message:String(error.message||'delivery_failed').slice(0,120),updated_at:new Date().toISOString()}).eq('id',item.id).eq('status','sending')
  }
 }
 return {disabled:false,processed}
}
