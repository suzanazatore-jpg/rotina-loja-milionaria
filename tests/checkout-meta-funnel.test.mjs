import test from 'node:test'
import assert from 'node:assert/strict'
import { websiteIdentifiers, metaVisit } from '../src/lib/checkoutMetaVisit.js'
import { readCheckoutSession } from '../src/lib/checkoutSession.js'
import { dispatchAnalytics } from '../src/lib/checkoutAnalytics.js'
import { funnelEvent } from '../src/lib/checkoutMetaFunnelServer.js'

test('signed analytics visit is scoped to this offer and cannot read a payment session',()=>{
  const env = {META_CAPI_ACCESS_TOKEN:'test',META_CAPI_PIXEL_ID:'123456',VERCEL_ENV:'production',CHECKOUT_CAPI_ENABLED:'true',PAGARME_BASE_URL:'https://api.pagar.me/core/v5',CHECKOUT_SESSION_SECRET:'a'.repeat(32)}
  const loaded = {offer:{id:'offer'},config:{meta_pixel_id:'123456'}}
  const visit = metaVisit(loaded,env)
  assert.ok(visit && visit.id)
  assert.equal(readCheckoutSession(visit.ticket,'offer',env.CHECKOUT_SESSION_SECRET),null)
  assert.equal(readCheckoutSession(visit.ticket,'meta-visit:other',env.CHECKOUT_SESSION_SECRET),null)
  assert.equal(readCheckoutSession(visit.ticket,'meta-visit:offer',env.CHECKOUT_SESSION_SECRET).key,visit.id)
  assert.equal(metaVisit(loaded,{...env,VERCEL_ENV:'preview'}),null)
})

test('checkout and API stages share event IDs and repeated renders do not emit again',()=>{
  const calls=[]
  const target={fbq:(...args)=>calls.push(args)}
  const config={meta_pixel_id:'123456'}
  const product={id:'product'}
  const cart={total_cents:2700,items:[{item_id:'product',item_name:'Desafio',price_cents:2700}]}
  for(const [action,name] of Object.entries({add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout',add_payment_info:'AddPaymentInfo',start_trial:'StartTrial'})) {
    const id=name+':visit'
    const event=funnelEvent(name,id,'https://shop.example/checkout/offer',{client_user_agent:'Test'},product,'visit')
    assert.equal(dispatchAnalytics(target,config,action,{...cart,event_id:id},id),true)
    assert.equal(dispatchAnalytics(target,config,action,{...cart,event_id:id},id),false)
    assert.equal(calls.at(-1)[2],event.event_name)
    assert.equal(calls.at(-1)[4].eventID,event.event_id)
  }
})

test('attribution only uses bounded Meta cookies and the original browser agent',()=>{
  const headers={'user-agent':'Browser','cookie':'other=private; _fbp=fb.1.1793881000000.12345; _fbc=bad@example.com'}
  assert.deepEqual(websiteIdentifiers(new Request('https://shop.example',{headers})),{client_user_agent:'Browser',fbp:'fb.1.1793881000000.12345'})
})
