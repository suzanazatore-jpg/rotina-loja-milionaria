import {notFound} from 'next/navigation'
import {checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {offerId} from '@/lib/checkoutLinks'
import {loadCheckoutOffer,publicCheckoutData} from '@/lib/checkoutPublicServer'
import PublicCheckout from '../../checkout/[slug]/PublicCheckout'
export const dynamic='force-dynamic'
export const metadata={title:'Checkout | Suzana Zatorre',robots:{index:false,follow:false}}
export default async function Page({params}){const {code}=await params;if(!/^[a-zA-Z0-9_-]{1,32}$/.test(code))notFound();const db=checkoutAdminClient();let offer;const alias=await db.from('offers').select('slug').eq('checkout_config->>payment_alias',code).eq('active',true).limit(2);if(alias.error)throw new Error('Não foi possível abrir este link.');if(alias.data?.length>1)notFound();offer=alias.data?.[0];if(!offer){const id=offerId(code);if(!id)notFound();const result=await db.from('offers').select('slug').eq('id',id).eq('active',true).maybeSingle();if(result.error)throw new Error('Não foi possível abrir este link.');offer=result.data}if(!offer)notFound();const loaded=await loadCheckoutOffer(offer.slug,db);if(!loaded)notFound();return <PublicCheckout data={publicCheckoutData(loaded)}/>}
