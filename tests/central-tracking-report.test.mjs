import assert from 'node:assert/strict'
import test from 'node:test'
import { challengeTracking, readTrackingMeta } from '../src/lib/centralTrackingMeta.js'
import { readConversionReceipt } from '../src/lib/centralRecords.js'
import { readTrackingFees } from '../src/lib/centralTrackingFees.js'
import { summarizeTracking, trackingFilters } from '../src/lib/centralTrackingReport.js'

test('uses the date of approval in Brasília and keeps an explicit all-products filter', () => {
  const now = new Date('2026-11-23T00:45:00Z')
  assert.deepEqual(trackingFilters(new URLSearchParams(), now), {
    from: '2026-11-16', to: '2026-11-22', productId: challengeTracking.productId,
  })
  assert.equal(trackingFilters(new URLSearchParams({ produto: '' }), now).productId, '')
  assert.throws(() => trackingFilters(new URLSearchParams({ fim: '2026-11-23' }), now), /Período inválido/)
})

test('keeps payment, accepted deliveries and Meta attribution distinct without duplicating ad spend', () => {
  const ad = '12345', adset = '34567', campaign = challengeTracking.campaignId
  const direct = { utm_campaign: campaign, utm_term: adset, utm_content: ad }
  const orders = [
    { ...direct, id: '1', status: 'paid', total_cents: 2700, pagarme_charge_id: 'ch_1', utm_source: 'fb' },
    { ...direct, id: '2', status: 'refunded', total_cents: 2700, pagarme_charge_id: 'ch_2', utm_source: 'ig' },
    { id: '3', status: 'paid', total_cents: 2700 },
  ]
  const receipts = new Map([
    ['1', { processed_at: '2026-11-22T16:43:01Z', payload: { mode: 'live', attempts: 1 } }],
    ['2', { processed_at: '2026-11-22T18:04:02Z', payload: { mode: 'test', attempts: 1 } }],
  ])
  const fees = new Map([['ch_1', 90], ['ch_2', 110]])
  const meta = { rows: [{ campaign, adset, ad, adName: 'Criativo', spend: 1200, purchases: 4, purchaseValue: 3600 }] }
  const report = summarizeTracking(orders, receipts, meta, fees)
  assert.deepEqual(report.totals, { approved: 3, accepted: 1, unknown: 1, withAdIds: 2, gross: 8100, refunds: 2700, fees: null, spend: 1200, purchases: 4, purchaseValue: 3600, metaCpa: 300, metaRoas: 3 })
  assert.equal(report.rows.length, 2)
  assert.equal(report.rows[0].approved, 2)
  assert.equal(report.rows[0].cpa, 600)
  assert.equal(report.rows[0].metaCpa, 300)
  assert.equal(report.rows[0].net, 1300)
  assert.equal(report.rows[1].purchases, null)
  assert.equal(report.sales[1].conversion.state, 'test')
  assert.equal(report.sales[2].conversion, null)

  const offline = summarizeTracking(orders, receipts, null, fees)
  assert.equal(offline.totals.purchases, null)
  assert.equal(offline.rows[0].cpa, null)
  assert.equal(offline.totals.metaRoas, null)
  assert.equal(offline.totals.accepted, 1)
  assert.equal(summarizeTracking(orders, receipts, meta, new Map()).rows[0].net, null)
})

test('uses weighted campaign efficiency and keeps missing attributed revenue unknown', () => {
  const first = { campaign: '34567', adset: '23456', ad: '12345', spend: 1000, purchases: 2, purchaseValue: 3000 }
  const second = { ...first, ad: '54321', spend: 4000, purchases: 3, purchaseValue: 3500 }
  const order = { id: '1', status: 'paid', total_cents: 1700, utm_campaign: first.campaign, utm_term: ' ', utm_content: first.ad }
  const report = summarizeTracking([order], new Map(), { rows: [first, second] }, new Map())
  assert.equal(report.totals.withAdIds, 0)
  assert.equal(report.totals.unknown, 0)
  assert.equal(report.totals.metaCpa, 1000)
  assert.equal(report.totals.metaRoas, 1.3)
  const incomplete = summarizeTracking([], new Map(), { rows: [first, { ...second, purchaseValue: null }] }, new Map())
  assert.equal(incomplete.totals.metaCpa, 1000)
  assert.equal(incomplete.totals.metaRoas, null)
})

