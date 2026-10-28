'use client'
import { useEffect,useId,useState } from 'react'
import styles from './CatalogAudit.module.css'

const fields={name:'Nome',code:'Código',slug:'Link',type:'Tipo',plan_id:'Plano de acesso',access_days:'Prazo de acesso',active:'Status',price_cents:'Preço',payment_methods:'Formas de pagamento',max_installments:'Parcelamento',free_installments:'Parcelas sem juros',monthly_interest_pct:'Juros',pix_discount_pct:'Desconto no Pix',checkout_config:'Configuração do checkout',thank_you_url:'Página de obrigado',billing_interval:'Recorrência',billing_interval_count:'Intervalo de cobrança',trial_days:'Dias grátis',brevo_list_id:'Lista do Brevo',botconversa_tag:'Tag do BotConversa'}
function initialPeriod() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const get=type=>parts.find(part=>part.type===type).value
  const end=`${get('year')}-${get('month')}-${get('day')}`
  const start=new Date(`${end}T12:00:00Z`)
  const day=start.getUTCDate()
  start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-6)
  const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate()
  start.setUTCDate(Math.min(day,last))
  return {inicio:start.toISOString().slice(0,10),fim:end}
}
const dateLabel=value=>value?value.split('-').reverse().join('/'):'Todo o período'
function title(row) {
  const entity=row.payload.entity==='oferta'?'Oferta':'Produto'
  return row.payload.action==='insert'?`${entity} ${entity==='Oferta'?'cadastrada':'cadastrado'}`:row.payload.action==='update'?`${entity} ${entity==='Oferta'?'atualizada':'atualizado'}`:'Produtos importados e ativados'
}
function Icon({filter=false}) {return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{filter?<path d="M3 4h18l-7 8v7l-4 2v-9z"/>:<><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/></>}</svg>}
export default function CatalogAudit({productId,offerId,token}) {
  const [data,setData]=useState(null)
  const [page,setPage]=useState(1)
  const [error,setError]=useState('')
  const [period,setPeriod]=useState(initialPeriod)
  const [draft,setDraft]=useState(period)
  const [filtersOpen,setFiltersOpen]=useState(false)
  const filterId=useId()
  useEffect(()=>{
    const controller=new AbortController()
    const params=new URLSearchParams({page:String(page),...period,...(productId?{produto:productId}:{}),...(offerId?{oferta:offerId}:{})})
    fetch(`/api/admin/checkout/auditoria?${params}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal}).then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error);if(!controller.signal.aborted)setData(json)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>controller.abort()
  },[productId,offerId,token,page,period])
  function apply(next) {setPeriod(next);setDraft(next);setPage(1);setData(null);setError('');setFiltersOpen(false)}
  return <section className={styles.audit} aria-label="Auditoria"><h2>Auditoria</h2>
    <div className={styles.toolbar}><span className={styles.period}>◷ {period.inicio || period.fim?`${dateLabel(period.inicio)} — ${period.fim?dateLabel(period.fim):'Hoje'}`:'Todo o período'}</span><button type="button" className={styles.filterButton} aria-expanded={filtersOpen} aria-controls={filterId} onClick={()=>setFiltersOpen(open=>!open)}><Icon filter/>Filtros</button></div>
    {filtersOpen && <form id={filterId} className={styles.filters} onSubmit={e=>{e.preventDefault();apply(draft)}}><label>De<input type="date" value={draft.inicio} max={draft.fim || undefined} onChange={e=>setDraft({...draft,inicio:e.target.value})}/></label><label>Até<input type="date" value={draft.fim} min={draft.inicio || undefined} onChange={e=>setDraft({...draft,fim:e.target.value})}/></label><button type="button" className="central-action" onClick={()=>apply({inicio:'',fim:''})}>Limpar</button><button className="central-primary" disabled={Boolean(draft.inicio && draft.fim && draft.inicio>draft.fim)}>Aplicar</button></form>}
    {error && <p role="alert" className="central-error">{error}</p>}
    {!data && !error && <p role="status" className={styles.empty}>Carregando…</p>}
    {data?.rows.length===0 && <p className={styles.empty}>Nenhuma alteração neste período.</p>}
    {data?.rows.length>0 && <ol className={styles.timeline}>{data.rows.map(row=><li key={row.id} className={styles.item}><span className={styles.marker}><Icon/></span><details className={styles.card}><summary><span>{title(row)}</span><time dateTime={row.received_at}>{new Date(row.received_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</time></summary><div className={styles.details}>{row.payload.name && <p><strong>{row.payload.name}</strong></p>}<p>Executor: {row.payload.actor || 'Administração'}</p>{row.payload.changed_fields?.length>0 && <p>Alterações: {row.payload.changed_fields.map(key=>fields[key] || key).join(', ')}.</p>}</div></details></li>)}</ol>}
    {data && data.count>25 && <div className="central-editor-actions"><button type="button" className="central-action" disabled={page===1} onClick={()=>{setData(null);setError('');setPage(p=>p-1)}}>Anterior</button><span>Página {page}</span><button type="button" className="central-action" disabled={page*25>=data.count} onClick={()=>{setData(null);setError('');setPage(p=>p+1)}}>Próxima</button></div>}
  </section>
}
