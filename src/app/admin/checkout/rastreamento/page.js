'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppIcon from '@/app/admin/central-vendas/CentralIcon'
import { supabase } from '@/lib/supabase'
import TrafficCreativeImage from '../../trafego/TrafficCreativeImage'
import DateRangePicker from '../DateRangePicker'
import { date, FilterDialog, FilterSection, money, Status, statusLabels } from '../CentralUI'
import { conversionLabel } from './trackingLabels'
import './tracking.css'

const storageKey = 'sz-central-filtros-rastreamento'
const displayDate = value => value.split('-').reverse().join('/')
const currency = value => value == null ? '—' : money(value)
const count = value => value == null ? '—' : value.toLocaleString('pt-BR')
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const multiple = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const coverage = (part, total) => total ? `${percent.format(part / total)} das aprovadas` : ''
const roas = value => value == null ? '—' : `${multiple.format(value)}×`
const pageSize = 25
const mediaOrders = {
  purchases: 'Mais compras atribuídas', metaCpa: 'Menor custo por compra na Meta',
  metaRoas: 'Maior retorno na Meta', visits: 'Mais visitas ao checkout', approved: 'Mais vendas na Central',
}

function compareMedia(a, b, field) {
  const missing = Number(a[field] == null) - Number(b[field] == null)
  const direction = field === 'metaCpa' ? 1 : -1
  return missing || ((a[field] ?? 0) - (b[field] ?? 0)) * direction
}

function initialFilters() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
}

function MediaLabel({ name, id }) {
  return <>{name || id || '—'}{name && id && name !== id && <><br/><small>{id}</small></>}</>
}

function MediaTable({ rows, selected, select }) {
  return <div className="cv-table-wrap"><table className="cv-table">
    <thead><tr><th>Campanha / origem</th><th>Conjunto</th><th>Anúncio</th><th>Visitas ao checkout</th><th>Investimento</th><th>Compras Meta Ads</th><th>CPA Meta</th><th>ROAS Meta</th><th>Vendas na Central</th><th>Faturamento</th><th>Taxas Pagar.me</th><th>CPA da Central</th><th>Após taxas e mídia</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}>
      <td><MediaLabel name={row.campaignName} id={row.campaign || row.origin || (!row.ad && !row.adset ? 'Origem não identificada' : '')}/></td>
      <td><MediaLabel name={row.adsetName} id={row.adset}/></td>
      <td><div className="cv-tracking-creative">
        {row.ad && <TrafficCreativeImage ad={{ id: row.ad, name: row.adName || row.ad, image_urls: row.imageUrls }}
          className="cv-tracking-thumbnail" fallback={<span className="cv-tracking-thumbnail cv-tracking-thumbnail-empty" title="Miniatura indisponível">—</span>}/>}
        <div><MediaLabel name={row.adName} id={row.ad}/></div>
      </div></td>
      <td>{count(row.visits)}</td>
      <td>{currency(row.spend)}</td>
      <td>{count(row.purchases)}</td><td>{currency(row.metaCpa)}</td><td>{roas(row.metaRoas)}</td>
      <td>{row.approved ? <button type="button" className="cv-link" aria-label={`Ver ${row.approved} vendas de ${row.adName || row.ad || row.campaignName || row.campaign || row.origin || 'origem não identificada'}`} aria-pressed={selected === row.key} onClick={() => select(row.key)}>{count(row.approved)}</button> : '0'}</td>
      <td>{currency(row.gross)}{row.refunds > 0 && <><br/><small>Estornos {currency(row.refunds)}</small></>}</td>
      <td>{currency(row.fees)}</td><td>{currency(row.cpa)}</td><td>{currency(row.net)}</td>
    </tr>)}{!rows.length && <tr><td colSpan={13}>Sem registros no período.</td></tr>}</tbody>
  </table></div>
}

