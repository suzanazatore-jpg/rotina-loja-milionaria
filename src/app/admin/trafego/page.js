'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TrafficDashboard from './TrafficDashboard'

const ADMIN='suporte@suzanazatorre.com.br'
const brl=n=>n==null?'Sem dado':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const num=n=>n==null?'—':Number(n).toLocaleString('pt-BR')
const pc=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'
const objectives={messages:'Mensagens no WhatsApp/Direct',leads:'Captação de leads',sales:'Vendas de produto/ticket',website_conversions:'Conversões no site',traffic:'Acessos ao site',engagement:'Engajamento',followers:'Seguidores',other:'Outro objetivo'}
const panel={background:'#141414',border:'1px solid #333029',borderRadius:14,padding:20}
const inputStyle={background:'#1C1C1C',border:'1px solid #47423A',borderRadius:8,padding:'10px 12px',color:'#FFF',maxWidth:'100%',fontSize:14}
const buttonStyle={background:'#D4AF37',color:'#151515',border:0,borderRadius:8,padding:'10px 15px',fontWeight:750,cursor:'pointer'}

export default function TrafficOffice({management=false}){
 const router=useRouter()
 const [authorized,setAuthorized]=useState(false)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [clients,setClients]=useState([])
 const [businesses,setBusinesses]=useState([])
 const [metrics,setMetrics]=useState([])
 const [goals,setGoals]=useState([])
 const [reports,setReports]=useState([])
 const [newBusiness,setNewBusiness]=useState('')
 const [period,setPeriod]=useState('')
 const [selectedBusiness,setSelectedBusiness]=useState('all')
 const [editing,setEditing]=useState(null)
 const [saving,setSaving]=useState(false)
 const [actionError,setActionError]=useState('')

 async function load(){
  const [a,b,m,g,r]=await Promise.all([
   supabase.from('traffic_clients').select('id,name,meta_account_id,mcp_status,business_id').order('name'),
   supabase.from('traffic_businesses').select('id,name').order('name'),
   supabase.from('traffic_daily_metrics').select('client_id,metric_date,spend,clicks,impressions,ctr,cpc,leads,cpl,frequency,data_status,messages,purchases,message_spend').order('metric_date',{ascending:false}).limit(5000),
   supabase.from('traffic_goals').select('id,client_id,campaign_id,campaign_name,objective,metric_label,target_cost,target_quantity,valid_from').order('valid_from',{ascending:false}).limit(1000),
   supabase.from('traffic_reports').select('id,client_id,period_type,period_end,published_at').limit(1000)
  ])
  const errs=[a.error,b.error,m.error,g.error,r.error].filter(Boolean)
  if(errs.length){setError(errs.map(e=>e.message).join(' | '));return}
  setError('');setClients(a.data||[]);setBusinesses(b.data||[]);setMetrics(m.data||[]);setGoals(g.data||[]);setReports(r.data||[])
 }
 useEffect(()=>{
  let mounted=true
  ;(async()=>{
   const {data:{session}}=await supabase.auth.getSession()
   if(!mounted)return
   if(!session){router.replace('/login');return}
   if(session.user.email!==ADMIN){setLoading(false);return}
   setAuthorized(true);await load();if(mounted)setLoading(false)
  })()
  return ()=>{mounted=false}
 },[router])
 const days=useMemo(()=>[...new Set(metrics.map(m=>m.metric_date))].sort().reverse(),[metrics])
 const activeDay=period||days[0]||''
 const daily=useMemo(()=>new Map(metrics.filter(m=>m.metric_date===activeDay).map(m=>[m.client_id,m])),[metrics,activeDay])
 const grouped=useMemo(()=>{
  const groups=businesses.map(b=>({...b,accounts:clients.filter(c=>c.business_id===b.id)})).filter(b=>b.accounts.length)
  const unassigned=clients.filter(c=>!c.business_id)
  if(unassigned.length)groups.push({id:'unassigned',name:'Contas sem cliente vinculado',accounts:unassigned})
  return selectedBusiness==='all'?groups:groups.filter(g=>g.id===selectedBusiness)
 },[businesses,clients,selectedBusiness])
 const countLinked=clients.filter(c=>c.business_id).length

 async function addBusiness(e){
  e.preventDefault();if(!newBusiness.trim())return
  setSaving(true);setActionError('')
  const r=await supabase.from('traffic_businesses').insert({name:newBusiness.trim()})
  if(r.error)setActionError(r.error.message);else{setNewBusiness('');await load()}
  setSaving(false)
 }
 async function assign(clientId,businessId){
  setSaving(true);setActionError('')
  const r=await supabase.from('traffic_clients').update({business_id:businessId||null}).eq('id',clientId)
  if(r.error)setActionError(r.error.message);else await load()
  setSaving(false)
 }
 function editGoal(account){
  const goal=goals.find(g=>g.client_id===account.id&&!g.campaign_id)
  setEditing({account,existing:goal?.id||null,objective:goal?.objective||'messages',target_cost:goal?.target_cost??'',target_quantity:goal?.target_quantity??'',metric_label:goal?.metric_label||''})
  setActionError('')
 }
 async function saveGoal(e){
  e.preventDefault();if(!editing)return
  setSaving(true);setActionError('')
  const payload={client_id:editing.account.id,objective:editing.objective,metric_label:editing.metric_label.trim()||null,target_cost:editing.target_cost===''?null:Number(editing.target_cost),target_quantity:editing.target_quantity===''?null:Number(editing.target_quantity)}
  if((payload.target_cost!=null&&(!Number.isFinite(payload.target_cost)||payload.target_cost<0))||(payload.target_quantity!=null&&(!Number.isInteger(payload.target_quantity)||payload.target_quantity<0))){setActionError('Informe metas válidas.');setSaving(false);return}
  const r=editing.existing?await supabase.from('traffic_goals').update(payload).eq('id',editing.existing):await supabase.from('traffic_goals').insert(payload)
  if(r.error)setActionError(r.error.message);else{setEditing(null);await load()}
  setSaving(false)
 }
 if(loading)return <main style={{background:'#0A0A0A',color:'#FFF',minHeight:'100vh',padding:30}}>Carregando...</main>
 if(!authorized)return <main style={{background:'#0A0A0A',color:'#FFF',minHeight:'100vh',padding:30}}>Acesso restrito ao escritório.</main>
 return <><aside className="td-sidebar"><div className="td-brand">SZ <span>INTELIGÊNCIA</span></div><p>SUZANA ZATORRE</p><nav><a className={!management?'current':''} href="/admin/trafego">▦ Relatório por cliente</a><a href="/admin/trafego/clientes">Clientes</a><a href="/admin">← Meu Escritório</a></nav></aside><main className="traffic-office-shell" style={{background:'#f5f4ef',color:'#25221c',minHeight:'100vh',padding:'24px clamp(16px,3vw,56px) 90px',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}}>
  <div style={{width:'100%'}}>
   {error&&<div role="alert" style={{...panel,borderColor:'#C55',marginBottom:18}}>Erro na leitura: {error}</div>}
   {actionError&&<div role="alert" style={{...panel,borderColor:'#C55',marginBottom:18}}>{actionError}</div>}
   {!management&&<TrafficDashboard accounts={clients} metrics={metrics} onRefresh={load} />}
   {management&&<section className="td-management"><h1>Contas, clientes e metas</h1><p>As configurações ficam separadas do relatório individual.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12,marginBottom:20}}>
     {[['Clientes cadastrados',businesses.length],['Contas vinculadas',countLinked+' de '+clients.length],['MCP habilitado',clients.filter(c=>c.mcp_status==='enabled').length],['Integração pendente',clients.filter(c=>c.mcp_status!=='enabled').length]].map(([label,value])=><div key={label} style={panel}><strong style={{display:'block',color:'#D4AF37',fontSize:28}}>{value}</strong><span style={{color:'#AFAFAF',fontSize:13}}>{label}</span></div>)}
   </div>
   <section style={{...panel,marginBottom:20}}>
    <h2 style={{fontSize:19,margin:'0 0 6px'}}>Organizar clientes e contas</h2>
    <p style={{color:'#AFAFAF',fontSize:13,lineHeight:1.6}}>Cadastre o nome do cliente e vincule suas contas de anúncios. Não presumimos que cada conta pertença a um cliente diferente.</p>
    <form onSubmit={addBusiness} style={{display:'flex',gap:9,flexWrap:'wrap'}}>
     <input value={newBusiness} onChange={e=>setNewBusiness(e.target.value)} placeholder="Nome da loja ou cliente" aria-label="Nome do cliente" style={{...inputStyle,width:280}}/>
     <button disabled={saving||!newBusiness.trim()} style={{...buttonStyle,opacity:saving?0.6:1}}>Cadastrar cliente</button>
    </form>
   </section>
   <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:12,marginBottom:20}}>
    <label style={{fontSize:13,color:'#AAA'}}>Cliente: <select value={selectedBusiness} onChange={e=>setSelectedBusiness(e.target.value)} style={inputStyle}><option value="all">Todos (separados)</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}<option value="unassigned">Não vinculadas</option></select></label>
    <label style={{fontSize:13,color:'#AAA'}}>Dia: <select value={activeDay} onChange={e=>setPeriod(e.target.value)} style={inputStyle}>{days.map(d=><option key={d} value={d}>{d.slice(8,10)}/{d.slice(5,7)}/{d.slice(0,4)}</option>)}</select></label>
    <button style={{...buttonStyle,background:'#27231D',color:'#D4AF37',border:'1px solid #53472B'}} onClick={load}>Atualizar painel</button>
   </div>
   {grouped.map(group=>{
    const records=group.accounts.map(a=>({account:a,metric:daily.get(a.id)}))
    const known=records.filter(x=>x.metric?.data_status==='ok')
    const spent=known.reduce((n,x)=>n+Number(x.metric.spend||0),0)
    return <section key={group.id} style={{...panel,marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap',marginBottom:15}}>
       <div><h2 style={{margin:'0 0 4px',fontSize:23}}>{group.name}</h2><p style={{color:'#AAA',fontSize:13,margin:0}}>{group.accounts.length} conta(s) de anúncios • {known.length} conta(s) com números registrados para este dia</p></div>
       <div style={{textAlign:'right'}}><div style={{color:'#AAA',fontSize:12}}>{group.id==='unassigned'?'Contas sem cliente definido':'Investimento conhecido do cliente'}</div><strong style={{color:'#D4AF37',fontSize:25}}>{group.id==='unassigned'?'Valores individuais abaixo':known.length?brl(spent):'Sem dados'}</strong></div>
      </div>
      {group.accounts.map(a=>{
       const m=daily.get(a.id)
       const goal=goals.find(g=>g.client_id===a.id&&!g.campaign_id)
       return <article key={a.id} style={{background:'#1B1B1B',border:'1px solid #39332B',borderRadius:12,padding:18,marginTop:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}>
         <div><strong style={{fontSize:17}}>{a.name}</strong><div style={{color:'#999',fontSize:12,marginTop:5}}>Conta Meta: {a.meta_account_id} • {a.mcp_status==='enabled'?'MCP habilitado':'MCP pendente'}</div></div>
         <label style={{fontSize:12,color:'#AAA'}}>Cliente responsável <select aria-label={'Cliente responsável pela conta '+a.name} disabled={saving} value={a.business_id||''} onChange={e=>assign(a.id,e.target.value)} style={{...inputStyle,marginLeft:7}}><option value="">Sem vínculo</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:9,marginBottom:12}}>
         {[['Investimento',m?.data_status==='ok'?brl(m.spend):'—'],['Cliques no link',m?.data_status==='ok'?num(m.clicks):'—'],['CTR do link',m?.data_status==='ok'?pc(m.ctr):'—'],['Leads',m?.data_status==='ok'&&m.leads!=null?num(m.leads):'—']].map(([title,value])=><div key={title} style={{background:'#111',borderRadius:9,padding:12}}><div style={{fontSize:12,color:'#999',marginBottom:5}}>{title}</div><strong style={{fontSize:18}}>{value}</strong></div>)}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',alignItems:'center'}}>
         <div style={{color:'#B7B7B7',fontSize:13}}>Objetivo configurado: <strong style={{color:'#FFF'}}>{goal?objectives[goal.objective]||goal.objective:'Ainda não definido'}</strong>{goal?.target_cost!=null?' • Custo-alvo: '+brl(goal.target_cost):''}{m?.data_status==='no_data'?' • Sem dados retornados':!m?' • Sem coleta neste dia':''}</div>
         <button style={{...buttonStyle,background:'#2C2414',color:'#E3C16C',border:'1px solid #69552B'}} onClick={()=>editGoal(a)}>Configurar objetivo e meta</button>
        </div>
       </article>
      })}
     </section>
   })}
   <section style={panel}><h2 style={{fontSize:18,margin:'0 0 8px'}}>Relatórios individuais</h2><p style={{color:'#AAA',fontSize:13,lineHeight:1.7}}>Relatórios cadastrados no backend: {reports.length}. As alunas consultam apenas as contas vinculadas aos seus cadastros; relatórios precisam ser publicados para aparecerem no acesso individual. A contagem de leads não é utilizada como meta universal; precisamos associar a métrica correta a cada campanha.</p><p style={{color:'#D4AF37',fontSize:13}}>Áudio oculto para todas as alunas.</p></section>
   </section>}
   {editing&&<div role="dialog" aria-modal="true" aria-label="Configuração de objetivo" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:99,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
     <form onSubmit={saveGoal} style={{...panel,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',boxSizing:'border-box'}}>
      <h2 style={{margin:'0 0 6px',fontSize:21}}>Objetivo da conta</h2><p style={{color:'#AAA',fontSize:13}}>{editing.account.name}. Configuração inicial da conta; metas de cada campanha poderão ser cadastradas separadamente.</p>
      <label style={{display:'block',fontSize:13,marginBottom:12}}>Objetivo<select value={editing.objective} onChange={e=>setEditing({...editing,objective:e.target.value})} style={{...inputStyle,display:'block',width:'100%',marginTop:5}}>{Object.entries(objectives).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      <label style={{display:'block',fontSize:13,marginBottom:12}}>Nome da métrica principal<input value={editing.metric_label} onChange={e=>setEditing({...editing,metric_label:e.target.value})} placeholder="Ex.: conversas iniciadas, compras, cadastros" style={{...inputStyle,display:'block',width:'100%',boxSizing:'border-box',marginTop:5}}/></label>
      <label style={{display:'block',fontSize:13,marginBottom:12}}>Custo máximo desejado por resultado (R$)<input type="number" step="0.01" min="0" value={editing.target_cost} onChange={e=>setEditing({...editing,target_cost:e.target.value})} style={{...inputStyle,display:'block',width:'100%',boxSizing:'border-box',marginTop:5}}/></label>
      <label style={{display:'block',fontSize:13,marginBottom:18}}>Meta de resultados no período<input type="number" step="1" min="0" value={editing.target_quantity} onChange={e=>setEditing({...editing,target_quantity:e.target.value})} style={{...inputStyle,display:'block',width:'100%',boxSizing:'border-box',marginTop:5}}/></label>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button type="button" onClick={()=>setEditing(null)} style={{...buttonStyle,background:'#444',color:'#FFF'}}>Cancelar</button><button disabled={saving} style={buttonStyle}>Salvar meta</button></div>
     </form>
    </div>}
  </div>
 </main></>
}
