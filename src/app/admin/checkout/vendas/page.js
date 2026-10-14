'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OURO = '#D4AF37'
const campo = { background: '#181818', color: '#fff', border: '1px solid #383838', borderRadius: 8, padding: '10px 12px', minWidth: 150 }
const moeda = n => (Number(n || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—'
const statusPT = { paid: 'Pago', pending: 'Pendente', failed: 'Falhou', canceled: 'Cancelado', refunded: 'Reembolsado', authorized: 'Autorizado', processing: 'Processando', expired: 'Expirado', chargeback: 'Contestação' }

export default function AdminVendasCheckout() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [data, setData] = useState({ orders: [], products: [], count: 0, page: 1, limit: 25 })
  const [filtros, setFiltros] = useState({ status: 'todos', produto: '', inicio: '', fim: '' })
  const [pagina, setPagina] = useState(1)
  const [detalhe, setDetalhe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!ativo) return
      if (!session) { router.push('/login'); return }
      if (session.user.email?.toLowerCase() !== 'suporte@suzanazatorre.com.br') { setErro('Acesso restrito ao administrador.'); setLoading(false); return }
      setToken(session.access_token)
    })
    return () => { ativo = false }
  }, [router])

  useEffect(() => {
    if (!token) return
    let ativo = true
    async function carregar() {
      setLoading(true); setErro('')
      try {
        const qs = new URLSearchParams({ ...filtros, page: String(pagina) })
        const resposta = await fetch(`/api/admin/checkout/vendas?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const json = await resposta.json()
        if (!resposta.ok) throw new Error(json.error || 'Erro ao buscar vendas')
        if (ativo) setData(json)
      } catch (e) { if (ativo) setErro(e.message) }
      finally { if (ativo) setLoading(false) }
    }
    carregar()
    return () => { ativo = false }
  }, [token, filtros, pagina])

  async function abrir(id) {
    setErro('')
    try {
      const resposta = await fetch(`/api/admin/checkout/vendas?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const json = await resposta.json()
      if (!resposta.ok) throw new Error(json.error || 'Não foi possível abrir o pedido')
      setDetalhe(json.order)
    } catch (e) { setErro(e.message) }
  }
  function mudar(chave, valor) { setFiltros(a => ({ ...a, [chave]: valor })); setPagina(1) }
  const paginas = Math.max(1, Math.ceil(data.count / data.limit))

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#fff', fontFamily: 'Arial, sans-serif', paddingBottom: 70 }}>
    <header style={{ padding: 18, borderBottom: '1px solid #292929', background: '#111' }}><button style={{ ...campo, color: OURO, cursor: 'pointer' }} onClick={() => router.push('/admin')}>← Meu Escritório</button></header>
    <main style={{ maxWidth: 1160, margin: 'auto', padding: '24px 16px' }}>
      <div style={{ color: OURO, fontWeight: 800, fontSize: 12, letterSpacing: 2 }}>VENDAS E CHECKOUT</div>
      <h1 style={{ margin: '8px 0' }}>Pedidos e Vendas</h1>
      <p style={{ color: '#aaa' }}>Consulte pagamentos, dados da cliente e produtos vendidos. Somente leitura: status vem do gateway.</p>
      <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '22px 0', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6 }}>Status<select style={campo} value={filtros.status} onChange={e => mudar('status', e.target.value)}>{[['todos','Todos'],['pending','Pendente'],['paid','Pago'],['failed','Falhou'],['canceled','Cancelado'],['refunded','Reembolsado'],['authorized','Autorizado'],['processing','Processando'],['expired','Expirado'],['chargeback','Contestação']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 6 }}>Produto<select style={campo} value={filtros.produto} onChange={e => mudar('produto', e.target.value)}><option value="">Todos os produtos</option>{data.products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 6 }}>De<input style={campo} type="date" value={filtros.inicio} onChange={e => mudar('inicio', e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 6 }}>Até<input style={campo} type="date" value={filtros.fim} onChange={e => mudar('fim', e.target.value)} /></label>
        <button style={{ ...campo, cursor: 'pointer' }} onClick={() => { setFiltros({ status: 'todos', produto: '', inicio: '', fim: '' }); setPagina(1) }}>Limpar</button>
      </section>
      {erro && <p role="alert" style={{ color: '#ff9999', background: '#321a1a', padding: 12, borderRadius: 8 }}>{erro}</p>}
      <p style={{ color: '#aaa' }}>{loading ? 'Carregando pedidos...' : `${data.count} pedido(s) encontrado(s)`}</p>
      <div style={{ overflowX: 'auto', border: '1px solid #333', borderRadius: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850, textAlign: 'left' }}>
        <thead style={{ background: '#1B1B1B', color: OURO }}><tr>{['Data','Cliente','Produto','Total','Pagamento','Status',''].map(h => <th key={h} style={{ padding: 13 }}>{h}</th>)}</tr></thead>
        <tbody>{data.orders.map(o => <tr key={o.id} style={{ borderTop: '1px solid #292929' }}><td style={{ padding: 13 }}>{dataBR(o.created_at)}</td><td style={{ padding: 13 }}><strong>{o.customer?.name || '—'}</strong><div style={{ color: '#999', fontSize: 12 }}>{o.customer?.email || ''}</div></td><td style={{ padding: 13 }}>{o.product_name}</td><td style={{ padding: 13 }}>{moeda(o.total_cents)}</td><td style={{ padding: 13 }}>{o.payment_method === 'pix' ? 'Pix' : 'Cartão'}{o.installments > 1 ? ` · ${o.installments}x` : ''}</td><td style={{ padding: 13 }}>{statusPT[o.status] || o.status}</td><td style={{ padding: 13 }}><button style={{ ...campo, color: OURO, cursor: 'pointer' }} onClick={() => abrir(o.id)}>Detalhes</button></td></tr>)}{!loading && data.orders.length === 0 && <tr><td colSpan={7} style={{ padding: 26, color: '#999', textAlign: 'center' }}>Nenhum pedido encontrado.</td></tr>}</tbody>
      </table></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}><button disabled={pagina === 1} style={campo} onClick={() => setPagina(p => p - 1)}>Anterior</button><span>Página {pagina} de {paginas}</span><button disabled={pagina >= paginas} style={campo} onClick={() => setPagina(p => p + 1)}>Próxima</button></div>
    </main>
    {detalhe && <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDetalhe(null) }} style={{ position: 'fixed', inset: 0, background: '#000c', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}><section role="dialog" aria-modal="true" aria-label="Detalhes do pedido" style={{ background: '#171717', border: '1px solid #555', borderRadius: 14, maxWidth: 720, width: '100%', padding: 23, maxHeight: '85vh', overflowY: 'auto' }}><button style={{ ...campo, float: 'right', cursor: 'pointer' }} onClick={() => setDetalhe(null)}>Fechar ×</button><h2 style={{ color: OURO }}>Detalhes do pedido</h2><p style={{ overflowWrap: 'anywhere' }}><strong>ID:</strong> {detalhe.id}</p><p><strong>Cliente:</strong> {detalhe.customer?.name || '—'} · {detalhe.customer?.email || '—'} · {detalhe.customer?.phone || '—'}</p><p><strong>Status:</strong> {statusPT[detalhe.status] || detalhe.status} · <strong>Pagamento:</strong> {detalhe.payment_method || '—'} · {detalhe.installments || 1}x</p><p><strong>Criado:</strong> {dataBR(detalhe.created_at)} · <strong>Pago:</strong> {dataBR(detalhe.paid_at)}</p><p><strong>Subtotal:</strong> {moeda(detalhe.subtotal_cents)} · <strong>Juros:</strong> {moeda(detalhe.interest_cents)} · <strong>Desconto:</strong> {moeda(detalhe.discount_cents)}</p><h3 style={{ color: OURO }}>Total: {moeda(detalhe.total_cents)}</h3><h3>Itens</h3>{detalhe.items?.map(i => <p key={i.id}>{i.product_name} ({i.kind}) — {moeda(i.price_cents)}</p>)}<h3>Rastreamento</h3><p>Origem: {detalhe.utm_source || '—'} · Mídia: {detalhe.utm_medium || '—'} · Campanha: {detalhe.utm_campaign || '—'}</p><p style={{ overflowWrap: 'anywhere', color: '#aaa', fontSize: 12 }}>Pagar.me: {detalhe.pagarme_order_id || '—'} · Cobrança: {detalhe.pagarme_charge_id || '—'} · Pedido de origem: {detalhe.parent_order_id || '—'}</p>{detalhe.refusal_reason && <p style={{ color: '#ff9999' }}>Motivo da recusa: {detalhe.refusal_reason}</p>}</section></div>}
  </div>
}
