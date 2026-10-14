import { checkoutAdminClient } from './checkoutAdminServer.js'
import { normalizeCheckoutSettings } from './checkoutSettings.js'
import { calculatePayment, gatewayConfiguration } from './pagarme.js'

export async function loadCheckoutOffer(slug, db = checkoutAdminClient()) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug || '')) return null
  const { data: offer, error } = await db.from('offers').select('*').eq('slug', slug).eq('active', true).maybeSingle()
  if (error) throw new Error('Não foi possível carregar a oferta.')
  if (!offer) return null
  const { data: product, error: productError } = await db.from('products').select('*').eq('id', offer.product_id).eq('active', true).maybeSingle()
  if (productError) throw new Error('Não foi possível carregar o produto.')
  if (!product) return null
  const config = normalizeCheckoutSettings(offer.checkout_config || {})
  config.redirects.approved ||= offer.thank_you_url || ''
  const methods = (offer.payment_methods || []).filter(method => product.type !== 'subscription' || method === 'credit_card')
  const prices = methods.flatMap(method => Array.from({ length: method === 'pix' || product.type === 'subscription' ? 1 : offer.max_installments || 1 }, (_, index) => ({ method, installments: index + 1, ...calculatePayment(offer, product, method, index + 1) })))
  return { offer, product, config, prices }
}
export function checkoutTestConfiguration(env = process.env) {
  try {
    const gateway = gatewayConfiguration(env)
    const ready = env.CHECKOUT_TEST_ENABLED === 'true' && gateway.base.includes('sdx-api') && (env.CHECKOUT_SESSION_SECRET?.length || 0) >= 32
    return { ready, tokenBase: gateway.base, publicKey: /^pk_test_[a-zA-Z0-9]+$/.test(env.PAGARME_PUBLIC_KEY || '') ? env.PAGARME_PUBLIC_KEY : '' }
  } catch { return { ready: false, tokenBase: 'https://sdx-api.pagar.me/core/v5', publicKey: '' } }
}
export function publicCheckoutData(loaded, env = process.env) {
  const { offer, product, config, prices } = loaded
  const test = checkoutTestConfiguration(env)
  // Nunca enviar o registro completo: contém vínculos internos e configuração administrativa.
  return {
    offer: { id: offer.id, name: offer.name, slug: offer.slug, price_cents: offer.price_cents, payment_methods: offer.payment_methods, billing_interval: offer.billing_interval, billing_interval_count: offer.billing_interval_count, trial_days: offer.trial_days },
    product: { name: product.name, type: product.type }, config, prices, test,
  }
}
