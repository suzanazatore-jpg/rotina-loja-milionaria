'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { WEBHOOK_EVENTS } from '@/lib/checkoutWebhookSettings'
import { CreateDialog, Switch, WebhookForm } from './WebhookForm'
import './webhooks.css'
const sections = { detalhe: 'Detalhe', atividades: 'Atividades', auditoria: 'Auditoria' }
const states = { pending: 'Na fila', processing: 'Processando', delivered: 'Entregue', failed: 'Falha', retry: 'Aguardando nova tentativa', skipped: 'Ignorado' }
const date = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const inCategory = (row, category) => row.events.some(event => category === 'assinaturas' ? event.startsWith('subscription.') : !event.startsWith('subscription.'))
async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
}
export default function Webhooks() {
  const [data, setData] = useState({ webhooks: [], products: [], rows: [], count: 0 })
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('detalhe')
  const [category, setCategory] = useState('vendas')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('todos')
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [receipts, setReceipts] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const hookId = selected?.id || ''
  const load = useCallback(async signal => {
    if (signal.aborted) return
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({ tab: receipts ? 'recebimentos' : hookId && tab !== 'detalhe' ? tab : 'cadastros', page: String(page), webhook_id: hookId, status: hookId && tab === 'atividades' ? status : 'todos' })
      const response = await fetch(`/api/admin/checkout/webhooks?${query}`, { headers: await headers(), cache: 'no-store', signal })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      if (!signal.aborted) setData(json)
    } catch (failure) { if (!signal.aborted) setError(failure.message) }
    finally { if (!signal.aborted) setLoading(false) }
  }, [hookId, tab, page, status, receipts])
  useEffect(() => { const controller = new AbortController(); Promise.resolve().then(() => load(controller.signal)); return () => controller.abort() }, [load, refresh])
  function back() { setSelected(null); setTab('detalhe'); setPage(1); setStatus('todos'); setError(''); setNotice(''); setReceipts(false) }
  function open(row) { setSelected({ ...row, product_ids: row.product_ids ?? null }); setTab('detalhe'); setPage(1); setStatus('todos'); setError(''); setNotice('') }
  async function mutate(input, draft = null) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/checkout/webhooks', { method: 'POST', headers: await headers(), body: JSON.stringify(input) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      if (draft) { setSelected({ ...draft, id: json.id }); setCreating(false); setTab('detalhe'); setPage(1) }
      setNotice(input.action === 'retry' ? 'Reenvio colocado na fila.' : 'Webhook salvo.'); setRefresh(value => value + 1)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  const categoryRows = data.webhooks.filter(row => inCategory(row, category))
  const rows = categoryRows.filter(row => (status === 'todos' || row.active === (status === 'active')) && row.name.toLowerCase().includes(search.toLowerCase()) && (!product || row.product_ids === null || row.product_ids.includes(product)))
  const stored = data.webhooks.find(row => row.id === hookId)
  const history = Boolean(selected && tab !== 'detalhe' || receipts)
  return <main className="central-home webhook-page">
    <div className="webhook-breadcrumb"><span>Início</span><span>/</span><span>Configurações</span><span>/</span>{selected || receipts ? <button disabled={busy} onClick={back}>Webhooks</button> : <strong>Webhooks</strong>}{selected && <><span>/</span><span>{selected.name}</span></>}{receipts && <><span>/</span><span>Recebimentos Pagar.me</span></>}</div>
    {(selected || receipts) && <button className="webhook-back" disabled={busy} onClick={back}>← Voltar</button>}
    {!selected && !receipts && <><div className="webhook-heading"><h1>Webhooks</h1></div><div className="webhook-tabs" role="group" aria-label="Tipos de webhook">{[['assinaturas', 'Assinaturas'], ['vendas', 'Vendas']].map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setStatus('todos'); setPage(1) }}>{label}</button>)}</div><div className="webhook-add-bar"><button onClick={() => { setCreating(true); setError(''); setNotice('') }}>+ Adicionar Webhook</button></div></>}
    {selected && <div className="webhook-tabs" role="group" aria-label="Seções do webhook">{Object.entries(sections).map(([key, label]) => <button key={key} aria-pressed={tab === key} disabled={busy} onClick={() => { setTab(key); setPage(1); setStatus('todos'); setError(''); setNotice('') }}>{label}</button>)}</div>}
    {!creating && error && <p className="central-editor-message" role="alert">{error}</p>}{notice && <p className="central-editor-message" role="status">{notice}</p>}
    <section className={`webhook-panel ${selected && tab === 'detalhe' ? 'webhook-detail-panel' : ''}`}>
      <div className="webhook-section-heading"><h2>{receipts ? 'Recebimentos Pagar.me' : selected ? sections[tab] : category === 'vendas' ? 'Vendas' : 'Assinaturas'}</h2>{(!selected && !receipts || selected && tab === 'atividades') && <button className="central-action" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>▽ Filtros</button>}</div>
      {!loading && !data.delivery_enabled && <p className="webhook-paused">Envios pausados durante a configuração.</p>}
      {!selected && !receipts && <><small className="webhook-count">{rows.length} de {categoryRows.length}</small>
        {filtersOpen && <div className="webhook-filters"><label>Nome<input value={search} onChange={event => setSearch(event.target.value)} /></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="todos">Todos</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label><label>Produto<select value={product} onChange={event => setProduct(event.target.value)}><option value="">Todos</option>{data.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
        <div className="central-table-wrap"><table className="central-table webhook-list"><thead><tr><th>Nome</th><th>URL</th><th><span className="webhook-sr-only">Atividades</span></th><th><span className="webhook-sr-only">Ativo</span></th></tr></thead><tbody>{!loading && rows.map(row => <tr key={row.id}><td><button className="webhook-name" onClick={() => open(row)}>{row.name}</button></td><td><span className="webhook-list-url" title={row.url}>{row.url}</span></td><td><button className="webhook-history-button" aria-label={`Atividades de ${row.name}`} onClick={() => { open(row); setTab('atividades') }}>◷</button></td><td><Switch checked={row.active} disabled={busy} label={`${row.active ? 'Desativar' : 'Ativar'} ${row.name}`} onChange={active => mutate({ action: 'toggle', id: row.id, active })} /></td></tr>)}{(loading || !rows.length) && <tr><td colSpan={4}>{loading ? 'Carregando…' : 'Nenhum webhook encontrado.'}</td></tr>}</tbody></table></div>
      </>}
      {selected && tab === 'detalhe' && <><p className="webhook-info">O aviso será enviado quando a venda atingir um dos status selecionados. Cada envio tem um identificador para reconhecer novas tentativas e evitar ações duplicadas no destino.</p><WebhookForm value={selected} products={data.products} busy={busy} onChange={setSelected} onSubmit={() => mutate({ action: 'save', id: selected.id, dados: selected }, selected)} onCancel={back} dates={{ created: date(stored?.created_at), updated: date(data.updated_at || stored?.created_at) }} /></>}
      {history && <>
        {selected && tab === 'atividades' && filtersOpen && <div className="webhook-filters"><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="todos">Todos</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
        <div className="central-table-wrap" aria-busy={loading}><table className="central-table"><thead><tr>{(receipts ? ['Evento', 'Recebido em', 'Processado em', 'Resultado'] : tab === 'auditoria' ? ['Data', 'Ação', 'Resultado'] : ['Evento', 'Status', 'Tentativas / HTTP', 'Datas', 'Ações']).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{!loading && data.rows.map(row => <tr key={row.id}>{receipts ? <><td>{row.type}<small>{row.pagarme_event_id}</small></td><td>{date(row.received_at)}</td><td>{date(row.processed_at)}</td><td>{row.processed_at ? 'Conciliado' : row.error ? 'Aguardando conciliação' : 'Recebido'}</td></> : tab === 'auditoria' ? <><td>{date(row.received_at)}</td><td>{({ save: 'Cadastro / edição', toggle: 'Alteração de status', retry: 'Reenvio solicitado' })[row.payload?.action] || 'Atualização'}</td><td>{row.processed_at ? 'Concluído' : row.error === 'processing' ? 'Em processamento / verificar' : 'Não concluído'}</td></> : <><td>{WEBHOOK_EVENTS[row.event_type] || row.event_type}</td><td><span className="central-badge">{states[row.status] || row.status}</span></td><td>{row.attempts} / {row.response_status || '—'}</td><td>{date(row.created_at)}<small>{row.delivered_at ? `Entregue: ${date(row.delivered_at)}` : `Próxima tentativa: ${date(row.next_attempt_at)}`}</small></td><td>{['failed', 'retry'].includes(row.status) && <button className="central-action" disabled={busy} onClick={() => mutate({ action: 'retry', id: row.id })}>Solicitar reenvio</button>}</td></>}</tr>)}{(loading || !data.rows.length) && <tr><td colSpan={5}>{loading ? 'Carregando…' : 'Nenhum registro encontrado.'}</td></tr>}</tbody></table></div>
        <div className="webhook-pagination"><span>{data.count} registros</span><button className="central-action" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button className="central-action" disabled={loading || page * 25 >= data.count} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
      </>}
    </section>
    <div className="webhook-bottom-actions"><button disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Atualizar</button>{!selected && !receipts && <button onClick={() => { setReceipts(true); setPage(1); setStatus('todos') }}>Recebimentos Pagar.me →</button>}</div>
    {creating && <CreateDialog products={data.products} busy={busy} error={error} onClose={() => { setCreating(false); setError('') }} onSave={draft => mutate({ action: 'save', dados: draft }, draft)} />}
  </main>
}
