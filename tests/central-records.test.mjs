import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {PDFDocument} from 'pdf-lib'
import {allRows,saleFilters,readSales,recordActivity} from '../src/lib/centralRecords.js'
import {summarizeSales} from '../src/lib/centralDashboard.js'
import {dashboardPdf} from '../src/lib/centralPdf.js'
const id='00000000-0000-0000-0000-000000000001'
const dataUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
test('sales filters reject invalid dates, references and payment types',()=>{
 for(const f of [{inicio:'2026-02-30'},{inicio:'2026-10-25',fim:'2026-10-24'},{date_by:'payload'},{produto:'bad'},{method:'wire'}])assert.throws(()=>saleFilters(new URLSearchParams(f)))
 assert.equal(saleFilters(new URLSearchParams({date_by:'paid_at'})).date_by,'paid_at')
})
test('all records are paginated and database failures stay visible',async()=>{
 let calls=0;const rows=await allRows(()=>({range(start,end){calls++;assert.equal(end,start+999);return {data:Array.from({length:start?3:1000},(_,i)=>i)}}}));assert.equal(rows.length,1003);assert.equal(calls,2)
 await assert.rejects(allRows(()=>({range(){return {error:new Error('database unavailable')}}})),/database unavailable/)
})
test('sales use inclusive Brazilian days, buyer escaping and bump membership',async()=>{
 const calls=[];const db={from(table){const q=new Proxy({range(){return {data:table==='order_items'?[{order_id:'bump-order'}]:[{id:'bump-order',offer:{product_id:'other',product:{name:'Main',marketplace_id:'pagarme'}}},{id:'excluded',offer:{product_id:'other',product:{}}}]}}},{get(t,k){if(k in t)return t[k];return (...a)=>{calls.push([k,...a]);return q}}});return q}}
 const rows=await readSales(db,new URLSearchParams({produto:id,inicio:'2026-10-25',fim:'2026-10-25',date_by:'paid_at',name:'Ana_%'}));assert.equal(rows.length,1);assert.equal(rows[0].id,'bump-order');assert.ok(calls.some(c=>c[0]==='gte'&&c[1]==='paid_at'&&c[2]==='2026-10-25T00:00:00-03:00'));assert.ok(calls.some(c=>c[0]==='lt'&&c[2]==='2026-10-26T00:00:00-03:00'));assert.ok(calls.some(c=>c[0]==='ilike'&&c[2]==='%Ana\\_\\%%'))
})
const orders=[{id:'one',customer_id:'buyer',status:'paid',payment_method:'credit_card',total_cents:455040,created_at:'2026-10-25T02:30:00Z',paid_at:'2026-10-25T03:30:00Z',marketplace:'pagarme',utm_source:'Instagram',affiliate_value:150000},{id:'two',customer_id:'buyer',status:'refunded',payment_method:'pix',total_cents:10000,created_at:'2026-10-24T15:00:00Z'},{id:'three',status:'failed',payment_method:'credit_card',refusal_reason:'Recusada'}]
const items=[{id:'item',order_id:'one',product_id:'product',price_cents:360000,product:{name:'Mentoria de Gestão'}},{id:'bump',order_id:'one',product_id:'bump',price_cents:1000,product:{name:'Material complementar'}}]
test('dashboard preserves the full approved value, counts bumps and Brazilian date basis',()=>{
 const created=summarizeSales(orders,items,'2026-10-24','2026-10-25');assert.equal(created.revenue,455040);assert.equal(created.sales,1);assert.equal(created.productCount,2);assert.equal(created.customers,1);assert.equal(created.refunds,1);assert.equal(created.daily[0].revenue,455040);assert.equal(created.hours[6][23],1);assert.deepEqual(created.approval.credit_card,{total:2,paid:1});assert.equal(created.products.reduce((n,p)=>n+p.revenue,0),361000)
 const approved=summarizeSales(orders,items,'2026-10-24','2026-10-25','paid_at');assert.equal(approved.daily[1].revenue,455040)
})
test('audit returns actual events and internal notes without raw provider secrets',async()=>{
 const db={from(table){let type;const q=new Proxy({eq(k,v){type=v;return q},range(){return {data:table==='webhook_deliveries'?[{id:'delivery',event_type:'order.paid',status:'delivered',attempts:1,created_at:'2026-10-25',response_status:200,response_body:'SECRET'}]:type==='central.comment'?[{id:'comment',payload:{text:'Observação interna',actor:'Administrador',api_token:'SECRET'},received_at:'2026-10-25'}]:[{id:'event',type:'order.paid',payload:{api_token:'SECRET'},processed_at:'2026-10-25'}]}}},{get(t,k){if(k in t)return t[k];return ()=>q}});return q}}
 const activity=await recordActivity(db,{entity:'vendas',id,orders:[{id,pagarme_order_id:'or_1',created_at:'2026-10-25'}]});assert.ok(activity.events.some(e=>e.title==='Pagamento aprovado'));assert.ok(activity.events.some(e=>e.title==='Webhook entregue'));assert.equal(activity.comments[0].text,'Observação interna');assert.doesNotMatch(JSON.stringify(activity),/SECRET|api_token|response_body/)
})
test('record reads and internal comments reject unauthenticated requests before data access',async()=>{
 const source=readFileSync(new URL('../src/app/api/admin/checkout/registros/route.js',import.meta.url),'utf8').replace("'@/lib/checkoutAdminServer'",JSON.stringify(dataUrl('export const ADMIN_EMAIL="admin";export const checkoutAdminClient=()=>({});export const autorizarAdmin=async()=>false'))).replace("'@/lib/centralRecords'",JSON.stringify(new URL('../src/lib/centralRecords.js',import.meta.url).href)).replace("'@/lib/checkoutSubscriptions'",JSON.stringify(new URL('../src/lib/checkoutSubscriptions.js',import.meta.url).href))
 const route=await import(dataUrl(source));for(const method of ['GET','POST'])assert.equal((await route[method](new Request('https://example.org/api/admin/checkout/registros'))).status,401)
})
test('dashboard PDF opens, paginates large tables and supports Portuguese',async()=>{
 const summary=summarizeSales(orders,items,'2026-10-24','2026-10-25');summary.products=Array.from({length:60},(_,i)=>({name:`${i+1}. Mentoria de Gestão e Tráfego Pago com acompanhamento`,sales:3,revenue:360000}));const bytes=await dashboardPdf(summary);const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=3);assert.deepEqual(doc.getPage(0).getSize(),{width:595,height:842});writeFileSync('/tmp/central-dashboard-qa.pdf',bytes)
})
