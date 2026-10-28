export const SUBSCRIPTION_STATUSES={active:'Ativa',past_due:'Pagamento atrasado',canceled:'Cancelada',expired:'Expirada'}
const text=value=>String(value || '').trim().slice(0,150)
export function subscriptionFilters(params){
 const status=text(params.get('status')) || 'all'
 if(status!=='all' && status!=='todos' && !Object.hasOwn(SUBSCRIPTION_STATUSES,status))throw new Error('Status inválido.')
 const result={status,code:text(params.get('code')),contact:text(params.get('contact')),produto:text(params.get('produto')),inicio:text(params.get('inicio')),fim:text(params.get('fim')),email:text(params.get('email')),document:text(params.get('document')),date_by:text(params.get('date_by')) || 'created_at',charge_min:text(params.get('charge_min')),charge_max:text(params.get('charge_max'))}
 if(!['created_at','updated_at','canceled_at','current_period_end'].includes(result.date_by))throw new Error('Data de referência inválida.')
 for(const key of ['charge_min','charge_max'])if(result[key]&&!/^\d{1,6}$/.test(result[key]))throw new Error('Quantidade de cobranças inválida.')
 if(result.charge_min&&result.charge_max&&Number(result.charge_min)>Number(result.charge_max))throw new Error('Intervalo de cobranças inválido.')
 if(result.produto && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.produto))throw new Error('Produto inválido.')
 for(const key of ['inicio','fim'])if(result[key]){const value=new Date(result[key]+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(result[key]) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0,10)!==result[key])throw new Error('Período inválido.')}
 if(result.inicio && result.fim && result.inicio>result.fim)throw new Error('A data final deve ser posterior à inicial.')
 return result
}
const wildcard=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`
export function subscriptionQuery(db,params,{count=false}={}){
 const f=subscriptionFilters(params)
 let query=db.from('subscriptions').select('id,customer_id,offer_id,origin_order_id,pagarme_subscription_id,status,current_period_end,canceled_at,created_at,customer:customers!inner(id,name,email,phone,document,billing_address),offer:offers!inner(id,name,product_id,billing_interval,billing_interval_count,trial_days,price_cents,billing_cycles,product:products(id,name,code,marketplace_id))',count?{count:'exact'}:undefined)
 if(!['all','todos'].includes(f.status))query=query.eq('status',f.status)
 if(f.code){if(/^[0-9a-f-]{36}$/i.test(f.code))query=query.eq('id',f.code);else query=query.ilike('pagarme_subscription_id',wildcard(f.code))}
 if(f.contact)query=query.ilike('customer.name',wildcard(f.contact))
 if(f.email)query=query.ilike('customer.email',wildcard(f.email))
 if(f.document)query=query.ilike('customer.document',wildcard(f.document))
 if(f.produto)query=query.eq('offer.product_id',f.produto)
 if(f.inicio&&f.date_by!=='updated_at')query=query.gte(f.date_by,f.inicio+'T00:00:00-03:00')
 if(f.fim&&f.date_by!=='updated_at'){const end=new Date(f.fim+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);query=query.lt(f.date_by,end.toISOString().slice(0,10)+'T00:00:00-03:00')}
 return query
}
export function subscriptionFrequency(offer){
 const unit=offer?.billing_interval,count=offer?.billing_interval_count
 if(!Number.isInteger(count) || count<1)return '—'
 const units={day:['dia','dias'],week:['semana','semanas'],month:['mês','meses'],year:['ano','anos']}
 return units[unit]?`${count} ${units[unit][count===1?0:1]}`:'—'
}
export function enrichSubscriptions(rows,charges){
 const groups=new Map()
 for(const charge of charges){if(!charge.pagarme_charge_id)continue;const origin=charge.parent_order_id || charge.id;if(!groups.has(origin))groups.set(origin,new Set());groups.get(origin).add(charge.pagarme_charge_id)}
 return rows.map(row=>({...row,offer_name:row.offer?.name || '',product_name:row.offer?.product?.name || '',billing_frequency:subscriptionFrequency(row.offer),charge_count:groups.get(row.origin_order_id)?.size || 0}))
}
export async function subscriptionUpdateDates(db,rows,charges=[]){
 const resources=new Map(rows.map(row=>[row.id,new Set(row.pagarme_subscription_id?[row.pagarme_subscription_id]:[])]))
 const origins=new Map(rows.filter(row=>row.origin_order_id).map(row=>[row.origin_order_id,row.id]))
 for(const charge of charges){const id=origins.get(charge.parent_order_id || charge.id);if(id && charge.pagarme_charge_id)resources.get(id).add(charge.pagarme_charge_id)}
 const codes=[...new Set([...resources.values()].flatMap(set=>[...set]))],latest=new Map()
 for(let batch=0;batch<codes.length;batch+=200){const group=codes.slice(batch,batch+200)
  for(let offset=0;;offset+=1000){const {data,error}=await db.from('webhook_events').select('payload,processed_at').in('payload->>resource_id',group).not('processed_at','is',null).order('processed_at',{ascending:false}).order('id').range(offset,offset+999);if(error)throw error;for(const event of data || [])if(!latest.has(event.payload?.resource_id))latest.set(event.payload.resource_id,event.processed_at);if(group.every(code=>latest.has(code)) || !data || data.length<1000)break}
 }
 return rows.map(row=>({...row,updated_at:[...resources.get(row.id)].map(code=>latest.get(code)).filter(Boolean).sort().at(-1) || null}))
}
export async function subscriptionDetails(db,rows){
 const ids=[...new Set(rows.map(row=>row.origin_order_id).filter(Boolean))]
 if(!ids.length)return enrichSubscriptions(await subscriptionUpdateDates(db,rows),[])
 const charges=[]
 for(const field of ['id','parent_order_id']){
  for(let offset=0;;offset+=1000){const {data,error}=await db.from('orders').select('id,parent_order_id,pagarme_charge_id').in(field,ids).order('id').range(offset,offset+999);if(error)throw error;charges.push(...(data || []));if(!data || data.length<1000)break}
 }
 return enrichSubscriptions(await subscriptionUpdateDates(db,rows,charges),charges)
}
export async function subscriptionFilteredRows(db,params){
 const rows=[]
 for(let offset=0;offset<=50000;offset+=500){const {data,error}=await subscriptionQuery(db,params).order('id').range(offset,offset+499);if(error)throw error;if(rows.length+(data?.length || 0)>50000)throw new Error('Mais de 50 mil registros. Aplique filtros para reduzir a exportação.');rows.push(...await subscriptionDetails(db,data || []));if(!data || data.length<500)break}
 const f=subscriptionFilters(params)
 return rows.filter(row=>{if(f.charge_min&&row.charge_count<Number(f.charge_min))return false;if(f.charge_max&&row.charge_count>Number(f.charge_max))return false;if(f.date_by==='updated_at'&&(f.inicio||f.fim)){if(!row.updated_at)return false;const day=new Date(row.updated_at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});if(f.inicio&&day<f.inicio||f.fim&&day>f.fim)return false}return true})
}
export const subscriptionExportRows=subscriptionFilteredRows
