'use client'
import {useEffect,useState} from 'react'
import CheckoutSettingsEditor from './CheckoutSettingsEditor'
import {productCheckoutDraft,checkoutConfigChanges} from '@/lib/checkoutConfigPatch'
export default function ProductCheckout({product,offers,globalConfig,token,onSaved}) {
  const [locked,setLocked]=useState(false)
  const [offerId,setOfferId]=useState(offers.find(o=>o.active)?.id || offers[0]?.id || '')
  const offer=offers.find(o=>o.id===offerId)
  return <section><h2>Configuração do Checkout</h2><label>Oferta<select disabled={locked} value={offerId} onChange={e=>setOfferId(e.target.value)}>{offers.map(o=><option key={o.id} value={o.id}>{o.name}{!o.active?' · Inativa':''}</option>)}</select></label>{offer?<OfferConfig key={offer.id} offer={offer} product={product} globalConfig={globalConfig} token={token} onSaved={onSaved} onDirty={setLocked}/>:<p>Nenhuma oferta cadastrada neste produto.</p>}</section>
}
function OfferConfig({offer,product,globalConfig,token,onSaved,onDirty}) {
  const [saved,setSaved]=useState(offer)
  const [draft,setDraft]=useState(()=>productCheckoutDraft(offer,globalConfig))
  const [baseline,setBaseline]=useState(()=>productCheckoutDraft(offer,globalConfig))
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const changes=checkoutConfigChanges(baseline,draft),dirty=Object.keys(changes).length>0
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty])
  useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  async function save() {
    setBusy(true);setMessage('')
    try {
      const response=await fetch('/api/admin/checkout/configuracao-oferta',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:saved.id,product_id:product.id,baseline:saved.checkout_config,thank_you_url:saved.thank_you_url,changes})})
      const json=await response.json();if(!response.ok)throw new Error(json.error || 'Não foi possível salvar.')
      setSaved(json.offer);const next=productCheckoutDraft(json.offer,globalConfig);setBaseline(next);setDraft(next);onSaved(json.offer);setMessage('✓ Configuração salva.')
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  return <><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><CheckoutSettingsEditor value={draft} onChange={setDraft} offer={saved} product={product} globalConfig={globalConfig} productEditor token={token}/></fieldset>{message&&<p role="status">{message}</p>}<div className="central-editor-actions"><span>{dirty?'Alterações ainda não salvas':'Nenhuma alteração pendente'}</span><button type="button" className="central-action" disabled={busy||!dirty} onClick={()=>{setDraft(baseline);setMessage('')}}>Redefinir</button><button type="button" className="central-primary" disabled={busy||!dirty} onClick={save}>{busy?'Enviando…':'Enviar'}</button></div></>
}
