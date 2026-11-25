const visitorKey = 'sz-checkout-visitor'
const consentKey = 'sz-checkout-consent-v2'

function browserIdentity() {
  try {
    if (window.localStorage.getItem(consentKey) === 'denied') return { consent: false }
    let visitor = window.localStorage.getItem(visitorKey)
    if (!visitor) {
      visitor = window.crypto.randomUUID()
      window.localStorage.setItem(visitorKey, visitor)
    }
    return { consent: true, visitor }
  } catch {
    return { consent: false }
  }
}

export function recordFunnelEvent(token, started) {
  if (!token) return
  void fetch('/api/checkout/telemetria/funil', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    credentials: 'omit', referrerPolicy: 'no-referrer',
    body: JSON.stringify({ token, started, ...browserIdentity() }),
  }).catch(() => {})
}

export function funnelPaymentHeaders(token) {
  if (!token) return {}
  const { consent, visitor } = browserIdentity()
  return {
    'X-Checkout-Funnel': token,
    'X-Checkout-Funnel-Consent': consent ? '1' : '0',
    ...(visitor && { 'X-Checkout-Visitor': visitor }),
  }
}
