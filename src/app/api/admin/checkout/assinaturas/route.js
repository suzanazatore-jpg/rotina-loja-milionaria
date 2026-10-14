import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { manageSubscription } from '@/lib/checkoutPaymentsServer'

export const runtime = 'nodejs'
export async function GET(request) {
  const db = checkoutAdminClient()
  if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
  const { data, error } = await db.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'Falha ao consultar assinaturas.' }, { status: 500 })
  const ids = [...new Set((data || []).map(row => row.customer_id))]
  const offerIds = [...new Set((data || []).map(row => row.offer_id))]
  const [customers, offers] = await Promise.all([
    ids.length ? db.from('customers').select('id,name,email').in('id', ids) : { data: [] },
    offerIds.length ? db.from('offers').select('id,name').in('id', offerIds) : { data: [] },
  ])
  if (customers.error || offers.error) return NextResponse.json({ error: 'Falha ao consultar os detalhes.' }, { status: 500 })
  return NextResponse.json({ subscriptions: (data || []).map(row => ({ ...row, customer: customers.data?.find(customer => customer.id === row.customer_id), offer_name: offers.data?.find(offer => offer.id === row.offer_id)?.name })) }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
    const { id, action } = await request.json()
    if (!['sync', 'cancel'].includes(action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    return NextResponse.json({ subscription: await manageSubscription(db, id, action === 'cancel') })
  } catch (error) { return NextResponse.json({ error: 'Não foi possível atualizar a assinatura.' }, { status: error.status || 500 }) }
}
