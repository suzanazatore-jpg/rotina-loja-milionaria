import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const url=name=>{let s=readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8');s=s.replace(/from '(\.\/([^']+)\.js)'/g,(_a,_p,dep)=>`from ${JSON.stringify(url(dep))}`);return `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`}
const { calculatePayment, subscriptionPlanPayload }=await import(url('pagarme'))
const { quoteBump }=await import(url('checkoutCart'))
const manifest=JSON.parse(readFileSync(new URL('../docs/guru-offers-2026-10-24.json',import.meta.url)))
const product={active:true,type:'one_time',name:'Gestão de Tráfego Pago'}
const offer={active:true,price_cents:300000,payment_methods:['credit_card'],max_installments:12,free_installments:1,monthly_interest_pct:2.2,interest_model:'simple'}
test('Guru installment table matches observed totals for all twelve installments',()=>{
  const golden=[300000,313200,319800,326400,333000,339600,346200,352800,359400,366000,372600,379200]
  for(let n=1;n<=12;n++)assert.equal(calculatePayment(offer,product,'credit_card',n).total_cents,golden[n-1])
  assert.equal(calculatePayment({...offer,free_installments:3},product,'credit_card',3).total_cents,300000)
  assert.equal(calculatePayment({...offer,free_installments:3},product,'credit_card',4).total_cents,326400)
  // Second table observed in Guru: R$3,600, three free installments.
  assert.equal(calculatePayment({...offer,price_cents:360000,free_installments:3},product,'credit_card',4).total_cents,391680)
  assert.equal(calculatePayment({...offer,price_cents:360000,free_installments:3},product,'credit_card',12).total_cents,455040)
})
test('Guru preserves four-decimal interest, exact cents, eighteen installments and Pix',()=>{
  const protocolo={...offer,price_cents:4700,monthly_interest_pct:2.23,payment_methods:['credit_card','pix']}
  assert.equal(calculatePayment(protocolo,product,'credit_card',3).total_cents,5014)
  assert.equal(calculatePayment({...protocolo,price_cents:2700,monthly_interest_pct:2.2999},product,'credit_card',12).total_cents,3445)
  const extended={...protocolo,max_installments:18,monthly_interest_pct:2.32}
  assert.equal(calculatePayment(extended,product,'credit_card',18).total_cents,6663)
  assert.throws(()=>calculatePayment(extended,product,'credit_card',19))
  assert.equal(calculatePayment(protocolo,product,'pix').total_cents,4700)
})
test('additional inherits principal interest model without applying it twice',()=>{
  const bump={offer:{...offer,price_cents:2700,interest_model:'price'},product}
  assert.equal(quoteBump(offer,bump,'credit_card',12).total_cents,3413)
})
test('subscription payload preserves day intervals and finite billing cycles',()=>{
  for(const count of [29,30,90]){
    const payload=subscriptionPlanPayload({...offer,billing_interval:'day',billing_interval_count:count,billing_cycles:3},product)
    assert.equal(payload.interval,'day');assert.equal(payload.interval_count,count)
    assert.equal(payload.items[0].cycles,3);assert.deepEqual(payload.installments,[1])
  }
  assert.equal(subscriptionPlanPayload({...offer,billing_cycles:0},product).items[0].cycles,undefined)
})
test('complete Guru manifest has unique provenance and valid commercial terms',()=>{
  assert.equal(manifest.length,85);assert.equal(new Set(manifest.map(o=>o.product_code)).size,25)
  assert.equal(new Set(manifest.map(o=>o.source_offer_id)).size,85)
  for(const o of manifest){
    assert.ok(o.name && o.source_slug && o.quantity===1 && o.price_cents>0)
    assert.ok(o.max_installments>=1&&o.max_installments<=18)
    assert.ok(o.free_installments>=1&&o.free_installments<=o.max_installments)
    assert.ok(o.default_installments>=1&&o.default_installments<=o.max_installments)
    assert.ok(o.subscription?o.billing_interval==='day'&&o.billing_interval_count>0:o.interest_model==='simple')
  }
})
