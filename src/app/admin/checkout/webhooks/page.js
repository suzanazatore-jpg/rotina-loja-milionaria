'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { WEBHOOK_EVENTS } from '@/lib/checkoutWebhookSettings'
import './webhooks.css'

const empty = () => ({ name: '', url: '', events: ['order.paid'], product_ids: null, active: false })
const tabs = { cadastros: 'Webhooks', atividades: 'Atividades', recebimentos: 'Recebimentos Pagar.me', auditoria: 'Auditoria' }
const states = { pending: 'Na fila', processing: 'Processando', delivered: 'Entregue', failed: 'Falha', retry: 'Aguardando nova tentativa', skipped: 'Ignorado' }
const date = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
}
export default function Webhooks() {
  const [data, setData] = useState({ webhooks: [], products: [], rows: [], count: 0 })
  const [tab, setTab] = useState('cadastros')
  const [page, setPage] = useState(1)
  const [hook, setHook] = useState('')
  const [status, setStatus] = useState('todos')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const load = useCallback(async signal => {
    await Promise.resolve()
    if (signal.aborted) return
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({ tab, page: String(page), webhook_id: hook, status })
      const response = await fetch(`/api/admin/checkout/webhooks?${query}`, { headers: await headers(), cache: 'no-store', signal })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      if (!signal.aborted) setData(json)
    } catch (failure) { if (!signal.aborted) setError(failure.message) }
    finally { if (!signal.aborted) setLoading(false) }
  }, [tab, page, hook, status])
  useEffect(() => { const controller = new AbortController(); Promise.resolve().then(() => load(controller.signal)); return () => controller.abort() }, [load, refresh])
  async function mutate(input) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/checkout/webhooks', { method: 'POST', headers: await headers(), body: JSON.stringify(input) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      setEditor(null); setNotice(input.action === 'retry' ? 'Reenvio colocado na fila.' : 'Webhook salvo.'); setRefresh(value => value + 1)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  const edit = (field, value) => setEditor(current => ({ ...current, [field]: value }))
  const visible = data.webhooks.filter(row => (!hook || row.id === hook) && (status === 'todos' || (status === 'active' ? row.active : !row.active)) && row.name.toLowerCase().includes(search.toLowerCase()))
  return <main className="central-home">
    <div className="central-dashboard-heading"><div><span className="central-eyebrow">INTEGRAÇÕES</span><h1>Webhooks</h1><p>Gerencie os avisos de vendas e acompanhe cada envio.</p></div><button className="central-primary" disabled={busy} onClick={() => { setEditor(empty()); setError(''); setNotice('') }}>+ Adicionar webhook</button></div>
    <div className="webhook-tabs" role="group" aria-label="Seções de webhooks">{Object.entries(tabs).map(([key, label]) => <button key={key} className="central-action" aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); setStatus('todos'); setHook('') }}>{label}</button>)}</div>
    {error && <p className="central-editor-message" role="alert">{error}</p>}
    {notice && <p className="central-editor-message" role="status">{notice}</p>}
    {!loading && !data.delivery_enabled && <p className="central-data-note">Os envios externos estão pausados para configuração. Cadastros e histórico estão disponíveis.</p>}
    {editor && <section className="central-chart-panel webhook-editor" aria-labelledby="webhook-editor-title">
      <h2 id="webhook-editor-title">{editor.id ? 'Editar webhook' : 'Adicionar webhook'}</h2>
      <form onSubmit={event => { event.preventDefault(); mutate({ action: 'save', id: editor.id, dados: editor }) }}>
        <label>Nome<input className="central-inline-input" required maxLength={120} value={editor.name} onChange={event => edit('name', event.target.value)} placeholder="Ex.: BotConversa — Protocolo" /></label>
        <label>URL de destino<input className="central-inline-input" type="url" required maxLength={2048} value={editor.url} onChange={event => edit('url', event.target.value)} placeholder="https://" /></label>
        <fieldset><legend>Status e eventos que disparam o aviso</legend><div className="webhook-options">{Object.entries(WEBHOOK_EVENTS).map(([key, label]) => <label key={key}><input type="checkbox" checked={editor.events.includes(key)} onChange={event => edit('events', event.target.checked ? [...editor.events, key] : editor.events.filter(item => item !== key))} />{label}</label>)}</div></fieldset>
        <fieldset><legend>Filtrar por produto</legend><div className="webhook-options"><label><input type="radio" name="products" checked={editor.product_ids === null} onChange={() => edit('product_ids', null)} />Todos os produtos</label><label><input type="radio" name="products" checked={editor.product_ids !== null} onChange={() => edit('product_ids', [])} />Produtos específicos</label></div>
          {editor.product_ids !== null && <div className="webhook-options">{data.products.map(product => <label key={product.id}><input type="checkbox" checked={editor.product_ids.includes(product.id)} onChange={event => edit('product_ids', event.target.checked ? [...editor.product_ids, product.id] : editor.product_ids.filter(id => id !== product.id))} />{product.name}</label>)}{!data.products.length && <p>Cadastre os produtos em Produtos e Ofertas para usar este filtro.</p>}</div>}
        </fieldset>
        <label className="webhook-check"><input type="checkbox" checked={editor.active} onChange={event => edit('active', event.target.checked)} />Ativo</label>
        <div className="central-editor-actions"><button type="button" className="central-action" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="central-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar webhook'}</button></div>
      </form>
    </section>}
    <section className="central-chart-panel"><div className="central-section-heading"><h2>{tabs[tab]}</h2><button className="central-action" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Atualizar</button></div>
      {['cadastros', 'atividades'].includes(tab) && <div className="webhook-filters">
        {tab === 'cadastros' && <label>Buscar por nome<input className="central-inline-input" value={search} onChange={event => setSearch(event.target.value)} /></label>}
        <label>Webhook<select className="central-inline-input" value={hook} onChange={event => { setHook(event.target.value); setPage(1) }}><option value="">Todos</option>{data.webhooks.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Status<select className="central-inline-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="todos">Todos</option>{Object.entries(tab === 'cadastros' ? { active: 'Ativo', inactive: 'Inativo' } : states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>}
      <div className="central-table-wrap" aria-busy={loading}><table className="central-table">
        <thead><tr>{(tab === 'cadastros' ? ['Nome / destino', 'Eventos', 'Produtos', 'Status', 'Ações'] : tab === 'atividades' ? ['Webhook / evento', 'Status', 'Tentativas / HTTP', 'Datas', 'Ações'] : tab === 'auditoria' ? ['Data', 'Ação', 'Identificador', 'Resultado'] : ['Evento', 'Recebido em', 'Processado em', 'Resultado']).map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{!loading && tab === 'cadastros' && visible.map(row => <tr key={row.id}><td>{row.name}<small className="webhook-url">{row.url}</small></td><td>{row.events.map(event => WEBHOOK_EVENTS[event] || event).join(', ')}</td><td>{row.product_ids === null ? 'Todos' : row.product_ids.map(id => data.products.find(item => item.id === id)?.name || 'Produto indisponível').join(', ')}</td><td><span className="central-badge">{row.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="webhook-actions"><button className="central-action" disabled={busy} onClick={() => setEditor({ ...row, product_ids: row.product_ids ?? null })}>Editar</button><button className="central-action" role="switch" aria-checked={row.active} aria-label={`${row.active ? 'Desativar' : 'Ativar'} ${row.name}`} disabled={busy} onClick={() => mutate({ action: 'toggle', id: row.id, active: !row.active })}>{row.active ? 'Desativar' : 'Ativar'}</button><button className="central-action" onClick={() => { setTab('atividades'); setHook(row.id); setPage(1); setStatus('todos') }}>Atividades</button></div></td></tr>)}
        {!loading && tab !== 'cadastros' && data.rows.map(row => <tr key={row.id}>{tab === 'atividades' ? <><td>{data.webhooks.find(item => item.id === row.webhook_id)?.name || 'Webhook'}<small>{WEBHOOK_EVENTS[row.event_type] || row.event_type}</small></td><td><span className="central-badge">{states[row.status] || row.status}</span></td><td>{row.attempts} / {row.response_status || '—'}</td><td>{date(row.created_at)}<small>{row.delivered_at ? `Entregue: ${date(row.delivered_at)}` : `Próxima tentativa: ${date(row.next_attempt_at)}`}</small></td><td>{['failed', 'retry'].includes(row.status) && <button className="central-action" disabled={busy} onClick={() => mutate({ action: 'retry', id: row.id })}>Solicitar reenvio</button>}</td></> : tab === 'auditoria' ? <><td>{date(row.received_at)}</td><td>{({ save: 'Cadastro / edição', toggle: 'Alteração de status', retry: 'Reenvio solicitado' })[row.payload?.action] || 'Atualização'}<small>{row.payload?.name}</small></td><td>{row.payload?.target_id || '—'}</td><td>{row.processed_at ? 'Concluído' : row.error === 'processing' ? 'Em processamento / verificar' : 'Não concluído'}</td></> : <><td>{row.type}<small>{row.pagarme_event_id}</small></td><td>{date(row.received_at)}</td><td>{date(row.processed_at)}</td><td>{row.processed_at ? 'Conciliado' : row.error ? 'Aguardando conciliação' : 'Recebido'}</td></>}</tr>)}
        {(loading || !(tab === 'cadastros' ? visible : data.rows).length) && <tr><td colSpan={5}>{loading ? 'Carregando…' : 'Nenhum registro encontrado.'}</td></tr>}
        </tbody></table></div>
      {tab !== 'cadastros' && <div className="central-editor-actions"><span>{data.count} registros</span><button className="central-action" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button className="central-action" disabled={loading || page * 25 >= data.count} onClick={() => setPage(value => value + 1)}>Próxima</button></div>}
    </section>
  </main>
}
