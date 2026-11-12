import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const analytics = `data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../src/lib/checkoutAnalytics.js', import.meta.url))).toString('base64')}`
const source = readFileSync(new URL('../src/lib/checkoutConversionsServer.js', import.meta.url), 'utf8').replace('./checkoutAnalytics.js', analytics)
const { conversionConfiguration, conversionEvent, sendConversion, deliverPaidConversion, retryConversions, reconcileMissingConversions, purchaseTracking, purchaseRequestContext } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const env = { META_CAPI_PIXEL_ID:'123456', META_CAPI_ACCESS_TOKEN:'secret', VERCEL_ENV:'production', CHECKOUT_CAPI_ENABLED:'true', PAGARME_BASE_URL:'https://api.pagar.me/core/v5' }
const now = Date.now()
const order = { id:'order', status:'paid', paid_at:new Date(now-1000).toISOString(), total_cents:4700 }
const snapshot = { items:[{product_id:'product',name:'Plano',total_cents:4700}], tracking:{consent:true,source_url:'https://example.com/checkout/offer'} }
test('conversion is disabled by default, in previews and for another pixel', () => {
 assert.equal(conversionConfiguration('123456',{}),null)
 assert.equal(conversionConfiguration('654321',env),null)
 assert.equal(conversionConfiguration('123456',{...env,VERCEL_ENV:'preview'}),null)
 assert.equal(conversionConfiguration('123456',{...env,CHECKOUT_CAPI_ENABLED:'false'}),null)
 assert.equal(conversionConfiguration('123456',{...env,META_GRAPH_API_VERSION:'bad/path'}),null)
 assert.ok(conversionConfiguration('123456',env))
 const sandbox = {...env,VERCEL_ENV:'preview',PAGARME_BASE_URL:'https://sdx-api.pagar.me/core/v5',CHECKOUT_CAPI_TEST_ENABLED:'true'}
 assert.equal(conversionConfiguration('123456',sandbox),null)
 assert.equal(conversionConfiguration('123456',{...sandbox,META_CAPI_TEST_EVENT_CODE:'TEST123'}).testCode,'TEST123')
})
test('paid Purchase uses browser event ID, hashes normalized email and requires consent and recent payment', () => {
 const event = conversionEvent(order,snapshot,{email:' Buyer@Example.com '},now)
 assert.equal(event.event_id,'purchase:order');assert.equal(event.custom_data.value,47)
 assert.match(event.user_data.em[0],/^[a-f0-9]{64}$/)
 assert.equal(event.user_data.em[0],conversionEvent(order,snapshot,{email:'buyer@example.com'},now).user_data.em[0])
 assert.ok(!JSON.stringify(event).includes('buyer@example.com'))
 for (const changed of [{status:'pending'},{paid_at:null},{paid_at:new Date(now-8*86400000).toISOString()},{total_cents:4701}]) assert.equal(conversionEvent({...order,...changed},snapshot,{email:'buyer@example.com'},now),null)
 assert.equal(conversionEvent(order,{...snapshot,tracking:{consent:false}},{email:'buyer@example.com'},now),null)
})
test('sends to fixed graph host with test code and checks acknowledgment',async()=>{
 const config=conversionConfiguration('123456',env)
 await sendConversion({...config,testCode:'TEST123'},'123456',{},async(url,options)=>{
  assert.equal(url,'https://graph.facebook.com/v25.0/123456/events')
  assert.equal(new URL(url).search,'')
  assert.equal(JSON.parse(options.body).test_event_code,'TEST123')
  return {ok:true,json:async()=>({events_received:1})}
 })
 await assert.rejects(sendConversion(config,'123456',{},async()=>({ok:true,json:async()=>({events_received:0})})))
})
test('database outage never breaks payment flow',async()=>{
 assert.deepEqual(await deliverPaidConversion({from(){throw new Error('outage')}},'order'),{status:'pending'})
})
function database() {
 const tables={orders:[{...order,event_id:'checkout:session',customer_id:'customer'}],customers:[{id:'customer',email:'buyer@example.com'}],webhook_events:[{pagarme_event_id:'request:session',payload:{...snapshot,tracking:{...snapshot.tracking,pixel_id:'123456',gateway_base:env.PAGARME_BASE_URL}}}]}
 return {tables,from(table){
  let action='read',value,filters=[],single=false
  const q={order(){return q},limit(){return q},in(key,values){filters.push(row=>values.includes(row[key]));return q},like(key,value){filters.push(row=>typeof row[key]==='string'&&row[key].startsWith(value.replace('%','')));return q},gte(key,value){filters.push(row=>row[key]>=value);return q},lte(key,value){filters.push(row=>row[key]<=value);return q},select(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},is(key,value){filters.push(row=>(row[key]??null)===value);return q},single(){single=true;return q},maybeSingle(){single=true;return q},upsert(v){action='insert';value=v;return q},update(v){action='update';value=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(action==='insert'){if(!tables[table].some(row=>row.pagarme_event_id===value.pagarme_event_id))tables[table].push({id:'marker',...value});return {data:null,error:null}}
   const rows=tables[table].filter(row=>filters.every(filter=>filter(row)))
   if(action==='update')rows.forEach(row=>Object.assign(row,value))
   return {data:single?rows[0]:rows,error:null}
  }).then(resolve,reject)}}
  return q
 }}
}
test('concurrent delivery claims once; failed delivery retries with same ID and confirmed delivery stops',async()=>{
 const oldEnv=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));const originalFetch=globalThis.fetch
 Object.assign(process.env,env)
 try {
  const db=database();let calls=0
  globalThis.fetch=async()=>{calls++;return {ok:false,json:async()=>({events_received:0})}}
  await Promise.all([deliverPaidConversion(db,'order'),deliverPaidConversion(db,'order')])
  assert.equal(calls,1)
  assert.equal(db.tables.webhook_events.find(row=>row.type==='checkout.capi').error,'retry')
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).data[0].event_id,'purchase:order');return {ok:true,json:async()=>({events_received:1})}}
  assert.equal((await deliverPaidConversion(db,'order')).status,'scheduled')
  assert.equal(calls,1)
  db.tables.webhook_events.find(row=>row.type==='checkout.capi').payload.next_attempt_at=null
  assert.equal((await deliverPaidConversion(db,'order')).status,'sent')
  await deliverPaidConversion(db,'order');assert.equal(calls,2)
  const sandbox=database();sandbox.tables.webhook_events[0].payload.tracking.gateway_base='https://sdx-api.pagar.me/core/v5'
  assert.equal((await deliverPaidConversion(sandbox,'order')).status,'disabled');assert.equal(calls,2)
 } finally {globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})

