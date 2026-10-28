import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { livePeriod, metaInsight, readLiveTraffic, TrafficLiveError } from '../src/lib/trafficLiveMeta.js'
const accountId = '123456'
const from = '2026-10-01', to = '2026-10-02'
function fixture({ fail, empty = false, missing = false, pagination = false } = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    assert.equal(url.searchParams.has('access_token'), false)
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.cache, 'no-store')
    if (!url.pathname.endsWith('/insights')) {
      if (url.searchParams.has('ids')) return Response.json({ ad1: { id: 'ad1', creative: { image_url: 'https://example.com/real.jpg' } } })
      return Response.json({ id: 'act_' + accountId, currency: 'BRL' })
    }
    const level = url.searchParams.get('level')
    assert.ok(url.searchParams.get('fields').includes('date_start'))
    assert.ok(url.searchParams.get('fields').includes('date_stop'))
    if (fail === level) return Response.json({ error: { code: 190, message: 'contains test-token' } }, { status: 400 })
    const daily = url.searchParams.has('time_increment')
    const range = JSON.parse(url.searchParams.get('time_range'))
    const row = { account_id: accountId, date_start: range.since, date_stop: range.until, spend: '10', impressions: '100', reach: '70', frequency: '1.42857', inline_link_clicks: '8', clicks: '20', actions: [{ action_type: 'lead', value: '2' }], results: [{ indicator: 'actions:lead', values: [{ value: '2' }] }], cost_per_result: [{ indicator: 'actions:lead', values: [{ value: '5' }] }] }
    if (empty || (missing && range.since === to && range.until === to)) return Response.json({ data: [] })
    if (level !== 'account') Object.assign(row, { campaign_id: 'c1', campaign_name: 'Real campaign', ...(level !== 'campaign' ? { adset_id: 'as1', adset_name: 'Real adset' } : {}), ...(level === 'ad' ? { ad_id: 'ad1', ad_name: 'Real ad' } : {}) })
    if (daily) {
      if (pagination && !url.searchParams.has('after')) return Response.json({ data: [{ ...row, metric_date: from, date_stop: from, spend: '5' }], paging: { next: 'https://evil.invalid/?access_token=leak', cursors: { after: 'next-page' } } })
      if (pagination) return Response.json({ data: [{ ...row, date_start: to, date_stop: to, spend: '5' }] })
      return Response.json({ data: [{ ...row, date_stop: from, spend: missing ? '10' : '5' }, ...(!missing ? [{ ...row, date_start: to, date_stop: to, spend: '5' }] : [])] })
    }
    return Response.json({ data: [row] })
  }
  return { calls, fetcher }
}
const run = (fetcher, extra = {}) => readLiveTraffic({ accountId, from, to, token: 'test-token', fetcher, ...extra })
test('real result indicator is preserved, link clicks are separate, no conversion guesses', () => {
  const row = metaInsight({ campaign_id: 'c', objective: 'OUTCOME_SALES', spend: '20', clicks: '60', inline_link_clicks: '10', impressions: '200', results: [{ indicator: 'actions:lead', values: [{ value: '4' }] }], cost_per_result: [{ indicator: 'actions:lead', values: [{ value: '5' }] }] })
  assert.equal(row.results, 4); assert.equal(row.result_event, 'lead'); assert.equal(row.leads, 4); assert.equal(row.purchases, null); assert.equal(row.cost, 5); assert.equal(row.clicks, 10); assert.equal(row.clicks_all, 60)
  assert.equal(metaInsight({ objective: 'OUTCOME_SALES', spend: '10' }).purchases, null)
})
test('exact period, daily data and every entity level use live Graph reads with exact creative ID', async () => {
  const { calls, fetcher } = fixture(); const data = await run(fetcher)
  assert.equal(data.snapshot.period_end, to); assert.equal(data.snapshot.payload.totals.spend, 10)
  assert.equal(data.snapshot.payload.daily.length, 2); assert.equal(data.snapshot.payload.ads[0].image_url, 'https://example.com/real.jpg')
  assert.equal(data.snapshot.payload.adsets[0].id, 'as1'); assert.equal(data.source, 'meta_api')
  assert.equal(calls.filter(c => c.url.searchParams.get('level') === 'ad').length, 1)
  assert.ok(calls.every(c => c.url.origin === 'https://graph.facebook.com'))
  assert.ok(!JSON.stringify(data).includes('test-token'))
})
test('pagination keeps trusted origin and original query, never follows arbitrary provider URL', async () => {
  const { fetcher, calls } = fixture({ pagination: true }); const data = await run(fetcher)
  assert.equal(data.snapshot.payload.daily.length, 2)
  assert.ok(calls.some(c => c.url.searchParams.get('after') === 'next-page'))
  assert.ok(calls.every(c => c.url.hostname === 'graph.facebook.com'))
})
test('missing days are confirmed separately; failure is never zero or an empty complete snapshot', async () => {
  const missing = fixture({ missing: true }); const result = await run(missing.fetcher)
  assert.equal(result.snapshot.payload.daily.find(r => r.metric_date === to).spend, 0)
  assert.ok(missing.calls.some(c => c.url.searchParams.get('time_range') === JSON.stringify({ since: to, until: to })))
  await assert.rejects(run(fixture({ fail: 'adset' }).fetcher), error => error instanceof TrafficLiveError && !error.message.includes('test-token'))
})
test('a successful no-delivery result can show zero spend for the requested days', async () => {
  const result = await run(fixture({ empty: true }).fetcher)
  assert.equal(result.snapshot.payload.daily.length, 2); assert.equal(result.snapshot.payload.totals.spend, 0)
})
test('single-day reports reuse the exact account total without a duplicate daily query', async () => {
  const { calls, fetcher } = fixture()
  const result = await run(fetcher, { from, to: from })
  assert.equal(result.snapshot.payload.daily.length, 1)
  assert.equal(result.snapshot.payload.daily[0].metric_date, from)
  assert.equal(result.snapshot.payload.daily[0].spend, result.snapshot.payload.totals.spend)
  assert.equal(calls.filter(c => c.url.searchParams.get('level') === 'account').length, 1)
})
test('invalid/future/oversized ranges and absent credentials are rejected', async () => {
  for (const range of [['2026-02-30', '2026-03-01'], ['2026-01-01', '2026-10-01'], ['2099-01-01', '2099-01-02']]) assert.throws(() => livePeriod(...range))
  await assert.rejects(run(fixture().fetcher, { token: '' }), /configurada/)
})

