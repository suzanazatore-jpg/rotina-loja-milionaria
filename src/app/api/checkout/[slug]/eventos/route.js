import { measurementRequest } from '@/lib/checkoutAnalytics'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadCheckoutOffer, publicCheckoutData } from '@/lib/checkoutPublicServer'
import { readCheckoutSession } from '@/lib/checkoutSession'
import { websiteIdentifiers } from '@/lib/checkoutMetaVisit'
import { conversionConfiguration } from '@/lib/checkoutConversionsServer'
import { deliverFunnelEvent, funnelEvent } from '@/lib/checkoutMetaFunnelServer'

const allowed = new Set(['AddToCart', 'InitiateCheckout', 'AddPaymentInfo'])

export async function POST(request, context) {
  const origin = new URL(request.url).origin
  if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 403 })
  try {
    const raw = await request.text()
    if (raw.length > 2048) return new Response(null, { status: 413 })
    const input = JSON.parse(raw)
    if (!measurementRequest(input).measurement_enabled || !allowed.has(input.event)) return new Response(null, { status: 400 })
    const { slug } = await context.params
    const db = checkoutAdminClient()
    const loaded = await loadCheckoutOffer(slug, db)
    if (!loaded) return new Response(null, { status: 404 })
    const visit = readCheckoutSession(input.ticket, 'meta-visit:' + loaded.offer.id, process.env.CHECKOUT_SESSION_SECRET)
    if (!visit) return new Response(null, { status: 403 })
    const pixel = loaded.config.meta_pixel_id
    const config = conversionConfiguration(pixel)
    const checkout = publicCheckoutData(loaded)
    if (config && (checkout.analytics_enabled || (config.testCode && checkout.test.ready))) {
      const event = funnelEvent(input.event, input.event + ':' + visit.key, origin + '/checkout/' + encodeURIComponent(slug), websiteIdentifiers(request), loaded.product, visit.key)
      await deliverFunnelEvent(db, config, pixel, event)
    }
    return new Response(null, { status: 204 })
  } catch { return new Response(null, { status: 503 }) }
}
