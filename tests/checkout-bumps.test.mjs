import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const url=name=>{
  let source=readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8')
  source=source.replace(/from '(\.\/([^']+)\.js)'/g,(_all,_path,dependency)=>`from ${JSON.stringify(url(dependency))}`)
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}
const {buildCheckoutCart,normalizeBumpSelection,loadOrderBumps}=await import(url('checkoutCart'))
const {orderPayload}=await import(url('pagarme'))
const {loadPurchasedPlans,fulfillPaidOrder}=await import(url('checkoutFulfillmentServer'))
const main={id:'00000000-0000-4000-8000-000000000001',active:true,price_cents:4700,payment_methods:['pix','credit_card'],pix_discount_pct:10,max_installments:12,free_installments:3,monthly_interest_pct:2}
const product={id:'main-product',name:'Protocolo',active:true,type:'one_time',plan_id:'plan-main'}
const bump={offer:{...main,id:'00000000-0000-4000-8000-000000000002',price_cents:3700,pix_discount_pct:0},product:{...product,id:'bump-product',name:'Equipe',plan_id:'plan-bump'}}
function database(steps){return {from(table){const ops=[];const query=new Proxy({}, {get(_object,method){if(method==='then')return (resolve,reject)=>{try{const step=steps.shift();assert.ok(step,`Unexpected ${table}`);assert.equal(step.table,table);step.check?.(ops);resolve({data:step.data,error:step.error||null})}catch(error){reject(error)}};return (...args)=>{ops.push([method,...args]);return query}}});return query}}}

