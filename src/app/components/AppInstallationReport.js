'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './AppInstallationReport.module.css'

async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
}
export default function InstallationReport({ cores }) {
  const [data, setData] = useState({ rows: [], email_enabled: false })
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const response = await fetch('/api/admin/checkout/app-instalacao', { headers: await headers(), signal: controller.signal })
        const json = await response.json()
        if (!response.ok) throw Error(json.error)
        setData(json)
      } catch (e) { if (!controller.signal.aborted) setError(e.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [refresh])
  async function remind(row) {
    setBusy(row.id); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/checkout/app-instalacao', { method: 'POST', headers: await headers(), body: JSON.stringify({ user_id: row.id }) })
      const json = await response.json()
      if (!response.ok) throw Error(json.error)
      setMessage(`Lembrete para ${row.name}: ${json.message}`)
      setRefresh(value => value + 1)
    } catch (e) { setError(e.message) }
    finally { setBusy('') }
  }
  const confirmed = data.rows.filter(row => row.confirmed_at).length
  const filtered = data.rows.filter(row => (status === 'all' || Boolean(row.confirmed_at) === (status === 'confirmed')) && `${row.name} ${row.email} ${row.phone}`.toLowerCase().includes(search.toLowerCase()))
  const visible = filtered.slice((page - 1) * 30, page * 30)
  return <div className={styles.report} style={cores ? { '--report-card': cores.card, '--report-bg': cores.card2, '--report-text': cores.tx, '--report-border': cores.borda } : undefined}>
    <div className="central-page-heading"><div><h1>Instalação do aplicativo</h1><p>Acompanhe os alunos ativos e ajude quem ainda precisa instalar.</p></div><button className="central-action" disabled={loading} onClick={() => setRefresh(value => value + 1)}>↻ Atualizar</button></div>
    <section className="central-chart-panel"><h2>{data.rows.length - confirmed} instalações não confirmadas</h2><p>{confirmed} confirmadas · {data.rows.length} alunos ativos</p><p>O registro é confirmado quando o aluno abre o app instalado ou conclui a instalação. Alunos que instalaram antes deste acompanhamento precisam abrir o app novamente. Notificações ativas são mostradas separadamente.</p></section>
    <div className="cv-actions" style={{ margin: '20px 0', gap: 12, flexWrap: 'wrap' }}><label>Exibir <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="pending">Instalação não confirmada</option><option value="confirmed">Instalação confirmada</option><option value="all">Todos</option></select></label><label>Buscar <input value={search} placeholder="Nome, e-mail ou telefone" onChange={e => { setSearch(e.target.value); setPage(1) }}/></label></div>
    <p>WhatsApp abre a mensagem pronta para você revisar e enviar. O botão de e-mail envia o passo a passo ao aluno.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="central-table-wrap"><table className="central-table"><thead><tr>{['Aluno', 'Contato', 'Instalação', 'Notificações', 'Último lembrete por e-mail', 'Lembrar de instalar'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.email}<br/>{row.phone || '—'}</td><td>{row.confirmed_at ? `Confirmada em ${new Date(row.confirmed_at).toLocaleDateString('pt-BR')}` : 'Não confirmada'}</td><td>{row.push_enabled ? 'Ativas' : 'Não ativadas'}</td><td>{row.last_reminder ? `${new Date(row.last_reminder.created_at).toLocaleString('pt-BR')} · ${{ accepted: 'Aceito pelo provedor', sending: 'Em processamento', failed: 'Falhou', unknown: 'Verificar no provedor' }[row.last_reminder.status]}` : '—'}</td><td>{!row.confirmed_at && <div className="cv-actions">{row.whatsapp_url && <a className="central-action" href={row.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp ↗</a>}<button className="central-action" disabled={Boolean(busy) || !data.email_enabled || !row.email} onClick={() => remind(row)}>{busy === row.id ? 'Enviando…' : 'Enviar e-mail'}</button></div>}</td></tr>)}{!visible.length && <tr><td colSpan={6}>{loading ? 'Carregando…' : 'Nenhum aluno neste filtro.'}</td></tr>}</tbody></table></div>
    <div className="cv-actions" style={{ marginTop: 16 }}><button className="central-action" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} · {filtered.length} alunos</span><button className="central-action" disabled={page * 30 >= filtered.length} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
  </div>
}