test('worker respects gates and due times, limits batch, and retires ineligible rows',async()=>{
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env)
 try {
  const db=database();db.tables.webhook_events=[]
  for(let i=0;i<7;i++){
   const id=`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`
   db.tables.webhook_events.push({pagarme_event_id:`capi:${id}`,type:'checkout.capi',error:'retry',payload:{order_id:id,next_attempt_at:new Date(i===0?now+86400000:now-1000).toISOString()}})
  }
  let calls=0
  const result=await retryConversions(db,async()=>{calls++;return {status:calls===1?'skipped':'sent'}},now)
  assert.equal(calls,4);assert.equal(result.checked,4);assert.equal(result.sent,3)
  assert.equal(db.tables.webhook_events[1].error,'ineligible')
  process.env.CHECKOUT_CAPI_ENABLED='false'
  assert.equal((await retryConversions({from(){throw new Error('should not query')}})).disabled,true)
 }finally{for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
test('eighth failed attempt stops automatic retries for review',async()=>{
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));const original=globalThis.fetch;Object.assign(process.env,env)
 try{
  const db=database()
  db.tables.webhook_events.push({id:'marker',pagarme_event_id:'capi:order',type:'checkout.capi',error:'retry',payload:{attempts:7}})
  globalThis.fetch=async()=>{throw new Error('network')}
  await deliverPaidConversion(db,'order')
  const record=db.tables.webhook_events.find(row=>row.type==='checkout.capi')
  assert.equal(record.error,'review_required');assert.equal(record.payload.attempts,8)
  await deliverPaidConversion(db,'order');assert.equal(record.payload.attempts,8)
 }finally{globalThis.fetch=original;for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
test('cron rejects missing or wrong secret and accepts authenticated disabled run',async()=>{
 const routeSource=readFileSync(new URL('../src/app/api/cron/checkout-conversoes/route.js',import.meta.url),'utf8')
  .replace("import { expireOrderAccess } from '@/lib/checkoutAccessServer'",'const expireOrderAccess = async () => ({disabled:true,checked:0})')
  .replace("import { checkoutAdminClient } from '@/lib/checkoutAdminServer'",'const checkoutAdminClient = () => ({})')
  .replace("import { retryConversions, reconcileMissingConversions } from '@/lib/checkoutConversionsServer'",'const retryConversions = async () => ({disabled:true,checked:0,sent:0}); const reconcileMissingConversions = async () => ({disabled:true,checked:0,queued:0})')
  .replace("import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'",'const processOutboundWebhooks = async () => ({disabled:true,sent:0})')
  .replace("import { processContractReminders } from '@/lib/contractsServer'",'const processContractReminders = async () => ({disabled:true,sent:0})')
  .replace("import { processContractTasks } from '@/lib/contractCompletionServer'",'const processContractTasks = async () => ({disabled:true,checked:0})')
 const {GET}=await import(`data:text/javascript;base64,${Buffer.from(routeSource).toString('base64')}`)
 const saved=process.env.CRON_SECRET
 try{
  delete process.env.CRON_SECRET
  assert.equal((await GET(new Request('https://example.com/api/cron/checkout-conversoes'))).status,401)
  process.env.CRON_SECRET='test-only-secret'
  assert.equal((await GET(new Request('https://example.com/api/cron/checkout-conversoes',{headers:{authorization:'Bearer wrong'}}))).status,401)
  const result=await GET(new Request('https://example.com/api/cron/checkout-conversoes',{headers:{authorization:'Bearer test-only-secret'}}))
  assert.equal(result.status,200);const output=await result.json();assert.equal(output.disabled,true);assert.equal(output.contract_tasks.disabled,true)
 }finally{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved}
})
test('scheduler stays within 100 jobs and each conversion expression runs once daily',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
 assert.ok(config.crons.length<=100)
 const jobs=config.crons.filter(job=>job.path==='/api/cron/checkout-conversoes')
 assert.equal(jobs.length,48);assert.equal(new Set(jobs.map(job=>job.schedule)).size,48)
 for(const job of jobs)assert.match(job.schedule,/^(15|45) ([0-9]|1[0-9]|2[0-3]) \* \* \*$/)
})

test('paid approval is independent of cookie choice while optional identifiers remain excluded', () => {
 const tracking=purchaseTracking({pixelId:'123456',gatewayBase:env.PAGARME_BASE_URL,sourceUrl:'https://example.com/checkout/offer',preference:'unknown',identifiers:{fbp:'must-not-send'}})
 assert.equal(tracking.consent,null)
 assert.deepEqual(tracking.identifiers,{})
 const event=conversionEvent(order,{...snapshot,tracking},{email:'buyer@example.com'},now)
 assert.equal(event.event_id,'purchase:order')
 assert.equal(event.user_data.fbp,undefined)
 const refusal=purchaseTracking({...tracking,preference:'denied'})
 assert.equal(conversionEvent(order,{...snapshot,tracking:refusal},{email:'buyer@example.com'},now).event_id,'purchase:order')
 assert.equal(refusal.consent,false);assert.deepEqual(refusal.identifiers,{})
 assert.equal(conversionEvent(order,{...snapshot,tracking:null},{email:'buyer@example.com'},now),null)
})
test('automatic approval delivery is idempotent even with optional cookie refusal',async()=>{
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));const original=globalThis.fetch;Object.assign(process.env,env)
 try {
  let calls=0
  globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({events_received:1})}}
  const db=database();db.tables.webhook_events[0].payload.tracking=purchaseTracking({pixelId:'123456',gatewayBase:env.PAGARME_BASE_URL,sourceUrl:'https://example.com/checkout/offer',preference:'unknown'})
  assert.equal((await deliverPaidConversion(db,'order')).status,'sent')
  await deliverPaidConversion(db,'order');assert.equal(calls,1)
  const refused=database();refused.tables.webhook_events[0].payload.tracking={...db.tables.webhook_events[0].payload.tracking,consent:false}
  assert.equal((await deliverPaidConversion(refused,'order')).status,'sent');assert.equal(calls,2)
 }finally{globalThis.fetch=original;for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})


