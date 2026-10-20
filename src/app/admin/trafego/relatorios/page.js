'use client'
import {useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {supabase} from '@/lib/supabase'
const ADMIN='suporte@suzanazatorre.com.br'
const fmt=n=>n==null?'—':Number(n).toLocaleString('pt-BR')
const money=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const formatDate=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—'
const obj={messages:'Mensagens',leads:'Leads',sales:'Vendas',website_conversions:'Conversões',traffic:'Tráfego',engagement:'Engajamento',followers:'Seguidores',other:'Outro'}
const style={background:'#171717',border:'1px solid #3D3529',borderRadius:13,padding:20}
const field={background:'#222',border:'1px solid #615034',borderRadius:8,color:'white',padding:10}
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
export default function TrafficReports(){
 const router=useRouter()
 const [authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [businesses,setBusinesses]=useState([]),[accounts,setAccounts]=useState([]),[metrics,setMetrics]=useState([]),[goals,setGoals]=useState([])
 const [business,setBusiness]=useState(''),[kind,setKind]=useState('weekly'),[offset,setOffset]=useState(0)
 useEffect(()=>{let active=true;(async()=>{
  const {data:{session}}=await supabase.auth.getSession()
  if(!active)return
  if(!session){router.replace('/login');return}
  if(session.user.email!==ADMIN){setLoading(false);return}
  setAuthorized(true)
  const [b,a,m,g]=await Promise.all([
   supabase.from('traffic_businesses').select('id,name').order('name'),
   supabase.from('traffic_clients').select('id,business_id,name,mcp_status,meta_account_id'),
   supabase.from('traffic_daily_metrics').select('client_id,metric_date,spend,impressions,clicks,leads,ctr,cpc,data_status').order('metric_date',{ascending:false}).limit(10000),
   supabase.from('traffic_goals').select('client_id,campaign_id,campaign_name,objective,target_cost,target_quantity,metric_label,valid_from').limit(3000)
  ])
  if(active){
    const errs=[b.error,a.error,m.error,g.error].filter(Boolean)
    if(errs.length)setError(errs.map(x=>x.message).join(' | '))
    else{setBusinesses(b.data||[]);setAccounts(a.data||[]);setMetrics(m.data||[]);setGoals(g.data||[]);setBusiness(b.data?.[0]?.id||'')}
    setLoading(false)
  }
 })();return()=>{active=false}},[router])
 const range=useMemo(()=>{
   const today=new Date(), anchor=new Date(today.getFullYear(),today.getMonth(),today.getDate())
   if(kind==='monthly'){
     const start=new Date(anchor.getFullYear(),anchor.getMonth()-offset,1)
     const end=new Date(anchor.getFullYear(),anchor.getMonth()-offset+1,0)
     if(offset===0)end.setTime(anchor.getTime())
     return {from:iso(start),to:iso(end)}
   }
   const mon=(anchor.getDay()+6)%7
   const end=new Date(anchor);end.setDate(anchor.getDate()-mon-1-offset*7)
   const start=new Date(end);start.setDate(end.getDate()-6)
   return {from:iso(start),to:iso(end)}
 },[kind,offset])
 const selected=accounts.filter(a=>a.business_id===business)
 const byAccount=useMemo(()=>selected.map(a=>{
  const days=metrics.filter(m=>m.client_id===a.id&&m.metric_date>=range.from&&m.metric_date<=range.to&&m.data_status==='ok')
  const val=k=>days.reduce((s,d)=>s+Number(d[k]||0),0)
  const spend=val('spend'),clicks=val('clicks'),impressions=val('impressions')
  return {...a,days:days.length,spend,clicks,impressions,leads:val('leads'),ctr:impressions?clicks/impressions*100:null,cpc:clicks?spend/clicks:null,goals:goals.filter(g=>g.client_id===a.id)}
 }),[selected,metrics,range,goals])
 const sum=k=>byAccount.reduce((s,a)=>s+a[k],0)
 const hasData=byAccount.some(a=>a.days>0)
 const fromLabel=formatDate(range.from),toLabel=formatDate(range.to)
 if(loading)return <main style={{background:'#0A0A0A',minHeight:'100vh',color:'white',padding:30}}>Carregando...</main>
 if(!authorized)return <main style={{background:'#0A0A0A',minHeight:'100vh',color:'white',padding:30}}>Acesso restrito.</main>
 return <main style={{background:'#0A0A0A',minHeight:'100vh',color:'white',padding:'25px clamp(16px,3vw,60px) 90px',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}}>
  <button style={{...field,cursor:'pointer'}} onClick={()=>router.push('/admin/trafego')}>← Meu Tráfego Pago</button>
  <p style={{color:'#D4AF37',fontSize:12,fontWeight:700,margin:'25px 0 5px'}}>ESCRITÓRIO • VISUALIZAÇÃO PRIVADA</p>
  <h1 style={{fontSize:30,margin:'0 0 6px'}}>Relatório por cliente</h1>
  <p style={{color:'#AAA',fontSize:14}}>Sem misturar lojas: cada relatório usa exclusivamente as contas vinculadas ao cliente escolhido.</p>
  {error&&<p role="alert" style={{color:'#FF9393'}}>{error}</p>}
  <div style={{...style,display:'flex',gap:13,flexWrap:'wrap',alignItems:'end',margin:'18px 0'}}>
   <label>Cliente<div><select style={field} value={business} onChange={e=>setBusiness(e.target.value)}><option value="">Selecione</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div></label>
   <label>Período<div><select style={field} value={kind} onChange={e=>{setKind(e.target.value);setOffset(0)}}><option value="weekly">Semana encerrada</option><option value="monthly">Mês</option></select></div></label>
   <label>Histórico<div><select style={field} value={offset} onChange={e=>setOffset(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{i===0?'Mais recente':i+' período(s) atrás'}</option>)}</select></div></label>
   <span style={{color:'#D4AF37',fontWeight:700}}>{fromLabel} a {toLabel}</span>
  </div>
  {!businesses.length&&<section style={style}>Nenhuma loja foi cadastrada ainda. Volte ao painel Meu Tráfego Pago, cadastre os clientes e vincule as respectivas contas antes de gerar seus relatórios.</section>}
  {!!businesses.length&&!business&&<section style={style}>Selecione uma loja para consultar o relatório.</section>}
  {!!business&&!selected.length&&<section style={style}>Este cliente não possui contas vinculadas. Faça o vínculo no painel administrativo.</section>}
  {!!selected.length&&<>
   <section style={style}>
    <h2 style={{margin:'0 0 6px',fontSize:20}}>{businesses.find(b=>b.id===business)?.name}</h2>
    <p style={{color:'#AAA',fontSize:13}}>Contas vinculadas: {selected.length} • Contas com dados no período: {byAccount.filter(x=>x.days).length}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>
      {[['Investimento registrado',hasData?money(sum('spend')):'Sem dados'],['Cliques totais',hasData?fmt(sum('clicks')):'—'],['Impressões',hasData?fmt(sum('impressions')):'—']].map(([k,v])=><div key={k} style={{padding:17,background:'#24211B',borderRadius:9}}><span style={{fontSize:12,color:'#BBB'}}>{k}</span><strong style={{display:'block',fontSize:22,color:'#D4AF37',marginTop:5}}>{v}</strong></div>)}
    </div>
    <p style={{color:'#AAA',fontSize:12}}>Somente investimento, impressões e cliques totais podem ser somados entre contas. Leads, mensagens, vendas e conversões devem ser avaliados por objetivo/campanha, sem mistura de resultados.</p>
   </section>
   <h2 style={{fontSize:21,margin:'26px 0 12px'}}>Contas e objetivos da loja</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,360px),1fr))',gap:13}}>
    {byAccount.map(a=><article key={a.id} style={style}>
      <h3 style={{margin:'0 0 4px'}}>{a.name}</h3>
      <div style={{color:'#AAA',fontSize:12,marginBottom:13}}>ID {a.meta_account_id} • {a.mcp_status==='enabled'?'MCP habilitado':'Integração pendente'}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
       {[['Investimento',a.days?money(a.spend):'—'],['Cliques',a.days?fmt(a.clicks):'—'],['CTR total',a.ctr==null?'—':a.ctr.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'],['CPC total',a.cpc==null?'—':money(a.cpc)]].map(([k,v])=><div key={k} style={{background:'#222',padding:10,borderRadius:8}}><span style={{color:'#AAA',fontSize:12}}>{k}</span><strong style={{display:'block',fontSize:17,marginTop:5}}>{v}</strong></div>)}
      </div>
      <p style={{fontSize:13,color:'#CCC'}}>Objetivos configurados: {a.goals.length?a.goals.map(g=>obj[g.objective]||g.objective).join(', '):'Pendente de configuração'}</p>
      <p style={{fontSize:12,color:a.days?'#81D6A2':'#E7BF77'}}>{a.days?a.days+' dia(s) com dados no período':'Sem dados coletados neste período'}</p>
    </article>)}
   </div>
   <section style={{...style,marginTop:20}}>
    <h2 style={{margin:'0 0 9px'}}>Análise estratégica</h2>
    <p style={{color:'#CCC',lineHeight:1.7,fontSize:14}}>Este é o relatório preliminar de dados registrados. Para avaliar custo por mensagem, venda, lead ou conversão, precisamos coletar as métricas de resultado da campanha correspondente e definir a meta daquele objetivo. Não vamos avaliar todas as campanhas pelo número de leads.</p>
    <p style={{color:'#D4AF37',fontSize:13}}>Publicação para alunas desativada. Sem notificações automáticas. Áudio oculto.</p>
   </section>
  </>}
 </main>
}
