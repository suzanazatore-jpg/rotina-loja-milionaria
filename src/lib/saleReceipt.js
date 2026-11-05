import { createHmac, timingSafeEqual } from 'node:crypto'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function receiptToken(id, secret = process.env.CHECKOUT_SESSION_SECRET) {
  if (!uuid.test(id) || !secret || secret.length < 32) return null
  const signature = createHmac('sha256', secret)
    .update('sale-receipt/v1/' + id)
    .digest('base64url')
  return id + '.' + signature
}

export function readReceipt(token, secret = process.env.CHECKOUT_SESSION_SECRET) {
  if (typeof token !== 'string' || token.length !== 80) return null
  const id = token.slice(0, 36)
  const expected = receiptToken(id, secret)
  return expected &&
    /^[A-Za-z0-9_.-]+$/.test(token) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(token))
    ? id
    : null
}
