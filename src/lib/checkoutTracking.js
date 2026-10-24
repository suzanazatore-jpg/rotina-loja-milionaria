export const TRACKING_DEFAULTS = { gtm_id: '', meta_pixel_id: '' }
export function normalizeTracking(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração de rastreamento inválida.')
  const gtm_id = String(input.gtm_id || '').trim().toUpperCase()
  const meta_pixel_id = String(input.meta_pixel_id || '').trim()
  if (gtm_id && !/^GTM-[A-Z0-9]{4,20}$/.test(gtm_id)) throw new Error('Informe um ID de GTM válido, como GTM-XXXXXXX.')
  if (meta_pixel_id && !/^\d{5,30}$/.test(meta_pixel_id)) throw new Error('O ID do Meta Pixel deve conter apenas números.')
  return { gtm_id, meta_pixel_id }
}
export function trackingMode(config = {}) {
  if (['inherit','custom','off'].includes(config.tracking_mode)) return config.tracking_mode
  return config.gtm_id || config.meta_pixel_id ? 'custom' : 'inherit'
}
export function resolveTracking(offerConfig = {}, globalConfig = {}) {
  const mode = trackingMode(offerConfig)
  return { ...normalizeTracking(mode === 'off' ? {} : mode === 'custom' ? offerConfig : globalConfig), source: mode }
}
export async function loadGlobalTracking(db) {
  const { data, error } = await db.from('checkout_settings').select('gtm_id,meta_pixel_id,updated_at,checkout_config').eq('id', 'global').maybeSingle()
  if (error) throw new Error('Não foi possível carregar o rastreamento global.')
  return { ...normalizeTracking(data || {}), updated_at: data?.updated_at || null, checkout_config: data?.checkout_config || {} }
}