test('Purchase includes actual buyer matching data, hashes phone and keeps stable deduplication ID',()=>{
 const request=new Request('https://pay.example/api/checkout/offer',{headers:{'x-forwarded-for':'203.0.113.42, 10.0.0.1','user-agent':'Buyer Browser','cookie':'_fbp=fb.1.1794432600000.123456'}})
 const identifiers=purchaseRequestContext(request,{fbclid:'Actual_Click_123',click_time:now-60000},now)
 const tracking=purchaseTracking({pixelId:'123456',gatewayBase:env.PAGARME_BASE_URL,sourceUrl:'https://pay.example/offer',preference:'unknown',identifiers})
 const event=conversionEvent({...order,customer_id:'stable-customer'},{...snapshot,tracking},{email:'buyer@example.com',phone:'(84) 99663-3020'},now)
 assert.equal(event.user_data.client_ip_address,'203.0.113.42')
 assert.equal(event.user_data.client_user_agent,'Buyer Browser')
 assert.equal(event.user_data.fbc,`fb.1.${now-60000}.Actual_Click_123`)
 assert.equal(event.user_data.fbp,'fb.1.1794432600000.123456')
 assert.match(event.user_data.ph[0],/^[a-f0-9]{64}$/)
 assert.equal(event.user_data.ph[0],conversionEvent(order,{...snapshot,tracking},{email:'buyer@example.com',phone:'+55 84 99663-3020'},now).user_data.ph[0])
 assert.equal(event.event_id,'purchase:order')
 assert.equal(JSON.stringify(event).includes('99663'),false)
 const refused=purchaseTracking({preference:'denied',identifiers})
 assert.deepEqual(refused.identifiers,{})
 assert.equal(conversionEvent(order,{...snapshot,tracking:refused},{email:'buyer@example.com'},now).event_id,'purchase:order')
})
test('no real click means no fbc; client-supplied network identity and invalid values are ignored',()=>{
 const request=new Request('https://example.org/api/checkout/offer',{headers:{'x-forwarded-for':'not-an-ip','user-agent':'Actual Buyer'}})
 const identifiers=purchaseRequestContext(request,{client_ip_address:'192.0.2.9',client_user_agent:'spoofed',fbclid:'bad<script>',click_time:now},now)
 assert.deepEqual(identifiers,{client_user_agent:'Actual Buyer'})
 assert.equal(purchaseRequestContext(request,{fbclid:'valid',click_time:now+1},now).fbc,undefined)
})

