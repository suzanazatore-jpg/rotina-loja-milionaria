import { NextResponse } from 'next/server'
import { isDeepStrictEqual } from 'node:util'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadGlobalCheckoutSettings } from '@/lib/checkoutSettings'
import { patchCheckoutConfig } from '@/lib/checkoutConfigPatch'
const reply = (error,status) => NextResponse.json({error},{status})
export async function PATCH(request) {
  const db = checkoutAdminClient()
  if (!(await autorizarAdmin(request,db))) return reply('Acesso restrito ao administrador.',401)
  try {
    const { id, product_id, baseline, thank_you_url, changes } = await request.json()
    if (![id,product_id].every(value=>/^[0-9a-f-]{36}$/i.test(value || ''))) return reply('Oferta inválida.',400)
    const {data:offer,error} = await db.from('offers').select('id,product_id,checkout_config,thank_you_url').eq('id',id).eq('product_id',product_id).single()
    if (error || !offer) return reply('Oferta não encontrada.',404)
    if (!isDeepStrictEqual(offer.checkout_config,baseline) || offer.thank_you_url !== thank_you_url) return reply('A oferta foi alterada em outra tela. Atualize antes de salvar.',409)
    const global = await loadGlobalCheckoutSettings(db)
    const config = patchCheckoutConfig(offer.checkout_config || {},changes,global)
    const record = {checkout_config:config}
    if (Object.hasOwn(changes,'redirects')) record.thank_you_url = config.redirects.approved || null
    let query = db.from('offers').update(record).eq('id',id).eq('product_id',product_id)
    query = offer.checkout_config === null ? query.is('checkout_config',null) : query.eq('checkout_config',JSON.stringify(offer.checkout_config))
    query = offer.thank_you_url === null ? query.is('thank_you_url',null) : query.eq('thank_you_url',offer.thank_you_url)
    const saved = await query.select('*').maybeSingle()
    if (saved.error) throw new Error('Não foi possível salvar a configuração.')
    if (!saved.data) return reply('A oferta foi alterada em outra tela. Atualize antes de salvar.',409)
    return NextResponse.json({offer:saved.data},{headers:{'Cache-Control':'no-store'}})
  } catch(error) {return reply(error.message,400)}
}
