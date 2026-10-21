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
  const oferta = url.searchParams.get('oferta')
  const status = url.searchParams.get('status')
  const produto = url.searchParams.get('produto')
  const inicio = url.searchParams.get('inicio')
  const fim = url.searchParams.get('fim')
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
        db.from('customers').select('id,name,email,phone').eq('id', pedido.customer_id).maybeSingle(),
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

    let query = db.from('orders').select('id,customer_id,offer_id,parent_order_id,status,payment_method,installments,subtotal_cents,interest_cents,discount_cents,total_cents,pagarme_order_id,created_at,paid_at', { count: 'exact' })
    if (oferta) query = query.eq('offer_id', oferta)
    if (status && status !== 'todos') query = query.eq('status', status)
    if (inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio)) query = query.gte('created_at', `${inicio}T00:00:00.000Z`)
    if (fim && /^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      const diaSeguinte = new Date(`${fim}T00:00:00.000Z`)
      if (!Number.isNaN(diaSeguinte.getTime())) {
        diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1)
        query = query.lt('created_at', diaSeguinte.toISOString())
      }
    }
    if (produto) {
      if (!nomes.has(produto)) return NextResponse.json({ orders: [], count: 0, page, limit, products: produtos })
      const ofertasDoProduto = (ofertas || []).filter(o => o.product_id === produto).map(o => o.id)
      const { data: itensProduto, error: errItens } = await db.from('order_items').select('order_id').eq('product_id', produto)
      if (errItens) throw errItens
      const { data: pedidosOferta, error: errPedidosOferta } = ofertasDoProduto.length
        ? await db.from('orders').select('id').in('offer_id', ofertasDoProduto)
        : { data: [], error: null }
      if (errPedidosOferta) throw errPedidosOferta
      const ids = [...new Set([...(itensProduto || []).map(i => i.order_id), ...(pedidosOferta || []).map(i => i.id)])]
      if (!ids.length) return NextResponse.json({ orders: [], count: 0, page, limit, products: produtos })
      query = query.in('id', ids)
    }
    const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
    if (error) throw error
    const customerIds = [...new Set((data || []).map(o => o.customer_id).filter(Boolean))]
    const { data: clientes, error: errClientes } = customerIds.length
      ? await db.from('customers').select('id,name,email').in('id', customerIds)
      : { data: [], error: null }
    if (errClientes) throw errClientes
    const mapaClientes = new Map((clientes || []).map(c => [c.id, c]))
    return NextResponse.json({
      orders: (data || []).map(o => ({ ...o, customer: mapaClientes.get(o.customer_id) || null, product_name: nomes.get(mapaOfertas.get(o.offer_id)?.product_id) || '—', offer_name: mapaOfertas.get(o.offer_id)?.name || '—' })),
      count: count || 0, page, limit, products: produtos,
    })
  } catch (error) {
    console.error('checkout vendas admin', error)
    return NextResponse.json({ error: 'Não foi possível consultar os pedidos.' }, { status: 500 })
  }
}
