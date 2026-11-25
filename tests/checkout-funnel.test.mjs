import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkoutFunnelFilters, readTrackableLink, trackableCheckoutUrl } from '../src/lib/checkoutFunnel.js'
import { offerId } from '../src/lib/checkoutLinks.js'
import { checkoutFunnelEvent, signCheckoutFunnel } from '../src/lib/checkoutFunnelServer.js'

const offer = '1ab30c39-efb0-4f55-9dc3-d3f76255ddfb'
const link = 'c116e2c2-53a1-4507-8d1c-d243ce51cbc2'
const visitor = '35bb821b-dca6-46cb-a9aa-648c22162431'
const now = Date.parse('2026-11-25T02:30:00Z')
const production = {
  VERCEL_ENV: 'production',
  CHECKOUT_LIVE_ENABLED: 'true',
  PAGARME_BASE_URL: 'https://api.pagar.me/core/v5',
  CHECKOUT_SESSION_SECRET: 'test-only-not-the-checkout-session-secret',
}

test('creates a stable destination for the selected offer and carries all UTMs', () => {
  const tags = {
    utm_source: ' Instagram ', utm_medium: 'social', utm_campaign: 'Natal & Verão',
    utm_content: 'Foto + Vídeo', utm_term: 'público A',
  }
  const record = readTrackableLink({ offer_id: offer, name: ' Divulgação ', ...tags })
  assert.equal(record.name, 'Divulgação')
  const url = new URL(trackableCheckoutUrl({ ...record, id: link }))
  assert.equal(url.origin, 'https://rotina.suzanazatorre.com.br')
  assert.equal(offerId(url.pathname.split('/').pop()), offer)
  assert.equal(url.searchParams.get('sz_link'), link)
  for (const [key, value] of Object.entries(tags)) assert.equal(url.searchParams.get(key), value.trim())
  assert.throws(() => readTrackableLink({ offer_id: offer, name: 'Sem origem' }))
})

test('signs the real offer, model, and attribution while anonymizing the visitor', () => {
  const query = { sz_link: link, utm_source: 'Instagram', utm_campaign: 'Vídeo de Natal' }
  const token = signCheckoutFunnel(offer, 'compact', query, 'https://exemplo.com/artigo?private=value', production, now)
  const view = checkoutFunnelEvent({ token, visitor, consent: true }, production, now)
  const start = checkoutFunnelEvent({ token, visitor, consent: true, started: true }, production, now)
  const next = checkoutFunnelEvent({
    token: signCheckoutFunnel(offer, 'official', {}, '', production, now), visitor, consent: true,
  }, production, now)
  assert.equal(view.p_visit, start.p_visit)
  assert.notEqual(view.p_visit, next.p_visit)
  assert.equal(view.p_visitor, next.p_visitor)
  assert.match(view.p_visitor, /^[0-9a-f]{64}$/)
  assert.equal(view.p_offer, offer)
  assert.equal(view.p_model, 'compact')
  assert.equal(view.p_link, link)
  assert.equal(view.p_utm_campaign, query.utm_campaign)
  assert.equal(view.p_referrer, 'exemplo.com')
  assert.equal(start.p_started, true)

  const denied = checkoutFunnelEvent({ token, visitor, consent: false }, production, now)
  for (const key of ['p_visitor', 'p_link', 'p_utm_source', 'p_utm_campaign', 'p_referrer']) assert.equal(denied[key], null)
  assert.equal(denied.p_visit, view.p_visit)
  assert.equal(checkoutFunnelEvent({ token: token.replace(/^./, token[0] === 'a' ? 'b' : 'a') }, production, now), null)
  assert.equal(checkoutFunnelEvent({ token }, production, now + 24 * 60 * 60 * 1000), null)
})

test('does not collect analytics from ordinary preview or sandbox checkouts', () => {
  const preview = { ...production, VERCEL_ENV: 'preview' }
  assert.equal(signCheckoutFunnel(offer, 'compact', {}, '', preview, now), null)
  assert.equal(signCheckoutFunnel(offer, 'compact', {}, '', { ...preview, CHECKOUT_FUNNEL_PREVIEW: 'true' }, now), null)
  assert.ok(signCheckoutFunnel(offer, 'compact', {}, '', {
    ...preview, CHECKOUT_FUNNEL_PREVIEW: 'true', PAGARME_BASE_URL: 'https://sdx-api.pagar.me/core/v5',
  }, now))
})

test('uses the São Paulo visit dates and validates the report filters', () => {
  const filters = checkoutFunnelFilters(new URLSearchParams({ grupo: 'creative', oferta: offer, link, pagina: 2 }), new Date(now))
  assert.equal(filters.to, '2026-11-24')
  assert.equal(filters.from, '2026-11-18')
  assert.deepEqual(filters.args, {
    p_from: '2026-11-18T00:00:00-03:00', p_until: '2026-11-25T00:00:00-03:00',
    p_offer: offer, p_link: link, p_group: 'creative', p_offset: 25,
  })
  assert.throws(() => checkoutFunnelFilters(new URLSearchParams({ grupo: 'constructor' }), new Date(now)))
  assert.throws(() => checkoutFunnelFilters(new URLSearchParams({ inicio: '2026-11-31' }), new Date(now)))
})
