import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const url=name=>{let source=readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8');source=source.replace(/from '(\.\/([^']+)\.js)'/g,(_all,_path,dep)=>`from ${JSON.stringify(url(dep))}`);return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`}
const {applyOrderAccess,reverseOrderAccess,expireOrderAccess}=await import(url('checkoutAccessServer'))
const {manageSubscription}=await import(url('checkoutPaymentsServer'))
const {loadPurchasedPlans,fulfillPaidOrder}=await import(url('checkoutFulfillmentServer'))
function db(steps){return {rpc(name,args){const s=steps.shift();assert.equal(s.rpc,name);s.check?.(args);return Promise.resolve({data:s.data,error:s.error})},from(table){const ops=[];const q=new Proxy({},{get(_o,key){if(key==='then')return(resolve,reject)=>{try{const s=steps.shift();assert.ok(s,`Unexpected ${table}`);assert.equal(s.table,table);s.check?.(ops);resolve({data:s.data,error:s.error})}catch(e){reject(e)}};return(...args)=>{ops.push([key,...args]);return q}}});return q}}}
async function enabled(run){const old=process.env.CHECKOUT_ACCESS_LEDGER_ENABLED;process.env.CHECKOUT_ACCESS_LEDGER_ENABLED='true';try{await run()}finally{if(old===undefined)delete process.env.CHECKOUT_ACCESS_LEDGER_ENABLED;else process.env.CHECKOUT_ACCESS_LEDGER_ENABLED=old}}
test('refund revokes only its order through server-only RPC and records result',async()=>enabled(async()=>{
 const steps=[{table:'orders',data:{id:'order',status:'refunded'}},{table:'checkout_access_grants',data:{profile_id:'profile'}},{rpc:'checkout_apply_access',data:{status:'completed'},check(args){assert.deepEqual(args,{p_order:'order',p_profile:'profile',p_plans:null,p_new_profile:false})}},{table:'webhook_events',data:null,check(ops){const row=ops.find(x=>x[0]==='upsert')[1];assert.equal(row.pagarme_event_id,'revoke:order');assert.ok(row.processed_at)}}]
 assert.equal((await reverseOrderAccess(db(steps),'order')).access_reversal,'completed');assert.equal(steps.length,0)
}))
test('legacy refund without provenance requires review and never deletes courses',async()=>enabled(async()=>{
 const steps=[{table:'orders',data:{id:'order',status:'chargedback'}},{table:'checkout_access_grants',data:null},{table:'webhook_events',data:{processed_at:'2026-10-15'}},{table:'webhook_events',data:null,check(ops){const row=ops.find(x=>x[0]==='upsert')[1];assert.equal(row.error,'review_required');assert.equal(row.processed_at,null)}}]
 assert.equal((await reverseOrderAccess(db(steps),'order')).access_reversal,'review_required');assert.equal(steps.length,0)
}))
test('interrupted legacy grant also requires review instead of assuming no access',async()=>enabled(async()=>{
 const steps=[{table:'orders',data:{id:'order',status:'chargedback'}},{table:'checkout_access_grants',data:null},{table:'webhook_events',data:{processed_at:null}},{table:'webhook_events',data:null,check(ops){const row=ops.find(x=>x[0]==='upsert')[1];assert.equal(row.error,'review_required');assert.equal(row.processed_at,null)}}]
 assert.equal((await reverseOrderAccess(db(steps),'order')).access_reversal,'review_required');assert.equal(steps.length,0)
}))
test('pending, canceled and paid orders do not trigger a refund reversal',async()=>enabled(async()=>{
 for(const status of ['paid','pending','canceled'])assert.equal((await reverseOrderAccess(db([{table:'orders',data:{status}}]),'order')).access_reversal,'unchanged')
 await assert.rejects(applyOrderAccess(db([{rpc:'checkout_apply_access',error:{message:'fail'}}]),'order','profile'),{status:503})
}))
test('expiry worker honors feature flag and uses next plan expiry with bounded batch',async()=>{
 const old=process.env.CHECKOUT_ACCESS_LEDGER_ENABLED;delete process.env.CHECKOUT_ACCESS_LEDGER_ENABLED
 try{assert.equal((await expireOrderAccess({from(){throw new Error('disabled')}})).disabled,true)}finally{if(old!==undefined)process.env.CHECKOUT_ACCESS_LEDGER_ENABLED=old}
 await enabled(async()=>{
  const steps=[{table:'checkout_access_grants',data:[{order_id:'order',profile_id:'profile'}],check(ops){assert.deepEqual(ops.find(x=>x[0]==='limit'),['limit',4]);assert.equal(ops.find(x=>x[0]==='lte')[1],'next_expiration');assert.deepEqual(ops.find(x=>x[0]==='eq'),['eq','review_required',false])}},{rpc:'checkout_apply_access',data:{status:'completed'}}]
  assert.equal((await expireOrderAccess(db(steps))).checked,1);assert.equal(steps.length,0)
 })
})
test('canceling subscription updates billing only and preserves its paid period',async()=>{
 const old=process.env.PAGARME_SECRET_KEY,fetcher=globalThis.fetch;process.env.PAGARME_SECRET_KEY='sk_test_mock'
 const subscription={id:'sub-local',pagarme_subscription_id:'sub_remote',status:'active',current_period_end:'2026-11-15T00:00:00Z'}
 const steps=[{table:'subscriptions',data:subscription},{table:'subscriptions',data:{...subscription,status:'canceled'},check(ops){const value=ops.find(x=>x[0]==='update')[1];assert.equal(value.status,'canceled');assert.equal(value.current_period_end,subscription.current_period_end)}}]
 globalThis.fetch=async(url,options)=>{assert.ok(url.endsWith('/subscriptions/sub_remote'));assert.equal(options.method,'DELETE');return Response.json({id:'sub_remote',status:'canceled'})}
 try{assert.equal((await manageSubscription(db(steps),'sub-local',true)).status,'canceled');assert.equal(steps.length,0)}finally{globalThis.fetch=fetcher;if(old===undefined)delete process.env.PAGARME_SECRET_KEY;else process.env.PAGARME_SECRET_KEY=old}
})
test('renewal uses original plan snapshot and anchors duration on the new payment',async()=>{
 const origin={id:'origin',event_id:'checkout:key',customer_id:'buyer',offer_id:'offer'}
 const steps=[{table:'orders',data:origin},{table:'order_items',data:[{product_id:'product',offer_id:'offer',kind:'main'}]},{table:'webhook_events',data:{payload:{items:[{product_id:'product',offer_id:'offer',kind:'main',plan_id:'original-plan'}]}}},{table:'plans',data:[{id:'original-plan',period_days:30}]}]
 const plans=await loadPurchasedPlans(db(steps),{event_id:'cycle:charge',parent_order_id:'origin',customer_id:'buyer',offer_id:'offer',paid_at:'2026-11-15T00:00:00Z'})
 assert.equal(plans[0].id,'original-plan');assert.equal(plans[0].expires_at,'2026-12-15T00:00:00.000Z');assert.equal(steps.length,0)
})
test('ledger fulfillment routes plan grants through transaction and does not merge legacy enrollments directly',async()=>enabled(async()=>{
 const old=process.env.CHECKOUT_FULFILLMENT_ENABLED;process.env.CHECKOUT_FULFILLMENT_ENABLED='true'
 const steps=[{table:'orders',data:{id:'order',event_id:'checkout:key',status:'paid',paid_at:'2026-10-15T00:00:00Z',customer_id:'buyer',total_cents:4700}},{table:'webhook_events',data:null},{table:'webhook_events',data:{id:'event',error:'ready'}},{table:'webhook_events',data:[{id:'event'}]},{table:'customers',data:{id:'buyer',email:'buyer@example.com',name:'Buyer'}},{table:'order_items',data:[{product_id:'product',offer_id:'offer',kind:'main'}]},{table:'webhook_events',data:{payload:{items:[{product_id:'product',offer_id:'offer',kind:'main',plan_id:'plan'}]}}},{table:'plans',data:[{id:'plan',period_days:30}]},{table:'perfis',data:{id:'profile'}},{table:'profiles',data:null},{rpc:'checkout_apply_access',data:{status:'completed'},check(args){assert.deepEqual(args.p_plans,['plan'])}},{table:'customers',data:null},{table:'webhook_events',data:null}]
 try{assert.equal((await fulfillPaidOrder(db(steps),'order')).fulfillment,'completed');assert.equal(steps.length,0)}finally{if(old===undefined)delete process.env.CHECKOUT_FULFILLMENT_ENABLED;else process.env.CHECKOUT_FULFILLMENT_ENABLED=old}
}))
