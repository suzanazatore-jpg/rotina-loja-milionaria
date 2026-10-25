import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import {subscriptionFilters,subscriptionFilteredRows} from '@/lib/checkoutSubscriptions'
import { manageSubscription } from '@/lib/checkoutPaymentsServer'

export const runtime = 'nodejs'
export async function GET(request) {
  try {
    const db=checkoutAdminClient()
    if(!await autorizarAdmin(request,db))return NextResponse.json({error:'Acesso restrito.'},{status:401,headers:{'Cache-Control':'no-store'}})
    const params=new URL(request.url).searchParams
    try {subscriptionFilters(params)} catch(error){return NextResponse.json({error:error.message},{status:400})}
    const page=Math.max(1,Math.min(100000,parseInt(params.get('page') || '1',10) || 1))
    const [all,products]=await Promise.all([subscriptionFilteredRows(db,params),db.from('products').select('id,name').order('name')])
    if(products.error)throw products.error
    const subscriptions=all.slice((page-1)*30,page*30)
    return NextResponse.json({subscriptions,total:all.length,page,products:products.data || []},{headers:{'Cache-Control':'no-store'}})
  } catch {return NextResponse.json({error:'Falha ao consultar assinaturas.'},{status:500,headers:{'Cache-Control':'no-store'}})}
}
export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
    const { id, action } = await request.json()
    if (!['sync', 'cancel'].includes(action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    const subscription=await manageSubscription(db,id,action==='cancel')
    const updated_at=new Date().toISOString()
    const logged=await db.from('webhook_events').insert({pagarme_event_id:`subscription-admin:${crypto.randomUUID()}`,type:action==='cancel'?'subscription.admin_canceled':'subscription.admin_synced',payload:{resource_id:subscription.pagarme_subscription_id},processed_at:updated_at})
    return NextResponse.json({subscription:{...subscription,updated_at:logged.error?null:updated_at}})
  } catch (error) { return NextResponse.json({ error: 'Não foi possível atualizar a assinatura.' }, { status: error.status || 500 }) }
}
