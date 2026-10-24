'use client'
import Image from 'next/image'
import {useEffect,useRef,useState} from 'react'
import styles from './ProductInterior.module.css'
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'
export default function ProductDetails({product,marketplaces,plans,token,onSave,saving,advanced}) {
  const [draft,setDraft]=useState({...product,plan_id:product.plan_id || '',brevo_list_id:product.brevo_list_id ?? '',botconversa_tag:product.botconversa_tag || ''})
  const [baseline]=useState(()=>JSON.stringify({...product,plan_id:product.plan_id || '',brevo_list_id:product.brevo_list_id ?? '',botconversa_tag:product.botconversa_tag || ''}))
  const dirty=JSON.stringify(draft)!==baseline
  useEffect(()=>{if(!dirty)return;const warn=event=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  const [uploading,setUploading]=useState(false)
  const [error,setError]=useState('')
  const [imageFailed,setImageFailed]=useState(false)
  const fileInput=useRef(null)
  const change=(key,value)=>setDraft(current=>({...current,[key]:value}))
  async function submit(event) {event.preventDefault();setError('');try{await onSave(draft)}catch(e){setError(e.message)}}
  async function upload(event) {
    const file=event.target.files?.[0]
    if(!file)return
    setError('')
    if(file.size>4*1024*1024){setError('A imagem deve ter até 4 MB.');event.target.value='';return}
    setUploading(true)
    try {
      const form=new FormData();form.set('image',file)
      const response=await fetch('/api/admin/checkout/produtos/imagem',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form})
      const json=await response.json()
      if(!response.ok)throw new Error(json.error || 'Não foi possível carregar a imagem.')
      change('image_url',json.url);setImageFailed(false)
    }catch(e){setError(e.message)}finally{setUploading(false);event.target.value=''}
  }
  return <form onSubmit={submit} className={styles.detailCard}>
    <section className={styles.detailFields}><h2 className={styles.sectionTitle}>Detalhe</h2><div className={styles.fieldGrid}>
      <label>Código *<input value={draft.code || ''} onChange={e=>change('code',e.target.value)} required inputMode="numeric" pattern="[0-9]{10}" /></label>
      <label>Marketplace<select value={draft.marketplace_id || 'pagarme'} onChange={e=>change('marketplace_id',e.target.value)}>{marketplaces.filter(m=>m.active || m.id===draft.marketplace_id).map(m=><option key={m.id} value={m.id} disabled={!m.active}>{m.name}</option>)}</select></label>
      <label className={styles.wide}>Nome *<input value={draft.name} onChange={e=>change('name',e.target.value)} required /></label>
      <label>Produtor<input readOnly value="Suzana Zatorre Educacional" /></label><label>Tipo<input readOnly value={draft.type==='subscription'?'Assinatura':'Produto'} /></label>
      <label className={styles.wide}>Domínio do checkout<input readOnly value={typeof window==='undefined'?'':window.location.origin}/><small>Padrão da central</small></label>
      <label className={styles.switch}><input type="checkbox" role="switch" checked={draft.active} onChange={e=>change('active',e.target.checked)}/>Produto ativo</label>
      <div className={styles.wide}><label>Rastreamento</label><p className={styles.note}>Configurado por oferta ou pelo padrão da central.</p></div>
      <div><label>Criado em</label><p className={styles.date}>{date(product.created_at)}</p></div><div><label>Atualizado em</label><p className={styles.date}>{date(product.updated_at)}</p></div>
    </div>
    {advanced && <section className={styles.advanced}><h3>Plano e integrações</h3><div className={styles.fieldGrid}><label className={styles.wide}>Plano do aplicativo<select value={draft.plan_id} onChange={e=>change('plan_id',e.target.value)}><option value="">Sem plano vinculado</option>{plans.map(p=><option key={p.id} value={p.id}>{p.commercial_name || p.name} · {p.period_days} dias</option>)}</select></label><label>Lista do Brevo<input type="number" value={draft.brevo_list_id} onChange={e=>change('brevo_list_id',e.target.value)}/></label><label>Tag no BotConversa<input value={draft.botconversa_tag} onChange={e=>change('botconversa_tag',e.target.value)}/></label></div></section>}
    {error && <p role="alert" className="central-error">{error}</p>}<div className={styles.saveRow}><button type="submit" className="central-primary" disabled={saving || uploading || !dirty}>{saving?'Salvando…':'Salvar'}</button></div>
    </section>
    <aside className={styles.imagePanel}><h2 className={styles.sectionTitle}>Imagem</h2><p className={styles.imageTip}>Tamanho ideal<br/>1024 × 1024 (quadrada)</p>{draft.image_url && !imageFailed?<Image key={draft.image_url} src={draft.image_url} alt={`Imagem de ${draft.name}`} width={240} height={240} unoptimized className={styles.productImage} onError={()=>setImageFailed(true)}/>:<div className={styles.imagePlaceholder}>{imageFailed?'Imagem indisponível':'Sem imagem'}</div>}<input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} onChange={upload} className={styles.hiddenInput}/><div className={styles.imageActions}><button type="button" className={styles.iconButton} disabled={uploading || saving} aria-label="Selecionar imagem do produto" title="Selecionar imagem" onClick={()=>fileInput.current?.click()}>↥</button><button type="button" className={styles.iconButton} disabled={!draft.image_url || uploading || saving} aria-label="Remover imagem do produto" title="Remover imagem" onClick={()=>{change('image_url',null);setImageFailed(false)}}>×</button></div><p className={styles.note}>{uploading?'Carregando imagem…':'JPG, PNG ou WebP · até 4 MB'}</p></aside>
  </form>
}
