import test from 'node:test'
import assert from 'node:assert/strict'
import {saleDeliveryReady,sendSaleNotification,processSaleNotifications} from '../src/lib/checkoutSaleNotificationsServer.js'
const sale={event_type:'order_created',order_id:'TEST',amount_cents:2700,name:'Desafio',customer:'Cliente Teste',method:'pix'}
test('automação desativada não consulta nem dispara a fila',async()=>{
 const result=await processSaleNotifications({from(){throw Error('fila não pode ser consultada')}} ,{env:{},send(){throw Error('nunca enviar')}})
 assert.deepEqual(result,{disabled:true,processed:0})
})
test('credenciais incompletas não são declaradas prontas',()=>{
 assert.deepEqual(saleDeliveryReady({}),{email:false,whatsapp:false})
 assert.equal(saleDeliveryReady({CHECKOUT_SALES_WHATSAPP_WEBHOOK_URL:'http://bad.example',CHECKOUT_SALES_WHATSAPP_WEBHOOK_TOKEN:'x'}).whatsapp,false)
})
test('Brevo envia só ao email especificado, sem credenciais no conteúdo',async()=>{
 const calls=[]
 const env={BREVO_API_KEY:'fake',BREVO_SENDER_EMAIL:'suporte@example.com'}
 const result=await sendSaleNotification({channel:'email',destination:'destinatario@example.com'},sale,env,async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({messageId:'fake-id'})}})
 assert.equal(result.provider_message_id,'fake-id')
 assert.equal(calls.length,1)
 assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email')
 const body=JSON.parse(calls[0].opts.body)
 assert.equal(body.to[0].email,'destinatario@example.com')
 assert.match(body.textContent,/Venda criada/)
 assert.doesNotMatch(body.textContent,/fake/)
})
test('WhatsApp só envia ao receptor autenticado com https',async()=>{
 const env={CHECKOUT_SALES_WHATSAPP_WEBHOOK_URL:'https://receiver.example.com/hook',CHECKOUT_SALES_WHATSAPP_WEBHOOK_TOKEN:'fake-token'}
 let call
 await sendSaleNotification({channel:'whatsapp',destination:'5584996633020'}, {...sale,event_type:'order_paid'},env,async(url,options)=>{call={url,options};return {ok:true}})
 assert.equal(call.url,env.CHECKOUT_SALES_WHATSAPP_WEBHOOK_URL)
 assert.equal(call.options.headers.Authorization,'Bearer fake-token')
 assert.equal(JSON.parse(call.options.body).phone,'5584996633020')
 assert.match(JSON.parse(call.options.body).message,/Venda aprovada/)
})
test('falha do provedor é sinalizada sem confirmação falsa',async()=>{
 await assert.rejects(sendSaleNotification({channel:'email',destination:'x@example.com'},sale,{BREVO_API_KEY:'fake',BREVO_SENDER_EMAIL:'from@example.com'},async()=>({ok:false,status:401})),/brevo_http_401/)
})