async function configured(run) {
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]])),original=globalThis.fetch
 Object.assign(process.env,env)
 try { await run() } finally {
  globalThis.fetch=original
  for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
}
test('approved payments send with granted, unknown and denied cookies; pending payments never send',async()=>configured(async()=>{
 let calls=0
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({events_received:1})}}
 for(const preference of ['granted','unknown','denied']) {
  const db=database()
  db.tables.webhook_events[0].payload.tracking=purchaseTracking({pixelId:'123456',gatewayBase:env.PAGARME_BASE_URL,sourceUrl:'https://example.com/offer',preference})
  assert.equal((await deliverPaidConversion(db,'order')).status,'sent')
  await deliverPaidConversion(db,'order')
 }
 assert.equal(calls,3)
 for(const status of ['pending','waiting_payment','failed','refunded']) {
  const db=database();db.tables.orders[0].status=status
  assert.equal((await deliverPaidConversion(db,'order')).status,'skipped')
 }
 assert.equal(calls,3)
}))
test('temporarily missing token retains the conversion for later delivery',async()=>configured(async()=>{
 const db=database();let calls=0
 const id='00000000-0000-0000-0000-000000000001';db.tables.orders[0].id=id
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({events_received:1})}}
 delete process.env.META_CAPI_ACCESS_TOKEN
 assert.equal((await deliverPaidConversion(db,id)).status,'pending')
 assert.equal(calls,0)
 assert.equal(db.tables.webhook_events.find(row=>row.type==='checkout.capi').error,'retry')
 process.env.META_CAPI_ACCESS_TOKEN=env.META_CAPI_ACCESS_TOKEN
 assert.equal((await retryConversions(db)).sent,1)
 assert.equal(calls,1)
}))
test('terminated lease recovers; a current lease and exhausted lease are never resent',async()=>configured(async()=>{
 const db=database(),clock=Date.now()
 db.tables.webhook_events.push(
  {id:'stale',pagarme_event_id:'capi:00000000-0000-0000-0000-000000000001',type:'checkout.capi',error:'processing',received_at:new Date(clock-11*60000).toISOString(),payload:{order_id:'00000000-0000-0000-0000-000000000001',attempts:1}},
  {id:'active',pagarme_event_id:'capi:00000000-0000-0000-0000-000000000002',type:'checkout.capi',error:'processing',received_at:new Date(clock-1000).toISOString(),payload:{order_id:'00000000-0000-0000-0000-000000000002'}},
  {id:'exhausted',pagarme_event_id:'capi:00000000-0000-0000-0000-000000000003',type:'checkout.capi',error:'processing',received_at:new Date(clock-11*60000).toISOString(),payload:{order_id:'00000000-0000-0000-0000-000000000003',attempts:8}}
 )
 const calls=[]
 await retryConversions(db,async(_db,id)=>{calls.push(id);return {status:'sent'}},clock)
 assert.deepEqual(calls,['00000000-0000-0000-0000-000000000001'])
 assert.equal(db.tables.webhook_events.find(row=>row.id==='active').error,'processing')
 assert.equal(db.tables.webhook_events.find(row=>row.id==='exhausted').error,'review_required')
}))
test('reconciliation queues a new missing receipt without network or replaying historical and completed purchases',async()=>configured(async()=>{
 const db=database(),clock=Date.now()
 const recent=new Date(clock-1000).toISOString()
 db.tables.orders=[
  {...order,id:'new',event_id:'checkout:new',paid_at:recent,status:'paid'},
  {...order,id:'historical',event_id:'checkout:historical',paid_at:recent,status:'paid'},
  {...order,id:'done',event_id:'checkout:done',paid_at:recent,status:'paid'},
  {...order,id:'pending',event_id:'checkout:pending',paid_at:recent,status:'waiting_payment'},
  {...order,id:'old',event_id:'checkout:old',paid_at:new Date(clock-25*3600000).toISOString(),status:'paid'}
 ]
 db.tables.webhook_events=[
  {pagarme_event_id:'request:new',payload:{tracking:{policy:'payment_approved_v2',consent:false}}},
  {pagarme_event_id:'request:historical',payload:{tracking:{policy:'payment_approved_v1',consent:false}}},
  {pagarme_event_id:'request:done',payload:{tracking:{policy:'payment_approved_v2'}}},
  {pagarme_event_id:'capi:done',processed_at:recent}
 ]
 const calls=[]
 globalThis.fetch=async()=>{assert.fail('reconciliation must only queue')}
 const result=await reconcileMissingConversions(db,async(_db,id,options)=>{calls.push([id,options]);return {status:'queued'}},clock)
 assert.deepEqual(calls,[['new',{queueOnly:true}]])
 assert.equal(result.queued,1)
}))
