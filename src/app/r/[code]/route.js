import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { trackableCheckoutUrl, trackableShortLookup } from '@/lib/checkoutFunnel'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const notFound = () => new Response('Link de checkout não encontrado.', { status: 404, headers })

export async function GET(request, { params }) {
  const { code } = await params
  const lookup = trackableShortLookup(code)
  if (!lookup) return notFound()
  try {
    const { data, error } = await checkoutAdminClient().from('checkout_trackable_links')
      .select('id,offer_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term')
      .eq(lookup.column, lookup.value).maybeSingle()
    if (error) throw error
    if (!data) return notFound()

    const location = trackableCheckoutUrl(data, new URL(request.url).searchParams)
    return new Response(null, { status: 307, headers: { ...headers, Location: location } })
  } catch {
    return new Response('Link temporariamente indisponível.', { status: 503, headers })
  }
}
