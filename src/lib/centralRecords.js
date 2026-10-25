export const validId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
export async function allRows(factory,limit=100000){const rows=[];for(let offset=0;;offset+=1000){const {data,error}=await factory().range(offset,offset+999);if(error)throw error;rows.push(...data || []);if(rows.length>limit)throw new Error('Muitos registros. Reduza o período.');if(!data || data.length<1000)return rows}}
const plain=value=>String(value || '').trim().slice(0,150)
export function saleFilters(params){
 const f=Object.fromEntries(['status','oferta','produto','inicio','fim','date_by','method','marketplace','code','name','email','document','source','customer'].map(key=>[key,plain(params.get(key))]))
 f.date_by=f.date_by || 'created_at'
 if(!['created_at','paid_at'].includes(f.date_by))throw new Error('Data de referência inválida.')
 for(const key of ['produto','oferta','customer'])if(f[key]&&!validId(f[key]))throw new Error('Código inválido.')
 for(const key of ['inicio','fim'])if(f[key]){const date=new Date(f[key]+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(f[key])||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==f[key])throw new Error('Período inválido.')}
 if(f.inicio&&f.fim&&f.inicio>f.fim)throw new Error('Período inválido.')
 if(f.method&&!['pix','credit_card'].includes(f.method))throw new Error('Pagamento inválido.')
 if(f.status&&!['todos','all','paid','pending','waiting_payment','failed','canceled','refunded','authorized','processing','expired','chargeback','chargedback'].includes(f.status))throw new Error('Status inválido.')
 return f
}
const wildcard=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`
export async function readSales(db,params=new URLSearchParams()){
 const f=saleFilters(params)
 const rows=await allRows(()=>{let q=db.from('orders').select('id,customer_id,offer_id,parent_order_id,status,payment_method,installments,subtotal_cents,interest_cents,discount_cents,total_cents,pagarme_order_id,pagarme_charge_id,created_at,paid_at,refusal_reason,utm_source,utm_medium,utm_campaign,utm_content,utm_term,event_id,client_ip,user_agent,customer:customers!inner(id,name,email,phone,document,billing_address),offer:offers!inner(id,name,slug,product_id,product:products(id,name,marketplace_id,code))')
  if(f.status&&!['todos','all'].includes(f.status))q=q.eq('status',f.status)
  if(f.method)q=q.eq('payment_method',f.method)
  if(f.oferta)q=q.eq('offer_id',f.oferta)
  if(f.customer)q=q.eq('customer_id',f.customer)
  for(const key of ['name','email','document'])if(f[key])q=q.ilike(`customer.${key}`,wildcard(f[key]))
  if(f.source)q=q.ilike('utm_source',wildcard(f.source))
  if(f.inicio)q=q.gte(f.date_by,f.inicio+'T00:00:00-03:00')
  if(f.fim){const end=new Date(f.fim+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);q=q.lt(f.date_by,end.toISOString().slice(0,10)+'T00:00:00-03:00')}
  if(f.code){if(validId(f.code))q=q.eq('id',f.code);else q=q.ilike('pagarme_charge_id',wildcard(f.code))}
  if(f.marketplace)q=q.eq('offer.product.marketplace_id',f.marketplace)
  return q.order('created_at',{ascending:false}).order('id')
 })
 let matchingItems=null
 if(f.produto)matchingItems=new Set((await allRows(()=>db.from('order_items').select('order_id').eq('product_id',f.produto).order('id'))).map(r=>r.order_id))
 return rows.filter(r=>(!f.marketplace||r.offer?.product?.marketplace_id===f.marketplace)&&(!f.produto||r.offer?.product_id===f.produto||matchingItems.has(r.id))).map(r=>({...r,offer_name:r.offer?.name || '',product_name:r.offer?.product?.name || '',marketplace:r.offer?.product?.marketplace_id || 'pagarme'}))
}
export async function relatedItems(db,ids){const rows=[];for(let i=0;i<ids.length;i+=200)rows.push(...await allRows(()=>db.from('order_items').select('id,order_id,kind,price_cents,product_id,offer_id,product:products(id,name,code,marketplace_id),offer:offers(id,name)').in('order_id',ids.slice(i,i+200)).order('id')));return rows}
const eventName=type=>({'order.paid':'Pagamento aprovado','charge.paid':'Cobrança aprovada','charge.payment_failed':'Cobrança recusada','order.payment_failed':'Pagamento recusado','subscription.created':'Assinatura criada','subscription.updated':'Assinatura atualizada','subscription.canceled':'Assinatura cancelada','subscription.admin_canceled':'Assinatura cancelada pelo administrador','subscription.admin_synced':'Status consultado no Pagar.me','charge.refunded':'Reembolso registrado','order.canceled':'Pedido cancelado','charge.chargedback':'Contestação registrada'})[type] || `Evento: ${type}`
export async function recordActivity(db,{entity,id,orders=[],subscriptions=[]}){
 const resourceIds=[...new Set([...orders.flatMap(o=>[o.pagarme_order_id,o.pagarme_charge_id]),...subscriptions.map(s=>s.pagarme_subscription_id)].filter(Boolean))]
 const events=[],comments=[]
 for(let i=0;i<resourceIds.length;i+=200){const records=await allRows(()=>db.from('webhook_events').select('id,type,received_at,processed_at,error,payload').in('payload->>resource_id',resourceIds.slice(i,i+200)).order('received_at',{ascending:false}).order('id'));events.push(...records.map(e=>({id:e.id,title:eventName(e.type),at:e.processed_at || e.received_at,description:e.processed_at?'Processado pela central':e.error?'Aguardando reconciliação':'Recebido pela central'})))}
 const saved=[];const commentIds=entity==='clientes'?[id,...orders.map(o=>o.id),...subscriptions.map(s=>s.id)]:[id];for(let i=0;i<commentIds.length;i+=200)saved.push(...await allRows(()=>db.from('webhook_events').select('id,payload,received_at').eq('type','central.comment').in('payload->>entity_id',commentIds.slice(i,i+200)).order('received_at',{ascending:false}).order('id')))
 comments.push(...saved.map(e=>({id:e.id,text:String(e.payload?.text || '').slice(0,3000),at:e.received_at,actor:e.payload?.actor || 'Administrador'})))
 const orderIds=orders.map(o=>o.id)
 for(let i=0;i<orderIds.length;i+=200){const deliveries=await allRows(()=>db.from('webhook_deliveries').select('id,event_type,status,attempts,created_at,delivered_at,response_status').in('order_id',orderIds.slice(i,i+200)).order('created_at',{ascending:false}).order('id'));events.push(...deliveries.map(e=>({id:`delivery:${e.id}`,title:e.status==='delivered'?'Webhook entregue':'Webhook registrado',at:e.delivered_at || e.created_at,description:`${e.event_type} · ${e.attempts || 0} tentativa(s)${e.response_status?` · HTTP ${e.response_status}`:''}`})))}
 events.push(...comments.map(c=>({id:`comment:${c.id}`,title:'Comentário interno registrado',at:c.at,description:c.text.slice(0,160)})))
 for(const subscription of subscriptions)events.push({id:`subscription:${subscription.id}`,title:'Assinatura criada',at:subscription.created_at,description:subscription.product_name || ''})
 for(const order of orders){events.push({id:`order:${order.id}`,title:'Pedido criado',at:order.created_at,description:order.product_name || order.offer_name || ''});if(order.paid_at)events.push({id:`paid:${order.id}`,title:'Pagamento confirmado',at:order.paid_at,description:'Valor integral da venda registrado na central'})}
 return {events:events.filter(e=>e.at).sort((a,b)=>String(b.at).localeCompare(String(a.at))),comments}
}
