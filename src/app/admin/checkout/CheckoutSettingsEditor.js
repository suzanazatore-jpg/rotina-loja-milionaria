'use client'
import { trackingMode } from '@/lib/checkoutTracking'
import Link from 'next/link'
import CheckoutRedirects from './CheckoutRedirects'
import CatalogAudit from './CatalogAudit'
import ImageCropEditor from './ImageCropEditor'
import CheckoutProfileField from './CheckoutProfileField'
import CheckoutPreview from './CheckoutPreview'
import { useRef, useState } from 'react'
import imageStyles from './CheckoutImageField.module.css'
import { checkoutSettingsDraft, SHARED_CHECKOUT_KEYS } from '@/lib/checkoutSettings'
import { supabase } from '@/lib/supabase'
export function CheckoutImageField({ label, value, onChange, style, picture = false, fallbackUrl = '' }) {
  const [uploading, setUploading] = useState(false),[cropFile,setCropFile]=useState(null)
  const [error, setError] = useState('')
  const picker = useRef(null)
  const previewUrl = value || fallbackUrl
  function upload(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;setError('');if(file.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Envie JPG, PNG ou WebP de até 4 MB.');return}if(/produto|especialista|logo|oferta/i.test(label))setCropFile(file);else uploadCropped(file)}
  async function adjust(){setError('');try{const response=await fetch(previewUrl);if(!response.ok)throw new Error('Envie a imagem novamente para ajustar.');const blob=await response.blob();if(blob.size>4*1024*1024)throw new Error('Envie uma imagem de até 4 MB.');setCropFile(new File([blob],'imagem-atual',{type:blob.type}))}catch(e){setError(e.message)}}
  async function uploadCropped(file){
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const form = new FormData(); form.set('image', file)
      const response = await fetch('/api/admin/checkout/produtos/imagem', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` }, body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Não foi possível enviar a imagem.')
      onChange(json.url);setCropFile(null)
    } catch (failure) { setError(failure.message);if(cropFile)throw failure }
    finally { setUploading(false) }
  }
  const cropDialog = cropFile && <ImageCropEditor file={cropFile} onClose={()=>setCropFile(null)} busy={uploading} onConfirm={uploadCropped}/>
  if (picture) {
    const action = uploading ? 'Enviando imagem…' : previewUrl ? 'Trocar imagem' : 'Selecionar imagem'
    return <div className={imageStyles.field}>
      {cropDialog}
      <input ref={picker} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={upload} />
      <button type="button" className={imageStyles.tile} aria-label={action + ' da oferta'} disabled={uploading} onClick={()=>picker.current?.click()}>
        {previewUrl
          ? <img className={imageStyles.preview} src={previewUrl} alt="Imagem atual da oferta" />
          : <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>}
        <span className={imageStyles.action}>{action}</span>
      </button>
      <small>JPG, PNG ou WebP · Até 4 MB</small>
      {previewUrl && <div className={imageStyles.tools}>
        <button type="button" disabled={uploading} onClick={adjust}>Ajustar enquadramento</button>
        {value && <button type="button" disabled={uploading} onClick={()=>onChange('')}>Remover imagem</button>}
      </div>}
      <details className={imageStyles.url}><summary>Usar URL da imagem</summary>
        <label>URL da imagem<input type="url" style={style} value={value || ''} onChange={e=>onChange(e.target.value)} placeholder="https://" /></label>
      </details>
      {error && <p role="alert" className="central-editor-message">{error}</p>}
    </div>
  }
  return <div>{cropDialog}<label>{label} — URL<input style={style} type="url" value={value} onChange={event => onChange(event.target.value)} placeholder="Cole uma URL ou envie a imagem abaixo" /></label><label style={{display:'block',marginTop:8,fontSize:13}}>{uploading ? 'Enviando imagem…' : `Enviar imagem: ${label}`}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={upload} style={{display:'block',marginTop:6,maxWidth:'100%'}} /></label>{value&&/produto|especialista|logo|oferta/i.test(label)&&<button type="button" className="central-action cv-adjust-image" disabled={uploading} onClick={adjust}>Ajustar enquadramento</button>}{error && <p role="alert" className="central-editor-message">{error}</p>}</div>
}
export default function CheckoutSettingsEditor({value,onChange,offer,product,globalConfig={},globalEditor=false,initialTab='appearance',productEditor=false,token}) {
  const [tab,setTab] = useState(initialTab === 'content' ? 'content' : 'appearance')
  const [device,setDevice] = useState('desktop')
  const config=checkoutSettingsDraft(value,globalConfig)
  function change(key,next) {onChange({...config,[key]:next,...(key==='product_display_name'?{use_offer_name:undefined}:{}),...(SHARED_CHECKOUT_KEYS.includes(key)?{appearance_mode:'custom'}:{})})}
  const field = {background:'var(--cv-field)',color:'var(--cv-text)',border:'1px solid var(--cv-border)',padding:10,borderRadius:7,width:'100%'}
  return <section><nav className="central-product-tabs" aria-label="Configurações do checkout">{[['appearance','Aparência'],['form','Formulário'],['content','Vendedor'],...(productEditor?[['bumps','Order Bump']]:[]),['emails','Emails'],['pixels','Pixels'],['redirects','Redirecionamento'],...(productEditor?[['audit','Auditoria']]:[])].filter(([key])=>!globalEditor || ['appearance','content'].includes(key)).map(([key,label])=><button type="button" key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {(tab==='appearance' || tab==='content') && <div className="central-appearance-workspace"><section className="central-chart-panel central-appearance-controls"><h2>{tab==='appearance'?'Aparência do checkout':'Vendedor e conteúdo da oferta'}</h2>{!globalEditor && <label>Identidade e aparência<select style={field} value={config.appearance_mode || 'custom'} onChange={e=>onChange({...config,appearance_mode:e.target.value})}><option value="inherit">Usar padrão da central</option><option value="custom">Personalizar nesta oferta</option></select><p className="central-data-note">O padrão acompanha as alterações da central. Editar uma cor ou dado da marca cria uma personalização nesta oferta. Preço, descrição e destinos continuam próprios.</p></label>}<div className="central-settings-fields">
      {tab==='appearance' ? <>
        {!globalEditor && <section><h3>Imagem da oferta</h3>
          <CheckoutImageField picture label="Imagem da oferta" style={field} value={config.product_image_url} fallbackUrl={product.image_url} onChange={url=>change('product_image_url',url)} />
        </section>}
        <div className="central-style-presets"><span>Comece por um estilo</span>{[['Guru',{layout:'guru',font:'Inter',background:'#021821',panel:'#ffffff',text:'#383c3e',accent:'#27af60',button_text_color:'#ffffff'}],['Banner claro',{layout:'banner',background:'#f4f5f7',panel:'#ffffff',text:'#383c3e',accent:'#27af60',button_text_color:'#ffffff'}],['Preto e dourado',{background:'#0b0b0d',panel:'#17171b',text:'#f4f4f5',accent:'#d4af37',button_text_color:'#17130a'}],['Claro e dourado',{background:'#f6f5f1',panel:'#ffffff',text:'#202020',accent:'#d4af37',button_text_color:'#17130a'}],['Preto, branco e verde',{layout:'focused',background:'#050505',panel:'#ffffff',text:'#202020',accent:'#08b53f',button_text_color:'#ffffff'}],['Claro e verde',{background:'#f2f5f3',panel:'#ffffff',text:'#202720',accent:'#167c52',button_text_color:'#ffffff'}]].map(([label,preset])=><button type="button" key={label} onClick={()=>onChange({...config,...preset,appearance_mode:'custom'})}><span style={{background:preset.background,borderColor:preset.accent}}><i style={{background:preset.accent}} /></span>{label}</button>)}</div>
        <details open><summary>Cores do checkout</summary><div className="central-colors-grid">{[['background','Fundo da página'],['panel','Cartão de pagamento'],['text','Textos'],['accent','Botão e destaques'],['button_text_color','Texto do botão']].map(([key,label])=><label key={key}>{label}<div className="central-color-control"><input type="color" value={config[key]} onChange={e=>change(key,e.target.value)} /><span>{config[key].toUpperCase()}</span></div></label>)}</div></details>
        <details open><summary>Tipografia e disposição</summary><label>Fonte<select style={field} value={config.font} onChange={e=>change('font',e.target.value)}>{['Inter','Arial','Georgia','Verdana'].map(font=><option key={font}>{font}</option>)}</select></label><label>Layout no computador<select style={field} value={config.layout} onChange={e=>change('layout',e.target.value)}><option value="guru">Guru · resumo lateral e campos sublinhados</option><option value="banner">Banner · página clara em uma coluna</option><option value="split">Resumo à esquerda · pagamento à direita</option><option value="stacked">Resumo acima do pagamento</option><option value="focused">Centralizado com destaque no topo</option></select></label><p className="central-data-note">No celular, os blocos ficam em uma única coluna.</p></details>
        {!globalEditor && config.layout === 'guru' && config.form_profile === 'compact' && <label className="central-active-switch"><input type="checkbox" checked={Boolean(config.express_checkout)} onChange={event=>change('express_checkout',event.target.checked)} />Abrir o checkout Low Ticket com o cartão selecionado</label>}
        <details open><summary>Banners</summary><CheckoutImageField label="Banner para computador" style={field} value={config.banner_url} onChange={url=>change('banner_url',url)} /><CheckoutImageField label="Banner para celular" style={field} value={config.mobile_banner_url} onChange={url=>change('mobile_banner_url',url)} /></details>
        <details open><summary>Relógio de encerramento</summary><label className="central-active-switch"><input type="checkbox" checked={config.countdown_enabled} onChange={e=>change('countdown_enabled',e.target.checked)} />Mostrar relógio</label><label>Encerramento — horário de Brasília<input type="datetime-local" style={field} value={config.countdown_ends_at ? new Date(new Date(config.countdown_ends_at).getTime()-3*3600000).toISOString().slice(0,16) : ''} onChange={e=>change('countdown_ends_at',e.target.value ? new Date(e.target.value+':00-03:00').toISOString() : '')} /></label><label>Texto ao lado do relógio<input style={field} maxLength={100} value={config.countdown_message} onChange={e=>change('countdown_message',e.target.value)} /></label><p className="central-data-note">O prazo é fixo e não reinicia ao atualizar a página. Ao terminar, novas compras desta oferta ficam indisponíveis. Ative após definir a data e hora.</p></details>
        <label>Texto do botão de compra<input style={field} maxLength={100} value={config.button_text} onChange={e=>change('button_text',e.target.value)} /></label>
      </> : <>
        {!globalEditor && <><label>Nome do produto no checkout<input style={field} maxLength={150} value={config.product_display_name} onChange={e=>change('product_display_name',e.target.value)} placeholder={product.name || 'Usar nome do produto'} /></label><label>Chamada acima do formulário<input style={field} maxLength={180} value={config.headline} onChange={e=>change('headline',e.target.value)} placeholder="Disponível no layout centralizado com destaque" /></label><label>Trecho em destaque na chamada<input style={field} maxLength={100} value={config.headline_highlight} onChange={e=>change('headline_highlight',e.target.value)} /></label></>}{globalEditor && <p className="central-data-note">O nome do produto, a headline e a imagem do produto são editados dentro de cada oferta. Aqui você define o modelo visual, os banners e o relógio padrão.</p>}<label>Nome exibido no checkout<input style={field} value={config.store_name} onChange={e=>change('store_name',e.target.value)} /></label><label>Descrição curta da oferta<textarea style={field} rows={3} maxLength={500} value={config.subtitle} onChange={e=>change('subtitle',e.target.value)} placeholder="O que a cliente vai receber" /></label>
        <details open><summary>Imagens da marca</summary>{[['logo_url','Logo'],['favicon_url','Ícone da aba (favicon)']].map(([key,label])=><CheckoutImageField key={key} label={label} style={field} value={config[key]} onChange={url=>change(key,url)} />)}</details>
        <details open><summary>Dados da empresa no rodapé</summary>{[['company_name','Razão social'],['company_document','CNPJ'],['company_address','Endereço da empresa']].map(([key,label])=><label key={key}>{label}<input style={field} value={config[key]} maxLength={key==='company_address'?300:150} onChange={e=>change(key,e.target.value)} /></label>)}<p className="central-data-note">Preencha os dados reais da empresa vendedora. Campos vazios não aparecem no rodapé.</p></details><label>Email de suporte<input style={field} type="email" value={config.support_email} onChange={e=>change('support_email',e.target.value)} /></label><label>Telefone de suporte<input style={field} type="tel" value={config.support_phone} onChange={e=>change('support_phone',e.target.value)} /></label><label>URL dos termos de uso<input style={field} type="url" value={config.terms_url} onChange={e=>change('terms_url',e.target.value)} placeholder="https://" /></label><label>URL da política de privacidade<input style={field} type="url" value={config.privacy_url} onChange={e=>change('privacy_url',e.target.value)} placeholder="https://" /></label>
      </>}
    </div></section><aside className="central-appearance-preview"><div className="central-preview-toolbar"><div><h2>Pré-visualização</h2><p>As alterações aparecem aqui na hora.</p></div><div className="central-theme" role="group" aria-label="Formato da prévia">{['desktop','mobile'].map(key=><button type="button" key={key} aria-pressed={device===key} onClick={()=>setDevice(key)}>{key==='desktop'?'Computador':'Celular'}</button>)}</div></div><div className="central-preview-browser"><span>● ● ●</span><small>{offer.slug || 'sua-oferta'}</small><span>Prévia</span></div><CheckoutPreview config={config} offer={offer} product={product} device={device}/><p className="central-data-note">Prévia visual com campos ilustrativos. Não coleta dados nem realiza pagamentos.</p></aside></div>}
    {tab==='form' && <section className="central-chart-panel"><h2>Formulário e aceites</h2><CheckoutProfileField value={config} onChange={onChange}/><div className="central-settings-fields">{[['confirm_email','Pedir confirmação do email'],['require_terms','Exigir aceite dos termos de uso'],['require_privacy','Exigir aceite da política de privacidade']].map(([key,label])=><label key={key} className="central-active-switch"><input type="checkbox" checked={config[key]} onChange={e=>change(key,e.target.checked)} />{label}</label>)}<p className="central-data-note">Cadastre as URLs de termos e privacidade na aba Vendedor e conteúdo ou no padrão da central. O aceite também é validado pelo servidor.</p></div></section>}
    {tab==='pixels'  && <section className="central-chart-panel"><h2>Pixels e rastreamento</h2><div className="central-settings-fields"><label>Configuração desta oferta<select style={field} value={trackingMode(config)} onChange={e=>change('tracking_mode',e.target.value)}><option value="inherit">Usar padrão da central</option><option value="custom">Personalizar nesta oferta</option><option value="off">Desativar nesta oferta</option></select></label>{trackingMode(config)==='custom' && <><label>Google Tag Manager<input style={field} value={config.gtm_id} onChange={e=>change('gtm_id',e.target.value)} placeholder="GTM-XXXXXXX" /></label><label>Meta Pixel — ID<input style={field} value={config.meta_pixel_id} onChange={e=>change('meta_pixel_id',e.target.value)} inputMode="numeric" /></label></>}{trackingMode(config)==='inherit' && <p>Esta oferta acompanha o cadastro global. <Link href="/admin/checkout/configuracoes">Abrir configurações da central →</Link></p>}</div><p className="central-data-note">O disparo respeita o consentimento e os controles de ativação do ambiente. O GTM tem prioridade sobre o Pixel direto para evitar duplicidade.</p></section>}
    {tab==='redirects' && <CheckoutRedirects value={config.redirects} onChange={redirects=>change('redirects',redirects)}/>}
    {tab==='audit' && <CatalogAudit productId={product.id} offerId={offer.id} token={token}/>}
    {tab==='bumps' && <section className="central-chart-panel"><h2>Order Bump</h2><p>Os adicionais são configurados individualmente na oferta.</p><Link className="central-action" href={`/admin/checkout/produtos/${product.id}/ofertas/${offer.id}#bumps`}>Configurar Order Bump →</Link></section>}
    {tab==='emails' && <section className="central-chart-panel"><h2>Emails enviados pelo app</h2><p>Os emails de acesso e renovação são gerenciados pelo aplicativo.</p><p className="central-data-note">Vamos reutilizar esse envio na integração com os eventos do Pagar.me. Não haverá um segundo envio de boas-vindas por esta oferta. Mensagens de pagamento pendente, recusa e abandono ainda precisam ser conectadas.</p></section>}
  </section>
}
