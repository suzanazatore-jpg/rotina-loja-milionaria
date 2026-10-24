'use client'
import { trackingMode } from '@/lib/checkoutTracking'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CheckoutSettingsEditor from './CheckoutSettingsEditor'
import CatalogAudit from './CatalogAudit'
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
        const initial = offer ? {...OFERTA_VAZIA,...offer,price:(offer.price_cents/100).toFixed(2).replace('.',','),thank_you_url:offer.thank_you_url || '',bumps:json.bumps.filter(b=>b.offer_id===offer.id).map(b=>({bump_offer_id:b.bump_offer_id,headline:b.headline,description:b.description || ''}))} : {...OFERTA_VAZIA,product_id:produtoId,payment_methods:product.type==='subscription'?['credit_card']:['pix','credit_card'],max_installments:product.type==='subscription'?1:12,monthly_interest_pct:product.type==='subscription'?'0':'2.99',bumps:[]}
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
      setBaseline(JSON.stringify(dados));setMessage('✓ Oferta salva.')
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
  const link=ofertaId==='nova'?'':`${typeof window!=='undefined'?window.location.origin:''}/checkout/${dados.slug}`
  const available=catalog.ofertas.filter(o=>o.id!==ofertaId && o.active && !dados.bumps.some(b=>b.bump_offer_id===o.id) && catalog.produtos.find(p=>p.id===o.product_id)?.type==='one_time')
  return <main className="central-home">
    <div className="central-breadcrumb"><Link href="/admin/checkout">Produtos</Link><span>/</span><Link href={base}>{product.name}</Link><span>/</span><span>Ofertas</span><span>/</span><strong>{dados.name || 'Nova oferta'}</strong></div>
    <div className="central-dashboard-heading"><div><span className="central-eyebrow">OFERTA</span><h1>{dados.name || 'Nova oferta'}</h1><p>{product.name} · {product.type==='subscription'?'Assinatura':'Pagamento único'}</p></div><Link className="central-action" href={base}>← Voltar ao produto</Link></div>
    <nav className="central-product-tabs" aria-label="Abas da oferta">{[['detalhes','Detalhes'],['bumps','Order Bump'],['vendas','Vendas'],['checkout','Checkout'],['auditoria','Auditoria']].map(([key,label])=><button key={key} disabled={key==='bumps' && product.type==='subscription'} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {dados.guru_config?.unsupported_methods?.length > 0 && <p className="central-editor-message" role="note">Importada do Guru. {dados.guru_config.unsupported_methods.map(m=>m==='boleto'?'Boleto':'Pix recorrente').join(' e ')} ainda não disponível neste checkout. Preço e frequência preservados; cobrança automática disponível no cartão.</p>}
    {message && <p role="status" className="central-editor-message">{message}</p>}
    {ofertaId!=='nova' && <section className="central-chart-panel"><h2>Link de pagamento</h2><div className="central-payment-link"><code>{link}</code><button className="central-action" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage('✓ Link copiado.')}catch{setMessage('Não foi possível copiar. Selecione o link acima.')}}}>Copiar link</button><a className="central-action" href={link} target="_blank" rel="noopener noreferrer">Abrir checkout ↗</a></div><p className="central-data-note">O link abre a aparência salva da oferta. Pagamentos disponíveis somente após configurar a homologação do Pagar.me.</p></section>}
    {tab==='auditoria' && ofertaId!=='nova' && <CatalogAudit offerId={ofertaId} token={token} />}
    <form onSubmit={save}>
      <div hidden={tab!=='detalhes'} className="central-offer-grid"><section className="central-chart-panel"><h2>Configuração comercial</h2><FormOferta dados={dados} produto={product} showBumps={false} onChange={setDados} /><label className="central-active-switch"><input type="checkbox" checked={dados.active} onChange={e=>setDados({...dados,active:e.target.checked})} />Oferta ativa</label></section><aside className="central-chart-panel central-offer-summary"><h2>Resumo da oferta</h2><span className="central-badge">{dados.active?'Ativa':'Inativa'}</span><h3>{dados.name || 'Nova oferta'}</h3><p>{product.name}</p><strong>{dados.price ? `R$ ${dados.price}` : 'Defina o preço'}</strong><dl><dt>Pagamento</dt><dd>{dados.payment_methods.map(m=>m==='pix'?'Pix':'Cartão').join(' + ')}</dd><dt>Parcelamento</dt><dd>Até {dados.max_installments}x</dd><dt>Adicionais</dt><dd>{dados.bumps.length} oferta(s)</dd></dl></aside></div>
      <section hidden={tab!=='bumps'} className="central-chart-panel"><div className="central-section-heading"><h2>Order Bump</h2><button type="button" className="central-action" onClick={()=>setAddOpen(!addOpen)}>＋ Adicionar oferta</button></div><p className="central-data-note">Escolha os adicionais e a ordem em que aparecem. Salve a oferta para aplicar as alterações.</p>
        {addOpen && <div className="central-bump-add"><label>Produto<select value={bumpProduct} onChange={e=>{setBumpProduct(e.target.value);setBumpOffer('')}}><option value="">Selecione</option>{catalog.produtos.filter(p=>available.some(o=>o.product_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Oferta<select value={bumpOffer} disabled={!bumpProduct} onChange={e=>setBumpOffer(e.target.value)}><option value="">Selecione</option>{available.filter(o=>o.product_id===bumpProduct).map(o=><option key={o.id} value={o.id}>{o.name} · {money(o.price_cents)}</option>)}</select></label><label>Chamada<input value={headline} onChange={e=>setHeadline(e.target.value)} /></label><label>Descrição exibida no checkout<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></label><button type="button" className="central-action" disabled={!bumpOffer} onClick={addBump}>Adicionar à lista</button></div>}
        <div className="central-table-wrap"><table className="central-table"><thead><tr><th>Produto / Oferta</th><th>Descrição</th><th>Valor</th><th>Ordem</th><th /></tr></thead><tbody>{dados.bumps.map((b,index)=>{const offer=catalog.ofertas.find(o=>o.id===b.bump_offer_id);return <tr key={b.bump_offer_id}><td>{catalog.produtos.find(p=>p.id===offer?.product_id)?.name || 'Produto'}<small>{offer?.name || 'Oferta indisponível'}</small></td><td><input aria-label={`Chamada do adicional ${index+1}`} className="central-inline-input" value={b.headline} onChange={e=>setDados({...dados,bumps:dados.bumps.map((item,i)=>i===index?{...item,headline:e.target.value}:item)})}/><textarea aria-label={`Descrição do adicional ${index+1}`} className="central-inline-input" value={b.description} rows={2} onChange={e=>setDados({...dados,bumps:dados.bumps.map((item,i)=>i===index?{...item,description:e.target.value}:item)})}/></td><td>{money(offer?.price_cents)}</td><td><button type="button" className="central-action" aria-label={`Mover adicional ${index+1} para cima`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" className="central-action" aria-label={`Mover adicional ${index+1} para baixo`} disabled={index===dados.bumps.length-1} onClick={()=>move(index,1)}>↓</button></td><td><button type="button" className="central-action" onClick={()=>setDados({...dados,bumps:dados.bumps.filter((_,i)=>i!==index)})}>Remover</button></td></tr>})}{!dados.bumps.length && <tr><td colSpan={5}>Nenhum adicional vinculado.</td></tr>}</tbody></table></div>
      </section>
      <section hidden={tab!=='vendas'} className="central-chart-panel"><h2>Vendas desta oferta</h2>{ofertaId==='nova'?<p>Salve a oferta antes de consultar suas vendas.</p>:<Link className="central-action" href={`/admin/checkout/vendas?oferta=${encodeURIComponent(ofertaId)}`}>Consultar pedidos da oferta →</Link>}</section>
      <div hidden={tab!=='checkout'}><CheckoutSettingsEditor value={dados.checkout_config} onChange={checkout_config=>setDados({...dados,checkout_config})} offer={dados} product={product} globalConfig={catalog.global_config} /></div>
      <div className="central-editor-actions"><span>{dirty?'Alterações ainda não salvas':'Nenhuma alteração pendente'}</span><button type="button" className="central-action" disabled={saving || !dirty} onClick={()=>setDados(JSON.parse(baseline))}>Descartar alterações</button><button className="central-primary" disabled={saving || (!dirty && ofertaId!=='nova')}>{saving?'Salvando…':'Salvar oferta'}</button></div>
    </form>
  </main>
}