test('only selected bumps are charged, with accurate Pix and item totals',()=>{
  const empty=buildCheckoutCart(main,product,[bump],[], 'pix')
  assert.equal(empty.items.length,1);assert.equal(empty.amount.total_cents,4230)
  const cart=buildCheckoutCart(main,product,[bump],[bump.offer.id],'pix')
  assert.deepEqual(cart.amount,{subtotal_cents:8400,discount_cents:470,interest_cents:0,total_cents:7930})
  assert.deepEqual(cart.items.map(item=>item.kind),['main','bump'])
  const payload=orderPayload({id:'local',payment_method:'pix',installments:1,...cart.amount},main,product,{},null,cart.items)
  assert.equal(payload.items.reduce((sum,item)=>sum+item.amount,0),payload.payments[0].amount)
  assert.equal(payload.items[1].amount,3700)
})
test('cart installments inherit principal offer terms and preserve cent rounding',()=>{
  const cart=buildCheckoutCart(main,product,[bump],[bump.offer.id],'credit_card',12)
  assert.equal(cart.amount.total_cents,cart.items.reduce((sum,item)=>sum+item.total_cents,0))
  assert.equal(cart.amount.total_cents%12,0)
  assert.ok(cart.amount.interest_cents>0)
  assert.equal(buildCheckoutCart(main,product,[bump],[bump.offer.id],'credit_card',3).amount.total_cents,8400)
})
test('duplicate, forged, inactive, foreign and unsupported bump selections are rejected',()=>{
  assert.throws(()=>normalizeBumpSelection([bump.offer.id,bump.offer.id]),/duas vezes/)
  assert.throws(()=>normalizeBumpSelection([{offer_id:bump.offer.id,price_cents:1}]),/inválida/)
  assert.throws(()=>buildCheckoutCart(main,product,[],[bump.offer.id],'pix'),/disponível/)
  assert.throws(()=>buildCheckoutCart(main,product,[{...bump,offer:{...bump.offer,active:false}}],[bump.offer.id],'pix'),/indisponível/)
  assert.throws(()=>buildCheckoutCart(main,product,[{...bump,offer:{...bump.offer,payment_methods:['pix']}}],[bump.offer.id],'credit_card'),/indisponível/)
  assert.throws(()=>buildCheckoutCart(main,{...product,type:'subscription'},[bump],[bump.offer.id],'credit_card'),/Assinaturas/)
  assert.throws(()=>buildCheckoutCart(main,product,[{...bump,product:{...bump.product,plan_id:null}}],[bump.offer.id],'pix'),/plano/)
})
test('configured links determine order and exclude products without a valid plan',async()=>{
  const links=[{bump_offer_id:bump.offer.id,position:0},{bump_offer_id:main.id,position:1},{bump_offer_id:'00000000-0000-4000-8000-000000000003',position:2}]
  const steps=[{table:'order_bumps',data:links,check(ops){assert.ok(ops.some(row=>row[0]==='eq'&&row[1]==='offer_id'&&row[2]===main.id));assert.ok(ops.some(row=>row[0]==='order'&&row[1]==='position'))}},{table:'offers',data:[{...bump.offer,product_id:'bump-product'},{...bump.offer,id:links[2].bump_offer_id,product_id:'no-plan'}]},{table:'products',data:[bump.product,{...bump.product,id:'no-plan',plan_id:null}]}]
  const loaded=await loadOrderBumps(database(steps),main.id)
  assert.equal(loaded.length,1);assert.equal(loaded[0].offer.id,bump.offer.id);assert.equal(steps.length,0)
})
test('delivery uses only plans snapshotted for purchased items with separate access periods',async()=>{
  const cart=buildCheckoutCart(main,product,[bump],[bump.offer.id],'pix')
  const steps=[{table:'order_items',data:cart.items},{table:'webhook_events',data:{payload:{items:cart.items}},check(ops){assert.ok(ops.some(row=>row[0]==='eq'&&row[2]==='request:abc'))}},{table:'plans',data:[{id:'plan-main',period_days:30},{id:'plan-bump',period_days:90}]}]
  const plans=await loadPurchasedPlans(database(steps),{id:'order',event_id:'checkout:abc',paid_at:'2026-10-14T12:00:00Z'})
  assert.deepEqual(plans.map(plan=>plan.expires_at),['2026-11-13T12:00:00.000Z','2027-01-12T12:00:00.000Z'])
  assert.equal(steps.length,0)
})
test('delivery rejects a plan snapshot including an unpurchased additional',async()=>{
  const cart=buildCheckoutCart(main,product,[bump],[bump.offer.id],'pix')
  const steps=[{table:'order_items',data:[cart.items[0]]},{table:'webhook_events',data:{payload:{items:cart.items}}}]
  await assert.rejects(()=>loadPurchasedPlans(database(steps),{id:'order',event_id:'checkout:abc',paid_at:'2026-10-14T12:00:00Z'}),/não correspondem/)
  assert.equal(steps.length,0)
})
test('unpaid purchases do not release any main or additional plan',async()=>{
  process.env.CHECKOUT_FULFILLMENT_ENABLED='true'
  const steps=[{table:'orders',data:{id:'order',status:'waiting_payment'}}]
  try{assert.deepEqual(await fulfillPaidOrder(database(steps),'order'),{fulfillment:'waiting_payment'});assert.equal(steps.length,0)}finally{delete process.env.CHECKOUT_FULFILLMENT_ENABLED}
})
test('payment registers and charges main plus selected additional in one gateway order',async()=>{
  const {createPayment}=await import(url('checkoutPaymentsServer'))
  const customer={name:'Ana',email:'ana@example.com',document:'12345678901',phone:'84981236393',address:{line_1:'Rua 1, 10',zip_code:'59000000',city:'Natal',state:'RN'}}
  let localOrder
  const steps=[
    {table:'offers',data:{...main,product_id:product.id}},{table:'products',data:product},
    {table:'order_bumps',data:[{bump_offer_id:bump.offer.id,position:0}]},
    {table:'offers',data:[{...bump.offer,product_id:bump.product.id}]},{table:'products',data:[bump.product]},
    {table:'orders',data:null},{table:'customers',data:null},{table:'customers',data:{id:'customer'}},
    {table:'orders',get data(){return localOrder},check(ops){localOrder=ops.find(row=>row[0]==='insert')[1];assert.equal(localOrder.total_cents,7930)}},
    {table:'webhook_events',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='insert')[1].payload.items[1].plan_id,'plan-bump')}},
    {table:'order_items',data:null,check(ops){const items=ops.find(row=>row[0]==='upsert')[1];assert.equal(items.length,2);assert.equal(items[1].kind,'bump');assert.equal(items[1].price_cents,3700);assert.notEqual(items[0].id,items[1].id)}},
    {table:'orders',data:null},
  ]
  const previousFetch=globalThis.fetch, previousKey=process.env.PAGARME_SECRET_KEY
  process.env.PAGARME_SECRET_KEY='sk_test_mock'
  globalThis.fetch=async (request,options)=>{
    assert.equal(request,'https://sdx-api.pagar.me/core/v5/orders')
    const body=JSON.parse(options.body)
    assert.equal(body.items.length,2);assert.equal(body.items[0].amount,4230);assert.equal(body.items[1].amount,3700)
    assert.equal(body.payments[0].amount,7930)
    return Response.json({id:'or_bumps',code:localOrder.id,amount:7930,customer:{email:customer.email},charges:[{id:'ch_bumps',status:'paid',paid_at:'2026-10-14T12:00:00Z'}]})
  }
  try{const paid=await createPayment(database(steps),{offer_id:main.id,customer,payment_method:'pix',bumps:[bump.offer.id]},'bumps-request-123456');assert.equal(paid.status,'paid');assert.equal(steps.length,0)}
  finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.PAGARME_SECRET_KEY;else process.env.PAGARME_SECRET_KEY=previousKey}
})
test('paid main and additional grant both plans once, preserving the longest shared course access',async()=>{
  const cart=buildCheckoutCart(main,product,[bump],[bump.offer.id],'pix')
  const order={id:'order',status:'paid',paid_at:'2026-10-14T12:00:00Z',event_id:'checkout:abc',customer_id:'customer',offer_id:main.id,total_cents:7930}
  const untilMain='2026-11-13T12:00:00.000Z',untilBump='2027-01-12T12:00:00.000Z'
  const steps=[
    {table:'orders',data:order},{table:'webhook_events',data:null},{table:'webhook_events',data:{id:'event',error:'ready'}},{table:'webhook_events',data:[{id:'event'}]},
    {table:'customers',data:{id:'customer',name:'Ana',email:'ana@example.com'}},{table:'order_items',data:cart.items},{table:'webhook_events',data:{payload:{items:cart.items}}},{table:'plans',data:[{id:'plan-main',period_days:30},{id:'plan-bump',period_days:90}]},
    {table:'perfis',data:{id:'profile',acesso_expira_em:null}},{table:'perfis',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='update')[1].acesso_expira_em,untilBump)}},{table:'profiles',data:null},
    {table:'profile_plans',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='upsert')[1].plan_id,'plan-main')}},{table:'plan_courses',data:[{course_id:'main-course'},{course_id:'shared'}]},
    {table:'profile_plans',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='upsert')[1].plan_id,'plan-bump')}},{table:'plan_courses',data:[{course_id:'bump-course'},{course_id:'shared'}]},
    {table:'enrollments',data:[]},{table:'enrollments',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='insert')[1].expires_at,untilMain)}},
    {table:'enrollments',data:[{id:'enrolled',expires_at:untilMain}]},{table:'enrollments',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='update')[1].expires_at,untilBump)}},
    {table:'enrollments',data:[]},{table:'enrollments',data:null,check(ops){assert.equal(ops.find(row=>row[0]==='insert')[1].expires_at,untilBump)}},
    {table:'customers',data:null},{table:'webhook_events',data:null,check(ops){assert.deepEqual(ops.find(row=>row[0]==='update')[1].payload.plan_ids,['plan-main','plan-bump'])}},
  ]
  const previous=process.env.CHECKOUT_FULFILLMENT_ENABLED,brevo=process.env.BREVO_API_KEY
  process.env.CHECKOUT_FULFILLMENT_ENABLED='true';delete process.env.BREVO_API_KEY
  try{
    assert.equal((await fulfillPaidOrder(database(steps),'order')).fulfillment,'completed');assert.equal(steps.length,0)
    const duplicate=[{table:'orders',data:order},{table:'webhook_events',error:{code:'23505'}},{table:'webhook_events',data:{id:'event',processed_at:'2026-10-14T12:01:00Z'}}]
    assert.deepEqual(await fulfillPaidOrder(database(duplicate),'order'),{fulfillment:'completed'});assert.equal(duplicate.length,0)
  }finally{if(previous===undefined)delete process.env.CHECKOUT_FULFILLMENT_ENABLED;else process.env.CHECKOUT_FULFILLMENT_ENABLED=previous;if(brevo!==undefined)process.env.BREVO_API_KEY=brevo}
})
