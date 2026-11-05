'use client'
import Image from 'next/image'
import ImageCropEditor from './ImageCropEditor'
import {CHECKOUT_ORIGIN} from '@/lib/checkoutLinks'
import {useEffect,useRef,useState} from 'react'
import styles from './ProductInterior.module.css'
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}).replace(',',''):'—'
export default function ProductDetails({product,marketplaces,plans,token,onSave,saving,advanced}) {
  const [draft,setDraft]=useState({...product,plan_id:product.plan_id || '',brevo_list_id:product.brevo_list_id ?? '',botconversa_tag:product.botconversa_tag || ''})
  const [baseline]=useState(()=>JSON.stringify({...product,plan_id:product.plan_id || '',brevo_list_id:product.brevo_list_id ?? '',botconversa_tag:product.botconversa_tag || ''}))
  const dirty=JSON.stringify(draft)!==baseline
  useEffect(()=>{if(!dirty)return;const warn=event=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  const [uploading,setUploading]=useState(false),[cropFile,setCropFile]=useState(null)
  const [error,setError]=useState('')
  const [imageFailed,setImageFailed]=useState(false)
  const fileInput=useRef(null)
  const change=(key,value)=>setDraft(current=>({...current,[key]:value}))
  async function submit(event) {event.preventDefault();setError('');try{await onSave(draft)}catch(e){setError(e.message)}}
  function upload(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Envie JPG, PNG ou WebP de até 4 MB.');return}setError('');setCropFile(file)}
  async function adjust(){setError('');try{const response=await fetch(draft.image_url);if(!response.ok)throw new Error('Não foi possível abrir esta imagem. Envie o arquivo novamente.');const blob=await response.blob();if(blob.size>4*1024*1024)throw new Error('Envie uma imagem de até 4 MB.');setCropFile(new File([blob],'imagem-atual',{type:blob.type}))}catch(e){setError(e.message)}}
  async function uploadCropped(file){
    setUploading(true)
    try {
      const form=new FormData();form.set('image',file)
      const response=await fetch('/api/admin/checkout/produtos/imagem',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form})
      const json=await response.json()
      if(!response.ok)throw new Error(json.error || 'Não foi possível carregar a imagem.')
      change('image_url',json.url);setImageFailed(false);setCropFile(null)
    }catch(e){setError(e.message);throw e}finally{setUploading(false)}
  }
  const validCode = /^[1-9][0-9]{9}$/.test(String(draft.code || ''))
  const validName = Boolean(draft.name?.trim())
  const provider = marketplaces.find(item => item.id === (draft.marketplace_id || 'pagarme'))
  return <>
    {cropFile && <ImageCropEditor file={cropFile} busy={uploading} onClose={()=>setCropFile(null)} onConfirm={uploadCropped}/>}
    <form onSubmit={submit} className={`${styles.detailCard} cv-product-details`}>
      <section className={styles.detailFields}>
        <div className={styles.titleRow}>
          <h2 className={styles.sectionTitle}>Detalhe</h2>
          <SectionHelp title="Detalhe">Edite o cadastro e clique em Enviar. Oculto retira o produto da lista principal. Uso em Rastreamentos inclui o produto na lista em Configurações → Pixels e rastreamento.</SectionHelp>
          <span className={styles.edition}>Checkout próprio</span>
        </div>
        <div className={styles.fieldGrid}>
          <label>Código *<span className={styles.validField}>
            <input value={draft.code ?? ''} onChange={e=>change('code',e.target.value)} required inputMode="numeric" pattern="[1-9][0-9]{9}" maxLength={10} title="Código de 10 dígitos" />
            {validCode && <span aria-hidden="true">✓</span>}
          </span></label>
          <label>Provedor<input readOnly value={provider?.name || draft.marketplace_id || 'Pagar.me'}/></label>
          <label className={styles.wide}>Nome *<span className={styles.validField}>
            <input value={draft.name} onChange={e=>change('name',e.target.value)} required />
            {validName && <span aria-hidden="true">✓</span>}
          </span></label>
          <label>Produtor<select defaultValue="sz"><option value="sz">Suzana Zatorre Educacional Ltda</option></select></label>
          <label>Tipo<input readOnly value={draft.type==='subscription'?'Assinatura':'Avulso'} /></label>
          <label className={`${styles.wide} ${styles.groupField}`}>
            <span className={styles.srOnly}>Grupo</span><select disabled defaultValue=""><option value="">Grupo</option></select>
          </label>
          <label className={styles.wide}>Domínio Próprio
            <select defaultValue={CHECKOUT_ORIGIN}><option>{CHECKOUT_ORIGIN}</option></select><small>Herdado da conta</small>
          </label>
          <div className={styles.switches}>
            <label className={styles.switch}><input className={styles.offerSwitch} type="checkbox" role="switch" checked={draft.catalog_hidden === true} onChange={e=>change('catalog_hidden',e.target.checked)}/>Oculto</label>
            <label className={styles.switch}><input className={styles.offerSwitch} type="checkbox" role="switch" checked={draft.tracking_eligible === true} onChange={e=>change('tracking_eligible',e.target.checked)}/>Uso em Rastreamentos</label>
          </div>
          <div><span className={styles.dateLabel}>Criado Em</span><p className={styles.date}>{date(product.created_at)}</p></div>
          <div><span className={styles.dateLabel}>Atualizado Em</span><p className={styles.date}>{date(product.updated_at)}</p></div>
        </div>
        {advanced && <section className={styles.advanced}>
          <h3>Plano e integrações</h3>
          <label className={styles.switch}>
            <input className={styles.offerSwitch} type="checkbox" role="switch" checked={draft.active} onChange={e=>change('active',e.target.checked)}/>
            Disponível para compra
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.wide}>Provedor
              <select value={draft.marketplace_id || 'pagarme'} onChange={e=>change('marketplace_id',e.target.value)}>
                {marketplaces.filter(m=>m.active || m.id===draft.marketplace_id).map(m=><option key={m.id} value={m.id} disabled={!m.active}>{m.name}</option>)}
              </select>
            </label>
            <label className={styles.wide}>Plano do aplicativo
              <select value={draft.plan_id} onChange={e=>change('plan_id',e.target.value)}>
                <option value="">Sem plano vinculado</option>
                {plans.map(p=><option key={p.id} value={p.id}>{p.commercial_name || p.name} · {p.period_days} dias</option>)}
              </select>
            </label>
            <label>Lista do Brevo<input type="number" value={draft.brevo_list_id} onChange={e=>change('brevo_list_id',e.target.value)}/></label>
            <label>Tag no BotConversa<input value={draft.botconversa_tag} onChange={e=>change('botconversa_tag',e.target.value)}/></label>
          </div>
        </section>}

        {error && <p role="alert" className="central-error">{error}</p>}
        <div className={styles.saveRow}>
          <button type="submit" className="central-primary" disabled={saving || uploading || !dirty || !validCode || !validName}>{saving?'Enviando…':'Enviar'}</button>
        </div>
      </section>
      <aside className={styles.imagePanel}>
        <div className={styles.titleRow}>
          <h2 className={styles.sectionTitle}>Imagem</h2>
          <SectionHelp title="Imagem">Selecione uma imagem JPG, PNG ou WebP de até 4 MB, ajuste o enquadramento e clique em Enviar para salvar.</SectionHelp>
        </div>
        <p className={styles.imageTip}><span aria-hidden="true">ⓘ</span> Tamanho ideal 1024×1024 (quadrada)</p>
        {draft.image_url && !imageFailed
          ? <Image key={draft.image_url} src={draft.image_url} alt={`Imagem de ${draft.name}`} width={180} height={180} unoptimized className={styles.productImage} onError={()=>setImageFailed(true)}/>
          : <div className={styles.imagePlaceholder} role="img" aria-label={imageFailed?'Imagem indisponível':'Sem imagem'}>
              <svg viewBox="0 0 48 36" width="88" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                <rect x="2" y="3" width="44" height="30" rx="4"/><circle cx="12" cy="11" r="3"/>
                <path d="m7 28 10-11 6 6 7-10 11 15z" strokeLinejoin="round"/>
              </svg>
            </div>}
        <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} onChange={upload} className={styles.hiddenInput}/>
        <div className={styles.imageActions}>
          <button type="button" className={styles.iconButton} disabled={uploading || saving} aria-label="Selecionar imagem do produto" title="Selecionar imagem" onClick={()=>fileInput.current?.click()}>
            <svg viewBox="0 0 24 24" width="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6"/></svg>
          </button>
          {draft.image_url && <button type="button" className={styles.iconButton} disabled={uploading || saving} aria-label="Remover imagem do produto" title="Remover imagem" onClick={()=>{change('image_url',null);setImageFailed(false)}}>×</button>}
        </div>
        {draft.image_url && <button type="button" className="central-action cv-adjust-image" disabled={uploading || saving} onClick={adjust}>Ajustar enquadramento</button>}
      </aside>
    </form>
  </>
}

function SectionHelp({title,children}) {
  return <details className={styles.help}><summary aria-label={`Ajuda sobre ${title}`}>ⓘ Ajuda</summary><div>{children}</div></details>
}
