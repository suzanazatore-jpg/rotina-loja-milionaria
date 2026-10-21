'use client'
import {useCallback,useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import TrafficDashboard from '../admin/trafego/TrafficDashboard'
export default function Traffic(){
 const router=useRouter(),[data,setData]=useState(null),[error,setError]=useState(''),[selectedReport,setSelectedReport]=useState(null)
 const load=useCallback(async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session){router.replace('/login');return}const r=await fetch('/api/trafego',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);setData(body);setSelectedReport(body.reports?.find(r=>r.id===new URL(window.location.href).searchParams.get('report'))||null);setError('')}catch(e){setError(e.message)}},[router])
 useEffect(()=>{load()},[load])
 return <main className="traffic-client-shell"><Link href="/painel">← Meu aplicativo e minhas aulas</Link>{error?<section role="alert"><p>{error}</p><button onClick={load}>Tentar novamente</button></section>:!data?<p>Carregando seus relatórios…</p>:data.pending?<section className="td-panel"><h1>Meus relatórios</h1><p>Seus relatórios aparecerão após a aprovação e vinculação da conta pela Suzana.</p></section>:<TrafficDashboard key={selectedReport?.id||'latest'} {...data} initialReport={selectedReport} clients={[]} onRefresh={load}/>}</main>
}
