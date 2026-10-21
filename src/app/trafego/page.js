'use client'
import {useCallback,useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {supabase} from '@/lib/supabase'
import TrafficDashboard from '@/app/admin/trafego/TrafficDashboard'
const date=s=>s?.slice(0,10).split('-').reverse().join('/')
export default function Traffic(){
 const router=useRouter(),[data,setData]=useState(null),[error,setError]=useState('')
 const load=useCallback(async(signal)=>{
  const {data:{session}}=await supabase.auth.getSession()
  if(!session){router.replace('/login');return}
  const r=await fetch('/api/trafego',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',signal})
  const result=await r.json()
  if(!r.ok)throw Error(result.error)
  if(!signal?.aborted){setData(result);setError('')}
 },[router])
 useEffect(()=>{const controller=new AbortController();load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[load])
 async function refresh(){try{await load()}catch(e){setError(e.message)}}
 return <><aside className="td-sidebar"><div className="td-brand">SZ <span>INTELIGÊNCIA</span></div><p>SUZANA ZATORRE</p><nav><a className="current" href="/trafego">▦ Meus relatórios</a><a href="/painel">← Meu aplicativo</a></nav></aside><main className="traffic-office-shell traffic-student-shell">
 {error&&<p className="td-notice" role="alert">{error}</p>}
 {!data&&!error?<p role="status">Carregando seus relatórios…</p>:data?.pending?<section className="td-panel"><h1>Aguardando vinculação</h1><p>Estamos preparando seus relatórios. Sua conta de anúncios está aguardando vinculação pela nossa equipe.</p></section>:data?<><TrafficDashboard accounts={data.accounts} metrics={data.metrics} onRefresh={refresh}/><section className="td-panel"><h2>Relatórios publicados</h2>{!data.reports.length?<p>Seu primeiro relatório está sendo preparado pela equipe.</p>:data.reports.map(r=><article key={r.id}><h3>{date(r.period_start)} a {date(r.period_end)}</h3><p style={{whiteSpace:'pre-wrap'}}>{r.summary}</p>{r.recommendations&&<><h4>Próximas ações</h4><p style={{whiteSpace:'pre-wrap'}}>{r.recommendations}</p></>}</article>)}</section></>:null}
 </main></>
}
