import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'

export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 })
    const url = new URL(request.url)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const end = url.searchParams.get('fim') || today
    const start = url.searchParams.get('inicio') || new Date(Date.now() - 29 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    if (![start, end].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const startDate = new Date(`${start}T00:00:00-03:00`)
    const endDate = new Date(`${end}T00:00:00-03:00`)
    if (!Number.isFinite(+startDate) || !Number.isFinite(+endDate) || endDate < startDate || endDate - startDate > 366 * 86400000) return NextResponse.json({ error: 'Escolha um período de até 366 dias.' }, { status: 400 })
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    const orders = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('orders').select('id,status,total_cents,payment_method,customer_id,offer_id,created_at').gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString()).order('created_at').order('id').range(offset, offset + 999)
      if (error) throw error
      orders.push(...(data || []))
      if (!data || data.length < 1000) break
      if (orders.length >= 100000) throw new Error('Período muito amplo')
    }
    const [{ data: products, error: productError }, { data: offers, error: offerError }] = await Promise.all([db.from('products').select('id,name'), db.from('offers').select('id,product_id')])
    if (productError || offerError) throw productError || offerError
    const byOffer = new Map((offers || []).map(o => [o.id, o.product_id]))
    const names = new Map((products || []).map(p => [p.id, p.name]))
    const daily = new Map()
    for (let date = new Date(startDate); date < endDate; date.setUTCDate(date.getUTCDate() + 1)) daily.set(date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), { date: date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), revenue: 0, sales: 0 })
    const statuses = {}, methods = {}, top = new Map()
    let revenue = 0, sales = 0, refunds = 0, refundedValue = 0
    const customers = new Set()
    for (const order of orders) {
      statuses[order.status] = (statuses[order.status] || 0) + 1
      if (order.status === 'refunded') { refunds++; refundedValue += Number(order.total_cents || 0) }
      if (order.status !== 'paid') continue
      const total = Number(order.total_cents || 0)
      revenue += total; sales++
      if (order.customer_id) customers.add(order.customer_id)
      methods[order.payment_method] = (methods[order.payment_method] || 0) + 1
      const day = daily.get(new Date(order.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
      if (day) { day.revenue += total; day.sales++ }
      const product = byOffer.get(order.offer_id)
      const row = top.get(product) || { name: names.get(product) || 'Produto não identificado', sales: 0, revenue: 0 }
      row.sales++; row.revenue += total; top.set(product, row)
    }
    return NextResponse.json({ start, end, revenue, sales, customers: customers.size, refunds, refundedValue, ticket: sales ? Math.round(revenue / sales) : 0, totalOrders: orders.length, daily: [...daily.values()], statuses, methods, products: [...top.values()].sort((a,b) => b.revenue - a.revenue) })
  } catch (error) {
    console.error('Resumo checkout', error)
    return NextResponse.json({ error: 'Não foi possível carregar o resumo de vendas.' }, { status: 500 })
  }
}
