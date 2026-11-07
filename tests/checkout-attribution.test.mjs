import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutAttribution, browserAttribution } from '../src/lib/checkoutAttribution.js'
import { readCheckoutConsent, writeCheckoutConsent, clearSessionChoice } from '../src/lib/checkoutConsent.js'
import { purchaseAuditRows } from '../src/lib/checkoutMetaAudit.js'

test('blocked storage preserves both acceptance and rejection for the payment request', () => {
  const target = { localStorage: {getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}, dispatchEvent(){} }
  clearSessionChoice()
  assert.equal(readCheckoutConsent(target),'unknown')
  writeCheckoutConsent('granted',target)
  assert.equal(readCheckoutConsent(target),'granted')
  writeCheckoutConsent('denied',target)
  assert.equal(readCheckoutConsent(target),'denied')
  writeCheckoutConsent('unknown',target)
  assert.equal(readCheckoutConsent(target),'unknown')
  clearSessionChoice()
})
test('only bounded campaign fields survive an ad URL; customer data and malformed values are ignored', () => {
  assert.deepEqual(browserAttribution('?utm_source=facebook&utm_campaign=Black+Friday&email=private&fbclid=click'),{utm_source:'facebook',utm_campaign:'Black Friday'})
  assert.deepEqual(checkoutAttribution({utm_source:'x'.repeat(257),utm_medium:'bad\nvalue',utm_content:42}),{})
  assert.deepEqual(checkoutAttribution(null),{})
})
test('audit distinguishes missing consent from an unconfirmed consented purchase and keeps environments apart', () => {
  const orders=[{id:'one',event_id:'checkout:key',paid_at:'2026-11-07T12:00:00Z'}]
  const rows=[{pagarme_event_id:'request:key',payload:{gateway_base:'live',tracking:null}}]
  assert.match(purchaseAuditRows(orders,rows,[],'live')[0].status,/sem autorização/)
  assert.deepEqual(purchaseAuditRows(orders,rows,[],'test'),[])
  rows[0].payload.tracking={consent:true}
  assert.match(purchaseAuditRows(orders,rows,[],'live')[0].status,/Sem confirmação/)
  assert.deepEqual(purchaseAuditRows(orders,rows,[{type:'checkout.capi',payload:{order_id:'one'}}],'live'),[])
})
