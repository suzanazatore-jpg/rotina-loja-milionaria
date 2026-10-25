'use client'
import ExportButton from '../ExportButton'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const statuses = { active: 'Ativa', past_due: 'Pagamento atrasado', canceled: 'Cancelada', expired: 'Expirada' }
const date = value => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
export default function Subscriptions() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [filter, setFilter] = useState('all')
  async function headers() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await fetch('/api/admin/checkout/assinaturas', { headers: await headers(), cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error)
        if (active) setRows(json.subscriptions || [])
      } catch (failure) { if (active) setError(failure.message) }
      finally { if (active) setLoading(false) }
    }
    load(); return () => { active = false }
  }, [])
  async function change(row, action) {
    setPending(row.id); setError('')
    try {
      const response = await fetch('/api/admin/checkout/assinaturas', { method: 'POST', headers: await headers(), body: JSON.stringify({ id: row.id, action }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...json.subscription } : item))
      setConfirmation(null)
    } catch (failure) { setError(failure.message) }
    finally { setPending('') }
  }
  const visible = rows.filter(row => filter === 'all' || row.status === filter)
  return <main className="central-home"><div className="central-dashboard-heading"><div><span className="central-eyebrow">RECORRÊNCIA</span><h1>Assinaturas</h1><p>Acompanhe as cobranças recorrentes do checkout próprio.</p></div><ExportButton section="assinaturas" filters={{status:filter}}/></div>
    {error && <p role="alert" className="central-editor-message">{error}</p>}
    {confirmation && <section className="central-chart-panel" role="dialog" aria-modal="false" aria-labelledby="cancel-subscription-title"><h2 id="cancel-subscription-title">Cancelar a assinatura de {confirmation.customer?.name || 'esta cliente'}?</h2><p>O cancelamento interrompe as próximas cobranças. O período de acesso já comprado será mantido.</p><p>Oferta: {confirmation.offer_name || '—'}</p><button className="central-action" disabled={Boolean(pending)} onClick={() => setConfirmation(null)}>Voltar</button>{' '}<button className="central-primary" disabled={Boolean(pending)} onClick={() => change(confirmation, 'cancel')}>{pending ? 'Cancelando…' : 'Confirmar cancelamento'}</button></section>}
    <section className="central-chart-panel"><div className="central-section-heading"><h2>Assinaturas cadastradas</h2><label>Status <select value={filter} onChange={event => setFilter(event.target.value)} style={{ padding: 8, borderRadius: 6, background: 'var(--cv-field)', color: 'var(--cv-text)' }}><option value="all">Todos</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className="central-table-wrap"><table className="central-table"><thead><tr><th>Cliente</th><th>Oferta</th><th>Status</th><th>Fim do ciclo</th><th>Criada em</th><th>Ações</th></tr></thead><tbody>
      {visible.map(row => <tr key={row.id}><td>{row.customer?.name || '—'}<small>{row.customer?.email}</small></td><td>{row.offer_name || '—'}</td><td><span className="central-badge">{statuses[row.status] || row.status}</span></td><td>{date(row.current_period_end)}</td><td>{date(row.created_at)}</td><td><button className="central-action" disabled={Boolean(pending)} onClick={() => change(row, 'sync')}>{pending === row.id ? 'Atualizando…' : 'Atualizar status'}</button>{' '}{row.status !== 'canceled' && <button className="central-action" disabled={Boolean(pending)} onClick={() => setConfirmation(row)}>Cancelar</button>}{row.origin_order_id && <Link className="central-action" href={`/admin/checkout/vendas?id=${row.origin_order_id}`}>Pedido</Link>}</td></tr>)}
      {!visible.length && <tr><td colSpan={6}>{loading ? 'Carregando assinaturas…' : 'Nenhuma assinatura encontrada.'}</td></tr>}
    </tbody></table></div><p className="central-data-note">Exibe as 100 assinaturas mais recentes. O status financeiro vem do Pagar.me.</p></section>
  </main>
}
