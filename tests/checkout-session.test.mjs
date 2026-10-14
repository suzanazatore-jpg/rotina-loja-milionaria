import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/lib/checkoutSession.js', import.meta.url), 'utf8')
const { signCheckoutSession, readCheckoutSession, safeCheckoutRedirect } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const secret = 'local-test-secret-with-at-least-32-characters'
const now = 1791993600000

test('checkout session binds an offer and expires in thirty minutes', () => {
  const token = signCheckoutSession('offer-a',secret,now)
  assert.equal(readCheckoutSession(token,'offer-a',secret,now).offerId,'offer-a')
  assert.equal(readCheckoutSession(token,'offer-b',secret,now),null)
  assert.equal(readCheckoutSession(token,'offer-a',secret,now+30*60000),null)
  assert.equal(readCheckoutSession(token,'offer-a',secret,now-1),null)
})
test('forged cookies, wrong keys and malformed tokens are rejected', () => {
  const token=signCheckoutSession('offer',secret,now)
  const [body,signature]=token.split('.')
  const payload=JSON.parse(Buffer.from(body,'base64url').toString());payload.offerId='other'
  assert.equal(readCheckoutSession(`${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`,'other',secret,now),null)
  for(const value of ['',token+'x',token+'.extra',null,'wrong']) assert.equal(readCheckoutSession(value,'offer',secret,now),null)
  assert.equal(readCheckoutSession(token,'offer','another-32-character-long-secret-key',now),null)
  assert.throws(()=>signCheckoutSession('offer','short',now))
})
test('each session is unique and never carries buyer details', () => {
  const a=readCheckoutSession(signCheckoutSession('offer',secret,now),'offer',secret,now)
  const b=readCheckoutSession(signCheckoutSession('offer',secret,now),'offer',secret,now)
  assert.notEqual(a.key,b.key)
  assert.deepEqual(Object.keys(a).sort(),['expires','key','offerId'])
})
test('redirect is chosen from trusted configuration by status', () => {
  const config={redirects:{approved:'https://example.com/ok',declined:'https://example.com/no',pending:'https://example.com/wait',pix:'https://example.com/pix'}}
  assert.equal(safeCheckoutRedirect(config,'paid','pix'),'https://example.com/ok')
  assert.equal(safeCheckoutRedirect(config,'failed','credit_card'),'https://example.com/no')
  assert.equal(safeCheckoutRedirect(config,'waiting_payment','pix'),'https://example.com/pix')
  assert.equal(safeCheckoutRedirect(config,'pending','credit_card'),'https://example.com/wait')
  for(const value of ['javascript:alert(1)','https://user:password@example.com','/relative']) assert.equal(safeCheckoutRedirect({redirects:{approved:value}},'paid','pix'),'')
})
