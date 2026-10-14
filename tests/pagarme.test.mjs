import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/lib/pagarme.js', import.meta.url), 'utf8')
const { calculatePayment, gatewayConfiguration, cardReference, confirmedOrderState, orderPayload, normalizeCustomer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const offer = { id: 'offer', active: true, price_cents: 4700, payment_methods: ['pix','credit_card'], pix_discount_pct: 10, max_installments: 12, free_installments: 3, monthly_interest_pct: 2 }
const product = { id: 'product', active: true, type: 'one_time', name: 'Protocolo' }
test('Pix and installments use server prices and integer cents', () => {
  assert.deepEqual(calculatePayment(offer, product, 'pix'), { subtotal_cents: 4700, discount_cents: 470, interest_cents: 0, total_cents: 4230 })
  assert.equal(calculatePayment(offer, product, 'credit_card', 3).total_cents,4700)
  assert.equal(calculatePayment(offer, product, 'credit_card', 12).total_cents % 12,0)
  assert.throws(() => calculatePayment(offer, product, 'pix', 2))
  assert.throws(() => calculatePayment(offer, product, 'credit_card', 13))
  assert.throws(() => calculatePayment(offer, { ...product, active: false }, 'pix'))
})
test('recurrence cannot use Pix or installments', () => {
  assert.throws(() => calculatePayment(offer, { ...product, type: 'subscription' }, 'pix'))
  assert.throws(() => calculatePayment(offer, { ...product, type: 'subscription' }, 'credit_card',2))
})
test('live payments require explicit activation and matching credentials', () => {
  assert.throws(() => gatewayConfiguration({ PAGARME_SECRET_KEY: 'sk_live_x' }))
  assert.throws(() => gatewayConfiguration({ PAGARME_SECRET_KEY: 'sk_live_x', PAGARME_BASE_URL: 'https://api.pagar.me/core/v5' }))
  assert.equal(gatewayConfiguration({ PAGARME_SECRET_KEY: 'sk_test_x' }).base,'https://sdx-api.pagar.me/core/v5')
  assert.throws(() => gatewayConfiguration({ PAGARME_SECRET_KEY: 'sk_test_x', PAGARME_BASE_URL: 'https://evil.example' }))
})
test('raw card fields are rejected and only token is sent', () => {
  assert.throws(() => cardReference({ card_token:'token_abc', cvv:'123' }))
  assert.throws(() => cardReference({ card_id:'card_othercustomer' }))
  assert.deepEqual(cardReference({ card_token:'token_abc' }),{ card_token:'token_abc' })
  const payload = orderPayload({ id:'order', payment_method:'credit_card', installments:1,total_cents:4700 },offer,product,{},cardReference({card_token:'token_abc'}))
  assert.equal(payload.payments[0].credit_card.card_token,'token_abc')
  assert.equal(payload.items[0].amount,4700)
})
test('confirmation must match code, amount and customer; pending never becomes paid', () => {
  const expected = { id:'local',total_cents:4700,email:'a@example.com' }
  const remote = { id:'or_abc',code:'local',amount:4700,customer:{email:'a@example.com'},charges:[{id:'ch_abc',status:'pending'}] }
  assert.equal(confirmedOrderState(remote,expected).status,'waiting_payment')
  assert.throws(() => confirmedOrderState({...remote,amount:47},expected))
  assert.throws(() => confirmedOrderState({...remote,code:'other'},expected))
  assert.throws(() => confirmedOrderState({...remote,customer:{email:'other@example.com'}},expected))
  assert.equal(confirmedOrderState({...remote,charges:[{id:'ch_abc',status:'paid'}]},expected).status,'paid')
})
test('customer normalization whitelists fields', () => {
  const customer = normalizeCustomer({ name:'Ana',email:' ANA@example.com ',document:'12345678901',phone:'5584981236393',role:'admin',address:{line_1:'Rua 1, 10',zip_code:'59000000',city:'Natal',state:'RN'} })
  assert.equal(customer.email,'ana@example.com')
  assert.equal(customer.role,undefined)
  assert.equal(customer.phones.mobile_phone.area_code,'84')
  assert.throws(() => normalizeCustomer({name:'Ana'}))
})

const paymentsSource = readFileSync(new URL('../src/lib/checkoutPaymentsServer.js', import.meta.url), 'utf8').replace("'./pagarme.js'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
const { createPayment, syncPayment } = await import(`data:text/javascript;base64,${Buffer.from(paymentsSource).toString('base64')}`)
function scriptedDatabase(steps) {
  return { from(table) {
    const operations = []
    const query = new Proxy({}, { get(_target, method) {
      if (method === 'then') return (resolve, reject) => {
        try {
          const step = steps.shift()
          assert.ok(step, `Unexpected database call: ${table}`)
          assert.equal(table, step.table)
          step.check?.(operations)
          resolve({ data: step.data, error: step.error || null })
        } catch (error) { reject(error) }
      }
      return (...args) => { operations.push([method,...args]); return query }
    } })
    return query
  } }
}
test('paid order creation registers locally before gateway and verifies returned amount', async () => {
  process.env.PAGARME_SECRET_KEY = 'sk_test_mock'
  const customer = { name:'Ana',email:'ana@example.com',document:'12345678901',phone:'84981236393',address:{line_1:'Rua 1, 10',zip_code:'59000000',city:'Natal',state:'RN'} }
  let localOrder
  const steps = [
    {table:'offers',data:{...offer,product_id:'product'}},
    {table:'products',data:{...product,plan_id:'plan-local'}},
    {table:'orders',data:null},
    {table:'customers',data:{id:'customer'}},
    {table:'orders',get data(){return localOrder},check(operations){localOrder=operations.find(row=>row[0]==='insert')[1]; assert.equal(localOrder.total_cents,4230)}},
    {table:'webhook_events',data:null},
    {table:'order_items',data:null},
    {table:'orders',data:null,check(operations){assert.equal(operations.find(row=>row[0]==='update')[1].status,'paid')}},
  ]
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(steps.length,1)
    assert.equal(url,'https://sdx-api.pagar.me/core/v5/orders')
    assert.equal(options.headers['Idempotency-Key'],localOrder.id)
    const body = JSON.parse(options.body)
    assert.equal(body.payments[0].amount,4230)
    return Response.json({id:'or_mock',code:localOrder.id,amount:4230,customer:{email:customer.email},charges:[{id:'ch_mock',status:'paid',paid_at:'2026-10-14T10:00:00Z'}]})
  }
  try {
    const response = await createPayment(scriptedDatabase(steps),{offer_id:'offer',customer,payment_method:'pix'},'request-key-123456')
    assert.equal(response.status,'paid')
    assert.equal(steps.length,0)
  } finally { globalThis.fetch=oldFetch; delete process.env.PAGARME_SECRET_KEY }
})
test('mismatched confirmation cannot update local order', async () => {
  process.env.PAGARME_SECRET_KEY='sk_test_mock'
  const steps=[{table:'orders',data:{id:'local',customer_id:'customer',total_cents:4700,pagarme_order_id:'or_mock'}},{table:'customers',data:{email:'ana@example.com'}}]
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>Response.json({id:'or_mock',code:'local',amount:1,customer:{email:'ana@example.com'},charges:[{status:'paid'}]})
  try { await assert.rejects(()=>syncPayment(scriptedDatabase(steps),'local'),/não corresponde/); assert.equal(steps.length,0) }
  finally {globalThis.fetch=oldFetch;delete process.env.PAGARME_SECRET_KEY}
})
test('reusing request key with different fingerprint never calls gateway', async () => {
  const customer={name:'Ana',email:'ana@example.com',document:'12345678901',phone:'84981236393',address:{line_1:'Rua 1, 10',zip_code:'59000000',city:'Natal',state:'RN'}}
  const steps=[{table:'offers',data:{...offer,product_id:'product'}},{table:'products',data:{...product,plan_id:'plan-local'}},{table:'orders',data:{id:'local',created_at:new Date().toISOString()}},{table:'webhook_events',data:{payload:{fingerprint:'different'}}}]
  await assert.rejects(()=>createPayment(scriptedDatabase(steps),{offer_id:'offer',customer,payment_method:'pix'},'request-key-123456'),/outros dados/)
  assert.equal(steps.length,0)
})
