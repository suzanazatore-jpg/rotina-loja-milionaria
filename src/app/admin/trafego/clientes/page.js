'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {supabase} from '@/lib/supabase'
import '../traffic-dashboard.css'
export default function TrafficClients(){
 const router=useRouter(),[rows,setRows]=useState(null),[error,setError]=useState(''),[search,setSearch]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
 const {data:{session}}=await supabase.auth.getSession();if(!session){router.replace('/login');return}if(session.user.email!=='suporte@suzanazatorre.com.br'){setError('Acesso restrito ao escritório.');return}
 const [links,accounts]=await Promise.all([supabase.from('traffic_client_users').select('user_id,client_id'),supabase.from('traffic_clients').select('id,name,meta_account_id')]);if(links.error||accounts.error)throw links.error||accounts.error
 const ids=[...new Set((links.data||[]).map(x=>x.user_id))];if(!ids.length){if(live)setRows([]);return}
 const profiles=await supabase.from('profiles').select('id,name,status,role').in('id',ids);if(profiles.error)throw profiles.error
 if(live)setRows((profiles.data||[]).filter(p=>p.role==='student').map(p=>({...p,accounts:(links.data||[]).filter(l=>l.user_id===p.id).map(l=>accounts.data.find(a=>a.id===l.client_id)).filter(Boolean)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')))
 }catch(e){if(live)setError(e.message)}})();return()=>{live=false}},[router])
 return <><aside className="td-sidebar"><div className="td-brand">SZ <span>INTELIGÊNCIA</span></div><p>SUZANA ZATORRE</p><nav><a href="/admin/trafego">▦ Relatório por cliente</a><a className="current" href="/admin/trafego/clientes">Clientes</a><a href="/admin/trafego/configuracoes">⚙ Contas e configurações</a><a href="/admin/alunas">Alunas e vínculos</a><a href="/admin">← Meu Escritório</a></nav></aside><main className="traffic-office-shell" style={{background:'#f5f4ef',color:'#25221c',minHeight:'100vh'}}><div className="traffic-dashboard"><header className="td-heading"><div><h1>Clientes</h1><p>CADASTROS APROVADOS NO ROTINA</p></div></header><p className="td-notice">Somente alunos com contas de anúncios vinculadas por você no cadastro. Uma aluna pode ter mais de uma conta.</p>{error?<p role="alert">{error}</p>:rows===null?<p>Carregando…</p>:<section className="td-panel"><label>Buscar cliente <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome no Rotina"/></label><p>{rows.length} clientes com contas vinculadas</p><div className="td-scroll"><table><thead><tr><th>Cliente</th><th>Status no Rotina</th><th>Contas vinculadas</th></tr></thead><tbody>{rows.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.status==='active'?'Ativo':p.status==='blocked'?'Bloqueado':p.status}</td><td>{p.accounts.map(a=><div key={a.id}>{a.name}<small>{a.meta_account_id}</small></div>)}</td></tr>)}</tbody></table></div><p>Para alterar os vínculos, use Alunas e vínculos.</p></section>}</div></main></>
}
