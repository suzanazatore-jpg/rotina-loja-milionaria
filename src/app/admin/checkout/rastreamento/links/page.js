'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AppIcon from '@/app/admin/central-vendas/CentralIcon'
import { checkoutUtmFields, funnelGroups } from '@/lib/checkoutFunnel'
import { supabase } from '@/lib/supabase'
import { money } from '../../CentralUI'
import '../tracking.css'
import './links.css'

const endpoint = '/api/admin/checkout/rastreamento/links'
const count = value => value.toLocaleString('pt-BR')
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const conversion = row => row.visits ? percent.format(row.converted / row.visits) : '—'
const models = { official: 'Checkout padrão', compact: 'Checkout 2', focused: 'Checkout focado', guru: 'Checkout com resumo' }
const missing = { link: 'Sem link gerado', source: 'Direta ou não identificada', campaign: 'Sem campanha', creative: 'Sem criativo' }
const initialFilters = { inicio: '', fim: '', oferta: '', link: '', grupo: 'link', pagina: 1 }

async function request(query, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(query ? endpoint + '?' + query : endpoint, {
    ...options,
    headers: { Authorization: `Bearer ${session?.access_token || ''}`, ...options.headers },
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.')
  return data
}

function OfferOptions({ offers }) {
  return offers.map(offer => <option key={offer.id} value={offer.id}>{offer.product.name} · {offer.name}</option>)
}

function Metrics({ report, changePage }) {
  const { totals, rows, group, page, groupCount } = report
  const cards = [
    ['Visitas', count(totals.visits), 'users'],
    ['Visitantes únicos', count(totals.visitors), 'customers'],
    ['Abandonos', count(totals.abandoned), 'clock'],
    ['Vendas aprovadas', count(totals.sales), 'cart'],
    ['Faturamento', money(totals.gross), 'money'],
    ['Conversão', conversion(totals), 'dashboard'],
  ]
  const pages = Math.ceil(groupCount / 25)
  return <>
    <div className="central-metrics">{cards.map(([title, value, icon]) => <article key={title}>
      <span>{title}</span><i className="cv-metric-icon"><AppIcon name={icon} size={17} /></i><strong>{value}</strong>
    </article>)}</div>
    <section className="central-chart-panel">
      <h2>Desempenho por {funnelGroups[group].toLowerCase()}</h2>
      <div className="cv-table-wrap"><table className="cv-table">
        <thead><tr><th>{funnelGroups[group]}</th><th>Visitas</th><th>Visitantes únicos</th><th>Inícios</th><th>Abandonos</th><th>Vendas</th><th>Faturamento</th><th>Conversão</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key ?? 'missing'}>
          <td>{row.label || (group === 'model' ? models[row.key] : row.key) || missing[group] || 'Não identificado'}</td>
          <td>{count(row.visits)}</td><td>{count(row.visitors)}</td><td>{count(row.starts)}</td>
          <td>{count(row.abandoned)}</td><td>{count(row.sales)}</td><td>{money(row.gross)}</td><td>{conversion(row)}</td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p className="central-data-note">Nenhuma visita registrada com esses filtros.</p>}
      {pages > 1 && <div className="cv-toolbar">
        <span>Página {page} de {pages}</span><div className="cv-actions">
          <button className="central-action" disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</button>
          <button className="central-action" disabled={page >= pages} onClick={() => changePage(page + 1)}>Próxima</button>
        </div>
      </div>}
      <p className="central-data-note">A data é a da visita. Pagamentos aprovados depois atualizam a visita de origem. O faturamento soma os pedidos atualmente aprovados. A conversão divide visitas com venda por visitas totais.</p>
      <p className="central-data-note">Um abandono é um preenchimento iniciado há pelo menos 24 horas sem pagamento aprovado. Visitantes únicos são navegadores identificados pela medição do checkout.</p>
    </section>
  </>
}

