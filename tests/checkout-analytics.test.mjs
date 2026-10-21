import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/checkoutAnalytics.js',import.meta.url),'utf8')
const {purchaseAnalytics,trackingDestination,dispatchAnalytics,ecommercePayload}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const snapshot=[{product_id:'main',name:'Protocolo',total_cents:4700},{product_id:'bump',name:'Equipe',total_cents:3700}]
const order={id:'order',status:'paid',paid_at:'2026-10-14T12:00:00Z',total_cents:8400}
const purchase=purchaseAnalytics(order,snapshot)
function storage(){const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}}
test('only a confirmed paid order with matching amounts produces a purchase event',()=>{
 assert.equal(purchase.total_cents,8400);assert.equal(purchase.event_id,'purchase:order')
 for(const status of ['pending','waiting_payment','failed','refunded'])assert.equal(purchaseAnalytics({...order,status},snapshot),null)
 assert.equal(purchaseAnalytics({...order,total_cents:8401},snapshot),null)
 assert.equal(purchaseAnalytics({...order,paid_at:null},snapshot),null)
 assert.equal(purchaseAnalytics(order,null),null)
})
test('GTM wins over direct pixel and never receives payment or personal fields',()=>{
 const config={gtm_id:'GTM-ABCDEFG',meta_pixel_id:'123456789'}
 const calls=[];const target={fbq:(...args)=>calls.push(args),localStorage:storage()}
 assert.deepEqual(trackingDestination(config),{channel:'gtm',id:'GTM-ABCDEFG'})
 assert.equal(dispatchAnalytics(target,config,'purchase',{...purchase,email:'private@example.com',card_token:'private-token'},purchase.event_id),true)
 assert.equal(calls.length,0)
 const sent=target.dataLayer.at(-1)
 assert.equal(sent.ecommerce.value,84);assert.equal(sent.ecommerce.items.length,2)
 assert.equal(JSON.stringify(sent).includes('private'),false)
 assert.equal(sent.ecommerce.transaction_id,'order')
})
test('polling, reload and repeated confirmations do not requeue the same purchase',()=>{
 const config={gtm_id:'GTM-ABCDEFG'};const localStorage=storage();const first={localStorage}
 assert.equal(dispatchAnalytics(first,config,'purchase',purchase,purchase.event_id),true)
 assert.equal(dispatchAnalytics(first,config,'purchase',purchase,purchase.event_id),false)
 assert.equal(first.dataLayer.filter(event=>event.event==='purchase').length,1)
 assert.equal(dispatchAnalytics({localStorage},config,'purchase',purchase,purchase.event_id),false)
})
test('direct Meta events target only the effective pixel with stable eventID',()=>{
 const calls=[];const target={fbq:(...args)=>calls.push(args),localStorage:storage()}
 assert.equal(dispatchAnalytics(target,{meta_pixel_id:'123456789'},'purchase',purchase,purchase.event_id),true)
 assert.equal(calls[0][0],'trackSingle');assert.equal(calls[0][1],'123456789');assert.equal(calls[0][2],'Purchase')
 assert.equal(calls[0][3].value,84);assert.equal(calls[0][4].eventID,'purchase:order')
})
test('disabled tracking, invalid events and tracker failures never break checkout',()=>{
 assert.equal(dispatchAnalytics({}, {tracking_mode:'off',gtm_id:'GTM-ABCDEFG'},'purchase',purchase,'key'),false)
 assert.equal(dispatchAnalytics({}, {gtm_id:'GTM-ABCDEFG'},'invalid',purchase,'key'),false)
 assert.equal(dispatchAnalytics({dataLayer:{push(){throw new Error('blocked')}}},{gtm_id:'GTM-ABCDEFG'},'purchase',purchase,'key'),false)
 assert.equal(ecommercePayload({...purchase,total_cents:0}),null)
})
