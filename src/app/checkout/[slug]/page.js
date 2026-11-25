import { headers } from 'next/headers'
import { funnelPageToken } from '@/lib/checkoutFunnelServer'
import { notFound } from 'next/navigation'
import { loadCheckoutOffer, publicCheckoutData, usesCompactCheckout } from '@/lib/checkoutPublicServer'
import PublicCheckout from './PublicCheckout'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Checkout | Suzana Zatorre', robots: { index: false, follow: false } }
export default async function Page({ params, searchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const loaded = await loadCheckoutOffer(slug)
  if (!loaded) notFound()
  const data = publicCheckoutData(loaded)
  const compact = usesCompactCheckout(loaded.config, query?.modelo)
  const funnelToken = funnelPageToken(data, compact, query, (await headers()).get('referer'))
  return <PublicCheckout data={data} compact={compact} funnelToken={funnelToken} />
}
