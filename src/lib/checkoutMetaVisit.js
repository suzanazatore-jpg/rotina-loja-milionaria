import { isIP } from 'node:net'
import { signCheckoutSession, readCheckoutSession } from './checkoutSession.js'
import { conversionConfiguration } from './checkoutConversionsServer.js'

// A tracking ticket can never authenticate a payment or read an order.
export function metaVisit(loaded, env = process.env) {
  const configuration = conversionConfiguration(loaded.config.meta_pixel_id, env)
  if (!configuration || !env.CHECKOUT_SESSION_SECRET || env.CHECKOUT_SESSION_SECRET.length < 32) return null
  const scope = 'meta-visit:' + loaded.offer.id
  const ticket = signCheckoutSession(scope, env.CHECKOUT_SESSION_SECRET)
  return { ticket, test: Boolean(configuration.testCode), id: readCheckoutSession(ticket, scope, env.CHECKOUT_SESSION_SECRET).key }
}

export function websiteIdentifiers(request) {
  const ua = (request.headers.get('user-agent') || '').slice(0, 512)
  const cookie = request.headers.get('cookie') || ''
  const identifiers = ua ? { client_user_agent: ua } : {}
  // Vercel sets these at its edge. Never use the webhook/worker's IP for a buyer.
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || ''
  const ip = forwarded.split(',')[0].trim()
  if (isIP(ip)) identifiers.client_ip_address = ip
  for (const key of ['fbp', 'fbc']) {
    const value = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('_' + key + '='))?.slice(5)
    if (value && /^fb\.\d\.\d{10,13}\.[A-Za-z0-9._-]{1,350}$/.test(value)) identifiers[key] = value
  }
  return identifiers
}
