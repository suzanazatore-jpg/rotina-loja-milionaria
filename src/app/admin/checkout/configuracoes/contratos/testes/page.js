'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const LABELS = { invite: 'Link', reminder: 'Lembrete', copy: 'PDF demonstrativo', code: 'Código demonstrativo' }
const STATES = { prepared: 'Amostra preparada', accepted: 'Aceito pelo serviço; conferir recebimento', waiting: 'Aguardando o Pabbly', dispatching: 'Envio em processamento', processing: 'Envio em processamento', review: 'Sem confirmação; revisar antes de repetir', canceled: 'Envio interrompido', ready: 'Preparado' }
export default function ContractConnectionTests() {
  const router = useRouter()
  const [token, setToken] = useState(''), [data, setData] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const load = useCallback(async auth => {
    try {
      const response = await fetch('/api/admin/contratos/testes', { headers: { Authorization: `Bearer ${auth}` }, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) { setMessage(body.error); return }
      setData(body)
    } catch { setMessage('Não foi possível carregar o teste. Recarregue o histórico antes de enviar.') }
  }, [])
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setToken(session.access_token); load(session.access_token)
    })
  }, [load, router])
  async function send(channel, kind) {
    setBusy(true); setMessage('Solicitando teste…')
    try {
      const response = await fetch('/api/admin/contratos/testes', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, kind }) })
      const body = await response.json()
      setMessage(body.error || (body.status === 'sent' || body.status === 'accepted' ? 'O serviço aceitou a solicitação. Confira o canal e o histórico; recebimento ainda não confirmado.' : body.message || 'Resultado sem confirmação. Confira o histórico antes de repetir.'))
      await load(token)
    } catch { setMessage('Resultado desconhecido. Confira o histórico antes de repetir.') }
    finally { setBusy(false) }
  }
  return <main className="central-home">
    <div className="central-breadcrumb"><Link href="/admin/checkout/configuracoes/contratos">Contratos</Link><span>/</span><strong>Testes de conexão</strong></div>
    <div className="central-dashboard-heading"><div><span className="central-eyebrow">HOMOLOGAÇÃO</span><h1>Testes de conexão</h1><p>Somente para o contato autorizado. O módulo das clientes continua pausado.</p></div></div>
    {message && <p role="status" className="central-editor-message">{message}</p>}
    {!data ? <p>Carregando configuração…</p> : !data.enabled ? <section className="central-chart-panel"><h2>Teste interno pausado</h2><p>A configuração restrita precisa estar ativa e dentro do prazo de homologação.</p></section> : <>
      <section className="central-chart-panel" aria-label="Destinatário autorizado"><h2>Contato do teste</h2><p>WhatsApp: {data.phone} · E-mail: {data.email}</p><p>Janela até {new Date(data.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p><p>Estes testes não criam compra, contrato comercial, assinatura ou acesso. O código e o PDF são demonstrativos. A jornada real será validada separadamente.</p></section>
      <section className="central-chart-panel"><h2>E-mail pelo Brevo</h2><p>Uma solicitação por tipo nesta janela. Resultados incertos exigem revisão, sem repetição automática.</p><div className="central-product-tabs">{Object.entries(LABELS).map(([kind, label]) => <button key={kind} disabled={busy} onClick={() => send('email', kind)}>Testar e-mail: {label}</button>)}</div></section>
      <section className="central-chart-panel"><h2>WhatsApp pelo Pabbly e BotConversa</h2><p>O fluxo de homologação precisa estar preparado para receber a amostra e validar sua autorização. Aceite do Pabbly ainda depende da execução protegida no BotConversa.</p><div className="central-product-tabs">{Object.entries(LABELS).filter(([kind]) => kind !== 'code').map(([kind, label]) => <button key={kind} disabled={busy} onClick={() => send('whatsapp', kind)}>Testar WhatsApp: {label}</button>)}</div><p>Código por WhatsApp continua pausado até aprovação do modelo.</p></section>
      <section className="central-chart-panel"><div className="central-section-heading"><h2>Histórico dos testes</h2><button disabled={busy} onClick={() => load(token)}>Atualizar histórico</button></div><div className="central-table-wrap"><table className="central-table"><thead><tr><th>Tipo</th><th>Etapa</th><th>Resultado</th><th>Referência</th></tr></thead><tbody>{data.records.map(row => <tr key={row.id}><td>{LABELS[row.kind] || 'WhatsApp'}</td><td>{row.type.endsWith('.email') ? 'Brevo' : row.type.endsWith('.relay') ? 'BotConversa' : row.type.endsWith('.dispatch') ? 'Pabbly' : 'Amostra'}</td><td>{STATES[row.state] || row.state}</td><td><small>{row.id}</small>{row.message_id && <small>{row.message_id}</small>}</td></tr>)}</tbody></table></div>{!data.records.length && <p>Nenhum teste solicitado nesta janela.</p>}</section>
    </>}
  </main>
}
