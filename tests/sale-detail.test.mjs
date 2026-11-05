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
 const route=await import(dataURL(source));for(const method of ['GET','POST'])assert.equal((await route[method](new Request('https://example.org/api/admin/checkout/venda'))).status,401)
})
test('sale mutations reject foreign origins and invalid buyer data without writes; refund verifies gateway identity before DELETE',async()=>{
 const writes=[],gatewayCalls=[]
 const order={id,status:'paid',total_cents:100,pagarme_charge_id:'ch_test',pagarme_order_id:'or_test',customer:{email:'ana@example.org'}}
 const db={from(table){const q={select(){return q},eq(){return q},is(){return q},single(){return Promise.resolve({data:order})},insert(value){writes.push(['insert',table,value]);return Promise.resolve({data:null})},update(value){writes.push(['update',table,value]);return q},then(resolve){resolve({data:[]})}};return q}}
 globalThis.__saleDb=db;globalThis.__saleGateway=async(path,options)=>{gatewayCalls.push({path,options});return {id:'ch_wrong',amount:100,order:{id:'or_test'}}}
 const dataURL=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
 let source=readFileSync(new URL('../src/app/api/admin/checkout/venda/route.js',import.meta.url),'utf8')
 const stubs={"next/server":"export const after=()=>{}",'../registros/route':'export const GET=()=>{}','@/lib/checkoutAdminServer':'export const checkoutAdminClient=()=>globalThis.__saleDb;export const autorizarAdmin=async()=>true;export const ADMIN_EMAIL="admin"','@/lib/centralRecords':'export const validId=v=>/^[0-9a-f-]{36}$/.test(v)','@/lib/checkoutFulfillmentServer':'export const fulfillPaidOrder=()=>{}','@/lib/checkoutPaymentsServer':'export const syncPayment=()=>{}','@/lib/checkoutAccessServer':'export const reverseOrderAccess=()=>{}','@/lib/pagarme':'export const pagarme=(...args)=>globalThis.__saleGateway(...args)','@/lib/checkoutOutboundServer':'export const processOutboundWebhooks=()=>{}','@/lib/contractsServer':'export const sendContractInvite=()=>{};export const sendSignedContractCopies=()=>{}'}
 for(const [path,stub] of Object.entries(stubs))source=source.replace(`'${path}'`,JSON.stringify(dataURL(stub)))
 source=source.replace("'@/lib/saleDetail'",JSON.stringify(new URL('../src/lib/saleDetail.js',import.meta.url).href))
 const route=await import(dataURL(source)),request=(body,origin='https://example.org')=>new Request('https://example.org/api/admin/checkout/venda',{method:'POST',headers:{origin,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({id,...body})})
 assert.equal((await route.POST(request({action:'sync'},'https://evil.example'))).status,403);assert.equal(writes.length,0)
 assert.equal((await route.POST(request({action:'buyer',buyer:{name:'x'}}))).status,400);assert.equal(writes.filter(w=>w[0]==='insert').length,0)
 const response=await route.POST(request({action:'refund',reason:'Teste'}));assert.equal(response.status,400);assert.equal(gatewayCalls.length,1);assert.equal(gatewayCalls[0].options,undefined)
 assert.ok(writes.some(w=>w[0]==='insert'));assert.ok(writes.every(w=>w[1]!=='orders'))
 delete globalThis.__saleDb;delete globalThis.__saleGateway
})
