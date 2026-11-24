'use client'
import Image from 'next/image'
import { checkoutAttribution } from '@/lib/checkoutAttribution'
import CheckoutAssurances from '../../admin/checkout/CheckoutAssurances'
import {Inter} from 'next/font/google'
import { flushSync } from 'react-dom'
import CheckoutAnalytics, { CookieChoice } from './CheckoutAnalytics'
import CheckoutCountdown from '../../admin/checkout/CheckoutCountdown'
import CompactCheckoutHeader from './CompactCheckoutHeader'
import { CompactBuyerNotices } from './CompactCheckoutTrust'
import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import '../../admin/checkout/checkout-preview.css'
import './public-checkout.css'
import './checkout-conversion.css'
import '../../admin/checkout/focused-checkout.css'
import '../../admin/checkout/checkout-models.css'
import './checkout-compact.css'

const inter=Inter({subsets:['latin'],display:'swap',variable:'--checkout-inter'})
const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const waiting = status => ['pending','waiting_payment'].includes(status)
const labels = { paid: 'Pagamento confirmado!', failed: 'Pagamento não aprovado', canceled: 'Pagamento cancelado', refunded: 'Pagamento reembolsado', chargedback: 'Pagamento contestado', pending: 'Aguardando confirmação', waiting_payment: 'Aguardando pagamento' }
function Field({ name, label, wide = false, prefix, ...props }) { return <label className={`cp-field ${wide ? 'wide' : ''}`}><span>{label}</span><div className={prefix ? "pc-phone-control" : "pc-input-control"}>{prefix && <span className="pc-country-prefix" aria-hidden="true">BR +55</span>}<input name={name} placeholder={({email:"Digite seu email para receber a compra",email_confirmation:"Digite novamente seu email",name:"Digite seu nome completo",document:"Digite seu CPF ou CNPJ",phone:"(11) 99999-9999",card_number:"0000 0000 0000 0000",holder_name:"Nome impresso no cartão",cvv:"3 ou 4 dígitos"})[name]} required {...props} /></div></label> }
function PaymentSymbol({ method }) {
  return method === 'pix' ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 2 5 5-5 5-5-5 5-5Zm0 10 5 5-5 5-5-5 5-5ZM2 12l5-5m10 0 5 5-5 5M7 17l-5-5" /></svg> : <svg width="19" height="15" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="2"/><path d="M1 6h22M5 12h5"/></svg>
}
function Asset({ src, alt, className = '' }) { return <Image unoptimized src={src} alt={alt} width={800} height={400} className={className} /> }