export default function TrackableLinksPage() {
  const [offers, setOffers] = useState([])
  const [links, setLinks] = useState([])
  const [created, setCreated] = useState(null)
  const [fullAddress, setFullAddress] = useState(false)
  const [error, setError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [report, setReport] = useState(null)
  const [reportError, setReportError] = useState('')
  const [reportLoading, setReportLoading] = useState(true)
  const [filters, setFilters] = useState(initialFilters)
  const [refresh, setRefresh] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    request('catalogo=1', { signal: controller.signal }).then(data => {
      setOffers(data.offers)
      setLinks(data.links)
      setCatalogError('')
    }).catch(cause => { if (!controller.signal.aborted) setCatalogError(cause.message) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setReportLoading(true)
      setReportError('')
      try {
        const data = await request(new URLSearchParams(filters), { signal: controller.signal })
        if (!controller.signal.aborted) setReport(data)
      } catch (cause) {
        if (!controller.signal.aborted) { setReport(null); setReportError(cause.message) }
      } finally {
        if (!controller.signal.aborted) setReportLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [filters, refresh])

  function filter(field, value) {
    setFilters(current => ({ ...current, pagina: 1, [field]: value }))
  }

  async function create(event) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const input = Object.fromEntries(new FormData(form))
    setError('')
    setFormMessage('')
    setSaving(true)
    try {
      const { link } = await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      setCreated(link)
      setFullAddress(false)
      setLinks(current => [link, ...current.filter(item => item.id !== link.id)])
      setHistoryPage(0)
      form.reset()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  async function copy(link, full = false) {
    try {
      await navigator.clipboard.writeText(full ? link.url : link.shortUrl)
      setFormMessage(`Link ${full ? 'com UTMs' : 'curto'} de «${link.name}» copiado.`)
    } catch {
      setCreated(link)
      setFullAddress(full)
      setFormMessage('Selecione o endereço para copiar.')
    }
  }

  return <main className="central-home cv-tracking cv-trackable-links">
    <header className="cv-heading"><h1>Gerador de Links Rastreáveis</h1>
      <div className="cv-actions">
        <Link className="central-action" href="/admin/checkout/rastreamento"><AppIcon name="arrowLeft" size={15} />Rastreamento</Link>
        <button className="central-action" onClick={() => setRefresh(value => value + 1)}><AppIcon name="refresh" size={15} />Atualizar</button>
      </div>
    </header>

    <section className="central-chart-panel">
      <h2>Novo link</h2>
      <form onSubmit={create}>
        <div className="cv-trackable-fields">
          <label>Nome do link<input name="name" maxLength={100} required /></label>
          <label>Oferta<select name="offer_id" defaultValue="" required><option value="" disabled>Selecione uma oferta ativa</option><OfferOptions offers={offers} /></select></label>
          {Object.entries(checkoutUtmFields).map(([key, label]) => <label key={key}>{label}
            <input name={key} maxLength={100} required={key === 'utm_source'} />
          </label>)}
        </div>
        <div className="cv-actions"><button className="central-primary" disabled={saving || !offers.length}>{saving ? 'Gerando…' : 'Gerar link'}</button></div>
      </form>
      {catalogError && <p className="central-error" role="alert">{catalogError}</p>}
      {error && <p className="central-error" role="alert">{error}</p>}
      {created && <>
        <div className="cv-trackable-result">
          <label>Link curto de {created.name}<input readOnly value={created.shortUrl} onFocus={event => event.target.select()} /></label>
          <button className="central-action" type="button" onClick={() => copy(created)}>Copiar link curto</button>
        </div>
        <button className="cv-link cv-trackable-full" type="button" aria-expanded={fullAddress} onClick={() => setFullAddress(current => !current)}>
          {fullAddress ? 'Ocultar link com UTMs' : 'Ver link com UTMs'}
        </button>
        {fullAddress && <div className="cv-trackable-result">
          <label>Link com UTMs de {created.name}<input readOnly value={created.url} onFocus={event => event.target.select()} /></label>
          <button className="central-action" type="button" onClick={() => copy(created, true)}>Copiar link com UTMs</button>
        </div>}
      </>}
      {formMessage && <p className="central-data-note" role="status">{formMessage}</p>}
    </section>

    <section className="central-chart-panel">
      <h2>Links salvos</h2>
      {links.length ? <>
        <div className="cv-table-wrap"><table className="cv-table">
          <thead><tr><th>Link</th><th>Origem</th><th>Campanha</th><th>Criativo</th><th>Ações</th></tr></thead>
          <tbody>{links.slice(historyPage * 10, historyPage * 10 + 10).map(link => <tr key={link.id}>
            <td><strong>{link.name}</strong><br /><small>{offers.find(offer => offer.id === link.offer_id)?.name || 'Oferta indisponível'}</small></td>
            <td>{link.utm_source}</td><td>{link.utm_campaign || '—'}</td><td>{link.utm_content || '—'}</td>
            <td><div className="cv-actions">
              <button type="button" className="central-action" aria-label={`Copiar link curto de ${link.name}`} onClick={() => copy(link)}>Copiar link curto</button>
              <button type="button" className="central-action" aria-label={`Copiar link com UTMs de ${link.name}`} onClick={() => copy(link, true)}>Copiar com UTMs</button>
              <button type="button" className="central-action" aria-label={`Ver métricas de ${link.name}`} onClick={() => {
                setFilters(current => ({ ...current, oferta: '', link: link.id, pagina: 1 }))
                document.getElementById('metricas-links')?.scrollIntoView()
              }}>Ver métricas</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {links.length > 10 && <div className="cv-toolbar">
          <span>Página {historyPage + 1} de {Math.ceil(links.length / 10)}</span>
          <div className="cv-actions">
            <button className="central-action" disabled={historyPage === 0} onClick={() => setHistoryPage(value => value - 1)}>Anterior</button>
            <button className="central-action" disabled={(historyPage + 1) * 10 >= links.length} onClick={() => setHistoryPage(value => value + 1)}>Próxima</button>
          </div>
        </div>}
      </> : <p className="central-data-note">Os links gerados aparecem aqui.</p>}
    </section>

    <section id="metricas-links" className="central-chart-panel">
      <h2>Métricas do checkout</h2>
      <div className="cv-trackable-fields">
        <label>De<input type="date" value={filters.inicio || report?.from || ''} onChange={event => filter('inicio', event.target.value)} /></label>
        <label>Até<input type="date" value={filters.fim || report?.to || ''} onChange={event => filter('fim', event.target.value)} /></label>
        <label>Agrupar por<select value={filters.grupo} onChange={event => filter('grupo', event.target.value)}>
          {Object.entries(funnelGroups).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Oferta<select value={filters.oferta} onChange={event => filter('oferta', event.target.value)}>
          <option value="">Todas as ofertas</option><OfferOptions offers={offers} />
        </select></label>
        <label>Link<select value={filters.link} onChange={event => filter('link', event.target.value)}>
          <option value="">Todos os acessos</option>{links.map(link => <option key={link.id} value={link.id}>{link.name}</option>)}
        </select></label>
      </div>
    </section>
    {reportLoading && <p role="status">Atualizando métricas…</p>}
    {reportError && <p className="central-error" role="alert">{reportError}</p>}
    {report && <Metrics report={report} changePage={page => filter('pagina', page)} />}
  </main>
}
