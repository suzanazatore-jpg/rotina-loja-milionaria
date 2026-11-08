import test from 'node:test'
import assert from 'node:assert/strict'
import {invoiceToken,readInvoiceToken,redactAudit,validateInvoice,validateBuyer} from '../src/lib/saleDetail.js'
import {readFileSync} from 'node:fs'
const id='30e2c0e9-edcf-4d98-9b22-40096f9ed6c0',secret='a'.repeat(48)
test('invoice links cannot be forged, reused for another order or verified without configuration',()=>{
 const t=invoiceToken(id,secret);assert.equal(readInvoiceToken(t,secret),id)
 for(const bad of [t.replace('30e2','10e2'),t+'.extra',t.slice(0,-3),null])assert.equal(readInvoiceToken(bad,secret),null)
 assert.equal(readInvoiceToken(t,'other'.repeat(10)),null);assert.equal(invoiceToken(id,''),null)
})
test('audit removes nested credentials, payment card numbers and webhook paths',()=>{
 const clean=redactAudit({attempts:2,nested:{api_key:'private',authorization:'bearer',items:[{cvv:'123',card_number:'1234567',status:'paid'}]},url:'https://example.org/webhook/catch/private?token=private',token:'private',password:'private'})
 assert.doesNotMatch(JSON.stringify(clean),/private|1234567|api_key|authorization|cvv|password/);assert.equal(clean.nested.items[0].status,'paid');assert.equal(clean.attempts,2)
})
test('buyer edits validate required fields and preserve only allowed data',()=>{
 const b={name:' Ana ',email:'ANA@example.org',phone:'(84) 99999-0000',document:'123.456.789-01',billing_address:{country:'BR',city:'Natal'},admin:true}
 assert.equal(validateBuyer(b).email,'ana@example.org');assert.equal(validateBuyer(b).phone,'84999990000');assert.equal(validateBuyer(b).admin,undefined)
 for(const v of [{...b,email:'x'},{...b,phone:'123'},{...b,document:'123'},{...b,billing_address:{}}])assert.throws(()=>validateBuyer(v))
})
test('invoice metadata rejects executable URLs, missing fields and invalid dates',()=>{
 const i={id:'n1',key:'k1',issued_at:'2026-11-05',xml_url:'https://example.org/a.xml',pdf_url:'https://example.org/a.pdf'}
 assert.equal(validateInvoice(i).id,'n1')
 for(const v of [{...i,pdf_url:'javascript:alert(1)'},{...i,xml_url:'https://user:pass@example.org/x'},{...i,issued_at:'2026-02-30'},{...i,key:''}])assert.throws(()=>validateInvoice(v))
})
test('sale API requires authorization for reads and mutations before querying orders',async()=>{
 const dataURL=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
 let source=readFileSync(new URL('../src/app/api/admin/checkout/venda/route.js',import.meta.url),'utf8')
 const stubs={"next/server":"export const after=()=>{}",'../registros/route':'export const GET=()=>{}','@/lib/checkoutAdminServer':'export const checkoutAdminClient=()=>({});export const autorizarAdmin=async()=>false;export const ADMIN_EMAIL="admin"','@/lib/saleDetail':'export const invoiceToken=()=>{};export const validateInvoice=()=>{};export const validateBuyer=()=>{};export const auditEvent=()=>{};export const redactAudit=()=>{}','@/lib/centralRecords':'export const validId=()=>true','@/lib/checkoutFulfillmentServer':'export const fulfillPaidOrder=()=>{}','@/lib/checkoutPaymentsServer':'export const syncPayment=()=>{}','@/lib/checkoutAccessServer':'export const reverseOrderAccess=()=>{}','@/lib/pagarme':'export const pagarme=()=>{}','@/lib/checkoutOutboundServer':'export const processOutboundWebhooks=()=>{}','@/lib/contractsServer':'export const sendContractInvite=()=>{};export const sendSignedContractCopies=()=>{}'}
 for(const [path,stub] of Object.entries(stubs))source=source.replace(`'${path}'`,JSON.stringify(dataURL(stub)))
 source=source.replace("'@/lib/saleLiveRelay'",JSON.stringify(new URL('../src/lib/saleLiveRelay.js',import.meta.url).href));source=source.replace("'@/lib/saleAudit'",JSON.stringify(new URL('../src/lib/saleAudit.js',import.meta.url).href));const route=await import(dataURL(source));for(const method of ['GET','POST'])assert.equal((await route[method](new Request('https://example.org/api/admin/checkout/venda'))).status,401)
})
test('audit shows exact configured destination and never calls queued delivery sent',async()=>{
 const {deliveryAudit,providerAudit,saleEnvironment}=await import('../src/lib/saleAudit.js')
 const hook={name:'BotConversa — compra',url:'https://example.org/hooks/buyer'}
 const waiting=deliveryAudit({id:'1',status:'pending',attempts:0,event_type:'order.paid',created_at:'2026-11-05T20:00:00Z'},hook)
 assert.equal(waiting.destination.url,hook.url);assert.equal(waiting.title,'Webhook na fila');assert.match(waiting.outcome,/ainda não enviado/)
 const sent=deliveryAudit({id:'2',status:'delivered',response_status:200,attempts:1},hook);assert.equal(sent.title,'Webhook Enviado');assert.equal(sent.http_status,200)
 const failed=deliveryAudit({id:'3',status:'retry',response_status:500},hook);assert.match(failed.failure,/500/)
 const incoming=providerAudit({id:'4',type:'charge.paid',error:'reconciliation_pending'});assert.equal(incoming.source,'Pagar.me');assert.equal(incoming.destination.name,'Central de Vendas');assert.match(incoming.outcome,/aguardando conciliação/)
 assert.equal(saleEnvironment({gateway_base:'https://api.pagar.me/core/v5'},'https://sdx-api.pagar.me/core/v5').matches,false)
 assert.equal(saleEnvironment({gateway_base:'https://api.pagar.me/core/v5'},'https://api.pagar.me/core/v5').matches,true)
})
test('live resend stays on the same screen and delegates only to the fixed authenticated application endpoint',async()=>{
 const {liveSaleRequest,eligibleLiveWebhooks}=await import('../src/lib/saleLiveRelay.js')
 const calls=[],request=new Request('https://preview.example/api/admin/checkout/venda',{headers:{authorization:'Bearer admin-session'}})
 const rows={paid:true,deliveries:[{id:'a',webhook_id:'one',active:true,event_type:'order.paid'},{id:'b',webhook_id:'one',active:true,event_type:'order.paid'},{id:'c',webhook_id:'two',active:false,event_type:'order.paid'},{id:'d',webhook_id:'three',active:true,internal:true,event_type:'order.paid'},{id:'e',webhook_id:'four',active:true,event_type:'order.created'}]}
 const fetcher=async(url,options)=>{calls.push({url,options});return Response.json(rows)}
 await liveSaleRequest(request,id,'webhooks',null,fetcher)
 assert.equal(calls[0].url,`https://rotina.suzanazatorre.com.br/api/admin/checkout/vendas/${id}/webhooks`);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.headers.Authorization,'Bearer admin-session');assert.equal(calls[0].options.redirect,'error')
 assert.deepEqual(eligibleLiveWebhooks(rows).map(r=>r.id),['a']);assert.deepEqual(eligibleLiveWebhooks({...rows,paid:false}),[])
 await assert.rejects(liveSaleRequest(request,'https://evil.example','webhooks',null,fetcher));await assert.rejects(liveSaleRequest(request,id,'refund',{},fetcher));assert.equal(calls.length,1)
})
test('financial delegation requires explicit confirmation and maps only the current sale to native handlers',async()=>{
 const {liveSaleRequest}=await import('../src/lib/saleLiveRelay.js'),calls=[]
 const request=new Request('https://preview.example/api/admin/checkout/venda',{headers:{authorization:'Bearer administrator'}})
 const fetcher=async(url,options)=>{calls.push({url,options});return Response.json({message:'Resposta de teste'})}
 for(const body of [{},{confirm:false,reason:'Teste',requestId:id},{confirm:true,reason:'',requestId:id}])await assert.rejects(liveSaleRequest(request,id,'refund',body,fetcher))
 assert.equal(calls.length,0)
 await liveSaleRequest(request,id,'refund',{confirm:true,reason:'Teste',requestId:id,order_id:'other',amount:999},fetcher)
 assert.equal(calls[0].url,`https://rotina.suzanazatorre.com.br/api/admin/checkout/vendas/${id}/acoes`)
 assert.deepEqual(JSON.parse(calls[0].options.body),{action:'refund',reason:'Teste',confirm:true,requestId:id})
 await liveSaleRequest(request,id,'sync',{requestId:id},fetcher)
 assert.equal(calls[1].url,'https://rotina.suzanazatorre.com.br/api/admin/checkout/pagamentos');assert.deepEqual(JSON.parse(calls[1].options.body),{action:'sync',order_id:id})
 await liveSaleRequest(request,id,'chargeback',{confirm:true,reason:'Teste',requestId:id},fetcher)
 assert.equal(JSON.parse(calls[2].options.body).action,'chargeback')
})
