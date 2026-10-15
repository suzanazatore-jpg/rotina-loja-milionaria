import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export function signCheckoutSession(offerId, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('Sessão de checkout não configurada.')
  const body = Buffer.from(JSON.stringify({ offerId, key: randomUUID(), expires: now + 30 * 60000 })).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}
export function readCheckoutSession(token, offerId, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 1024) return null
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString())
    return session.offerId === offerId && session.expires > now && session.expires <= now + 30 * 60000 && /^[0-9a-f-]{36}$/.test(session.key) ? session : null
  } catch { return null }
}

export function safeCheckoutRedirect(config, status, method) {
  const key = status === 'paid' ? 'approved' : ['failed','canceled','refunded','chargedback'].includes(status) ? 'declined' : method === 'pix' ? 'pix' : 'pending'
  const value = config?.redirects?.[key] || (key === 'approved' ? config?.thank_you_url : '')
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : ''
  } catch { return '' }
}
