import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { validId } from './centralRecords.js'
import { checkoutExpired } from './checkoutSettings.js'
import { checkoutUtmFields, marketingValue } from './checkoutFunnel.js'

const lifetime = 24 * 60 * 60 * 1000
const models = ['official', 'compact', 'focused', 'guru']
const signed = (key, scope, value) => createHmac('sha256', key).update(scope).update(value).digest()

function trackingKey(env) {
  const secret = env.CHECKOUT_SESSION_SECRET
  const production = env.VERCEL_ENV === 'production' && env.CHECKOUT_LIVE_ENABLED === 'true' && env.PAGARME_BASE_URL === 'https://api.pagar.me/core/v5'
  const preview = env.VERCEL_ENV === 'preview' && env.CHECKOUT_FUNNEL_PREVIEW === 'true' && env.PAGARME_BASE_URL === 'https://sdx-api.pagar.me/core/v5'
  return (production || preview) && secret?.length >= 32 ? secret : null
}

function referrerHost(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (['rotina.suzanazatorre.com.br', 'pay.suzanazatorre.com.br'].includes(url.hostname)) return ''
    return marketingValue(url.hostname)
  } catch {
    return ''
  }
}

export function funnelPageToken(data, compact, query, referrer) {
  if (!data.test.ready || !data.prices.length || checkoutExpired(data.config)) return null
  const model = compact ? 'compact' : data.config.layout
  return signCheckoutFunnel(data.offer.id, models.includes(model) ? model : 'official', query, referrer)
}

export function signCheckoutFunnel(offerId, model, query, referrer, env = process.env, now = Date.now()) {
  const key = trackingKey(env)
  if (!key || !validId(offerId) || !models.includes(model)) return null
  const tags = Object.fromEntries(Object.keys(checkoutUtmFields).map(field => [field, marketingValue(query?.[field])]))
  const link = typeof query?.sz_link === 'string' && validId(query.sz_link) ? query.sz_link.toLowerCase() : null
  const body = Buffer.from(JSON.stringify({
    id: randomUUID(), offer: offerId, model, expires: now + lifetime, link, tags, host: referrerHost(referrer),
  })).toString('base64url')
  return body + '.' + signed(key, 'checkout-funnel:', body).toString('base64url')
}

export function checkoutFunnelEvent(input, env = process.env, now = Date.now()) {
  const key = trackingKey(env)
  if (!key || typeof input?.token !== 'string' || input.token.length > 4000) return null
  const [body, hash, extra] = input.token.split('.')
  if (extra !== undefined || !/^[\w-]+$/.test(body) || !/^[\w-]{43}$/.test(hash || '')) return null
  const actual = Buffer.from(hash, 'base64url')
  if (!timingSafeEqual(actual, signed(key, 'checkout-funnel:', body))) return null
  try {
    const visit = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!validId(visit.id) || !validId(visit.offer) || !models.includes(visit.model) ||
        !Number.isSafeInteger(visit.expires) || visit.expires <= now || visit.expires > now + lifetime) return null
    const consent = input.consent === true
    const tags = consent ? visit.tags : {}
    return {
      p_visit: visit.id,
      p_offer: visit.offer,
      p_model: visit.model,
      p_link: consent ? visit.link : null,
      p_referrer: consent ? visit.host || null : null,
      p_visitor: consent && typeof input.visitor === 'string' && validId(input.visitor)
        ? signed(key, 'checkout-visitor:', input.visitor.toLowerCase()).toString('hex') : null,
      p_started: input.started === true,
      p_utm_source: tags.utm_source || null,
      p_utm_medium: tags.utm_medium || null,
      p_utm_campaign: tags.utm_campaign || null,
      p_utm_content: tags.utm_content || null,
      p_utm_term: tags.utm_term || null,
    }
  } catch {
    return null
  }
}

export async function recordCheckoutFunnel(db, visit, sessionKey = null, attemptedAt = null) {
  const { error } = await db.rpc('checkout_funnel_record', { ...visit, p_session: sessionKey, p_attempted_at: attemptedAt })
  if (error) throw error
}
