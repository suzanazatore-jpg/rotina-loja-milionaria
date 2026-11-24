import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { validId } from './centralRecords.js'
import { isMetaId } from './centralTrackingMeta.js'

const tokenLifetime = 30 * 60 * 1000

function visitKey(env) {
  const key = env.CHECKOUT_SESSION_SECRET
  return env.VERCEL_ENV === 'production' && env.CHECKOUT_LIVE_ENABLED === 'true' &&
    env.PAGARME_BASE_URL === 'https://api.pagar.me/core/v5' && key?.length >= 32 ? key : null
}

function signature(key, payload) {
  return createHmac('sha256', key).update('checkout-visit:').update(payload).digest()
}

export function signCheckoutVisit(productId, env = process.env, now = Date.now()) {
  const key = visitKey(env)
  if (!key || !validId(productId)) return null
  const payload = `${productId}.${randomUUID()}.${now + tokenLifetime}`
  return `${payload}.${signature(key, payload).toString('base64url')}`
}

export function checkoutVisitRow(input, env = process.env, now = Date.now()) {
  const key = visitKey(env)
  if (!key || typeof input?.token !== 'string' || input.token.length > 160) return null
  const [productId, id, expires, hash, extra] = input.token.split('.')
  if (extra !== undefined || !validId(productId) || !validId(id) || !/^\d{13}$/.test(expires) ||
    Number(expires) <= now || Number(expires) > now + tokenLifetime || !/^[\w-]{43}$/.test(hash || '')) return null
  const actual = Buffer.from(hash, 'base64url')
  if (!timingSafeEqual(actual, signature(key, `${productId}.${id}.${expires}`))) return null
  const { campaign, adset, ad } = input
  const hasAd = [campaign, adset, ad].every(value => typeof value === 'string' && isMetaId(value))
  return { id, product_id: productId, campaign_id: hasAd ? campaign : null, adset_id: hasAd ? adset : null, ad_id: hasAd ? ad : null }
}