function SalesTable({ sales, page, setPage }) {
  const pages = Math.ceil(sales.length / pageSize)
  return <>
    <div className="cv-table-wrap"><table className="cv-table">
      <thead><tr><th>Pedido</th><th>Produto</th><th>Aprovado em</th><th>Valor</th><th>Origem / anúncio</th><th>Envio à Meta</th></tr></thead>
      <tbody>{sales.slice(page * pageSize, (page + 1) * pageSize).map(sale => <tr key={sale.id}>
        <td><span className="cv-code"><Status value={sale.status}/><Link className="cv-link" title={statusLabels[sale.status]} href={`/admin/checkout/vendas/${sale.id}?tab=tracking`}>{sale.code}</Link></span></td>
        <td>{sale.product || '—'}</td><td>{date(sale.paidAt)}</td><td>{money(sale.amount)}</td>
        <td>{[sale.source, sale.ad || sale.campaign].filter(Boolean).join(' · ') || 'Origem não identificada'}</td>
        <td>{conversionLabel(sale.conversion)}{sale.conversion?.state === 'accepted' && <><br/><small>{date(sale.conversion.at)}</small></>}</td>
      </tr>)}{!sales.length && <tr><td colSpan={6}>Nenhuma venda aprovada neste filtro.</td></tr>}</tbody>
    </table></div>
    {pages > 1 && <div className="cv-toolbar"><span>Página {page + 1} de {pages}</span><div className="cv-actions">
      <button className="central-action" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button>
      <button className="central-action" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
    </div></div>}
  </>
}

