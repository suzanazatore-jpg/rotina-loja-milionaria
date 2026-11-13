// Administrative sale email alerts. Isolated from payment, access and WhatsApp flows.
// Default OFF: enable via CHECKOUT_SALES_EMAIL_ENABLED and per-event/recipient switches after deployment review.
// A provider HTTP acceptance is "sent", never proof of inbox delivery.
const eventNames = {order_created:'Venda criada',order_paid:'Venda aprovada'}
const currency = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100)
const localTime = date => new Date(date).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'})
async function required(query,label){
 const {data,error}=await query
 if(error)throw new Error(label)
 return data
}
export async function sendCheckoutSaleEmail(recipient,sale,{env=process.env,fetcher=fetch}={}){
 if(!env.BREVO_API_KEY)throw new Error('brevo_not_configured')
 if(!recipient||recipient.channel!=='email'||!/^\S+@\S+\.\S+$/.test(recipient.destination))throw new Error('invalid_email_recipient')
 if(!eventNames[sale.event_type])throw new Error('invalid_sale_event')
 const subject='[Rotina] '+eventNames[sale.event_type]+' — '+sale.product
 const lines=[
  eventNames[sale.event_type],
  'Pedido: '+sale.id,
  'Cliente: '+sale.customer,
  'Produto: '+sale.product,
  'Valor: '+currency(sale.total_cents),
  'Pagamento: '+sale.payment_method,
  'Data: '+localTime(sale.occurred_at),
  'Consultar venda: https://rotina.suzanazatorre.com.br/admin/checkout/vendas/'+encodeURIComponent(sale.id),
 ]
 const response=await fetcher('https://api.brevo.com/v3/smtp/email',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({
   sender:{email:'suporte@suzanazatorre.com.br',name:'Suzana Zatorre'},
   to:[{email:recipient.destination,name:recipient.name}],subject,textContent:lines.join('\n')
  })
 })
 if(!response.ok)throw new Error('brevo_http_'+response.status)
 const result=await response.json().catch(()=>({}))
 return {messageId:typeof result.messageId==='string'?result.messageId:null}
}
export async function processCheckoutSaleEmails(db,{env=process.env,sender=sendCheckoutSaleEmail,now=new Date()}={}){
 if(env.CHECKOUT_SALES_EMAIL_ENABLED!=='true')return {enabled:false,processed:0}
 if(!env.BREVO_API_KEY)return {enabled:true,processed:0,error:'brevo_not_configured'}
 const events=await required(db.from('checkout_notification_event_settings').select('event_type').eq('enabled',true),'event_settings_unavailable')
 const allowed=new Set(events.map(x=>x.event_type))
 if(!allowed.size)return {enabled:true,processed:0}
 const pending=await required(db.from('checkout_notification_deliveries').select('id,order_id,recipient_id,event_type,status,attempts').in('status',['queued','failed']).lt('attempts',3).order('created_at',{ascending:true}).limit(20),'delivery_queue_unavailable')
 let processed=0,failed=0
 for(const job of pending){
  if(!allowed.has(job.event_type)||!job.order_id)continue
  const {data:recipient,error:recipientError}=await db.from('checkout_notification_recipients').select('id,name,channel,destination,enabled').eq('id',job.recipient_id).maybeSingle()
  if(recipientError||!recipient||!recipient.enabled||recipient.channel!=='email')continue
  const {data:claimed,error:claimError}=await db.from('checkout_notification_deliveries').update({status:'sending',attempts:job.attempts+1,updated_at:now.toISOString()}).eq('id',job.id).eq('status',job.status).eq('attempts',job.attempts).select('id')
  if(claimError||!claimed?.length)continue
  try{
   const order=await required(db.from('orders').select('id,customer_id,offer_id,total_cents,payment_method,created_at,paid_at,status').eq('id',job.order_id).single(),'order_unavailable')
   // Approval alerts must only describe confirmed payments.
   if(job.event_type==='order_paid'&&(order.status!=='paid'||!order.paid_at))throw new Error('payment_not_confirmed')
   const [customer,offer]=await Promise.all([
    required(db.from('customers').select('name').eq('id',order.customer_id).single(),'customer_unavailable'),
    required(db.from('offers').select('name').eq('id',order.offer_id).single(),'offer_unavailable')
   ])
   const sale={id:order.id,event_type:job.event_type,customer:customer.name,product:offer.name,total_cents:order.total_cents,payment_method:order.payment_method,occurred_at:job.event_type==='order_paid'?order.paid_at:order.created_at}
   const receipt=await sender(recipient,sale,{env})
   const saved=await db.from('checkout_notification_deliveries').update({status:'sent',provider_message_id:receipt.messageId,sent_at:now.toISOString(),error_message:null,updated_at:now.toISOString()}).eq('id',job.id).eq('status','sending')
   if(saved.error)throw new Error('receipt_save_failed')
   processed++
  }catch(e){
   failed++
   // Retries only after a failure; idempotency is guaranteed at order/recipient/event insertion.
   await db.from('checkout_notification_deliveries').update({status:'failed',error_message:String(e.message||'delivery_failed').slice(0,100),updated_at:now.toISOString()}).eq('id',job.id).eq('status','sending')
  }
 }
 return {enabled:true,processed,failed}
}
