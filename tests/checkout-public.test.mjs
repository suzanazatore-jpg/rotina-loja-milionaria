import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const moduleUrl=name=>{let source=readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8');source=source.replace(/from '(\.\/([^']+)\.js)'/g,(_all,_path,dependency)=>`from ${JSON.stringify(moduleUrl(dependency))}`);return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`}
const source=readFileSync(new URL('../src/lib/checkoutPublicServer.js',import.meta.url),'utf8')
 .replace("import { checkoutAdminClient } from './checkoutAdminServer.js'", "const checkoutAdminClient=()=>{throw new Error('Unexpected real database access')}")
 .replace("'./checkoutSettings.js'",JSON.stringify(moduleUrl('checkoutSettings')))
 .replace("'./pagarme.js'",JSON.stringify(moduleUrl('pagarme')))
 .replace("'./checkoutCart.js'",JSON.stringify(moduleUrl('checkoutCart')))
const {checkoutTestConfiguration,loadCheckoutOffer,publicCheckoutData}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const env={CHECKOUT_TEST_ENABLED:'true',CHECKOUT_SESSION_SECRET:'a'.repeat(32),PAGARME_SECRET_KEY:'sk_test_mock',PAGARME_PUBLIC_KEY:'pk_test_mock'}
test('public checkout denies real payments, incomplete configuration and accidental activation',()=>{
 assert.equal(checkoutTestConfiguration(env).ready,true)
 assert.equal(checkoutTestConfiguration({...env,CHECKOUT_TEST_ENABLED:'false'}).ready,false)
 assert.equal(checkoutTestConfiguration({...env,CHECKOUT_SESSION_SECRET:'short'}).ready,false)
 assert.equal(checkoutTestConfiguration({...env,PAGARME_SECRET_KEY:''}).ready,false)
 assert.equal(checkoutTestConfiguration({...env,PAGARME_SECRET_KEY:'sk_live_mock',PAGARME_BASE_URL:'https://api.pagar.me/core/v5',CHECKOUT_LIVE_ENABLED:'true'}).ready,false)
 assert.equal(checkoutTestConfiguration({...env,PAGARME_PUBLIC_KEY:'sk_test_do_not_expose'}).publicKey,'')
})
test('offer lookup filters active records and exposes only public product/offer fields',async()=>{
 const offer={id:'offer',slug:'offer',name:'Oferta',product_id:'product',price_cents:4700,active:true,max_installments:3,free_installments:3,payment_methods:['pix','credit_card'],pix_discount_pct:10,checkout_config:{},internal_flag:'private'}
 const product={id:'product',name:'Produto',type:'one_time',active:true,plan_id:'internal-plan',botconversa_tag:'private'}
 let calls=0
 const db={from(table){
  const data=table==='order_bumps'?[]:table==='offers'?offer:product
  const operations=[]
  const query={select(){return query},eq(key,value){operations.push([key,value]);return query},order(){return query},then(resolve){calls++;assert.ok(operations.some(([key,value])=>key==='active'&&value===true));resolve({data})},async maybeSingle(){assert.ok(operations.some(([key,value])=>key==='active'&&value===true));calls++;return {data}}}
  return query
 }}
 const loaded=await loadCheckoutOffer('offer',db)
 assert.equal(calls,3)
 assert.equal(loaded.prices.find(p=>p.method==='pix').total_cents,4230)
 assert.equal(loaded.prices.find(p=>p.installments===3).total_cents,4700)
 const exposed=publicCheckoutData(loaded,env)
 assert.equal(exposed.offer.internal_flag,undefined)
 assert.equal(exposed.product.plan_id,undefined)
 assert.equal(exposed.product.botconversa_tag,undefined)
 assert.equal(exposed.test.publicKey,'pk_test_mock')
 assert.equal(exposed.test.key,undefined)
 assert.equal(await loadCheckoutOffer('../invalid',db),null)
})
