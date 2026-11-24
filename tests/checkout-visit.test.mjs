import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutVisitRow, signCheckoutVisit } from '../src/lib/checkoutVisitServer.js'
import { checkoutVisitWindow, summarizeTracking } from '../src/lib/centralTrackingReport.js'

const productId = 'c35a5d1c-bf01-4d98-805f-b86f05e345f1'
const now = Date.parse('2026-11-24T00:00:00Z')
const env = {
  VERCEL_ENV: 'production', CHECKOUT_LIVE_ENABLED: 'true',
  PAGARME_BASE_URL: 'https://api.pagar.me/core/v5', CHECKOUT_SESSION_SECRET: 'secret-for-checkout-visit-tests-only',
}
const identifiers = { campaign: '12345', adset: '23456', ad: '34567' }

test('records the product scoped by the token and only the permitted tracking IDs', () => {
  const token = signCheckoutVisit(productId, env, now)
  const row = checkoutVisitRow({ token, ...identifiers, email: 'ignored@example.test', product_id: 'ignored', visited_at: 'ignored' }, env, now)
  assert.deepEqual(row, { id: token.split('.')[1], product_id: productId, campaign_id: '12345', adset_id: '23456', ad_id: '34567' })
  assert.equal(checkoutVisitRow({ token }, env, now).id, row.id)
  assert.notEqual(signCheckoutVisit(productId, env, now), token)
  assert.equal(checkoutVisitRow({ token, ...identifiers, ad: '{{ad.id}}' }, env, now).campaign_id, null)
})

test('rejects changed, expired and non-production visit tokens', () => {
  const token = signCheckoutVisit(productId, env, now)
  const preview = { ...env, VERCEL_ENV: 'preview' }
  assert.equal(signCheckoutVisit(productId, preview, now), null)
  assert.equal(checkoutVisitRow({ token }, preview, now), null)
  assert.equal(checkoutVisitRow({ token }, env, now + 30 * 60 * 1000), null)
  assert.equal(checkoutVisitRow({ token: `a${token.slice(1)}` }, env, now), null)
})

test('distinguishes a partial visit period from historical and fully covered periods', () => {
  const result = { since: '2026-11-24T00:00:00Z', total: 3, by_ad: [] }
  const historic = checkoutVisitWindow(result, '2026-11-22T00:00:00-03:00', '2026-11-23T00:00:00-03:00')
  assert.equal(historic.total, null)
  const partial = checkoutVisitWindow(result, '2026-11-23T00:00:00-03:00', '2026-11-24T00:00:00-03:00')
  assert.equal(partial.total, 3)
  assert.equal(partial.complete, false)
  const full = checkoutVisitWindow({ ...result, total: 0 }, '2026-11-24T00:00:00-03:00', '2026-11-25T00:00:00-03:00')
  assert.equal(full.total, 0)
  assert.equal(full.complete, true)
})

test('shows visits on ads even before the first approval', () => {
  const meta = { rows: [{ ...identifiers, adName: 'Ad', spend: 1600, purchases: 2, purchaseValue: 3400 }] }
  const visits = { total: 6, byAd: [{ ...identifiers, count: 3 }, { ...identifiers, ad: '99999', count: 2 }] }
  const report = summarizeTracking([], new Map(), meta, new Map(), visits)
  assert.equal(report.totals.approved, 0)
  assert.deepEqual(report.rows.map(row => [row.ad, row.visits]), [['34567', 3], ['99999', 2]])
  assert.equal(summarizeTracking([], new Map(), meta, new Map()).rows[0].visits, null)
})
