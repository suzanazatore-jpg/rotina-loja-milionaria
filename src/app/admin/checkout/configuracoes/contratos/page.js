'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../../ContractFields.module.css'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STATUS = { pending: 'Enviado', viewed: 'Visualizado', signed: 'Assinado', canceled: 'Cancelado' }
const ACCESS = { completed: 'Liberado', awaiting_signature: 'Aguardando assinatura', not_gated: 'Liberado no pagamento', retry: 'Falhou — liberar', awaiting_contract: 'Aguardando assinatura', disabled: 'Liberação desligada' }
const EVENTS = { created: 'Contrato gerado', sent: 'Link enviado', reminder_sent: 'Lembrete enviado', viewed: 'Visualizado', otp_sent: 'Código enviado', otp_failed: 'Código incorreto', document_mismatch: 'CPF divergente', signed: 'Assinado', pdf_generated: 'PDF gerado', pdf_failed: 'Falha no PDF', signed_copy_sent: 'Cópia enviada', access_released: 'Acesso liberado', access_failed: 'Falha ao liberar acesso', canceled: 'Cancelado' }
const when = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function ContratosPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('contratos')
  const [filter, setFilter] = useState('')
  const [message, setMessage] = useState('')
  const [events, setEvents] = useState(null)
  const [draft, setDraft] = useState({})

  const load = useCallback(async (auth = token, status = filter) => {
    const r = await fetch(`/api/admin/contratos${status ? `?status=${status}` : ''}`, { headers: { Authorization: `Bearer ${auth}` }, cache: 'no-store' })
    const body = await r.json()
    if (!r.ok) { setMessage(body.error); return }
    setData(body)
    setDraft(Object.fromEntries(body.templates.map(t => [t.slug, { name: t.name, body: t.body }])))
  }, [token, filter])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setToken(session.access_token); load(session.access_token, '')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(payload, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setMessage('Processando…')
    const r = await fetch('/api/admin/contratos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    const body = await r.json()
    setMessage(r.ok ? '✓ Feito.' : body.error)
    if (r.ok) load()
  }
  async function openPdf(id) {
    const r = await fetch(`/api/admin/contratos?pdf=${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const body = await r.json()
    if (r.ok) window.open(body.url, '_blank', 'noopener'); else setMessage(body.error)
  }
  async function showEvents(c) {
    const r = await fetch(`/api/admin/contratos?eventos=${c.id}`, { headers: { Authorization: `Bearer ${token}` } })
    const body = await r.json()
    setEvents({ contract: c, list: body.eventos || [] })
  }

  if (!data) return <main className="central-home"><p role="status" className="central-access">{message || 'Carregando contratos…'}</p></main>
  return <main className="central-home">
    <div className="central-breadcrumb"><Link href="/admin/checkout/configuracoes">Configurações</Link><span>/</span><strong>Contratos</strong></div>
    <div className="central-dashboard-heading"><div><span className="central-eyebrow">CONTRATOS</span><h1>Contratos e assinaturas</h1><p>{data.enabled ? 'Módulo ativo: compras de ofertas com contrato aguardam a assinatura para liberar o acesso.' : 'Envio automático desativado. Você já pode revisar e editar os modelos de contrato.'}</p></div></div>
    <nav className="central-product-tabs">{[['contratos', 'Contratos'], ['modelos', 'Modelos']].map(([k, l]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}</button>)}</nav>
    {message && <p role="status" className="central-editor-message">{message}</p>}

    {tab === 'contratos' && <section className="central-chart-panel">
      <div className="central-section-heading"><h2>Contratos</h2>
        <select value={filter} onChange={e => { setFilter(e.target.value); load(token, e.target.value) }}><option value="">Todos</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="central-table-wrap"><table className="central-table"><thead><tr><th>Cliente</th><th>Oferta</th><th>Valor / prazo</th><th>Status</th><th>Acesso</th><th>Datas</th><th /></tr></thead><tbody>
        {data.contracts.map(c => <tr key={c.id}>
          <td>{c.customer?.name}<small>{c.customer?.email}</small><small>{c.customer?.phone}</small></td>
          <td>{c.offer}<small>Pedido {c.fields?.pedido}</small></td>
          <td>{c.fields?.valor_total}<small>{c.fields?.prazo}</small></td>
          <td><span className="central-badge">{STATUS[c.status]}</span>{c.reminders_sent > 0 && <small>{c.reminders_sent} lembrete(s)</small>}</td>
          <td>{ACCESS[c.fulfillment_status] || c.fulfillment_status || '—'}</td>
          <td><small>Criado {when(c.created_at)}</small><small>Assinado {when(c.signed_at)}</small></td>
          <td>
            <button type="button" className="central-action" onClick={() => showEvents(c)}>Histórico</button>
            {c.link && <button type="button" className="central-action" onClick={async () => { try { await navigator.clipboard.writeText(c.link); setMessage('✓ Link copiado.') } catch { setMessage(c.link) } }}>Copiar link</button>}
            {c.link && <button type="button" className="central-action" onClick={() => act({ action: 'resend', id: c.id })}>Reenviar</button>}
            {c.has_pdf && <button type="button" className="central-action" onClick={() => openPdf(c.id)}>PDF</button>}
            {c.status === 'signed' && !c.has_pdf && <button type="button" className="central-action" onClick={() => act({ action: 'regenerate_pdf', id: c.id, send_copy: true })}>Gerar PDF</button>}
            {c.status === 'signed' && c.fulfillment_status !== 'completed' && <button type="button" className="central-action" onClick={() => act({ action: 'release_access', id: c.id })}>Liberar acesso</button>}
            {c.link && <button type="button" className="central-action" onClick={() => act({ action: 'cancel', id: c.id }, 'Cancelar este contrato? O link deixa de funcionar e o acesso não será liberado.')}>Cancelar</button>}
          </td>
        </tr>)}
        {!data.contracts.length && <tr><td colSpan={7}>Nenhum contrato ainda.</td></tr>}
      </tbody></table></div>
      {events && <div className="central-chart-panel"><div className="central-section-heading"><h2>Histórico — {events.contract.customer?.name}</h2><button type="button" className="central-action" onClick={() => setEvents(null)}>Fechar</button></div>
        <ul>{events.list.map((e, i) => <li key={i}>{when(e.created_at)} — {EVENTS[e.type] || e.type}{e.channel ? ` (${e.channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'})` : ''}{e.detail?.status && e.detail.status !== 'sent' ? ` — ${e.detail.status}` : ''}{e.ip ? ` · IP ${e.ip}` : ''}</li>)}</ul>
      </div>}
    </section>}

    {tab === 'modelos' && data.templates.map(t => <section key={t.slug} className="central-chart-panel">
      <div className="central-section-heading"><h2>{t.name}</h2><small>Versão {t.version} · atualizado {when(t.updated_at)}</small></div>
      <div className={styles.fields}>
        <label>Nome<input value={draft[t.slug]?.name || ''} onChange={e => setDraft({ ...draft, [t.slug]: { ...draft[t.slug], name: e.target.value } })} /></label>
        <label>Texto do contrato<textarea rows={22} value={draft[t.slug]?.body || ''} onChange={e => setDraft({ ...draft, [t.slug]: { ...draft[t.slug], body: e.target.value } })} /></label>
      </div>
      <p className="central-data-note">Use <code># Título</code> e <code>## Cláusula</code> para títulos. Campos automáticos: {data.fields.map(f => <code key={f} style={{ marginRight: 6 }}>{`{${f}}`}</code>)}</p>
      <button type="button" className="central-primary" onClick={() => act({ action: 'save_template', slug: t.slug, ...draft[t.slug] })}>Salvar nova versão</button>
    </section>)}
  </main>
}
