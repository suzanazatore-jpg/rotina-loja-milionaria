'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import styles from '../Integrations.module.css'

const stages = [
  ['AddToCart','Abriu o checkout'],
  ['InitiateCheckout','Preencheu nome, email e telefone'],
  ['AddPaymentInfo','Clicou em pagar com o formulário válido'],
  ['Purchase','O Pagar.me confirmou o pagamento'],
  ['StartTrial','Iniciou o período gratuito de uma assinatura habilitada'],
]
const back = '/admin/checkout/configuracoes/integracoes'
const envUrl = 'https://vercel.com/mariano12/rotina-loja-milionaria/settings/environment-variables'
export default function MetaEvents() {
  const [tab,setTab] = useState('Pixels')
  const [data,setData] = useState(null)
  const [error,setError] = useState('')
  const [version,setVersion] = useState(0)
  useEffect(()=>{
    const controller = new AbortController()
    async function load() {
      const {data:{session}} = await supabase.auth.getSession()
      const res = await fetch('/api/admin/checkout/meta',{signal:controller.signal,cache:'no-store',headers:{Authorization:'Bearer ' + (session?.access_token || '')}})
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      if (!controller.signal.aborted) { setData(body); setError('') }
    }
    load().catch(err=>{if (!controller.signal.aborted) setError(err.message || 'Falha na consulta.')})
    return ()=>controller.abort()
  },[version])
  return <main className="central-home">
    <nav className={styles.breadcrumb}><Link href={back}>Integrações</Link> / Meta Ads</nav>
    <header className={styles.heading}><h1>Meta Ads</h1><button className="central-action" onClick={()=>setVersion(value=>value+1)}>Atualizar</button></header>
    <nav className={styles.categories} aria-label="Configuração da Meta">{['Pixels','Eventos','Auditoria'].map(label=><button key={label} aria-pressed={tab===label} onClick={()=>setTab(label)}>{label}</button>)}<Link className="central-action" href="/admin/trafego">Contas e anúncios ↗</Link></nav>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Consultando configuração…</p>}
    {data && <section className={styles.metaPanel}><h2>{tab} · {data.environment}</h2>
      {tab==='Pixels' && <><dl>{data.checks.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><div className={styles.actions}><Link className="central-action" href={back+'/rastreamento'}>Editar Pixel padrão</Link><a className="central-action" href={envUrl} target="_blank" rel="noreferrer">Configurar token na Vercel ↗</a></div><p>Salve o token em META_CAPI_ACCESS_TOKEN no ambiente correspondente e publique a configuração.</p></>}
      {tab==='Eventos' && <><dl>{stages.map(([name,action])=><div key={name}><dt>{name}</dt><dd>{action}</dd></div>)}</dl><p>A medição é automática e respeita a recusa nas preferências de cookies. O Pix gera compra ao ser pago.</p></>}
      {tab==='Auditoria' && <>{!data.deliveries.length ? <p>Nenhuma tentativa de envio pelo servidor registrada neste ambiente.</p> : <table><thead><tr><th>Evento</th><th>Situação</th><th>Data e hora</th><th>Venda</th></tr></thead><tbody>{data.deliveries.map((row,i)=><tr key={i}><td>{row.event}</td><td>{row.status}</td><td>{new Date(row.date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</td><td>{row.order?<Link href={'/admin/checkout/vendas/'+row.order}>Abrir venda</Link>:'—'}</td></tr>)}</tbody></table>}</>}
    </section>}
  </main>
}
