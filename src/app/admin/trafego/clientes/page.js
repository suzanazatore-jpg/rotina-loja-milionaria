'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {supabase} from '@/lib/supabase'
import '../traffic-dashboard.css'
export default function TrafficClients(){
 const router=useRouter(),[rows,setRows]=useState(null),[error,setError]=useState(''),[search,setSearch]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
 const {data:{session}}=await supabase.auth.getSession();if(!session){router.replace('/login');return}if(session.user.email!=='suporte@suzanazatorre.com.br'){setError('Acesso restrito ao escritório.');return}
 const response=await fetch('/api/admin/trafego/clientes',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'})
 const result=await response.json();if(!response.ok)throw Error(result.error)
 if(live)setRows(result.clients)

 }catch(e){if(live)setError(e.message)}})();return()=>{live=false}},[router])
 return <><aside className="td-sidebar"><div className="td-brand">SZ <span>INTELIGÊNCIA</span></div><p>SUZANA ZATORRE</p><nav><a href="/admin/trafego">▦ Relatório por cliente</a><a className="current" href="/admin/trafego/clientes">Clientes</a><a href="/admin">← Meu Escritório</a></nav></aside><main className="traffic-office-shell" style={{background:'#f5f4ef',color:'#25221c',minHeight:'100vh'}}><div className="traffic-dashboard"><header className="td-heading"><div><h1>Clientes</h1><p>CADASTROS APROVADOS NO ROTINA</p></div></header><p className="td-notice">Somente alunos com contas de anúncios vinculadas por você no cadastro. Uma aluna pode ter mais de uma conta.</p>{error?<p role="alert">{error}</p>:rows===null?<p>Carregando…</p>:<section className="td-panel"><label>Buscar cliente <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome no Rotina"/></label><p>{rows.length} clientes com contas vinculadas</p><div className="td-scroll"><table><thead><tr><th>Cliente</th><th>Status no Rotina</th><th>Contas vinculadas</th></tr></thead><tbody>{rows.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.status==='active'?'Ativo':p.status==='blocked'?'Bloqueado':p.status}</td><td>{p.accounts.map(a=><div key={a.id}>{a.name}<small>{a.meta_account_id}</small></div>)}</td></tr>)}</tbody></table></div></section>}</div></main></>
}
