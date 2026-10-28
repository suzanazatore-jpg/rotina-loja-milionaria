import {readSales} from '@/lib/centralRecords'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export async function GET(request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Configuração do servidor incompleta.' }, { status: 500 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
  const limit = 25

  try {
    const { data: produtos, error: errProdutos } = await db.from('products').select('id,name').order('name')
    if (errProdutos) throw errProdutos
    const { data: ofertas, error: errOfertas } = await db.from('offers').select('id,name,product_id')
    if (errOfertas) throw errOfertas

    const nomes = new Map((produtos || []).map(p => [p.id, p.name]))
    const mapaOfertas = new Map((ofertas || []).map(o => [o.id, o]))
    const detalhar = async (pedido) => {
      const [{ data: cliente, error: errCliente }, { data: itens, error: errItens }] = await Promise.all([
        db.from('customers').select('id,name,email,phone,document,billing_address').eq('id', pedido.customer_id).maybeSingle(),
        db.from('order_items').select('id,kind,product_id,offer_id,price_cents').eq('order_id', pedido.id),
      ])
      if (errCliente) throw errCliente
      if (errItens) throw errItens
      const conversion = await db.from('webhook_events').select('error,processed_at,payload').eq('pagarme_event_id', `capi:${pedido.id}`).maybeSingle()
      if (conversion.error) throw conversion.error
      const [grant, reversal] = await Promise.all([
        db.from('checkout_access_grants').select('expires_at,next_expiration,revoked_at,reason,review_required').eq('order_id', pedido.id).maybeSingle(),
        db.from('webhook_events').select('error,processed_at').eq('pagarme_event_id', `revoke:${pedido.id}`).maybeSingle(),
      ])
      if (grant.error || reversal.error) throw new Error('Falha ao consultar acessos.')
      const access = { grant: grant.data, review_required: grant.data?.review_required || reversal.data?.error === 'review_required' }
      const registro = conversion.data
      return { ...pedido, access, conversion: registro ? { status: registro.processed_at ? 'sent' : registro.error, mode: registro.payload?.mode, attempts: registro.payload?.attempts || 0, next_attempt_at: registro.payload?.next_attempt_at } : null, customer: cliente, items: (itens || []).map(i => ({ ...i, product_name: nomes.get(i.product_id) || 'Produto', offer_name: mapaOfertas.get(i.offer_id)?.name || 'Oferta' })) }
    }

    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
      const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
      return NextResponse.json({ order: await detalhar(data) })
    }

    const all=await readSales(db,url.searchParams)
    const data=all.slice((page-1)*limit,page*limit)
    return NextResponse.json({orders:data,count:all.length,page,limit,products:produtos},{headers:{'Cache-Control':'no-store'}})
  } catch (error) {
    console.error('checkout vendas admin', error)
    return NextResponse.json({ error: 'Não foi possível consultar os pedidos.' }, { status: 500 })
  }
}
