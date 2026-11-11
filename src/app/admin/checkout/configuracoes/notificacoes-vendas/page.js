'use client'
import {useCallback,useEffect,useState} from 'react'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import styles from './Notifications.module.css'
const events={order_created:'Venda criada',order_paid:'Venda aprovada'}
const labels={queued:'Na fila',sending:'Processando',sent:'Aceito pelo provedor',delivered:'Entregue',failed:'Falha',skipped:'Ignorado'}
const fmt=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'
export default function SaleNotifications(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[newItem,setNewItem]=useState({name:'',channel:'whatsapp',destination:''}),[preview,setPreview]=useState(null)
 const auth=async()=>{const {data:{session}}=await supabase.auth.getSession();return {'Authorization':`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'}}
 const load=useCallback(async()=>{const response=await fetch('/api/admin/checkout/notificacoes-vendas',{headers:await auth(),cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Falha na consulta.');setData(body)},[])
 useEffect(()=>{load().catch(error=>setMessage(error.message))},[load])
 async function act(body){
  setBusy(true);setMessage('')
  try{
   const response=await fetch('/api/admin/checkout/notificacoes-vendas',{method:'POST',headers:await auth(),body:JSON.stringify(body)})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error||'Falha na operação.')
   if(body.action==='test')setPreview({recipient:data.recipients.find(r=>r.id===body.id),...result})
   else await load()
   setMessage(body.action==='test'?(result.dry_run?'Prévia gerada; nenhuma mensagem foi enviada.':'Teste solicitado ao provedor; confirme o recebimento no aparelho ou na caixa de entrada.'):'Configuração salva.')
   if(body.action==='recipient')setNewItem({name:'',channel:'whatsapp',destination:''})
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 return <main className="central-home">
  <nav className="central-breadcrumb"><Link href="/admin/checkout/configuracoes">Configurações</Link><span>/</span><strong>Notificações de vendas</strong></nav>
  <header className="central-dashboard-heading"><div><span className="central-eyebrow">CHECKOUT • ALERTAS</span><h1>Notificações de vendas</h1><p>Cadastre WhatsApps e e-mails, faça testes e acompanhe os envios.</p></div></header>
  {message&&<p role="status" className="central-editor-message">{message}</p>}
  {!data?<p>Carregando configuração...</p>:<>
   <section className="central-chart-panel">
    <h2>Segurança dos disparos</h2>
    <p className={styles.status}>{data.production_enabled?'Processador disponível no servidor':'Disparos automáticos bloqueados no servidor'} · WhatsApp: {data.channels.whatsapp?'configuração detectada':'conexão pendente'} · E-mail: {data.channels.email?'configuração detectada':'conexão pendente'}</p>
    <p className="central-data-note">Uma credencial configurada não comprova entrega. Os eventos só podem ser ligados depois da homologação do ambiente. O botão de prévia não envia mensagens.</p>
   </section>
   <section className="central-chart-panel">
    <h2>Eventos</h2>
    <div className={styles.stack}>{data.events.map(event=><label key={event.event_type} className={styles.line}><span><strong>{events[event.event_type]||event.event_type}</strong><small>{event.event_type==='order_paid'?'Apenas quando o pagamento é confirmado':'Quando o pedido é registrado'}</small></span><input type="checkbox" checked={event.enabled} disabled={busy||(!data.production_enabled&&!event.enabled)} onChange={e=>act({action:'event_toggle',event_type:event.event_type,enabled:e.target.checked})}/></label>)}</div>
   </section>
   <section className="central-chart-panel">
    <h2>Destinatários</h2>
    <div className={styles.stack}>{data.recipients.map(item=><div className={styles.line} key={item.id}><span><strong>{item.name}</strong><small>{item.channel==='whatsapp'?'WhatsApp':'E-mail'} · {item.destination}</small></span><div className={styles.buttons}><button type="button" className="central-action" disabled={busy} onClick={()=>act({action:'test',id:item.id,dry_run:true})}>Prévia</button><button type="button" className="central-action" disabled={busy||!data.channels[item.channel]} onClick={()=>{if(window.confirm('Enviar uma mensagem real de TESTE somente para este destinatário?'))act({action:'test',id:item.id,dry_run:false})}}>Testar envio</button><label className={styles.switch}>Ativo <input aria-label={`Ativar ${item.name}`} type="checkbox" checked={item.enabled} disabled={busy} onChange={e=>act({action:'recipient_toggle',id:item.id,enabled:e.target.checked})}/></label></div></div>)}</div>
    <h3>Adicionar destinatário</h3>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();act({action:'recipient',...newItem})}}>
     <label>Nome<input required maxLength={80} value={newItem.name} onChange={e=>setNewItem({...newItem,name:e.target.value})}/></label>
     <label>Canal<select value={newItem.channel} onChange={e=>setNewItem({...newItem,channel:e.target.value})}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></label>
     <label>Número ou e-mail<input required value={newItem.destination} onChange={e=>setNewItem({...newItem,destination:e.target.value})} placeholder={newItem.channel==='whatsapp'?'55 84 99999-9999':'contato@empresa.com'}/></label>
     <button className="central-primary" type="submit" disabled={busy}>Cadastrar desativado</button>
    </form>
   </section>
   {preview&&<section className="central-chart-panel"><h2>Prévia de teste — {preview.recipient?.name}</h2><p>{preview.dry_run?'Simulação sem envio':'Pedido de envio aceito pelo serviço'}</p><pre className={styles.preview}>{JSON.stringify(preview.preview||preview.result,null,2)}</pre></section>}
   <section className="central-chart-panel"><h2>Histórico de envios</h2><div className="central-table-wrap"><table className="central-table"><thead><tr><th>Data</th><th>Evento</th><th>Destinatário</th><th>Status</th><th>Tentativas</th></tr></thead><tbody>{data.deliveries.map(item=><tr key={item.id}><td>{fmt(item.created_at)}</td><td>{events[item.event_type]||item.event_type}</td><td>{data.recipients.find(r=>r.id===item.recipient_id)?.name||'Destinatário removido'}</td><td>{labels[item.status]||item.status}{item.error_message&&<small title={item.error_message}>Falha registrada</small>}</td><td>{item.attempts}</td></tr>)}{!data.deliveries.length&&<tr><td colSpan={5}>Nenhum disparo registrado ainda.</td></tr>}</tbody></table></div></section>
  </>}
 </main>
}
