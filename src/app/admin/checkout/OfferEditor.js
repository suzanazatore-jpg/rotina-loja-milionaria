'use client'
import { trackingMode } from '@/lib/checkoutTracking'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CheckoutSettingsEditor,{CheckoutImageField} from './CheckoutSettingsEditor'
import Image from 'next/image'
import {paymentLink,offerPath} from '@/lib/checkoutLinks'
import OfferPaymentLinks from './OfferPaymentLinks'
import ProductSales from './ProductSales'
import detailStyles from './OfferDetail.module.css'
import CatalogAudit from './CatalogAudit'
import interior from './ProductInterior.module.css'
import CheckoutProfileField from './CheckoutProfileField'
import ContractOfferSettings from './ContractOfferSettings'
import { CHECKOUT_DEFAULTS } from '@/lib/checkoutSettings'
import { FormOferta, OFERTA_VAZIA } from './CheckoutForms'
const money = n => (Number(n || 0) / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
export default function OfferEditor({produtoId,ofertaId}) {
  const router = useRouter()
  const [catalog,setCatalog] = useState(null)
  const [dados,setDados] = useState(null)
  const [token,setToken] = useState('')
  const [tab,setTab] = useState('detalhes')
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [addOpen,setAddOpen] = useState(false)
  const [bumpProduct,setBumpProduct] = useState('')
  const [bumpOffer,setBumpOffer] = useState('')
  const [headline,setHeadline] = useState('Sim, quero adicionar!')
  const [description,setDescription] = useState('')
  const [baseline,setBaseline] = useState('')
  const [updatedAt,setUpdatedAt] = useState(null)
  useEffect(()=>{
    if(!token || ofertaId==='nova')return
    const controller=new AbortController()
    const params=new URLSearchParams({oferta:ofertaId})
    fetch(`/api/admin/checkout/auditoria?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(response=>response.ok?response.json():null)
      .then(data=>{if(!controller.signal.aborted)setUpdatedAt(data?.rows?.[0]?.received_at || null)})
      .catch(()=>{})
    return ()=>controller.abort()
  },[token,ofertaId,baseline])

  useEffect(()=>{
    let active = true
    async function load() {
      try {
        const {data:{session}} = await supabase.auth.getSession()
        if (!session) {router.replace('/login');return}
        const response = await fetch('/api/admin/checkout',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'})
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Não foi possível carregar a oferta.')
        const product = json.produtos.find(p=>p.id===produtoId)
        const offer = json.ofertas.find(o=>o.id===ofertaId && o.product_id===produtoId)
        if (!product || (ofertaId!=='nova' && !offer)) throw new Error('Produto ou oferta não encontrado.')
        const initial = offer ? {...OFERTA_VAZIA,...offer,promo_price:offer.checkout_config?.regular_price_cents ? (offer.price_cents/100).toFixed(2).replace('.',',') : '',price:((offer.checkout_config?.regular_price_cents || offer.price_cents)/100).toFixed(2).replace('.',','),thank_you_url:offer.thank_you_url || '',bumps:json.bumps.filter(b=>b.offer_id===offer.id).map(b=>({bump_offer_id:b.bump_offer_id,headline:b.headline,description:b.description || ''}))} : {...OFERTA_VAZIA,product_id:produtoId,payment_methods:product.type==='subscription'?['credit_card']:['pix','credit_card'],max_installments:product.type==='subscription'?1:12,monthly_interest_pct:product.type==='subscription'?'0':'2.99',bumps:[]}
        initial.checkout_config = {...CHECKOUT_DEFAULTS,...offer?.checkout_config,tracking_mode:trackingMode(offer?.checkout_config),appearance_mode:offer ? (offer.checkout_config?.appearance_mode || 'custom') : 'inherit',redirects:{...CHECKOUT_DEFAULTS.redirects,...offer?.checkout_config?.redirects,approved:offer?.checkout_config?.redirects?.approved || offer?.thank_you_url || ''}}
        if (active) {setCatalog(json);setDados(initial);setBaseline(JSON.stringify(initial));setToken(session.access_token);if(window.location.hash==='#checkout')setTab('checkout')}
      } catch(e) {if(active)setMessage(e.message)}
      finally {if(active)setLoading(false)}
    }
    load();return()=>{active=false}
  },[produtoId,ofertaId,router])
  const dirty = dados && JSON.stringify(dados)!==baseline
  useEffect(()=>{
    if(!dirty)return
    const warn=e=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  async function save(e) {
    e.preventDefault();setSaving(true);setMessage('')
    try {
      const response=await fetch('/api/admin/checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({entidade:'oferta',id:ofertaId==='nova'?undefined:ofertaId,dados})})
      const json=await response.json()
      if(!response.ok)throw new Error(json.error || 'Não foi possível salvar.')
      const saved = {...dados, id:json.id, slug:json.slug, payment_path:json.payment_path}
      setDados(saved)
      setBaseline(JSON.stringify(saved))
      setMessage('✓ Oferta salva.')
      if(ofertaId==='nova')router.replace(`/admin/checkout/produtos/${encodeURIComponent(produtoId)}/ofertas/${encodeURIComponent(json.id)}`)
    }catch(e){setMessage(e.message)}finally{setSaving(false)}
  }
  function move(index,direction) {setDados(current=>{const bumps=[...current.bumps];const next=index+direction;if(next<0||next>=bumps.length)return current;[bumps[index],bumps[next]]=[bumps[next],bumps[index]];return {...current,bumps}})}
  function addBump() {
    if(!bumpOffer)return
    setDados(current=>({...current,bumps:[...current.bumps,{bump_offer_id:bumpOffer,headline,description}]}))
    setAddOpen(false);setBumpProduct('');setBumpOffer('');setDescription('');setHeadline('Sim, quero adicionar!')
  }
  if(loading)return <p role="status" className="central-access">Carregando oferta…</p>
  if(!dados || !catalog)return <div className="central-error" role="alert">{message}<p><Link href="/admin/checkout">Voltar para Produtos</Link></p></div>
  const product=catalog.produtos.find(p=>p.id===produtoId)
  const base=`/admin/checkout/produtos/${encodeURIComponent(produtoId)}`
  const savedLink = ofertaId==='nova' ? '' : paymentLink(JSON.parse(baseline))
  const path = offerPath(dados.payment_path) || offerPath(dados.name)
  const link = path ? paymentLink({payment_path:path}) : ''
  const canShare = Boolean(link && link === savedLink)
  const available=catalog.ofertas.filter(o=>o.id!==ofertaId && o.active && !dados.bumps.some(b=>b.bump_offer_id===o.id) && catalog.produtos.find(p=>p.id===o.product_id)?.type==='one_time')
  return <main className={`central-home cv-offer-editor ${detailStyles.page}`}>
    <nav aria-label="Caminho da oferta" className={interior.breadcrumb}>
      <Link href="/admin/central-vendas">Início</Link><span>/</span><Link href="/admin/checkout">Produtos</Link><span>/</span>
      <Link href={base}>{product.name}</Link><span>/</span><span>Ofertas</span><span>/</span><strong>{dados.name || 'Nova oferta'}</strong>
    </nav>
    <div className={interior.topbar}>
      <Link className="central-action" href={base}>← Voltar ao produto</Link>
      <details className={interior.additional}><summary>⚙ Configurações adicionais</summary>
        <div>{[['checkout','Checkout'],['contrato','Contrato']].map(([key,label])=>
          <button key={key} onClick={e=>{e.currentTarget.closest('details').open=false;setTab(key)}}>{label}</button>
        )}</div>
      </details>
    </div>
    <nav className="central-product-tabs" aria-label="Abas da oferta">
      {[['detalhes','Detalhe'],['vendas','Vendas'],['bumps','Order Bump'],['frete','Frete'],['auditoria','Auditoria'],...([['checkout','Checkout'],['contrato','Contrato']].filter(([key])=>key===tab))].map(([key,label])=>
        <button key={key} disabled={key==='bumps' && product.type==='subscription'} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>
      )}
    </nav>
    {dados.guru_config?.unsupported_methods?.length > 0 && <p className="central-editor-message" role="note">Importada do Guru. {dados.guru_config.unsupported_methods.map(m=>m==='boleto'?'Boleto':'Pix recorrente').join(' e ')} ainda não disponível neste checkout. Preço e frequência preservados; cobrança automática disponível no cartão.</p>}
    {message && <p role="status" className="central-editor-message">{message}</p>}
    {tab==='detalhes' && <OfferPaymentLinks link={link} canShare={canShare} onMessage={setMessage}/>}
    {tab==='vendas' && (ofertaId==='nova' ? <p>Salve a oferta para consultar as vendas.</p> : <ProductSales productId={produtoId} offerId={ofertaId} token={token}/>)}
    {tab==='frete' && <section className="central-chart-panel"><h2>Frete</h2><p>Entrega digital · sem cobrança de frete.</p></section>}
    {tab==='auditoria' && ofertaId!=='nova' && <CatalogAudit offerId={ofertaId} token={token} />}
    <form onSubmit={save}>
      <div hidden={tab!=='detalhes'} className="central-offer-grid">
        <section className="central-chart-panel">
          <header className={detailStyles.heading}><h2>Detalhe</h2><span>Checkout próprio</span></header>
          <FormOferta dados={dados} produto={product} onChange={setDados}/>
          <CheckoutProfileField value={dados.checkout_config} onChange={checkout_config=>setDados({...dados,checkout_config})}/>
          <label className="central-active-switch"><input type="checkbox" role="switch" checked={dados.active} onChange={e=>setDados({...dados,active:e.target.checked})}/>Oferta ativa</label>
          <div className={detailStyles.dates}>
            <span>Criada em <time>{dados.created_at ? new Date(dados.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—'}</time></span>
            <span>Atualizada em <time>{updatedAt ? new Date(updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—'}</time></span>
          </div>
        </section>
        <aside className="central-chart-panel central-offer-image">
          <header className={detailStyles.heading}><h2>Imagem</h2></header>
          <p className={detailStyles.imageTip}>ⓘ　Tamanho ideal 1024 × 1024 (quadrada)</p>
          {(dados.checkout_config.product_image_url || product.image_url) && <Image unoptimized width={180} height={180} className="cv-offer-product-image" src={dados.checkout_config.product_image_url || product.image_url} alt="Imagem da oferta"/>}
          <details className={detailStyles.imageControls}><summary>Selecionar ou ajustar imagem</summary>
            <CheckoutImageField label="Imagem da oferta" value={dados.checkout_config.product_image_url || product.image_url || ''} onChange={url=>setDados({...dados,checkout_config:{...dados.checkout_config,product_image_url:url}})} style={{width:'100%'}}/>
            {dados.checkout_config.product_image_url && <button type="button" className="central-action" onClick={()=>setDados({...dados,checkout_config:{...dados.checkout_config,product_image_url:''}})}>Remover imagem da oferta</button>}
          </details>
        </aside>
      </div>
      <section hidden={tab!=='bumps'} className="central-chart-panel"><div className="central-section-heading"><h2>Order Bump</h2><button type="button" className="central-action" onClick={()=>setAddOpen(!addOpen)}>＋ Adicionar oferta</button></div><p className="central-data-note">Escolha os adicionais e a ordem em que aparecem. Salve a oferta para aplicar as alterações.</p>
        {addOpen && <div className="central-bump-add"><label>Produto<select value={bumpProduct} onChange={e=>{setBumpProduct(e.target.value);setBumpOffer('')}}><option value="">Selecione</option>{catalog.produtos.filter(p=>available.some(o=>o.product_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Oferta<select value={bumpOffer} disabled={!bumpProduct} onChange={e=>setBumpOffer(e.target.value)}><option value="">Selecione</option>{available.filter(o=>o.product_id===bumpProduct).map(o=><option key={o.id} value={o.id}>{o.name} · {money(o.price_cents)}</option>)}</select></label><label>Chamada<input value={headline} onChange={e=>setHeadline(e.target.value)} /></label><label>Descrição exibida no checkout<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></label><button type="button" className="central-action" disabled={!bumpOffer} onClick={addBump}>Adicionar à lista</button></div>}
        <div className="central-table-wrap"><table className="central-table"><thead><tr><th>Produto / Oferta</th><th>Descrição</th><th>Valor</th><th>Ordem</th><th /></tr></thead><tbody>{dados.bumps.map((b,index)=>{const offer=catalog.ofertas.find(o=>o.id===b.bump_offer_id);return <tr key={b.bump_offer_id}><td>{catalog.produtos.find(p=>p.id===offer?.product_id)?.name || 'Produto'}<small>{offer?.name || 'Oferta indisponível'}</small></td><td><input aria-label={`Chamada do adicional ${index+1}`} className="central-inline-input" value={b.headline} onChange={e=>setDados({...dados,bumps:dados.bumps.map((item,i)=>i===index?{...item,headline:e.target.value}:item)})}/><textarea aria-label={`Descrição do adicional ${index+1}`} className="central-inline-input" value={b.description} rows={2} onChange={e=>setDados({...dados,bumps:dados.bumps.map((item,i)=>i===index?{...item,description:e.target.value}:item)})}/></td><td>{money(offer?.price_cents)}</td><td><button type="button" className="central-action" aria-label={`Mover adicional ${index+1} para cima`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" className="central-action" aria-label={`Mover adicional ${index+1} para baixo`} disabled={index===dados.bumps.length-1} onClick={()=>move(index,1)}>↓</button></td><td><button type="button" className="central-action" onClick={()=>setDados({...dados,bumps:dados.bumps.filter((_,i)=>i!==index)})}>Remover</button></td></tr>})}{!dados.bumps.length && <tr><td colSpan={5}>Nenhum adicional vinculado.</td></tr>}</tbody></table></div>
      </section>
      <div hidden={tab!=='contrato'}><ContractOfferSettings value={dados.checkout_config} onChange={checkout_config=>setDados({...dados,checkout_config})} offer={dados} product={product} /></div>
      <div hidden={tab!=='checkout'}><CheckoutSettingsEditor value={dados.checkout_config} onChange={checkout_config=>setDados({...dados,checkout_config})} offer={dados} product={product} globalConfig={catalog.global_config} /></div>
      <div className="central-editor-actions"><span>{dirty?'Alterações ainda não salvas':'Nenhuma alteração pendente'}</span><button type="button" className="central-action" disabled={saving || !dirty} onClick={()=>setDados(JSON.parse(baseline))}>Descartar alterações</button><button className="central-primary" disabled={saving || (!dirty && ofertaId!=='nova')}>{saving?'Salvando…':'Salvar oferta'}</button></div>
    </form>
  </main>
}
