import test from 'node:test'
import assert from 'node:assert/strict'
import { websiteIdentifiers, metaVisit } from '../src/lib/checkoutMetaVisit.js'
import { readCheckoutSession } from '../src/lib/checkoutSession.js'
import { dispatchAnalytics } from '../src/lib/checkoutAnalytics.js'
import { conversionEvent } from '../src/lib/checkoutConversionsServer.js'
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


test('Vercel visitor IP accompanies the browser agent in every funnel and paid purchase payload',()=>{
  for (const ip of ['203.0.113.42','2001:db8::1234']) {
    const request = new Request('https://shop.example',{headers:{'user-agent':'Buyer Browser','x-vercel-forwarded-for':ip,'x-forwarded-for':'198.51.100.99'}})
    const identifiers = websiteIdentifiers(request)
    assert.equal(identifiers.client_ip_address,ip)
    assert.equal(identifiers.client_user_agent,'Buyer Browser')
    for (const name of ['AddToCart','InitiateCheckout','AddPaymentInfo','StartTrial']) {
      assert.equal(funnelEvent(name,name+':visit','https://shop.example',identifiers,{id:'product'},'visit').user_data.client_ip_address,ip)
    }
    const snapshot={tracking:{consent:true,identifiers,source_url:'https://shop.example'},items:[{product_id:'product',name:'Desafio',total_cents:2700}]}
    const order={id:'order',status:'paid',paid_at:new Date(Date.now()-1000).toISOString(),total_cents:2700}
    // A webhook later uses the saved buyer identifiers, not its own request headers.
    const purchase=conversionEvent(order,JSON.parse(JSON.stringify(snapshot)),{email:'buyer@example.com'})
    assert.equal(purchase.user_data.client_ip_address,ip)
    assert.equal(purchase.user_data.client_user_agent,'Buyer Browser')
  }
})
test('IP extraction validates addresses, supports proxy lists, and never invents a missing IP',()=>{
  const read=headers=>websiteIdentifiers(new Request('https://shop.example',{headers}))
  assert.equal(read({'x-forwarded-for':'203.0.113.42, 192.0.2.10'}).client_ip_address,'203.0.113.42')
  assert.equal(read({'x-real-ip':'2001:db8::2'}).client_ip_address,'2001:db8::2')
  for(const value of ['unknown','999.1.2.3','203.0.113.42:1234','https://example.com','']) {
    assert.equal(read({'x-vercel-forwarded-for':value}).client_ip_address,undefined)
  }
  assert.equal(read({'user-agent':'Browser'}).client_ip_address,undefined)
})
