import test from 'node:test'
import assert from 'node:assert/strict'
import {processCheckoutSaleEmails,sendCheckoutSaleEmail} from '../src/lib/checkoutSaleEmailNotifications.js'
const order={id:'b0000000-0000-0000-0000-000000000001',event_type:'order_paid',product:'Teste',customer:'Cliente de Teste',total_cents:2700,payment_method:'pix',occurred_at:'2026-11-13T14:00:00Z'}
test('flag desativada jamais consulta banco ou envia email',async()=>{
 const db={from(){throw new Error('unexpected database use')}}
 assert.deepEqual(await processCheckoutSaleEmails(db,{env:{},sender(){throw new Error('unexpected send')}}),{enabled:false,processed:0})
})
test('envia somente ao email autorizado e marca aceite pelo Brevo',async()=>{
 const calls=[]
 const result=await sendCheckoutSaleEmail({channel:'email',destination:'destinatario@example.com',name:'Teste'},order,{
  env:{BREVO_API_KEY:'fake-test-key'},
  fetcher:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({messageId:'test-msg'})}}
 })
 assert.equal(result.messageId,'test-msg')
 assert.equal(calls.length,1)
 assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email')
 const payload=JSON.parse(calls[0].opts.body)
 assert.equal(payload.to.length,1)
 assert.equal(payload.to[0].email,'destinatario@example.com')
 assert.equal(payload.sender.email,'suporte@suzanazatorre.com.br')
 assert.match(payload.textContent,/Venda aprovada/)
 assert.match(payload.textContent,/R\$ 27,00/)
 assert.doesNotMatch(payload.textContent,/fake-test-key/)
})
test('não envia a canais WhatsApp ou sem credencial',async()=>{
 await assert.rejects(sendCheckoutSaleEmail({channel:'whatsapp',destination:'5584999999999'},order,{env:{BREVO_API_KEY:'test'},fetcher:async()=>assert.fail()}),/invalid_email_recipient/)
 await assert.rejects(sendCheckoutSaleEmail({channel:'email',destination:'a@example.com'},order,{env:{},fetcher:async()=>assert.fail()}),/brevo_not_configured/)
})
test('rejeição do provedor permanece erro, sem confirmação de entrega',async()=>{
 await assert.rejects(sendCheckoutSaleEmail({channel:'email',destination:'a@example.com'},order,{env:{BREVO_API_KEY:'test'},fetcher:async()=>({ok:false,status:403})}),/brevo_http_403/)
})

test('venda criada nunca dispara email, mesmo quando chamada diretamente', async()=>{
 await assert.rejects(sendCheckoutSaleEmail({channel:'email',destination:'destinatario@example.com',name:'Teste'},{...order,event_type:'order_created'},{env:{BREVO_API_KEY:'test'},fetcher:async()=>assert.fail('venda criada não deve enviar')}),/invalid_sale_event/)
})
