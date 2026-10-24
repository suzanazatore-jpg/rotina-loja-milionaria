import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const pagarme=`data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../src/lib/pagarme.js',import.meta.url),'utf8').replace("'./checkoutPricing.js'",JSON.stringify(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../src/lib/checkoutPricing.js',import.meta.url))).toString('base64')}`))).toString('base64')}`
const source=readFileSync(new URL('../src/lib/checkoutWebhookServer.js',import.meta.url),'utf8').replace('./pagarme.js',pagarme)
const {reconcileWebhookResource}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const id='00000000-0000-4000-8000-000000000001'
const local={id,event_id:'checkout:session',customer_id:'customer',total_cents:4700,payment_method:'pix',pagarme_order_id:null}
const remote={id:'or_test',code:id,amount:4700,customer:{email:'buyer@example.com'},charges:[{id:'ch_test',status:'paid',paid_at:'2026-10-15T00:00:00Z'}]}
const event={type:'order.paid',data:{id:'or_test',code:'untrusted',amount:1,status:'failed'}}
function database(order={...local}){
 const tables={orders:order?[order]:[],customers:[{id:'customer',email:'buyer@example.com'}],subscriptions:[]}
 let race=false
 return {tables,loseClaim(){race=true},from(table){let filters=[],values;let single=false
  const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},is(k,v){filters.push(row=>(row[k]??null)===v);return q},single(){single=true;return q},maybeSingle(){single=true;return q},update(v){values=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
   const rows=tables[table].filter(row=>filters.every(f=>f(row)))
   if(values&&race)return {data:[],error:null}
   if(values)rows.forEach(row=>Object.assign(row,values))
   return {data:single?rows[0]:rows,error:null}
  }).then(resolve,reject)}};return q
 }}
}
test('early webhook recovers local order from verified gateway code, without trusting incoming status',async()=>{
 const db=database();let calls=0
 const result=await reconcileWebhookResource(db,event,{gateway:async path=>{assert.equal(path,'/orders/or_test');calls++;return remote}})
 assert.equal(result.status,'paid');assert.equal(result.order_id,id);assert.equal(calls,1)
 assert.equal(db.tables.orders[0].pagarme_order_id,'or_test')
})
test('missing local order, wrong email/value/code and conflicting gateway ID never confirm',async()=>{
 for(const [db,reply] of [[database(null),remote],[database(),{...remote,amount:1}],[database(),{...remote,customer:{email:'other@example.com'}}],[database(),{...remote,code:'invalid'}],[database({...local,pagarme_order_id:'or_other'}),remote]]){
  await assert.rejects(reconcileWebhookResource(db,event,{gateway:async()=>reply}))
  assert.notEqual(db.tables.orders[0]?.status,'paid')
 }
})
test('lost conditional claim requests retry instead of overwriting another gateway binding',async()=>{
 const db=database();db.loseClaim()
 await assert.rejects(reconcileWebhookResource(db,event,{gateway:async()=>remote}),{status:503})
 assert.equal(db.tables.orders[0].pagarme_order_id,null)
})
test('charge looks up its verified order and subscription charge uses cycle reconciliation',async()=>{
 const db=database(),paths=[]
 const result=await reconcileWebhookResource(db,{type:'charge.paid',data:{id:'ch_test'}},{gateway:async path=>{paths.push(path);return path.startsWith('/charges/')?{id:'ch_test',amount:4700,status:'paid',order:{id:'or_test'}}:remote}})
 assert.equal(result.status,'paid');assert.deepEqual(paths,['/charges/ch_test','/orders/or_test'])
 const cycle=await reconcileWebhookResource(db,{type:'charge.paid',data:{id:'ch_test'}},{gateway:async()=>({id:'ch_test',invoice:{subscription_id:'sub_test'},order:{id:'or_unknown'}}),reconcileSubscriptionCharge:async(database,charge)=>{assert.equal(database,db);assert.equal(charge.invoice.subscription_id,'sub_test');return {order_id:'cycle',status:'paid'}}})
 assert.equal(cycle.order_id,'cycle')
})
test('subscription arriving before local insert remains pending and unrecognized gateway status preserves local status',async()=>{
 const db=database(),e={type:'subscription.created',data:{id:'sub_test'}},gateway=async()=>({id:'sub_test',status:'future'})
 await assert.rejects(reconcileWebhookResource(db,e,{gateway}),{status:503})
 db.tables.subscriptions.push({id:'local-sub',status:'past_due',pagarme_subscription_id:'sub_test'})
 await reconcileWebhookResource(db,e,{gateway});assert.equal(db.tables.subscriptions[0].status,'past_due')
})
test('invalid resource paths and gateway failures never mark payment',async()=>{
 const db=database();await assert.rejects(reconcileWebhookResource(db,{type:'order.paid',data:{id:'or_bad/path'}},{gateway:async()=>{throw new Error('must not fetch')}}))
 await assert.rejects(reconcileWebhookResource(db,event,{gateway:async()=>{throw new Error('network')}}))
 assert.notEqual(db.tables.orders[0].status,'paid')
})
test('webhook HTTP failure remains unprocessed; retry completes and duplicate never fulfills again',async()=>{
 const originalSecret=process.env.PAGARME_WEBHOOK_SECRET;process.env.PAGARME_WEBHOOK_SECRET='test-secret'
 const state={stored:null,fail:true,grants:0,conversions:0,queries:0}
 const db={from(){state.queries++;let change,onlyPending=false
  const q={upsert(value){state.stored ||= {...value,processed_at:null};return q},select(){return q},eq(){return q},single(){return q},is(){onlyPending=true;return q},update(value){change=value;return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(change&&(!onlyPending||!state.stored.processed_at))Object.assign(state.stored,change)
   return {data:state.stored,error:null}
  }).then(resolve,reject)}};return q
 }}
 globalThis.__checkoutWebhook={db,state}
 let route=readFileSync(new URL('../src/app/api/webhook-pagarme/route.js',import.meta.url),'utf8')
 route=route.replace("import { reverseOrderAccess } from '@/lib/checkoutAccessServer'",'const reverseOrderAccess = async () => ({})')
 route=route.replace("import { NextResponse } from 'next/server'",'const NextResponse = Response')
 route=route.replace("import { checkoutAdminClient } from '@/lib/checkoutAdminServer'",'const checkoutAdminClient = () => globalThis.__checkoutWebhook.db')
 route=route.replace("import { reconcileSubscriptionCharge } from '@/lib/checkoutPaymentsServer'",'const reconcileSubscriptionCharge = () => {}')
 route=route.replace("import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'",'const fulfillPaidOrder = async () => { globalThis.__checkoutWebhook.state.grants++ }')
 route=route.replace("import { deliverPaidConversion } from '@/lib/checkoutConversionsServer'",'const deliverPaidConversion = async () => { globalThis.__checkoutWebhook.state.conversions++ }')
 route=route.replace("import { reconcileWebhookResource } from '@/lib/checkoutWebhookServer'",'const reconcileWebhookResource = async () => { if(globalThis.__checkoutWebhook.state.fail) throw new Error("not ready"); return {order_id:"order",status:"paid"} }')
 const {POST}=await import(`data:text/javascript;base64,${Buffer.from(route).toString('base64')}`)
 const body=JSON.stringify({id:'hook_test',type:'order.paid',data:{id:'or_test'}})
 const req=(value=body,authorization='Bearer test-secret')=>new Request('https://example.com/api/webhook-pagarme',{method:'POST',headers:{authorization},body:value})
 try{
  assert.equal((await POST(req(body,'Bearer wrong'))).status,401);assert.equal(state.queries,0)
  assert.equal((await POST(req('not json'))).status,400)
  assert.equal((await POST(req('null'))).status,400)
  assert.equal((await POST(req('x'.repeat(262145)))).status,413)
  assert.equal((await POST(req())).status,503);assert.equal(state.stored.processed_at,null);assert.equal(state.stored.error,'reconciliation_pending');assert.equal(state.grants,0)
  state.fail=false
  assert.equal((await POST(req())).status,200);assert.ok(state.stored.processed_at);assert.equal(state.stored.error,null);assert.equal(state.grants,1);assert.equal(state.conversions,1)
  assert.equal((await POST(req())).status,200);assert.equal(state.grants,1)
  assert.equal((await POST(req(body.replace('or_test','or_other')))).status,503);assert.equal(state.grants,1)
 }finally{delete globalThis.__checkoutWebhook;if(originalSecret===undefined)delete process.env.PAGARME_WEBHOOK_SECRET;else process.env.PAGARME_WEBHOOK_SECRET=originalSecret}
})
test('new chargeback event verifies charge at gateway before changing financial status',async()=>{
 const db=database(),charge={id:'ch_test',amount:4700,status:'chargedback',order:{id:'or_test'}}
 const gateway=async path=>path.startsWith('/charges/')?charge:remote
 const result=await reconcileWebhookResource(db,{type:'chargeback.received',data:{id:'cb_test',charge_id:'ch_test'}},{gateway})
 assert.equal(result.status,'chargedback');assert.equal(db.tables.orders[0].status,'chargedback')
 await assert.rejects(reconcileWebhookResource(database(),{type:'chargeback.received',data:{id:'cb_test',charge_id:'ch_test'}},{gateway:async()=>({...charge,status:'paid'})}))
 await assert.rejects(reconcileWebhookResource(database(),{type:'charge.refunded',data:{id:'ch_test'}},{gateway:async path=>path.startsWith('/charges/')?{...charge,status:'refunded',amount:1}:remote}))
})
