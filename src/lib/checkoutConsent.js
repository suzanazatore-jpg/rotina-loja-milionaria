const KEY = 'sz-checkout-consent-v2'
let sessionChoice
export function readCheckoutConsent(target = window) {
  if (sessionChoice !== undefined) return sessionChoice
  try {
    const value = target.localStorage.getItem(KEY)
    return ['granted', 'denied'].includes(value) ? value : 'unknown'
  } catch { return 'unknown' }
}
export function writeCheckoutConsent(value, target = window) {
  sessionChoice = ['granted', 'denied'].includes(value) ? value : 'unknown'
  try { target.localStorage.setItem(KEY, sessionChoice) } catch { /* Keep the choice for this page when storage is blocked. */ }
  target.dispatchEvent(new Event('sz-checkout-consent'))
}
export function clearSessionChoice() { sessionChoice = undefined }
