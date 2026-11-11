import {notFound} from 'next/navigation'
import {checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {offerId} from '@/lib/checkoutLinks'
import {loadCheckoutOffer,publicCheckoutData} from '@/lib/checkoutPublicServer'
import PublicCheckout from '../../checkout/[slug]/PublicCheckout'
export const dynamic='force-dynamic'
export const metadata={title:'Checkout | Suzana Zatorre',robots:{index:false,follow:false}}

export default async function Page({params}){
  const {code}=await params
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(code))notFound()
  const db=checkoutAdminClient()
  // Link amigável persistido é a referência principal; o código antigo continua válido.
  const saved=await db.from('checkout_offer_links').select('offer_id').eq('path',code).maybeSingle()
  if(saved.error)throw new Error('Não foi possível abrir este link.')
  let targetId=saved.data?.offer_id || null
  if(!targetId){
    const alias=await db.from('offers').select('id').eq('checkout_config->>payment_alias',code).eq('active',true).limit(2)
    if(alias.error)throw new Error('Não foi possível abrir este link.')
    if(alias.data?.length>1)notFound()
    targetId=alias.data?.[0]?.id || null
  }
  if(!targetId){
    // URL amigável (slug) da oferta: pay.suzanazatorre.com.br/<url-amigavel>
    const bySlug=await db.from('offers').select('id').eq('slug',code).eq('active',true).maybeSingle()
    if(bySlug.error)throw new Error('Não foi possível abrir este link.')
    targetId=bySlug.data?.id || offerId(code)
  }
  if(!targetId)notFound()
  const result=await db.from('offers').select('slug').eq('id',targetId).eq('active',true).maybeSingle()
  if(result.error)throw new Error('Não foi possível abrir este link.')
  if(!result.data)notFound()
  const loaded=await loadCheckoutOffer(result.data.slug,db)
  if(!loaded)notFound()
  return <PublicCheckout data={publicCheckoutData(loaded)}/>
}
