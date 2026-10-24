'use client'
import {useState} from 'react'
import {supabase} from '@/lib/supabase'
export default function TrafficImport(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 async function upload(event){const file=event.target.files?.[0];if(!file)return;setBusy(true);setMessage('');try{if(file.size>5_000_000)throw Error('Arquivo excede 5 MB.');const {data:{session}}=await supabase.auth.getSession();const response=await fetch('/api/admin/trafego/importar',{method:'POST',headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'},body:await file.text()});const body=await response.json();if(!response.ok)throw Error(body.error);setMessage(`Coleta salva: ${body.campaigns} campanhas e ${body.ads} anúncios.`)}catch(e){setMessage(e.message)}finally{setBusy(false);event.target.value=''}}
 return <section className="td-panel"><h2>Coleta de campanhas e criativos</h2><p>Importe a coleta JSON da conta com métricas, campanhas, conjuntos e anúncios. As imagens e miniaturas precisam vir da coleta real da Meta.</p><label>Arquivo de coleta <input type="file" accept="application/json,.json" onChange={upload} disabled={busy}/></label>{message&&<p role="status">{message}</p>}</section>
}
