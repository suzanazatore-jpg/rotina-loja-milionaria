'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatInstallationPhone } from '@/lib/appInstallationStatus'
import { installationMessage } from '@/lib/commerceNotices'
import styles from './AppInstallationReport.module.css'

async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
}
const date = value => value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const installationLabel = row => !row.confirmed_at ? 'Sem informação' : ({ admin_confirmed: 'Confirmada pela administração', legacy_browser: 'Instalação anterior registrada', standalone: 'Uso pelo app confirmado', appinstalled: 'Instalação confirmada' }[row.installation_evidence] || 'Instalação registrada')

export default function InstallationReport({ cores }) {
  const [data, setData] = useState({ rows: [], email_enabled: false, whatsapp_bulk_enabled: false })
  const [status, setStatus] = useState('all')
  const [financial, setFinancial] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState([])
  const [outcomes, setOutcomes] = useState({})
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const response = await fetch('/api/admin/checkout/app-instalacao', { headers: await headers(), signal: controller.signal, cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw Error(json.error)
        setData(json)
      } catch (e) { if (!controller.signal.aborted) setError(e.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [refresh])
  async function request(body, method = 'POST') {
    const response = await fetch('/api/admin/checkout/app-instalacao', { method, headers: await headers(), body: JSON.stringify(body) })
    const json = await response.json()
    if (!response.ok) throw Error(json.error)
    return json
  }
  async function confirm(row) {
    setBusy(row.id); setError(''); setMessage('')
    try {
      await request({ user_id: row.id }, 'PATCH')
      setSelected(ids => ids.filter(id => id !== row.id))
      setMessage(`Instalação de ${row.name} confirmada pela administração.`)
      setRefresh(value => value + 1)
    } catch (e) { setError(e.message) }
    finally { setBusy('') }
  }
  async function sendEmails(ids) {
    const people = data.rows.filter(row => ids.includes(row.id) && !row.confirmed_at && row.email)
    if (!people.length) { setError('Selecione alunos sem registro de instalação e com e-mail.'); return }
    setBusy('email'); setError(''); setMessage(''); setOutcomes({})
    let accepted = 0, failed = 0
    for (let start = 0; start < people.length; start += 3) {
      await Promise.all(people.slice(start, start + 3).map(async row => {
        try { await request({ user_id: row.id }); accepted++; setOutcomes(old => ({ ...old, [row.id]: 'E-mail aceito pelo provedor' })) }
        catch (e) { failed++; setOutcomes(old => ({ ...old, [row.id]: e.message })) }
      }))
      setMessage(`Processados ${Math.min(start + 3, people.length)} de ${people.length}: ${accepted} aceitos pelo provedor · ${failed} não enviados ou em verificação.`)
    }
    setSelected([]); setBusy(''); setRefresh(value => value + 1)
  }
  async function sendWhatsapp() {
    setBusy('whatsapp'); setError(''); setMessage('')
    try {
      const result = await request({ action: 'whatsapp_bulk', user_ids: selected })
      setMessage(`${result.message} ${result.accepted || 0} encaminhados · ${result.skipped || 0} ignorados · ${result.failed || result.unknown || 0} pendentes/falhas.`)
      setSelected([]); setRefresh(value => value + 1)
    } catch (e) { setError(e.message) }
    finally { setBusy('') }
  }
  function changeFilter(setter, value) { setter(value); setPage(1); setSelected([]) }
  function toggle(id) { setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]) }
  const confirmed = data.rows.filter(row => row.confirmed_at).length
  const filtered = data.rows.filter(row => (status === 'all' || Boolean(row.confirmed_at) === (status === 'confirmed')) && (financial === 'all' || row.financial_status === financial) && `${row.name} ${row.email} ${row.phone}`.toLowerCase().includes(search.toLowerCase()))
  const visible = filtered.slice((page - 1) * 20, page * 20)
  const eligibleVisible = visible.filter(row => !row.confirmed_at)
  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every(row => selected.includes(row.id))
  const togglePage = () => setSelected(ids => allVisibleSelected ? ids.filter(id => !eligibleVisible.some(row => row.id === id)) : [...new Set([...ids, ...eligibleVisible.map(row => row.id)])])
  return <div className={styles.report} style={cores ? { '--report-card': cores.card, '--report-bg': cores.card2, '--report-text': cores.tx, '--report-border': cores.borda } : undefined}>
    <div className="central-page-heading"><div><h1>Instalação do aplicativo</h1><p>Alunos com acesso ativo. Nome, telefone, situação financeira e instalação em um só lugar.</p></div><button className="central-action" disabled={loading || Boolean(busy)} onClick={() => setRefresh(value => value + 1)}>↻ Atualizar</button></div>
    <div className={styles.stats}><section><strong>{loading ? '…' : data.rows.length}</strong><span>Alunos com acesso ativo</span></section><section><strong>{loading ? '…' : confirmed}</strong><span>Instalações registradas</span></section><section><strong>{loading ? '…' : data.rows.length - confirmed}</strong><span>Sem informação de instalação</span></section></div>
    <p className={styles.note}>“Sem informação” não significa que a pessoa não instalou. Instalações antigas são recuperadas ao acessar pelo mesmo aparelho; você também pode confirmar os casos conhecidos. Notificações e último acesso, sozinhos, não comprovam instalação.</p>
    <div className={styles.filters}><label>Instalação<select disabled={Boolean(busy)} value={status} onChange={e => changeFilter(setStatus, e.target.value)}><option value="all">Todos os ativos</option><option value="pending">Sem informação</option><option value="confirmed">Instalação registrada</option></select></label><label>Financeiro<select disabled={Boolean(busy)} value={financial} onChange={e => changeFilter(setFinancial, e.target.value)}><option value="all">Todas as situações</option><option value="Em dia">Em dia</option><option value="Sem informação">Sem informação financeira</option></select></label><label className={styles.search}>Buscar<input disabled={Boolean(busy)} value={search} placeholder="Nome, telefone ou e-mail" onChange={e => changeFilter(setSearch, e.target.value)}/></label></div>
    <p className={styles.note}>Financeiro conforme o cadastro do aplicativo e a validade do acesso. Cadastro ativo, sozinho, não comprova pagamento; dados financeiros ausentes aparecem como “Sem informação”.</p>
    <div className={styles.bulk}><strong>{selected.length} selecionados</strong><button className="central-action" disabled={Boolean(busy) || loading} onClick={() => setSelected(filtered.filter(row => !row.confirmed_at).map(row => row.id))}>Selecionar todos do filtro</button><button className="central-action" disabled={Boolean(busy) || !selected.length} onClick={() => setSelected([])}>Limpar seleção</button><button className="central-action" disabled={Boolean(busy) || !selected.length || !data.email_enabled} onClick={() => sendEmails(selected)}>Enviar e-mail em massa</button><button className="central-action" disabled={Boolean(busy) || !selected.length || !data.whatsapp_bulk_enabled} onClick={sendWhatsapp}>WhatsApp em massa</button></div>
    {!data.whatsapp_bulk_enabled && <p className={styles.note}>WhatsApp em massa: integração ainda não configurada. Os links individuais abrem a mensagem pronta para revisão e envio.</p>}
    <details className={styles.preview}><summary>Ver mensagem e instruções de instalação</summary><p style={{ whiteSpace: 'pre-line' }}>{installationMessage('aluno')}</p></details>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="central-table-wrap"><table><colgroup>{['44px','250px','155px','85px','135px','110px','235px','245px'].map((width, i) => <col key={i} style={{ width }}/>)}</colgroup><thead><tr><th><input type="checkbox" aria-label="Selecionar alunos desta página" disabled={Boolean(busy) || !eligibleVisible.length} checked={allVisibleSelected} onChange={togglePage}/></th>{['Nome / e-mail', 'Telefone', 'Acesso', 'Financeiro', 'Válido até', 'Instalação', 'Lembretes'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} data-selected={selected.includes(row.id)}><td><input type="checkbox" aria-label={`Selecionar ${row.name}`} checked={selected.includes(row.id)} disabled={Boolean(busy) || Boolean(row.confirmed_at)} onChange={() => toggle(row.id)}/></td><td><strong className={styles.name}>{row.name}</strong><small className={styles.secondary}>{row.email}</small></td><td className={styles.phone}>{formatInstallationPhone(row.phone)}</td><td><span className={styles.good}>Ativo</span></td><td title={row.financial_source}><span className={row.financial_status === 'Em dia' ? styles.good : styles.neutral}>{row.financial_status}</span></td><td>{row.expires_at ? date(row.expires_at) : 'Sem prazo'}</td><td><span className={row.confirmed_at ? styles.good : styles.neutral}>{installationLabel(row)}</span><small className={styles.secondary}>{row.confirmed_at ? date(row.confirmed_at) : `Último acesso: ${date(row.last_access_at)}`}</small>{!row.confirmed_at && <button className={styles.textButton} disabled={Boolean(busy)} onClick={() => confirm(row)}>Confirmar que já instalou</button>}</td><td>{!row.confirmed_at ? <div className="cv-actions">{row.whatsapp_url && <a className="central-action" href={row.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp ↗</a>}<button className="central-action" disabled={Boolean(busy) || !data.email_enabled || !row.email} onClick={() => sendEmails([row.id])}>E-mail</button></div> : 'Instalação registrada'}<small className={styles.secondary}>{outcomes[row.id] || (row.last_reminder ? `Último lembrete: ${date(row.last_reminder.created_at)}` : '')}</small></td></tr>)}{!visible.length && <tr><td colSpan={8}>{loading ? 'Carregando…' : 'Nenhum aluno ativo neste filtro.'}</td></tr>}</tbody></table></div>
    <div className="cv-actions" style={{ marginTop: 16 }}><button className="central-action" disabled={page === 1 || Boolean(busy)} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} · {filtered.length} alunos ativos</span><button className="central-action" disabled={page * 20 >= filtered.length || Boolean(busy)} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
  </div>
}
