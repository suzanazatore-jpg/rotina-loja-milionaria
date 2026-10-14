export const CHECKOUT_DEFAULTS = {
  background: '#f5f5f3', panel: '#ffffff', text: '#202020', accent: '#d4af37', button_text: 'Comprar agora', store_name: 'Suzana Zatorre', logo_url: '', banner_url: '', font: 'Arial', gtm_id: '', meta_pixel_id: '', redirects: { approved: '', declined: '', pending: '', pix: '', trial: '' },
}
export const REDIRECT_LABELS = { approved: 'Aprovada', declined: 'Negada', pending: 'Pendente', pix: 'Pix', trial: 'Trial' }
export function normalizeCheckoutSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração de checkout inválida.')
  const result = { ...CHECKOUT_DEFAULTS, redirects: {} }
  for (const key of ['background','panel','text','accent']) {
    const value = input[key] ?? CHECKOUT_DEFAULTS[key]
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Cor do checkout inválida.')
    result[key] = value
  }
  for (const key of ['button_text','store_name']) result[key] = String(input[key] ?? CHECKOUT_DEFAULTS[key]).trim().slice(0,100) || CHECKOUT_DEFAULTS[key]
  result.font = ['Arial','Georgia','Verdana'].includes(input.font) ? input.font : 'Arial'
  function safeUrl(value) {
    const text = String(value || '').trim()
    if (!text) return ''
    try { const url = new URL(text); if (['https:','http:'].includes(url.protocol) && !url.username && !url.password && text.length <= 2048) return url.toString() } catch {}
    throw new Error('Informe uma URL válida começando com https:// ou http://.')
  }
  for (const key of ['logo_url','banner_url']) result[key] = safeUrl(input[key])
  result.gtm_id = String(input.gtm_id || '').trim().toUpperCase()
  result.meta_pixel_id = String(input.meta_pixel_id || '').trim()
  if (result.gtm_id && !/^GTM-[A-Z0-9]{4,20}$/.test(result.gtm_id)) throw new Error('ID do GTM inválido.')
  if (result.meta_pixel_id && !/^\d{5,30}$/.test(result.meta_pixel_id)) throw new Error('ID do Meta Pixel inválido.')
  for (const key of Object.keys(REDIRECT_LABELS)) result.redirects[key] = safeUrl(input.redirects?.[key])
  return result
}