test('shows retry timing and requires a live receipt before reporting acceptance', () => {
  const next = '2026-11-22T18:05:00Z'
  const receipt = readConversionReceipt({ error: 'retry', payload: { mode: 'live', attempts: 2, next_attempt_at: next } })
  assert.equal(receipt.state, 'retry')
  assert.equal(receipt.nextAttemptAt, next)
  assert.equal(readConversionReceipt({ processed_at: next }).state, 'unconfirmed')
  assert.equal(readConversionReceipt({ processed_at: next, payload: { mode: 'live', next_attempt_at: next } }).nextAttemptAt, null)
})

test('counts only website purchases for the linked campaign and rejects data outside the filter', async () => {
  const { accountId, campaignId } = challengeTracking
  const row = {
    account_id: accountId, campaign_id: campaignId, ad_id: '12345', adset_id: '23456',
    date_start: '2026-11-22', date_stop: '2026-11-22', spend: '12.30',
    actions: [{ action_type: 'omni_purchase', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
    action_values: [{ action_type: 'omni_purchase', value: '450' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '34' }],
  }
  const options = { from: '2026-11-16', to: '2026-11-22', token: 'test', fetcher: async url => {
    if (url.pathname.endsWith(`act_${accountId}`)) return Response.json({ account_id: accountId, currency: 'BRL', timezone_name: 'America/Sao_Paulo' })
    assert.equal(url.pathname, `/v25.0/${campaignId}/insights`)
    assert.equal(url.searchParams.get('level'), 'ad')
    return Response.json({ data: [row] })
  } }
  const { rows } = await readTrackingMeta(options)
  assert.equal(rows[0].purchases, 2)
  assert.equal(rows[0].spend, 1230)
  assert.equal(rows[0].purchaseValue, 3400)
  row.action_values = []
  assert.equal((await readTrackingMeta(options)).rows[0].purchaseValue, null)
  row.campaign_id = '99999'
  await assert.rejects(readTrackingMeta(options), /fora do escopo/)
})

test('uses the sum of confirmed credit fees and leaves unrelated payables unknown', async () => {
  const orders = [{ pagarme_charge_id: 'ch_A' }, { pagarme_charge_id: 'ch_B' }]
  const fees = await readTrackingFees(orders, async url => {
    assert.equal(url.pathname, '/core/v5/payables')
    assert.equal(url.searchParams.get('type'), 'credit')
    const payable = { type: 'credit', charge_id: 'ch_A' }
    if (url.searchParams.get('charge_id') === 'ch_B') {
      return Response.json({ data: [{ ...payable, id: 1, fee: 10 }], paging: { total: 1 } })
    }
    if (url.searchParams.get('forward_cursor')) {
      return Response.json({ data: [{ ...payable, id: 2, fee: 30 }], paging: { total: 2 } })
    }
    return Response.json({ data: [{ ...payable, id: 1, fee: 20 }], paging: { total: 2, forward_cursor: 'next' } })
  }, { PAGARME_BASE_URL: 'https://api.pagar.me/core/v5', PAGARME_SECRET_KEY: 'sk_mock', CHECKOUT_LIVE_ENABLED: 'true' })
  assert.deepEqual([...fees.entries()], [['ch_A', 50]])
})

test('handles Pix payables without an echoed charge ID when the charge amount reconciles', async () => {
  const orders = [
    { pagarme_charge_id: 'ch_A', payment_method: 'pix', total_cents: 2700 },
    { pagarme_charge_id: 'ch_B', payment_method: 'pix', total_cents: 4500 },
  ]
  const fees = await readTrackingFees(orders, async url => {
    if (url.searchParams.get('forward_cursor')) return Response.json({ data: [], paging: { forward_cursor: null } })
    return Response.json({ data: [{ type: 'credit', payment_method: 'pix', id: 1, amount: 2700, fee: 31 }], paging: { forward_cursor: 'next' } })
  }, { PAGARME_BASE_URL: 'https://api.pagar.me/core/v5', PAGARME_SECRET_KEY: 'sk_mock', CHECKOUT_LIVE_ENABLED: 'true' })
  assert.deepEqual([...fees.entries()], [['ch_A', 31]])
})