// Exercise the actual handler with in-memory auth and query boundaries, before any Meta request.
let route = await readFile(new URL('../src/app/api/trafego/online/route.js', import.meta.url), 'utf8')
route = route.replace(/^import .*\n/gm, '')
const realHandler = new Function('trafficDb', 'trafficUser', 'TRAFFIC_ADMIN', 'loadTrafficAccess', 'livePeriod', 'readLiveTraffic', 'TrafficLiveError', route.replace(/export const /g, 'const ').replace('export async function POST', 'async function POST') + '; return POST')
function handlerFixture({ user = { id: 'alice' }, eligible = true, linked = true, active = true } = {}) {
  let reads = 0
  const db = { from(table) { const query = { select() { return query }, eq(key, value) { if (table === 'traffic_client_users' && key === 'user_id') assert.equal(value, 'alice'); return query }, async maybeSingle() { return { data: table === 'traffic_client_users' ? (linked ? { client_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } : null) : (active ? { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', meta_account_id: accountId } : null) } } }; return query } }
  const post = realHandler(() => db, async () => user, 'admin@example.com', async () => eligible, livePeriod, async () => { reads++; return { snapshot: {} } }, TrafficLiveError)
  const request = () => new Request('https://example.com/api/trafego/online', { method: 'POST', body: JSON.stringify({ client_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', from, to }) })
  return { post, request, get reads() { return reads } }
}
test('live route blocks anonymous, expired, unlinked and inactive accounts before Meta', async () => {
  for (const config of [{ user: null }, { eligible: false }, { linked: false }, { active: false }]) { const f = handlerFixture(config); const response = await f.post(f.request()); assert.ok([401, 403].includes(response.status)); assert.equal(f.reads, 0) }
  const f = handlerFixture(); const response = await f.post(f.request()); assert.equal(response.status, 200); assert.equal(f.reads, 1); assert.match(response.headers.get('Cache-Control'), /no-store/)
})
