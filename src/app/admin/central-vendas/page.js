'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const statusLabels = { paid:'Pago',pending:'Pendente',failed:'Falhou',canceled:'Cancelado',refunded:'Reembolsado',authorized:'Autorizado',processing:'Processando',expired:'Expirado',chargeback:'Contestação' }
const dateLabel = date => date.slice(8,10) + '/' + date.slice(5,7)
function Distribution({ title, data, labels = {} }) {
  const entries = Object.entries(data || {})
  const total = entries.reduce((sum,[,value]) => sum + value,0)
  return <section className="central-chart-panel"><h2>{title}</h2>{!total ? <p className="central-empty">Sem dados no período.</p> : <div className="central-distribution">{entries.map(([key,value]) => <div key={key}><div><span>{labels[key] || key}</span><strong>{value} · {Math.round(value / total * 100)}%</strong></div><progress value={value} max={total} /></div>)}</div>}</section>
}
export default function CentralVendas() {
  const [data,setData] = useState(null)
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const [filters,setFilters] = useState({inicio:'',fim:''})
  const [period,setPeriod] = useState({inicio:'',fim:''})
  const [refresh,setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true);setError('')
      try {
        const {data:{session}} = await supabase.auth.getSession()
        if (!session) throw new Error('Entre na sua conta para consultar as vendas.')
        const qs = new URLSearchParams(Object.entries(period).filter(([,value])=>value))
        const response = await fetch(`/api/admin/checkout/resumo?${qs}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'})
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Erro ao carregar vendas.')
        if (active) setData(json)
      } catch (e) { if (active) {setError(e.message);setData(null)} }
      finally {if(active) setLoading(false)}
    }
    load();return()=>{active=false}
  },[period,refresh])
  const max = Math.max(1,...(data?.daily || []).map(day=>day.revenue))
  const cards = data ? [['Faturamento aprovado',money(data.revenue)],['Vendas pagas',data.sales],['Clientes compradores',data.customers],['Ticket médio',money(data.ticket)],['Reembolsos',data.refunds]] : []
  return <main className="central-home">
    <div className="central-dashboard-heading"><div><span className="central-eyebrow">VISÃO GERAL</span><h1>Dashboard de vendas</h1><p>{data ? `${dateLabel(data.start)} a ${dateLabel(data.end)} · Pedidos criados no período` : 'Acompanhe os resultados do seu checkout.'}</p></div><button className="central-action" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>↻ Atualizar</button></div>
    <form className="central-filter-bar" onSubmit={e=>{e.preventDefault();setPeriod({...filters})}}><label>De<input type="date" value={filters.inicio} onChange={e=>setFilters({...filters,inicio:e.target.value})} /></label><label>Até<input type="date" value={filters.fim} onChange={e=>setFilters({...filters,fim:e.target.value})} /></label><button className="central-action" type="submit" disabled={loading}>Aplicar filtros</button><button className="central-action" type="button" onClick={()=>{setFilters({inicio:'',fim:''});setPeriod({inicio:'',fim:''})}}>Últimos 30 dias</button></form>
    {loading && <p role="status">Carregando resultados…</p>}{error && <p role="alert" className="central-error">{error}</p>}
    {data && <>
      <div className="central-metrics">{cards.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong>{label === 'Reembolsos' && <small>{money(data.refundedValue)}</small>}</article>)}</div>
      <section className="central-chart-panel"><div className="central-section-heading"><h2>Volume de vendas</h2><span>Faturamento aprovado por dia</span></div>{data.sales === 0 ? <p className="central-empty">Nenhuma venda paga neste período.</p> : <div className="central-revenue-chart"><div className="central-chart-scale"><span>{money(max)}</span><span>{money(max/2)}</span><span>R$ 0</span></div><div className="central-chart-bars">{data.daily.map((day,index)=><div className="central-chart-day" key={day.date}><div className="central-chart-track"><div className="central-chart-bar" style={{height:`${day.revenue / max * 100}%`}} title={`${dateLabel(day.date)}: ${money(day.revenue)} · ${day.sales} venda(s)`} /></div><small>{index % Math.max(1,Math.ceil(data.daily.length / 12)) === 0 ? dateLabel(day.date) : ''}</small></div>)}</div></div>}<div className="central-chart-totals"><span>Total em vendas <strong>{money(data.revenue)}</strong></span><span>Vendas pagas <strong>{data.sales}</strong></span><span>Pedidos no período <strong>{data.totalOrders}</strong></span><span>Ticket médio <strong>{money(data.ticket)}</strong></span></div></section>
      <div className="central-home-grid"><Distribution title="Vendas por status" data={data.statuses} labels={statusLabels} /><Distribution title="Formas de pagamento" data={data.methods} labels={{pix:'Pix',credit_card:'Cartão de crédito'}} /></div>
      <section className="central-chart-panel" style={{marginTop:24}}><h2>Produtos mais vendidos</h2><div className="central-table-wrap"><table className="central-table"><thead><tr><th>Produto</th><th>Vendas pagas</th><th>Faturamento</th></tr></thead><tbody>{data.products.map(row=><tr key={row.name}><td>{row.name}</td><td>{row.sales}</td><td>{money(row.revenue)}</td></tr>)}{!data.products.length && <tr><td colSpan={3}>Nenhuma venda paga no período.</td></tr>}</tbody></table></div></section>
      <p className="central-data-note">Valores do checkout próprio. Faturamento bruto dos pedidos pagos; taxas do gateway não são descontadas. Clientes compradores são contatos distintos com pedidos pagos no período.</p>
    </>}
  </main>
}