export default function TrackingPage() {
  const [report, setReport] = useState(null)
  const [filters, setFilters] = useState(null)
  const [draft, setDraft] = useState(null)
  const [group, setGroup] = useState('')
  const [orderBy, setOrderBy] = useState('purchases')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const current = filters || initialFilters()
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(`/api/admin/checkout/rastreamento?${new URLSearchParams(current)}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` }, cache: 'no-store', signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (!controller.signal.aborted) {
          setReport(data)
          setGroup('')
          setPage(0)
        }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause.message); setReport(null) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [filters, refresh])

  const period = report ? `${displayDate(report.from)} – ${displayDate(report.to)}` : 'Últimos 7 dias'
  const product = report?.products.find(item => item.id === report.productId)?.name || 'Todos os produtos'
  const totals = report?.totals
  const hasMeta = report?.meta.status === 'ready'
  const visits = report?.visits
  const hasVisits = visits?.total != null
  const sortOptions = Object.keys(mediaOrders).filter(field => field === 'approved' || (field === 'visits' ? hasVisits : hasMeta))
  const activeOrder = sortOptions.includes(orderBy) ? orderBy : 'approved'
  const sortedRows = report ? [...report.rows].sort((a, b) => compareMedia(a, b, activeOrder)) : []
  const salesPer100 = visits?.complete && visits.total > 0 ? (100 * totals.approved / visits.total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : ''
  const visitNote = salesPer100 ? `${salesPer100} vendas / 100 visitas` : visits?.since ? `Coleta desde ${date(visits.since)}` :
    visits?.status === 'unavailable' ? 'Contagem indisponível' : 'Aguardando a primeira visita'
  const cards = totals ? [
    ['Visitas ao checkout', count(visits?.total), 'users', visitNote],
    ['Vendas aprovadas', count(totals.approved), 'cart', `${currency(totals.gross)} em faturamento bruto`],
    ['Recebidas pela Meta', count(totals.accepted), 'check', coverage(totals.accepted, totals.approved)],
    ['Compras no Meta Ads', count(totals.purchases), 'dashboard', totals.purchaseValue == null ? '' : `${currency(totals.purchaseValue)} atribuídos`],
    ['Pedidos com IDs de anúncio', count(totals.withAdIds), 'link', coverage(totals.withAdIds, totals.approved)],
    ['Investimento', currency(totals.spend), 'money', hasMeta ? `CPA ${currency(totals.metaCpa)} · ROAS ${roas(totals.metaRoas)}` : ''],
  ] : []

  function apply(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep the filter in memory. */ }
    setFilters(next)
    setDraft(null)
  }

  function selectGroup(key) {
    setGroup(current => current === key ? '' : key)
    setPage(0)
  }

  return <main className="central-home cv-tracking">
    <header className="cv-heading"><h1>Rastreamento <small>Vendas</small></h1>
      <div className="cv-actions"><Link className="central-primary" href="/admin/checkout/rastreamento/links"><AppIcon name="link" size={15}/>Gerador de Links Rastreáveis</Link><button className="central-action" disabled={loading} onClick={() => setRefresh(value => value + 1)}><AppIcon name="refresh" size={15}/>Atualizar</button></div>
    </header>
    <div className="cv-toolbar">
      <div className="cv-chips"><span className="cv-chip"><AppIcon name="calendar" size={13}/>{period}</span>
        {report && <span className="cv-chip">{product}</span>}
        <button className="cv-link" onClick={() => apply({})}>Limpar filtros</button>
      </div>
      <button className="central-action" aria-expanded={Boolean(draft)} disabled={!report || loading} onClick={() => setDraft({ inicio: report.from, fim: report.to, produto: report.productId })}><AppIcon name="filter" size={15}/>Filtros</button>
    </div>
    {draft && <FilterDialog floating title="Filtros de rastreamento" onClose={() => setDraft(null)} onClear={() => setDraft({ inicio: '', fim: '', produto: report.defaultProductId })} onApply={() => apply(draft)}>
      <FilterSection title="Aprovação do pagamento"><DateRangePicker filters={draft} change={(key, value) => setDraft(current => ({ ...current, [key]: value }))}/></FilterSection>
      <FilterSection title="Produto"><label>Produto principal<select value={draft.produto} onChange={event => setDraft({ ...draft, produto: event.target.value })}>
        <option value="">Todos</option>{report.products.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label></FilterSection>
    </FilterDialog>}
    {loading && <p role="status">Atualizando rastreamento…</p>}
    {error && <p className="central-error" role="alert">{error}</p>}
    {report && <>
      <div className="central-metrics">{cards.map(([label, value, icon, note]) => <article key={label}>
        <span>{label}</span><i className="cv-metric-icon"><AppIcon name={icon} size={17}/></i><strong>{value}</strong>{note && <small>{note}</small>}
      </article>)}</div>
      <p className="central-data-note">Atualizado em {date(report.updatedAt)} · {count(totals.unknown)} vendas sem origem registrada. A cobertura por anúncio usa os IDs de campanha, conjunto e anúncio gravados no pedido.</p>
      <p className="central-data-note">Cada abertura do checkout conta uma visita. A coluna por anúncio usa os IDs presentes no link. O indicador de vendas por 100 visitas compara os totais de um período integralmente coberto pela coleta.</p>
      <section className="central-chart-panel">
        <div className="cv-toolbar"><h2>Desempenho por anúncio</h2>{sortOptions.length > 1 && <label className="cv-tracking-order">Ordenar por<select value={activeOrder} onChange={event => setOrderBy(event.target.value)}>
          {sortOptions.map(value => <option key={value} value={value}>{mediaOrders[value]}</option>)}
        </select></label>}</div>
        {report.meta.status === 'unavailable' && <p className="central-data-note">O relatório da Meta está indisponível nesta consulta. As vendas e os recibos da Central continuam disponíveis.</p>}
        {report.meta.status === 'unlinked' && <p className="central-data-note">A leitura de investimento e atribuição da Meta está vinculada à campanha do Desafio. Selecione o Desafio para consultar esses dados.</p>}
        <MediaTable rows={sortedRows} selected={group} select={selectGroup}/>
        <p className="central-data-note">O CPA Meta é o custo por compra atribuída. O ROAS Meta mostra quanto a Meta atribui em vendas para cada R$ 1 investido. O CPA da Central usa os pedidos com os IDs do anúncio. O valor após taxas e mídia desconta estornos integrais, taxas confirmadas e investimento.</p>
      </section>
      <section className="central-chart-panel">
        <div className="cv-toolbar"><h2>Vendas no período</h2>{group && <button className="cv-link" onClick={() => selectGroup(group)}>Ver todas as vendas</button>}</div>
        <SalesTable sales={group ? report.sales.filter(sale => sale.key === group) : report.sales} page={page} setPage={setPage}/>
      </section>
    </>}
  </main>
}
