import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { webhookBody, isInternalAccessWebhook } = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../src/lib/checkoutWebhookPayload.js', import.meta.url))).toString('base64')}`)
const sample = { id:'delivery-1',event:'order.paid',environment:'test',created_at:'2026-10-24T12:00:00Z',order:{id:'order-1',status:'paid',paid_at:'2026-10-24T12:00:00Z',subtotal_cents:360000,total_cents:455040,interest_cents:95040,discount_cents:0,installments:12,payment_method:'credit_card'},customer:{id:'buyer',name:'Cliente de teste',email:'test@example.invalid',phone:'5599999999999',document:'test-document',billing_address:{line_1:'Rua de teste',city:'Cidade',state:'RN',zip_code:'00000000'}},items:[{product_id:'product-1',product_code:'1773344369',product_name:'Gestão de Tráfego Pago',offer_id:'local-offer',guru_offer_id:'source-offer',offer_name:'3M',price_cents:360000}],subscription:{id:'subscription-1',status:'active',current_period_end:'2026-11-24T12:00:00Z'}}
test('transaction adapter preserves gross sale, installments, contact and source product/offer codes',()=>{
 const body=webhookBody(sample,'guru','test-token')
 assert.equal(body.status,'approved');assert.equal(body.webhook_type,'transaction')
 assert.equal(body.product.id,'1773344369');assert.equal(body.product.offer.id,'source-offer')
 assert.equal(body.contact.phone_number,'99999999999');assert.equal(body.contact.doc,'test-document')
 assert.equal(body.payment.gross,3600);assert.equal(body.payment.total,4550.4);assert.equal(body.payment.installments.value,379.2)
 assert.equal(body.payment.net,null);assert.equal(body.payment.affiliate_value,null)
 assert.equal(body.id,'order-1');assert.equal(body.event_id,'delivery-1');assert.equal(body.api_token,'test-token')
 assert.equal(sample.api_token,undefined);assert.equal(body.credit_card,undefined)
})
test('only paid active subscriptions produce active payload and invoice cents',()=>{
 const active={...sample,event:'subscription.active'}
 const body=webhookBody(active,'guru','test-token')
 assert.equal(body.last_status,'active');assert.equal(body.current_invoice.status,'paid');assert.equal(body.current_invoice.value,455040)
 assert.equal(body.subscriber.email,sample.customer.email);assert.equal(body.dates.next_cycle_at,sample.subscription.current_period_end)
 for(const order of [{...sample.order,status:'pending'},{...sample.order,paid_at:null}])assert.throws(()=>webhookBody({...active,order},'guru','test-token'))
 assert.throws(()=>webhookBody({...active,subscription:{status:'canceled'}},'guru','test-token'))
 assert.equal(webhookBody({...sample,event:'subscription.created'},'guru','test-token').last_status,'pending')
})
test('refusal, refund, chargeback and cancellation stay distinct; retries retain stable ids',()=>{
 for(const [event,status] of [['order.failed','refused'],['order.refunded','refunded'],['order.chargedback','chargedback'],['subscription.canceled','canceled']]) assert.equal(webhookBody({...sample,event},'guru','token').status,status)
 assert.deepEqual(webhookBody(sample,'guru','token'),webhookBody(sample,'guru','token'))
 assert.equal(webhookBody(sample),sample)
 assert.throws(()=>webhookBody(sample,'guru'));assert.throws(()=>webhookBody({...sample,items:[]},'guru','token'))
})
test('self callbacks are blocked, external member area remains external',()=>{
 assert.equal(isInternalAccessWebhook('https://rotina.suzanazatorre.com.br/api/webhook-guru'),true)
 assert.equal(isInternalAccessWebhook('https://rotina-loja-milionaria-branch.vercel.app/api/webhook-guru/'),true)
 assert.equal(isInternalAccessWebhook('https://membros.suzanazatorre.com.br/api/webhooks/guru'),false)
 assert.equal(isInternalAccessWebhook('https://example.com/api/webhook-guru'),false)
})
test('bump-specific webhook identifies the purchased target without losing the full cart total',()=>{
 const cart={...sample,items:[...sample.items,{...sample.items[0],product_id:'bump',product_code:'1783630452',kind:'bump',price_cents:3700}]}
 const body=webhookBody(cart,'guru','token',['bump'])
 assert.equal(body.product.id,'1783630452');assert.equal(body.is_order_bump,1);assert.equal(body.items.length,2)
 assert.equal(body.payment.total,4550.4)
 assert.throws(()=>webhookBody(cart,'guru','token',['unrelated']))
})
