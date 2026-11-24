import { notFound } from 'next/navigation'
import { loadCheckoutOffer, publicCheckoutData, usesCompactCheckout } from '@/lib/checkoutPublicServer'
import PublicCheckout from './PublicCheckout'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Checkout | Suzana Zatorre', robots: { index: false, follow: false } }
export default async function Page({ params, searchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const loaded = await loadCheckoutOffer(slug)
  if (!loaded) notFound()
  return <PublicCheckout data={publicCheckoutData(loaded)} compact={usesCompactCheckout(loaded.config, query?.modelo)} />
}
