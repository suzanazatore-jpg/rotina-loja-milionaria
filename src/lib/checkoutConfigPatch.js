import { checkoutSettingsDraft, normalizeCheckoutSettings } from './checkoutSettings.js'

export const CHECKOUT_EDITABLE_KEYS = ['appearance_mode','background','panel','text','accent','button_text_color','store_name','logo_url','banner_url','mobile_banner_url','favicon_url','font','layout','support_email','support_phone','terms_url','privacy_url','company_name','company_document','company_address','countdown_enabled','countdown_ends_at','countdown_message','product_image_url','product_display_name','use_offer_name','headline','headline_highlight','subtitle','button_text','express_checkout','form_profile','confirm_email','require_terms','require_privacy','tracking_mode','gtm_id','meta_pixel_id','redirects']
export function productCheckoutDraft(offer, global = {}) {
  const draft = checkoutSettingsDraft(offer.checkout_config || {}, global)
  draft.redirects.approved ||= offer.thank_you_url || ''
  return draft
}
export function checkoutConfigChanges(before, after) {
  return Object.fromEntries(CHECKOUT_EDITABLE_KEYS.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => [key, after[key]]))
}
// Validate the candidate, but persist only explicitly edited keys. Legacy settings
// and future keys must survive a visual edit byte-for-byte as JSON values.
export function patchCheckoutConfig(current, changes, global = {}) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Alterações inválidas.')
  for (const key of Object.keys(changes)) if (!CHECKOUT_EDITABLE_KEYS.includes(key)) throw new Error('Campo não permitido nesta configuração.')
  const candidate = { ...current, ...changes }
  const normalized = normalizeCheckoutSettings(candidate)
  const urls = candidate.appearance_mode === 'inherit' ? global : candidate
  if (candidate.require_terms && !urls.terms_url) throw new Error('Informe a URL dos termos antes de exigir o aceite.')
  if (candidate.require_privacy && !urls.privacy_url) throw new Error('Informe a URL da política de privacidade antes de exigir o aceite.')
  return { ...current, ...Object.fromEntries(Object.keys(changes).map(key => [key, key === 'redirects' ? {...current.redirects,...normalized.redirects} : normalized[key]])) }
}
