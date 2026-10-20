'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const money = n => n == null ? '—' : Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const integer = n => n == null ? '—' : Number(n).toLocaleString('pt-BR')
const pct = n => n == null ? '—' : Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'
const dateBR = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4) : '—'
const card = {background:'#151515',border:'1px solid #34302A',borderRadius:13,padding:18}
export default function AdminTrafego() {
  const router=useRouter()
  const [authorized,setAuthorized]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [clients,setClients]=useState([])
  const [metrics,setMetrics]=useState([])
  const [reports,setReports]=useState([])
  const [search,setSearch]=useState('')
  const [period,setPeriod]=useState('latest')

  async function load() {
    setError('')
    const [c,m,r]=await Promise.all([
      supabase.from('traffic_clients').select('id,name,meta_account_id,mcp_status,active').order('name'),
      supabase.from('traffic_daily_metrics').select('client_id,metric_date,spend,impressions,clicks,leads,ctr,cpc,cpl,frequency,data_status').order('metric_date',{ascending:false}).limit(5000),
      supabase.from('traffic_reports').select('id,client_id,period_type,period_start,period_end,published_at').order('period_end',{ascending:false}).limit(500)
    ])
    if(c.error || m.error || r.error) {setError([c.error?.message,m.error?.message,r.error?.message].filter(Boolean).join(' | '));return}
    setClients(c.data||[]);setMetrics(m.data||[]);setReports(r.data||[])
  }
  useEffect(()=>{
    let mounted=true
    ;(async()=>{
      const {data:{session}}=await supabase.auth.getSession()
      if(!mounted)return
      if(!session){router.replace('/login');return}
      if(session.user.email!==ADMIN_EMAIL){setLoading(false);return}
      setAuthorized(true)
      await load()
      if(mounted)setLoading(false)
    })()
    return ()=>{mounted=false}
  },[router])

  const mostRecent=metrics.reduce((v,m)=>m.metric_date>v?m.metric_date:v,'')
  const selectedDate=period==='latest'?mostRecent:period
  const current=useMemo(()=>new Map(metrics.filter(m=>m.metric_date===selectedDate).map(m=>[m.client_id,m])),[metrics,selectedDate])
  const displayed=clients.filter(c=>(c.name+' '+c.meta_account_id).toLowerCase().includes(search.toLowerCase()))
  const measured=metrics.filter(m=>m.metric_date===selectedDate&&m.data_status==='ok')
  const total=measured.reduce((sum,m)=>sum+Number(m.spend||0),0)
  const clicks=measured.reduce((sum,m)=>sum+Number(m.clicks||0),0)
  const enabled=clients.filter(c=>c.mcp_status==='enabled').length
  const pending=clients.filter(c=>c.mcp_status!=='enabled').length

  if(loading)return <main style={{background:'#0A0A0A',color:'white',minHeight:'100vh',padding:30}}>Carregando dados do tráfego...</main>
  if(!authorized)return <main style={{background:'#0A0A0A',color:'white',minHeight:'100vh',padding:30}}>Acesso restrito ao escritório.</main>
  return <main style={{background:'#0A0A0A',minHeight:'100vh',color:'#FFF',padding:'25px 16px 70px',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}}>
    <div style={{maxWidth:1120,margin:'auto'}}>
      <button onClick={()=>router.push('/admin')} style={{background:'transparent',color:'#D4AF37',border:'1px solid #49402B',padding:'9px 13px',borderRadius:8,cursor:'pointer'}}>← Meu Escritório</button>
      <p style={{color:'#D4AF37',fontSize:12,fontWeight:700,letterSpacing:1,margin:'26px 0 6px'}}>GESTÃO DE TRÁFEGO PAGO</p>
      <h1 style={{margin:'0 0 6px',fontSize:29}}>Meu Tráfego Pago</h1>
      <p style={{color:'#AAA',margin:'0 0 22px'}}>Painel administrativo com dados registrados no Supabase. Não altera campanhas ou investimentos.</p>
      {error&&<div role="alert" style={{...card,borderColor:'#B74C4C',color:'#FFB3B3',marginBottom:16}}>Não foi possível consultar todos os dados: {error}</div>}
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
        <label htmlFor="traffic-date" style={{color:'#CCC',fontSize:13}}>Dia do relatório:</label>
        <select id="traffic-date" value={period} onChange={e=>setPeriod(e.target.value)} style={{background:'#1C1C1C',color:'#FFF',border:'1px solid #444',borderRadius:8,padding:'9px 12px'}}>
          <option value="latest">Mais recente ({dateBR(mostRecent)})</option>
          {[...new Set(metrics.map(m=>m.metric_date))].sort().reverse().map(d=><option key={d} value={d}>{dateBR(d)}</option>)}
        </select>
        <button onClick={load} style={{background:'#25211A',color:'#D4AF37',border:'1px solid #5A4D2A',padding:'9px 13px',borderRadius:8,cursor:'pointer'}}>Atualizar tela</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10,marginBottom:23}}>
        {[[integer(clients.length),'Contas cadastradas'],[integer(enabled),'MCP habilitado'],[integer(pending),'MCP pendente'],[money(total),'Investimento registrado'],[integer(clicks),'Cliques totais']].map(([v,l])=><div key={l} style={card}><strong style={{display:'block',fontSize:23,color:'#D4AF37'}}>{v}</strong><span style={{color:'#AAA',fontSize:12}}>{l}</span></div>)}
      </div>
      <section style={card}>
        <h2 style={{fontSize:19,margin:'0 0 5px'}}>Carteira de clientes</h2>
        <p style={{fontSize:12,color:'#AAA',margin:'0 0 15px'}}>Dados de {dateBR(selectedDate)}. “Sem dados” não significa zero. Cliques são cliques totais, não necessariamente no link.</p>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente ou ID..." aria-label="Buscar cliente" style={{background:'#101010',color:'#FFF',border:'1px solid #444',borderRadius:8,padding:11,width:'100%',maxWidth:370,boxSizing:'border-box',marginBottom:15}}/>
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',minWidth:780,fontSize:13}}>
            <thead><tr>{['Cliente','Integração','Investimento','Cliques','CTR','Leads','Situação dos dados'].map(h=><th key={h} style={{textAlign:'left',padding:'11px 8px',borderBottom:'1px solid #444',color:'#D4AF37'}}>{h}</th>)}</tr></thead>
            <tbody>{displayed.map(c=>{
              const m=current.get(c.id)
              const status=c.mcp_status!=='enabled'?'MCP pendente':!m?'Sem coleta':m.data_status==='no_data'?'Sem dados retornados':m.data_status==='ok'?'Registrado':m.data_status
              return <tr key={c.id}>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525'}}><strong>{c.name}</strong><div style={{color:'#888',fontSize:11}}>{c.meta_account_id}</div></td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525',color:c.mcp_status==='enabled'?'#78D5A8':'#E8BC74'}}>{c.mcp_status==='enabled'?'Habilitado':'Pendente'}</td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525'}}>{m?.data_status==='ok'?money(m.spend):'—'}</td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525'}}>{m?.data_status==='ok'?integer(m.clicks):'—'}</td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525'}}>{m?.data_status==='ok'?pct(m.ctr):'—'}</td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525'}}>{m?.data_status==='ok'?integer(m.leads):'—'}</td>
                <td style={{padding:'11px 8px',borderBottom:'1px solid #252525',color:status==='Registrado'?'#78D5A8':'#E8BC74'}}>{status}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </section>
      <section style={{...card,marginTop:18}}>
        <h2 style={{fontSize:19,margin:'0 0 9px'}}>Relatórios semanais e mensais</h2>
        <p style={{color:'#AAA',lineHeight:1.6,fontSize:13}}>Relatórios cadastrados: {reports.length}. Publicados: {reports.filter(r=>r.published_at).length}. A publicação para as alunas e as notificações ainda não foram ativadas.</p>
        <p style={{color:'#D4AF37',fontSize:13,marginBottom:0}}>O recurso de áudio permanece desabilitado e oculto.</p>
      </section>
    </div>
  </main>
}
