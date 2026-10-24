import { trackingMode } from './checkoutTracking.js'
export const CHECKOUT_DEFAULTS = {
  confirm_email: false, require_terms: false, require_privacy: false,
  button_text_color: '#17130a', subtitle: '', product_image_url: '', mobile_banner_url: '', favicon_url: '', support_email: '', support_phone: '', terms_url: '', privacy_url: '', layout: 'split',
  background: '#f5f5f3', panel: '#ffffff', text: '#202020', accent: '#d4af37', button_text: 'Comprar agora', store_name: 'Suzana Zatorre', logo_url: '', banner_url: '', font: 'Arial', gtm_id: '', meta_pixel_id: '', redirects: { approved: '', declined: '', pending: '', pix: '', trial: '' },
}
export const REDIRECT_LABELS = { approved: 'Aprovada', declined: 'Negada', pending: 'Pendente', pix: 'Pix', trial: 'Trial' }
// Somente identidade e aparência são herdadas. Preço, entrega e redirecionamentos
// continuam exclusivos de cada oferta. Ofertas antigas preservam seu visual.
export const SHARED_CHECKOUT_KEYS = ['background','panel','text','accent','button_text_color','store_name','logo_url','banner_url','mobile_banner_url','favicon_url','font','layout','support_email','support_phone','terms_url','privacy_url']
export function resolveCheckoutSettings(offer = {}, global = {}) {
  const resolved = { ...offer }
  if (offer.appearance_mode === 'inherit') {
    const defaults = normalizeCheckoutSettings(global)
    for (const key of SHARED_CHECKOUT_KEYS) resolved[key] = defaults[key]
  }
  return normalizeCheckoutSettings(resolved)
}
export function checkoutSettingsDraft(offer = {}, global = {}) {
  const result = { ...CHECKOUT_DEFAULTS, ...offer, redirects: { ...CHECKOUT_DEFAULTS.redirects, ...offer.redirects } }
  if (offer.appearance_mode === 'inherit') for (const key of SHARED_CHECKOUT_KEYS) result[key] = global[key] ?? CHECKOUT_DEFAULTS[key]
  return result
}
export async function loadGlobalCheckoutSettings(db) {
  const { data, error } = await db.from('checkout_settings').select('checkout_config').eq('id', 'global').maybeSingle()
  if (error) throw new Error('Não foi possível carregar o padrão visual da central.')
  return normalizeCheckoutSettings(data?.checkout_config || {})
}
export function normalizeCheckoutSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração de checkout inválida.')
  const result = { ...CHECKOUT_DEFAULTS, redirects: {} }
  result.appearance_mode = input.appearance_mode === 'inherit' ? 'inherit' : 'custom'
  for (const key of ['background','panel','text','accent','button_text_color']) {
    const value = input[key] ?? CHECKOUT_DEFAULTS[key]
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Cor do checkout inválida.')
    result[key] = value
  }
  for (const key of ['button_text','store_name']) result[key] = String(input[key] ?? CHECKOUT_DEFAULTS[key]).trim().slice(0,100) || CHECKOUT_DEFAULTS[key]
  result.subtitle = String(input.subtitle || '').trim().slice(0,500)
  result.support_email = String(input.support_email || '').trim().slice(0,254)
  if (result.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.support_email)) throw new Error('Email de suporte inválido.')
  result.support_phone = String(input.support_phone || '').trim().slice(0,40)
  result.layout = input.layout === 'stacked' ? 'stacked' : 'split'
  result.font = ['Arial','Georgia','Verdana'].includes(input.font) ? input.font : 'Arial'
  function safeUrl(value) {
    const text = String(value || '').trim()
    if (!text) return ''
    try { const url = new URL(text); if (['https:','http:'].includes(url.protocol) && !url.username && !url.password && text.length <= 2048) return url.toString() } catch {}
    throw new Error('Informe uma URL válida começando com https:// ou http://.')
  }
  for (const key of ['logo_url','banner_url','mobile_banner_url','product_image_url','favicon_url','terms_url','privacy_url']) result[key] = safeUrl(input[key])
  result.tracking_mode = trackingMode(input)
  result.gtm_id = String(input.gtm_id || '').trim().toUpperCase()
  result.meta_pixel_id = String(input.meta_pixel_id || '').trim()
  if (result.gtm_id && !/^GTM-[A-Z0-9]{4,20}$/.test(result.gtm_id)) throw new Error('ID do GTM inválido.')
  if (result.meta_pixel_id && !/^\d{5,30}$/.test(result.meta_pixel_id)) throw new Error('ID do Meta Pixel inválido.')
  for (const key of Object.keys(REDIRECT_LABELS)) result.redirects[key] = safeUrl(input.redirects?.[key])
  for (const key of ['confirm_email','require_terms','require_privacy']) result[key] = input[key] === true
  return result
}
export function validateCheckoutForm(config, input) {
  if (config.confirm_email && String(input.email_confirmation || '').trim().toLowerCase() !== String(input.customer?.email || '').trim().toLowerCase()) throw new Error('Os emails não conferem.')
  if (config.require_terms && (!config.terms_url || input.terms_accepted !== true)) throw new Error('Leia e aceite os termos de uso.')
  if (config.require_privacy && (!config.privacy_url || input.privacy_accepted !== true)) throw new Error('Leia e aceite a política de privacidade.')
}
