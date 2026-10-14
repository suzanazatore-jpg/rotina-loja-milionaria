import { trackingMode } from './checkoutTracking.js'
export const CHECKOUT_DEFAULTS = {
  button_text_color: '#17130a', subtitle: '', product_image_url: '', mobile_banner_url: '', favicon_url: '', support_email: '', support_phone: '', terms_url: '', privacy_url: '', layout: 'split',
  background: '#f5f5f3', panel: '#ffffff', text: '#202020', accent: '#d4af37', button_text: 'Comprar agora', store_name: 'Suzana Zatorre', logo_url: '', banner_url: '', font: 'Arial', gtm_id: '', meta_pixel_id: '', redirects: { approved: '', declined: '', pending: '', pix: '', trial: '' },
}
export const REDIRECT_LABELS = { approved: 'Aprovada', declined: 'Negada', pending: 'Pendente', pix: 'Pix', trial: 'Trial' }
export function normalizeCheckoutSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração de checkout inválida.')
  const result = { ...CHECKOUT_DEFAULTS, redirects: {} }
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
  return result
}
