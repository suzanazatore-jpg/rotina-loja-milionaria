import { metaVisit } from '@/lib/checkoutMetaVisit'
import { notFound } from 'next/navigation'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { offerId } from '@/lib/checkoutLinks'
import { loadCheckoutOffer, publicCheckoutData } from '@/lib/checkoutPublicServer'
import PublicCheckout from '../../checkout/[slug]/PublicCheckout'

export const dynamic = 'force-dynamic'
export const metadata = {title:'Checkout | Suzana Zatorre', robots:{index:false, follow:false}}

export default async function Page({params}) {
  const {code} = await params
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(code)) notFound()

  const db = checkoutAdminClient()
  const address = await db.from('checkout_offer_links').select('offer_id').eq('path',code).maybeSingle()
  if (address.error) throw new Error('Não foi possível consultar o link de pagamento.')
  const id = address.data?.offer_id || offerId(code)
  if (!id) notFound()

  const offer = await db.from('offers').select('slug').eq('id',id).eq('active',true).maybeSingle()
  if (offer.error) throw new Error('Não foi possível abrir esta oferta.')
  if (!offer.data) notFound()
  const loaded = await loadCheckoutOffer(offer.data.slug,db)
  if (!loaded) notFound()
  return <PublicCheckout data={publicCheckoutData(loaded)} metaVisit={metaVisit(loaded)}/>
}
