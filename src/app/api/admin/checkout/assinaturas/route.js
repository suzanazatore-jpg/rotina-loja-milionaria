import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { manageSubscription } from '@/lib/checkoutPaymentsServer'

export const runtime = 'nodejs'
export async function GET(request) {
  const db = checkoutAdminClient()
  if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
  const { data, error } = await db.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(100)
  return error ? NextResponse.json({ error: 'Falha ao consultar assinaturas.' }, { status: 500 }) : NextResponse.json({ subscriptions: data })
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
