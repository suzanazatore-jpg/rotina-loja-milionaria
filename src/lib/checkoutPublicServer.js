import { loadGlobalTracking, resolveTracking } from './checkoutTracking.js'
import { checkoutAdminClient } from './checkoutAdminServer.js'
import { resolveCheckoutSettings } from './checkoutSettings.js'
import { loadOrderBumps, quoteBump } from './checkoutCart.js'
import { calculatePayment, gatewayConfiguration } from './pagarme.js'

export async function loadCheckoutOffer(slug, db = checkoutAdminClient()) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug || '')) return null
  const { data: offer, error } = await db.from('offers').select('*').eq('slug', slug).eq('active', true).maybeSingle()
  if (error) throw new Error('Não foi possível carregar a oferta.')
  if (!offer) return null
  const { data: product, error: productError } = await db.from('products').select('*').eq('id', offer.product_id).eq('active', true).maybeSingle()
  if (productError) throw new Error('Não foi possível carregar o produto.')
  if (!product || (product.marketplace_id || 'pagarme') !== 'pagarme') return null
  const global = await loadGlobalTracking(db)
  const config = resolveCheckoutSettings(offer.checkout_config || {}, global.checkout_config)
  config.product_image_url ||= product.image_url || ''
  const tracking = resolveTracking(config, global)
  config.gtm_id = tracking.gtm_id
  config.meta_pixel_id = tracking.meta_pixel_id
  config.tracking_source = tracking.source
  config.redirects.approved ||= offer.thank_you_url || ''
  const methods = (offer.payment_methods || []).filter(method => product.type !== 'subscription' || method === 'credit_card')
  const prices = methods.flatMap(method => Array.from({ length: method === 'pix' || product.type === 'subscription' ? 1 : offer.max_installments || 1 }, (_, index) => ({ method, installments: index + 1, ...calculatePayment(offer, product, method, index + 1) })))
  const bumps = product.type === 'subscription' ? [] : await loadOrderBumps(db, offer.id)
  return { offer, product, config, prices, bumps }
}
export function checkoutTestConfiguration(env = process.env) {
  try {
    const gateway = gatewayConfiguration(env)
    const ready = env.CHECKOUT_TEST_ENABLED === 'true' && gateway.mode === 'test' && env.VERCEL_ENV !== 'production' && (env.CHECKOUT_SESSION_SECRET?.length || 0) >= 32
    return { ready, tokenBase: gateway.base, publicKey: /^pk_test_[a-zA-Z0-9]+$/.test(env.PAGARME_PUBLIC_KEY || '') ? env.PAGARME_PUBLIC_KEY : '' }
  } catch { return { ready: false, tokenBase: 'https://sdx-api.pagar.me/core/v5', publicKey: '' } }
}
// A primeira compra real é restrita ao administrador e às ofertas escolhidas.
// Não transforma uma credencial instalada em autorização para vender todo o catálogo.
export function checkoutPaymentConfiguration(loaded, env = process.env) {
  const disabled = { ready: false, mode: 'disabled', adminOnly: true, tokenBase: 'https://api.pagar.me/core/v5', publicKey: '' }
  try {
    const gateway = gatewayConfiguration(env)
    if (gateway.mode === 'test') return { ...checkoutTestConfiguration(env), mode: 'test', adminOnly: true }
    const allowedOffers = (env.CHECKOUT_LIVE_OFFER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    // Autoriza ofertas de validação específicas sem torná-las públicas e sem abrir o restante do catálogo.
    const adminTestOffers = (env.CHECKOUT_ADMIN_TEST_OFFER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    const autoPublic = loaded.offer.active === true
      && loaded.product.active === true
      && loaded.product.type === 'one_time'
      && loaded.offer.checkout_config?.auto_publish === true
      && Number.isInteger(loaded.offer.price_cents)
      && loaded.offer.price_cents >= 1000
      && !/^(teste|test)(?:\b|\s|[-_:])/i.test(String(loaded.offer.name || '').trim())
      && !adminTestOffers.includes(loaded.offer.id)
    const ready = env.CHECKOUT_TEST_ENABLED !== 'true'
      && (allowedOffers.includes(loaded.offer.id) || adminTestOffers.includes(loaded.offer.id) || autoPublic)
      && (Boolean(loaded.product.plan_id) || (loaded.product.type === 'one_time' && (env.CHECKOUT_RESERVATION_OFFER_IDS || '').split(',').map(id => id.trim()).includes(loaded.offer.id)))
      && loaded.product.type === 'one_time'
      && (env.CHECKOUT_SESSION_SECRET?.length || 0) >= 32
      && (env.PAGARME_WEBHOOK_SECRET?.length || 0) >= 32
      && env.CHECKOUT_FULFILLMENT_ENABLED === 'true'
      && env.CHECKOUT_ACCESS_LEDGER_ENABLED === 'true'
      && (!loaded.config.contract?.required || (env.CONTRACTS_ENABLED === 'true' && (env.CONTRACT_TOKEN_SECRET?.length || 0) >= 32))
    const publicKey = /^pk_(?:live_)?[a-zA-Z0-9]+$/.test(env.PAGARME_PUBLIC_KEY || '') ? env.PAGARME_PUBLIC_KEY : ''
    // Somente ofertas explicitamente autorizadas podem receber compras de clientes.
    // A oferta de teste e todas as demais continuam restritas ao administrador.
    const publicOffers = (env.CHECKOUT_PUBLIC_OFFER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    const adminOnly = adminTestOffers.includes(loaded.offer.id) || (loaded.offer.price_cents < 1000) || (!autoPublic && !publicOffers.includes(loaded.offer.id))
    return { ready, mode: 'live', adminOnly, tokenBase: gateway.base, publicKey }
  } catch { return disabled }
}
export function publicCheckoutData(loaded, env = process.env) {
  const { offer, product, config, prices, bumps = [] } = loaded
  const test = checkoutTestConfiguration(env)
  const payment = checkoutPaymentConfiguration(loaded, env)
  // Nunca enviar o registro completo: contém vínculos internos e configuração administrativa.
  return {
    offer: { id: offer.id, name: offer.name, slug: offer.slug, price_cents: offer.price_cents, payment_methods: offer.payment_methods, default_installments: offer.default_installments || 1, monthly_interest_pct: Number(offer.monthly_interest_pct) || 0, billing_cycles: offer.billing_cycles || 0, billing_interval: offer.billing_interval, billing_interval_count: offer.billing_interval_count, trial_days: offer.trial_days },
    product: { id: product.id, name: product.name, type: product.type }, config, prices, test, payment,
    analytics_enabled: payment.ready && payment.mode === 'live' && env.CHECKOUT_TRACKING_ENABLED === 'true',
    bumps: (payment.mode === 'live' ? [] : bumps).map(bump => ({ offer_id: bump.offer.id, product_id: bump.product.id, product_name: bump.product.name, offer_name: bump.offer.name, headline: bump.headline, description: bump.description, prices: prices.filter(price => bump.offer.payment_methods?.includes(price.method)).map(price => ({ method: price.method, installments: price.installments, ...quoteBump(offer, bump, price.method, price.installments) })) })),
  }
}
