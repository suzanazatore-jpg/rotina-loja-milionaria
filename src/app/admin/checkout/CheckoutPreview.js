'use client'
import Image from 'next/image'
import { useState } from 'react'
import { CHECKOUT_DEFAULTS } from '@/lib/checkoutSettings'
import './checkout-preview.css'
const money = n => (n / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
function PreviewImage({src,alt,className}) {
  const [failed,setFailed] = useState(false)
  if(failed)return <div className="cp-image-error">Imagem indisponível. Confira a URL.</div>
  return <Image unoptimized src={src} width={800} height={400} alt={alt} className={className} onError={()=>setFailed(true)} />
}
function Field({label,placeholder,wide}) {return <div className={`cp-field ${wide?'wide':''}`}><span>{label}</span><div>{placeholder}</div></div>}
export default function CheckoutPreview({config:input,offer,product,device='desktop'}) {
  const config={...CHECKOUT_DEFAULTS,...input}
  const [selected,setSelected]=useState('credit_card')
  const methods=offer.payment_methods || []
  const method=methods.includes(selected)?selected:methods[0]
  const value=String(offer.price || '').replace(/\s/g,'')
  const cents=Math.round(Number(value.includes(',')?value.replace(/\./g,'').replace(',','.'):value)*100) || 0
  const pix=Math.round(cents*(1-Number(String(offer.pix_discount_pct || 0).replace(',','.'))/100))
  const installments=Math.max(1,Math.min(Number(offer.free_installments)||1,Number(offer.max_installments)||1))
  const banner=device==='mobile' && config.mobile_banner_url?config.mobile_banner_url:config.banner_url
  const color= { '--cp-bg':config.background,'--cp-panel':config.panel,'--cp-text':config.text,'--cp-accent':config.accent,'--cp-button-text':config.button_text_color,fontFamily:config.font }
  return <div className={`cp-viewport ${device}`}><div className={`cp-page ${device} ${config.layout==='stacked'?'stacked':''}`} style={color}>
    <header className="cp-header"><div className="cp-brand">{config.logo_url?<PreviewImage key={config.logo_url} src={config.logo_url} alt="Logo do checkout" className="cp-logo"/>:<span className="cp-brand-mark">SZ</span>}<strong>{config.store_name}</strong></div><span className="cp-security">♧ Ambiente de pagamento</span></header>
    {banner && <div className="cp-banner"><PreviewImage key={banner} src={banner} alt="Banner da oferta"/></div>}
    <div className="cp-columns">
      <aside className="cp-summary"><span className="cp-kicker">SUA ESCOLHA</span>{config.product_image_url?<PreviewImage key={config.product_image_url} src={config.product_image_url} alt={product.name} className="cp-product-image"/>:<div className="cp-product-placeholder"><span>SZ</span><strong>{product.name}</strong></div>}<h2>{offer.name || product.name}</h2>{config.subtitle && <p className="cp-description">{config.subtitle}</p>}<div className="cp-price"><span>{product.type==='subscription'?'Valor por cobrança':'Total da sua compra'}</span><strong>{money(method==='pix'?pix:cents)}</strong>{method==='credit_card' && installments>1 && <small>ou {installments}x de {money(Math.ceil(cents/installments))} sem juros</small>}{method==='pix' && Number(offer.pix_discount_pct)>0 && <small>{offer.pix_discount_pct}% de desconto no Pix</small>}</div><div className="cp-assurances"><div><span>✓</span><p>Seus dados protegidos<small>Informações usadas para concluir a compra.</small></p></div><div><span>✓</span><p>Acesso após a confirmação<small>Entrega conforme o plano do produto.</small></p></div></div></aside>
      <section className="cp-form-card"><div className="cp-step"><span>1</span><div><h3>Seus dados</h3><p>Preencha seus dados para receber o acesso.</p></div></div><div className="cp-fields"><Field label="Nome completo" placeholder="Seu nome" wide/><Field label="Email" placeholder="voce@email.com" wide/>{config.confirm_email && <Field label="Confirme seu email" placeholder="voce@email.com" wide/>}<Field label="CPF" placeholder="000.000.000-00"/><Field label="Celular" placeholder="(00) 00000-0000"/></div><div className="cp-divider"/><div className="cp-step"><span>2</span><div><h3>Pagamento</h3><p>Escolha a melhor forma para você.</p></div></div><div className="cp-payment-tabs">{methods.map(key=><button type="button" key={key} aria-pressed={method===key} onClick={()=>setSelected(key)}><span>{key==='pix'?'◇':'▤'}</span>{key==='pix'?'Pix':'Cartão de crédito'}</button>)}</div>
        {method==='credit_card'?<div className="cp-fields"><Field label="Número do cartão" placeholder="0000 0000 0000 0000" wide/><Field label="Nome no cartão" placeholder="Como aparece no cartão" wide/><Field label="Validade" placeholder="MM/AA"/><Field label="Código de segurança" placeholder="CVV"/><Field label="Parcelas" placeholder={installments>1?`${installments}x de ${money(Math.ceil(cents/installments))} sem juros`:`1x de ${money(cents)}`} wide/></div>:<div className="cp-pix-info"><span>◇</span><div><strong>Pagamento com Pix</strong><p>O código Pix será gerado após a confirmação dos seus dados.</p></div></div>}
        {!!offer.bumps?.length && <div className="cp-bump"><span className="cp-faux-checkbox"/><div><strong>{offer.bumps[0].headline || 'Adicione também'}</strong><p>{offer.bumps[0].description || 'Uma oferta adicional para sua compra.'}</p></div></div>}
        <div className="cp-total"><span>Total</span><strong>{money(method==='pix'?pix:cents)}</strong></div><div className="cp-purchase-button">{config.button_text}<span>→</span></div><p className="cp-legal">Ao concluir, você concorda com os termos da compra.</p><div className="cp-processor"><span>Processamento de pagamento</span><strong>Pagar.me</strong></div>
      </section>
    </div>
    <footer className="cp-footer"><strong>{config.store_name}</strong>{config.support_email && <span>{config.support_email}</span>}{config.support_phone && <span>{config.support_phone}</span>}<div>{config.terms_url && <span>Termos de uso</span>}{config.privacy_url && <span>Política de privacidade</span>}</div></footer>
  </div></div>
}
