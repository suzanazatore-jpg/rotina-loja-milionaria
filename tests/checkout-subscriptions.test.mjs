import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/checkoutSubscriptions.js',import.meta.url),'utf8')
const {enrichSubscriptions,subscriptionFrequency,subscriptionFilters,subscriptionQuery,subscriptionDetails}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('subscription summary counts unique recorded charges across original and renewed orders',()=>{
 const rows=[{id:'s1',origin_order_id:'o1',status:'past_due',updated_at:null,offer:{name:'Mensal',billing_interval:'month',billing_interval_count:1,product:{name:'Rotina'}}},{id:'s2',origin_order_id:'o2',offer:{billing_interval:'day',billing_interval_count:30}}]
 const enriched=enrichSubscriptions(rows,[{id:'o1',pagarme_charge_id:'ch_1'},{id:'r1',parent_order_id:'o1',pagarme_charge_id:'ch_2'},{id:'duplicate',parent_order_id:'o1',pagarme_charge_id:'ch_2'},{id:'pending',parent_order_id:'o1',pagarme_charge_id:null},{id:'foreign',parent_order_id:'other',pagarme_charge_id:'ch_3'}])
 assert.equal(enriched[0].charge_count,2);assert.equal(enriched[0].status,'past_due');assert.equal(enriched[0].updated_at,null);assert.equal(enriched[0].billing_frequency,'1 mês');assert.equal(enriched[0].product_name,'Rotina');assert.equal(enriched[1].charge_count,0);assert.equal(enriched[1].billing_frequency,'30 dias')
 assert.equal(subscriptionFrequency({billing_interval:'year',billing_interval_count:2}),'2 anos');assert.equal(subscriptionFrequency({}),'—')
})
test('filters reject invalid dates, inverted periods and forged product IDs',()=>{
 for(const query of ['inicio=2026-02-30','fim=2026-13-01','inicio=2026-10-25&fim=2026-10-01','produto=bad','status=unknown'])assert.throws(()=>subscriptionFilters(new URLSearchParams(query)))
 assert.equal(subscriptionFilters(new URLSearchParams()).status,'all')
})
test('list and export share filters, with an inclusive end date in Brazilian time',()=>{
 const calls=[],query=new Proxy({},{get(_t,key){return (...args)=>{calls.push([key,...args]);return query}}}),db={from(){return query}}
 subscriptionQuery(db,new URLSearchParams({status:'active',contact:'Ana_%',inicio:'2026-10-01',fim:'2026-10-24'}))
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='active'))
 assert.ok(calls.some(c=>c[0]==='ilike'&&c[1]==='customer.name'&&c[2]==='%Ana\\_\\%%'))
 assert.ok(calls.some(c=>c[0]==='lt'&&c[1]==='created_at'&&c[2]==='2026-10-25T00:00:00-03:00'))
})
test('charge count fetches all pages and never calls the payment provider',async()=>{
 const offsets=[];let column
 const db={from(table){if(table==='webhook_events'){const q={select(){return q},in(){return q},not(){return q},order(){return q},range(){return Promise.resolve({data:[],error:null})}};return q}assert.equal(table,'orders');const query={select(){return query},in(field,ids){column=field;assert.deepEqual(ids,['origin']);return query},order(){return query},range(offset){offsets.push([column,offset]);const size=column==='id'?1:offset===0?1000:1;return Promise.resolve({data:Array.from({length:size},(_,i)=>({id:column==='id'?'origin':`r${offset+i}`,parent_order_id:column==='id'?null:'origin',pagarme_charge_id:`ch_${column}_${offset+i}`})),error:null})}};return query}}
 const result=await subscriptionDetails(db,[{id:'s',origin_order_id:'origin'}]);assert.equal(result[0].charge_count,1002);assert.deepEqual(offsets,[['id',0],['parent_order_id',0],['parent_order_id',1000]])
})
test('updated date comes from processed subscription events, never from an invented timestamp',async()=>{
 const {subscriptionUpdateDates}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
 const query={select(){return query},like(){return query},in(field,ids){assert.equal(field,'payload->>resource_id');assert.deepEqual(ids,['sub_real','sub_unknown']);return query},not(){return query},order(){return query},range(){return Promise.resolve({data:[{payload:{resource_id:'sub_real'},processed_at:'2026-10-24T12:00:00Z'},{payload:{resource_id:'sub_real'},processed_at:'2026-10-23T12:00:00Z'}],error:null})}}
 const result=await subscriptionUpdateDates({from(table){assert.equal(table,'webhook_events');return query}},[{id:'s1',pagarme_subscription_id:'sub_real'},{id:'s2',pagarme_subscription_id:'sub_unknown',created_at:'2026-10-01T12:00:00Z'}])
 assert.equal(result[0].updated_at,'2026-10-24T12:00:00Z');assert.equal(result[1].updated_at,null)
})
