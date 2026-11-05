import test from 'node:test'
import assert from 'node:assert/strict'
import { readReceipt, receiptToken } from '../src/lib/saleReceipt.js'
import { saleAction } from '../src/lib/saleOperations.js'

const order = {
  id: '510be20c-c33d-45a2-9ac6-c3c05e88e7ab',
  customer: { email: 'buyer@example.invalid' },
  status: 'paid',
}
const secret = 'a'.repeat(32)
test('public receipt authenticates only one sale and rejects malformed or cross-purpose tokens', () => {
  const token = receiptToken(order.id, secret)
  assert.equal(readReceipt(token, secret), order.id)
  for (const value of [
    order.id,
    token + '!',
    token.replace('510b', '520b'),
    token.replace(/.$/, '?'),
    '😀'.repeat(40),
    null,
  ])
    assert.equal(readReceipt(value, secret), null)
  assert.equal(readReceipt(token, 'different'.repeat(8)), null)
  assert.equal(receiptToken(order.id, ''), null)
})
test('unavailable member access cannot send or modify a purchase', async () => {
  await assert.rejects(
    saleAction(null, { order, view: { member: false } }, { action: 'access' }),
    /indisponível/,
  )
})
test('a refund or dispute requires a reason, explicit confirmation and a paid charge', async () => {
  for (const action of ['refund', 'chargeback']) {
    for (const input of [{ reason: 'motivo' }, { confirm: true }, { reason: 'motivo', confirm: true }]) {
      await assert.rejects(saleAction(null, { order }, { action, ...input }), /Confirme/)
    }
  }
})
test('invoice rejects executable document URLs before storing data', async () => {
  await assert.rejects(
    saleAction(
      null,
      { order },
      { action: 'invoice', number: '123', issued: '2026-11-01', pdf: 'javascript:alert(1)' },
    ),
    /HTTPS/,
  )
})

test('member resend sends only the login and recovery instructions and records provider acceptance', async (t) => {
  let recorded, destination
  const db = {
    from(table) {
      assert.equal(table, 'webhook_events')
      return {
        insert: async () => ({ error: null }),
        update(values) {
          recorded = values
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    destination = JSON.parse(options.body)
    return Response.json({ messageId: 'test' })
  })
  const ctx = { order, profile: { email: 'member@example.invalid' }, view: { member: true } }
  const message = await saleAction(db, ctx, { action: 'access', requestId: order.id })
  assert.match(message, /aceito/)
  assert.equal(destination.to[0].email, 'member@example.invalid')
  assert.match(destination.textContent, /\/login/)
  assert.match(destination.textContent, /\/esqueci-senha/)
  assert.equal(recorded.error, null)
  assert.ok(recorded.processed_at)
})
