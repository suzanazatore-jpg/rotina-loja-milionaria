import test from 'node:test'
import assert from 'node:assert/strict'
import {saleDeliveryReady,sendSaleNotification,processSaleNotifications,sendBotConversaSaleFlow} from '../src/lib/checkoutSaleNotificationsServer.js'
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
 const env={BREVO_API_KEY:'fake'}
 const result=await sendSaleNotification({channel:'email',destination:'destinatario@example.com'},sale,env,async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({messageId:'fake-id'})}})
 assert.equal(result.provider_message_id,'fake-id')
 assert.equal(calls.length,1)
 assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email')
 const body=JSON.parse(calls[0].opts.body)
 assert.equal(body.to[0].email,'destinatario@example.com')
 assert.equal(body.sender.email,'suporte@suzanazatorre.com.br')
 assert.equal(saleDeliveryReady(env).email,true)
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

test('BotConversa requires configured API key and approved flow for alerts',async()=>{
 const recipient={channel:'whatsapp',destination:'5584996633020'}
 await assert.rejects(sendBotConversaSaleFlow(recipient,sale,{},async()=>{throw Error('unexpected network')}),/api_key_missing/)
 await assert.rejects(sendBotConversaSaleFlow(recipient,sale,{CHECKOUT_BOTCONVERSA_API_KEY:'test'},async()=>{throw Error('unexpected network')}),/approved_flow_missing/)
 assert.equal(saleDeliveryReady({CHECKOUT_BOTCONVERSA_API_KEY:'test'}).whatsapp,false)
})
test('BotConversa looks up recipient before sending approved template flow',async()=>{
 const calls=[]
 const env={CHECKOUT_BOTCONVERSA_API_KEY:'test-key',CHECKOUT_BOTCONVERSA_FLOW_CREATED_ID:'12345',CHECKOUT_BOTCONVERSA_FLOW_PAID_ID:'56789'}
 const result=await sendBotConversaSaleFlow({channel:'whatsapp',destination:'5584996633020'},sale,env,async(url,opts)=>{
  calls.push({url,opts})
  return url.includes('get_by_phone')?{ok:true,json:async()=>({id:100})}:{ok:true}
 })
 assert.equal(result.provider,'botconversa')
 assert.equal(calls.length,2)
 assert.equal(calls[0].url,'https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/5584996633020/')
 assert.equal(calls[1].url,'https://backend.botconversa.com.br/api/v1/webhook/subscriber/100/send_flow/')
 assert.equal(calls[1].opts.headers['API-KEY'],'test-key')
 assert.deepEqual(JSON.parse(calls[1].opts.body),{flow:12345})
})