export default function PublicCheckout({ data, compact = false }) {
  useEffect(() => { checkoutAttribution(window) }, [])
  const { offer, product, config, prices, test, bumps = [] } = data
  const focused = !compact && config.layout === 'focused'
  const guru = !compact && config.layout === 'guru'
  const FormGroup = compact ? 'div' : Fragment
  const SummaryHeading = focused ? 'h2' : 'h1'
  // Pix já vem marcado nos modelos Guru e compacto.
  const methods = [...new Set(prices.map(price => price.method))]
  const preferredMethod = focused ? 'credit_card' : guru || compact ? 'pix' : null
  const initialMethod = methods.includes(preferredMethod) ? preferredMethod : methods[0] || 'pix'
  const [method, setMethod] = useState(initialMethod)
  const compactCard = compact && method === 'credit_card'
  const [installments, setInstallments] = useState(initialMethod === 'credit_card' ? offer.default_installments || 1 : 1)
  const [selectedBumps, setSelectedBumps] = useState([])
  const needsAddress = config.layout==='guru'?method==='credit_card':config.form_profile !== 'compact' || method === 'credit_card'
  const [addressOpen, setAddressOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [countdownExpired, setCountdownExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [attemptStarted, setAttemptStarted] = useState(false)
  const pendingRequest = useRef(null)
  const form = useRef(null)
  const submitting = useRef(false)
  const endpoint = `/api/checkout/${encodeURIComponent(offer.slug)}`
  const basePrice = prices.find(price => price.method === method && price.installments === installments) || prices[0] || { method, installments: 1, total_cents: offer.price_cents, interest_cents: 0 }
  const bumpPrice = bump => bump.prices.find(price => price.method === method && price.installments === installments)
  const cartPrice = base => selectedBumps.reduce((total, id) => {
    const price = bumps.find(bump => bump.offer_id === id)?.prices.find(price => price.method === base.method && price.installments === base.installments)
    if (!price) return total
    return { ...total, total_cents: total.total_cents + price.total_cents, interest_cents: total.interest_cents + price.interest_cents }
  }, { ...base })
  const selected = cartPrice(basePrice)
  const displayPrice = cents => method === 'credit_card' && installments > 1 ? `${installments} × ${money(cents / installments)}` : money(cents)
  const summaryTotal = displayPrice(selected.total_cents)
  const singlePayment = prices.find(price => price.method === method && price.installments === 1)
  const frozen = busy || attemptStarted
  const shownBumps = compact ? bumps.filter(bump => bumpPrice(bump)) : bumps
  const analyticsCart = { total_cents: selected.total_cents, items: [{ item_id: product.id, item_name: product.name, price_cents: basePrice.total_cents }, ...bumps.filter(bump => selectedBumps.includes(bump.offer_id)).map(bump => ({ item_id: bump.product_id, item_name: bump.product_name, price_cents: bumpPrice(bump)?.total_cents }))] }
  const viewCart = { total_cents: offer.price_cents, items: [{ item_id: product.id, item_name: product.name, price_cents: offer.price_cents }] }

  function changePayment(key) {
    if (compact && key === method) return
    setMethod(key)
    if (compact) setAddressOpen(false)
    setInstallments(key === 'credit_card' ? offer.default_installments || 1 : 1)
    setSelectedBumps(current => current.filter(id => bumps.find(bump => bump.offer_id === id)?.prices.some(price => price.method === key)))
  }
  async function checkStatus() {
    const response = await fetch(endpoint, { cache: 'no-store' })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Não foi possível consultar o pagamento.')
    if (json.status !== 'not_started') setResult(json)
    return json
  }
  useEffect(() => {
    let active = true
    fetch(endpoint, { cache: 'no-store' }).then(async response => {
      if (!response.ok) return
      const json = await response.json()
      if (active && json.status !== 'not_started') setResult(json)
    }).catch(() => {})
    return () => { active = false }
  }, [endpoint])
  useEffect(() => {
    if (!waiting(result?.status)) return
    let active = true
    const interval = setInterval(async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) { if (active) setError(json.error); clearInterval(interval); return }
        if (active) setResult(json)
      } catch { /* A confirmação não muda em caso de falha de rede. */ }
    }, 10000)
    return () => { active = false; clearInterval(interval) }
  }, [endpoint, result?.status])

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const values = pendingRequest.current ? null : new FormData(form.current)
    submitting.current = true; setBusy(true); setError('')
    try {
      if(!method)throw new Error('Escolha cartão de crédito ou Pix para continuar.')
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
      const start = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ action: 'start' }) })
      const startData = await start.json()
      if (!start.ok) throw new Error(startData.error)
      if (!pendingRequest.current) {
        const get = key => String(values.get(key) || '').trim()
        if (config.confirm_email && get('email_confirmation').toLowerCase() !== get('email').toLowerCase()) throw new Error('Os emails não conferem.')
        const customer = { name: get('name'), email: get('email'), document: get('document'), phone: get('phone'), ...(needsAddress ? { address: { line_1: [get('address_number'), get('street'), get('district')].join(', '), street: get('street'), number: get('address_number'), district: get('district'), line_2: get('line_2'), zip_code: get('zip_code'), city: get('city'), state: get('state').toUpperCase() } } : {}) }
        const payload = { action: 'pay', meta_attribution: checkoutAttribution(window), customer, payment_method: method, installments, bumps: selectedBumps, email_confirmation: get('email_confirmation'), terms_accepted: values.get('terms_accepted') === 'on', privacy_accepted: values.get('privacy_accepted') === 'on', marketing_preference: (() => { try { return localStorage.getItem('sz-checkout-consent-v2') || 'unknown' } catch { return 'unknown' } })(), marketing_consent: (() => { try { return localStorage.getItem('sz-checkout-consent-v2') === 'granted' } catch { return false } })() }
        if (method === 'credit_card') {
          if (!test.publicKey) throw new Error('Pagamento por cartão em preparação.')
          const expiry = get('expiry').match(/^(\d{2})\/(\d{2}|\d{4})$/)
          if (!expiry || Number(expiry[1]) < 1 || Number(expiry[1]) > 12) throw new Error('Informe a validade como MM/AA.')
          const tokenResponse = await fetch(`${test.tokenBase}/tokens?appId=${encodeURIComponent(test.publicKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'card', card: { number: get('card_number').replace(/\D/g, ''), holder_name: get('holder_name'), exp_month: Number(expiry[1]), exp_year: Number(expiry[2].length === 2 ? `20${expiry[2]}` : expiry[2]), cvv: get('cvv') } }) })
          const token = await tokenResponse.json()
          if (!tokenResponse.ok || !/^token_[a-zA-Z0-9]+$/.test(token.id || '')) throw new Error('Não foi possível validar o cartão. Confira os dados.')
          payload.card_token = token.id
          for (const name of ['card_number','holder_name','expiry','cvv']) form.current.elements.namedItem(name).value = ''
        }
        // Só o token chega ao app. Uma retentativa conserva o mesmo payload e sessão.
        pendingRequest.current = payload
        setAttemptStarted(true)
      }
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(pendingRequest.current) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Não foi possível concluir. Consulte o pagamento antes de tentar novamente.')
      setResult(json)
    } catch (failure) { setError(failure.message || 'Falha de conexão. Consulte o pagamento antes de tentar novamente.') }
    finally { submitting.current = false; setBusy(false) }
  }
  const installmentField = (
    <label className={compactCard ? 'cp-field pc-installments wide' : 'cp-field pc-installments'}>
      <span>{compactCard ? 'Nº de parcelas' : 'Parcelamento *'}</span>
      <select aria-label={compactCard ? undefined : 'Parcelamento'} value={installments}
        onChange={event => setInstallments(Number(event.target.value))}
      >
        {prices.filter(price => price.method === method).map(price => {
          const amount = money(cartPrice(price).total_cents / price.installments)
          const label = compactCard && price.installments === 1
            ? `À vista: ${amount}`
            : `${String(price.installments).padStart(2, '0')} × ${amount}`
          return <option key={price.installments} value={price.installments}>{label}</option>
        })}
      </select>
    </label>
  )
  const cardControls = (
    <div className={compactCard ? 'cp-fields compact-card-fields' : 'cp-fields'}>
      {compactCard && installmentField}
      <Field name="card_number" label={compactCard ? 'Número do cartão' : 'Número do cartão *'}
        {...(compactCard && { placeholder: 'Número do cartão' })}
        autoComplete="cc-number" inputMode="numeric" wide minLength={13} maxLength={24} />
      <Field name="holder_name" label={compactCard ? 'Nome impresso no cartão' : 'Nome impresso no cartão *'}
        autoComplete="cc-name" wide maxLength={64} />
      <Field name="expiry" label={compactCard ? 'Validade (MM/AA)' : 'Validade *'}
        autoComplete="cc-exp" placeholder={compactCard ? 'Validade (MM/AA)' : 'MM/AA'}
        inputMode="numeric" pattern="[0-9]{2}/([0-9]{2}|[0-9]{4})" maxLength={7} />
      <Field name="cvv" label={compactCard ? 'CVV' : 'CVV *'} {...(compactCard && { placeholder: 'CVV' })}
        autoComplete="cc-csc" inputMode="numeric" type="password" pattern="[0-9]{3,4}" maxLength={4} />
      {!compactCard && installmentField}
    </div>
  )
  const paymentControls = method === 'credit_card' ? cardControls : compact
    ? <p className="compact-pix-note">Gere o código Pix e pague no app do seu banco.</p>
    : <div className="cp-pix-info"><div><strong>Atenção a estes detalhes:</strong><ul><li>Pagamento à vista pelo Pix.</li><li>O acesso é liberado após a confirmação do pagamento.</li><li>Após o vencimento do código, faça um novo pedido.</li></ul></div></div>
  const billingAddress = needsAddress && (
    <details className={compactCard ? 'pc-address compact-card-address' : 'pc-address'}
      open={addressOpen || (!compactCard && (compact || config.layout !== 'guru') && config.form_profile !== 'compact')}
      onToggle={event => setAddressOpen(event.currentTarget.open)}
    >
      <summary>{compactCard ? 'Endereço de cobrança (obrigatório)' : 'Endereço de cobrança'}</summary>
      <p className="pc-note">{compact ? 'Informe o endereço associado ao pagamento.' : 'Necessário para processar o cartão no Pagar.me.'}</p>
      <div className="cp-fields">
        <Field name="zip_code" label="CEP" autoComplete="postal-code" inputMode="numeric" maxLength={9} />
        <Field name="state" label="Estado (UF)" autoComplete="address-level1" pattern="[A-Za-z]{2}" maxLength={2} />
        <Field name="city" label="Cidade" autoComplete="address-level2" wide maxLength={64} />
        <Field name="street" label="Rua" autoComplete="address-line1" wide maxLength={128} />
        <Field name="address_number" label="Número (ou s/n)" maxLength={32} />
        <Field name="district" label="Bairro" maxLength={64} />
        <label className="cp-field wide">
          <span>Complemento (opcional)</span>
          <input name="line_2" autoComplete="address-line2" maxLength={128} />
        </label>
      </div>
    </details>
  )
  const color = { '--cp-bg': config.background, '--cp-panel': config.panel, '--cp-text': config.text, '--cp-accent': config.accent, '--cp-button-text': config.button_text_color, fontFamily: config.layout==='guru'?'var(--checkout-inter), Inter, Arial, sans-serif':config.font }
  return <main className={`pc-checkout ${inter.variable} ${compact ? 'compact-checkout' : ''}`} style={compact ? undefined : color}>
    <CheckoutCountdown config={config} onExpire={setCountdownExpired} />
    <CheckoutAnalytics config={config} enabled={data.analytics_enabled} viewCart={viewCart} currentCart={analyticsCart} started={attemptStarted} purchase={result?.purchase} visitToken={data.visit_token} />
    <div className={`cp-page ${compact ? 'compact' : config.layout === 'focused' ? 'focused' : config.layout === 'stacked' ? 'stacked' : config.layout === 'guru' ? 'guru' : config.layout === 'banner' ? 'banner' : ''}`}>
      {compact ? <CompactCheckoutHeader config={config} offer={offer} product={product} prices={prices} money={money} /> : <>
      {focused && <div className="cp-hero"><p>{config.store_name}</p><h1>{config.headline || config.product_display_name || product.name}{config.headline_highlight && <span>{config.headline_highlight}</span>}</h1></div>}
      {config.layout === 'banner' && config.headline && <div className="cp-model-headline">{config.headline}{config.headline_highlight && <span>{config.headline_highlight}</span>}</div>}
    <header className="cp-header"><div className="cp-brand">{config.logo_url ? <Asset src={config.logo_url} alt={config.store_name} className="cp-logo" /> : <span className="cp-brand-mark">SZ</span>}<strong>{config.store_name}</strong></div><span className="cp-security">Pagamento protegido</span></header>
      </>}
      {!focused && (test.mode === 'test' || !test.ready) && <div className="pc-notice" role="status">{test.mode === 'test' ? 'Ambiente de teste — disponível somente para o administrador.' : test.ready ? '' : 'Checkout indisponível. Tente novamente em instantes.'}</div>}
      {!compact && config.banner_url && <div className={`cp-banner ${config.mobile_banner_url ? 'pc-desktop-banner' : ''}`}><Asset src={config.banner_url} alt="Oferta" /></div>}
      {!compact && config.mobile_banner_url && <div className="cp-banner pc-mobile-banner"><Asset src={config.mobile_banner_url} alt="Oferta" /></div>}
      <div className="cp-columns">
        {focused && <div className="pc-country-note">BR · Pagamento em reais (R$)</div>}
        {!compact && <aside className="cp-summary">{config.layout === 'guru' && <><div className="guru-seller">{config.logo_url ? <Asset src={config.logo_url} alt="" className="guru-seller-logo" /> : <span className="guru-seller-monogram">SZ</span>}<strong>{config.company_name || config.store_name}</strong></div><div className="guru-security"><svg width="16" height="18" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 2 3 6v7c0 5 9 11 9 11s9-6 9-11V6l-9-4Z"/><path d="m7 12 3 3 7-7"/></svg> Compra segura</div></>}<span className="cp-kicker">SUA ESCOLHA</span>{config.product_image_url ? <Asset src={config.product_image_url} alt={product.name} className="cp-product-image" /> : <div className="cp-product-placeholder"><span>SZ</span><strong>{config.product_display_name || product.name}</strong></div>}<SummaryHeading>{config.product_display_name || offer.name || product.name}</SummaryHeading>{config.layout==='guru'&&<button type="button" className="guru-summary-toggle" aria-expanded={summaryOpen} onClick={()=>setSummaryOpen(!summaryOpen)}><span>Detalhe da compra ⌄</span><strong>{summaryTotal}</strong></button>}{config.layout === 'guru' && config.headline && <p className="guru-offer-headline">{config.headline} {config.headline_highlight}</p>}{focused && <p className="pc-producer">Por {config.store_name}</p>}{config.subtitle && (config.layout !== 'guru' || config.subtitle !== config.product_display_name) && <p className="cp-description">{config.subtitle}</p>}<div className={`cp-price ${summaryOpen?'guru-summary-open':''}`}>{config.layout === 'guru' && <div className="guru-price-rows"><div><span>Produto</span><strong>{money(offer.price_cents)}</strong></div><div><span>TOTAL</span><strong>{summaryTotal}</strong></div></div>}<span>{product.type === 'subscription' ? 'Valor por cobrança' : 'Total da sua compra'}</span><strong>{summaryTotal}</strong>{product.type === 'subscription' && <small>A cada {offer.billing_interval_count} {({day:'dia(s)',week:'semana(s)',month:'mês(es)',year:'ano(s)'})[offer.billing_interval]}</small>}{product.type === 'subscription' && offer.billing_cycles > 0 && <small>Até {offer.billing_cycles} cobrança(s).</small>}{offer.trial_days > 0 && <small>Teste de {offer.trial_days} dias. O acesso será liberado após o pagamento.</small>}</div><CheckoutAssurances config={config}/></aside>}
        <section className={compact && !result ? "compact-form" : "cp-form-card"}>
          {result ? <div className="pc-result" aria-live="polite"><span className="pc-result-icon" style={result.status === 'paid' ? { color: '#16A34A', borderColor: '#16A34A' } : undefined}>{result.status === 'paid' ? '✓' : '◇'}</span><h2>{labels[result.status] || 'Aguardando confirmação'}</h2><p>{result.status === 'paid' ? result.contract_required ? result.contract?.status === 'canceled' ? 'O contrato foi cancelado. Entre em contato com o suporte.' : result.contract?.access_status === 'completed' ? 'Contrato assinado e acesso liberado.' : result.contract?.status === 'signed' ? 'Assinatura registrada. Acompanhe a liberação pela página do contrato.' : 'Para concluir a entrega, assine o contrato. O link estará disponível aqui assim que o documento for preparado.' : compact && test.mode === 'live' ? 'Sua compra foi aprovada. Confira as instruções de acesso enviadas para você.' : 'Pagamento de teste confirmado. A liberação depende da configuração de teste do app.' : waiting(result.status) ? 'A confirmação será atualizada aqui automaticamente.' : 'Consulte o suporte se precisar de ajuda.'}</p><strong>{money(result.total_cents)}</strong>{result.pix_code && waiting(result.status) && <div className="pc-pix"><label>Código Pix copia e cola<textarea readOnly rows={4} value={result.pix_code} /></label><button type="button" className="pc-secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.pix_code); setCopied(true) } catch { setError('Selecione e copie o código acima.') } }}>{copied ? 'Copiado!' : 'Copiar código Pix'}</button>{result.pix_expires_at && <small>Válido até {new Date(result.pix_expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}</div>}{waiting(result.status) && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Conferir pagamento</button>}{result.contract?.signing_url && <a className="cp-purchase-button" href={result.contract.signing_url}>{result.contract.status === 'signed' ? 'Acompanhar acesso e contrato →' : 'Assinar meu contrato →'}</a>}{result.status === 'paid' && result.contract_required && !result.contract && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Conferir contrato</button>}{result.redirect_url && <a className="cp-purchase-button" href={result.redirect_url}>Continuar →</a>}</div> : <form ref={form} onSubmit={submit} onInvalidCapture={event => { if (event.target.closest('.pc-address')) flushSync(() => setAddressOpen(true)) }}>
            {!compact && <div className="cp-step"><span>1</span><div><h2>{guru ? 'Os seus dados' : 'Dados pessoais'}</h2><p>Informe os dados para receber o acesso.</p></div></div>}
            <fieldset disabled={frozen}>
              <FormGroup {...(compact && { className: 'compact-data' })}>
                {compact && <h2>Seus dados</h2>}
                <div className="cp-fields">{(guru || compact) && <Field name="name" label="Nome e sobrenome *" autoComplete="name" wide maxLength={128} />}<Field name="email" label="E-mail *" type="email" autoComplete="email" wide maxLength={254} />{config.confirm_email && <Field name="email_confirmation" label="Confirme seu email" type="email" autoComplete="off" wide maxLength={254} />}{!guru && !compact && <Field name="name" label="Nome e sobrenome *" autoComplete="name" wide maxLength={128} />}<Field name="phone" label="Celular *" prefix="+55" type="tel" autoComplete="tel-national" maxLength={20}/><Field name="document" label={config.document_type==='cpf'?'CPF *':config.document_type==='cnpj'?'CNPJ *':'CPF / CNPJ *'} inputMode="numeric" maxLength={18}/></div>
                {!compact && billingAddress}
              </FormGroup>
              <FormGroup {...(compact && { className: 'compact-payment' })}>
                {compact ? <h2>Forma de pagamento</h2> : <><div className="cp-divider" /><div className="cp-step"><span>2</span><div><h2>{guru ? 'Método de pagamento' : 'Escolha a forma de pagamento'}</h2><p>Escolha a melhor forma para você.</p></div></div></>}
                {(focused || guru) ? <div className="pc-payment-options">{methods.map(key => <section key={key} className={`pc-payment-option ${method === key ? 'is-open' : ''}`}><button type="button" aria-expanded={method === key} aria-controls={`payment-panel-${key}`} onClick={() => changePayment(key)}><span className="pc-payment-radio" aria-hidden="true" /><PaymentSymbol method={key} />{key === 'pix' ? 'Pix' : 'Cartão de crédito'}</button>{method === key && <div id={`payment-panel-${key}`} className="pc-payment-body">{paymentControls}</div>}</section>)}</div> : <><div className="cp-payment-tabs">{methods.map(key => <button type="button" key={key} aria-pressed={method === key} onClick={() => changePayment(key)}>{compact && <PaymentSymbol method={key} />}{key === 'pix' ? 'Pix' : 'Cartão de crédito'}</button>)}</div>{(!compact || (!compactCard && methods.length > 0)) && paymentControls}</>}
                {compact && !compactCard && billingAddress}
              </FormGroup>
              {compactCard && (
                <>
                  <section className="compact-card" aria-labelledby="compact-card-heading">
                    <h2 id="compact-card-heading">Dados do cartão</h2>
                    {cardControls}
                  </section>
                  {billingAddress}
                </>
              )}
            {shownBumps.length > 0 && <section className="pc-bumps" aria-label="Ofertas adicionais"><h3>{compact ? 'Adicionais opcionais' : 'Aproveite e compre junto:'}</h3>{shownBumps.map(bump => {
              const price = bumpPrice(bump)
              return <label key={bump.offer_id} className={`pc-bump ${selectedBumps.includes(bump.offer_id) ? 'is-selected' : ''} ${!price ? 'is-unavailable' : ''}`}><input type="checkbox" disabled={!price} checked={selectedBumps.includes(bump.offer_id)} onChange={event => setSelectedBumps(current => event.target.checked ? [...current, bump.offer_id] : current.filter(id => id !== bump.offer_id))} /><span><strong>{compact ? bump.product_name : bump.headline}</strong>{!compact && <span className="pc-bump-name">{bump.product_name}</span>}{bump.description && <span className="pc-bump-description">{bump.description}</span>}<b>{price ? `+ ${compact ? displayPrice(price.total_cents) : money(price.total_cents)}` : 'Indisponível nesta forma de pagamento'}</b></span>{focused && <span className="pc-bump-add">Adicionar produto</span>}</label>
            })}</section>}
            {(config.require_terms || config.require_privacy) && <div className={compact ? "cp-legal compact-terms" : "cp-legal"}>{config.require_terms && <label style={{display:'block',marginBottom:10}}><input type="checkbox" name="terms_accepted" required /> Li e aceito os <a href={config.terms_url} target="_blank" rel="noopener noreferrer">termos de uso</a>.</label>}{config.require_privacy && <label style={{display:'block'}}><input type="checkbox" name="privacy_accepted" required /> Li e aceito a <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">política de privacidade</a>.</label>}</div>}
            </fieldset>
            <FormGroup {...(compact && { className: 'compact-review' })}>
            {(compact || focused || selectedBumps.length > 0) && <div className="pc-order-summary">{(compact || focused) && <h3>{compact ? 'Resumo do pedido' : 'Detalhes da compra'}</h3>}<div><span>{config.product_display_name || offer.name || product.name}</span><strong>{compact ? displayPrice(basePrice.total_cents) : money(singlePayment?.total_cents ?? offer.price_cents)}</strong></div>{bumps.filter(bump => selectedBumps.includes(bump.offer_id)).map(bump => <div key={bump.offer_id}><span>{bump.product_name}</span><strong>{compact ? displayPrice(bumpPrice(bump)?.total_cents) : money(bumpPrice(bump)?.total_cents)}</strong></div>)}</div>}
            {(compact || (!focused && !guru) || selectedBumps.length > 0) && <div className="cp-total" aria-live={compact ? "polite" : undefined}><span>Total</span><strong>{summaryTotal}</strong></div>}{error && <p className="pc-error" role="alert">{error}</p>}{attemptStarted && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Consultar pedido</button>}{focused && !test.ready && <p className="pc-preparation-note" role="status">Checkout em preparação. Pagamentos ainda não disponíveis.</p>}<button className="cp-purchase-button" type="submit" disabled={busy || countdownExpired || !method || (compact && !methods.length) || !test.ready || (method === 'credit_card' && !test.publicKey)}>{countdownExpired ? 'Prazo encerrado' : busy ? 'Processando…' : attemptStarted ? 'Reenviar a mesma tentativa' : compact && method === 'pix' ? 'Gerar código Pix' : config.button_text}</button>{method === 'credit_card' && selected.interest_cents > 0 && <p className="pc-cta-interest">Taxa de juros: {Number(offer.monthly_interest_pct).toLocaleString('pt-BR')}% ao mês</p>}<p className="cp-legal pc-data-notice">Ao continuar, você concorda com os termos da compra e com o uso dos seus dados para processar o pedido e medir nossos anúncios (cookies e Meta). Os dados do cartão vão direto para o Pagar.me. <CookieChoice /></p>{method === 'credit_card' && !test.publicKey && <p className="pc-note">Pagamento por cartão em preparação.</p>}{!compact && <div className="cp-processor"><svg width="14" height="16" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="9" width="14" height="11" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3"/></svg><span>Pagamento processado por</span><strong>Pagar.me</strong></div>}
            </FormGroup>
          </form>}{result && error && <p role="alert" className="pc-error">{error}</p>}
        </section>
      </div>
      {compact && <CompactBuyerNotices />}
      <footer className="cp-footer">
        {!compact && <p className="pc-payment-footer">Pagamento processado pelo <strong>Pagar.me</strong>.</p>}
        {compact && <div className="compact-company">
          <strong>Suzana Zatorre Educacional</strong>
          <span>CNPJ 51.557.598/0001-55</span>
        </div>}
        <div className={compact ? 'compact-support' : 'guru-support'}>
          {(!compact || config.support_phone || config.support_email) && <h3>Atendimento</h3>}
          {config.support_phone && <a href={`https://wa.me/${config.support_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">☏ {config.support_phone}</a>}
          {config.support_email && <a href={`mailto:${config.support_email}`}>✉ {config.support_email}</a>}
        </div>
        {!compact && <>
          <strong>{config.store_name}</strong>
          <p className="pc-company-note">{config.company_name}</p>
          {config.company_document && <p className="pc-company-note">CNPJ: {config.company_document}</p>}
        </>}
        {config.company_address && <p className="pc-company-note">{config.company_address}</p>}
        <div>
          {config.terms_url && <a href={config.terms_url} target="_blank" rel="noopener noreferrer">Termos de uso</a>}
          {config.privacy_url && <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">Política de privacidade</a>}
        </div>
      </footer>
    </div>
  </main>
}
