'use client'
import Image from 'next/image'
import { flushSync } from 'react-dom'
import CheckoutAnalytics from './CheckoutAnalytics'
import CheckoutCountdown from '../../admin/checkout/CheckoutCountdown'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import '../../admin/checkout/checkout-preview.css'
import './public-checkout.css'
import '../../admin/checkout/focused-checkout.css'
import '../../admin/checkout/checkout-models.css'

const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const waiting = status => ['pending','waiting_payment'].includes(status)
const labels = { paid: 'Pagamento confirmado!', failed: 'Pagamento não aprovado', canceled: 'Pagamento cancelado', refunded: 'Pagamento reembolsado', chargedback: 'Pagamento contestado', pending: 'Aguardando confirmação', waiting_payment: 'Aguardando pagamento' }
function Field({ name, label, wide = false, prefix, ...props }) { return <label className={`cp-field ${wide ? 'wide' : ''}`}><span>{label}</span><div className={prefix ? "pc-phone-control" : "pc-input-control"}>{prefix && <span className="pc-country-prefix" aria-hidden="true">BR +55</span>}<input name={name} placeholder={({email:"Digite seu email para receber a compra",email_confirmation:"Digite novamente seu email",name:"Digite seu nome completo",document:"Digite seu CPF ou CNPJ",phone:"(11) 99999-9999",card_number:"0000 0000 0000 0000",holder_name:"Nome impresso no cartão",cvv:"3 ou 4 dígitos"})[name]} required {...props} /></div></label> }
function PaymentSymbol({ method }) {
  return method === 'pix' ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 2 5 5-5 5-5-5 5-5Zm0 10 5 5-5 5-5-5 5-5ZM2 12l5-5m10 0 5 5-5 5M7 17l-5-5" /></svg> : <svg width="19" height="15" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="2"/><path d="M1 6h22M5 12h5"/></svg>
}
function Asset({ src, alt, className = '' }) { return <Image unoptimized src={src} alt={alt} width={800} height={400} className={className} /> }

export default function PublicCheckout({ data }) {
  const { offer, product, config, prices, test, bumps = [] } = data
  const focused = config.layout === 'focused'
  const SummaryHeading = focused ? 'h2' : 'h1'
  const initialMethod = focused && prices.some(price => price.method === 'credit_card') ? 'credit_card' : prices[0]?.method || 'pix'
  const [method, setMethod] = useState(initialMethod)
  const [installments, setInstallments] = useState(initialMethod === 'credit_card' ? offer.default_installments || 1 : 1)
  const [selectedBumps, setSelectedBumps] = useState([])
  const needsAddress = config.form_profile !== 'compact' || method === 'credit_card'
  const [addressOpen, setAddressOpen] = useState(false)
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
  const basePrice = prices.find(price => price.method === method && price.installments === installments) || prices[0]
  const bumpPrice = bump => bump.prices.find(price => price.method === method && price.installments === installments)
  const cartPrice = base => selectedBumps.reduce((total, id) => {
    const price = bumps.find(bump => bump.offer_id === id)?.prices.find(price => price.method === base.method && price.installments === base.installments)
    if (!price) return total
    return { ...total, total_cents: total.total_cents + price.total_cents, interest_cents: total.interest_cents + price.interest_cents }
  }, { ...base })
  const selected = cartPrice(basePrice)
  const frozen = busy || attemptStarted
  const analyticsCart = { total_cents: selected.total_cents, items: [{ item_id: product.id, item_name: product.name, price_cents: basePrice.total_cents }, ...bumps.filter(bump => selectedBumps.includes(bump.offer_id)).map(bump => ({ item_id: bump.product_id, item_name: bump.product_name, price_cents: bumpPrice(bump)?.total_cents }))] }
  const viewCart = { total_cents: offer.price_cents, items: [{ item_id: product.id, item_name: product.name, price_cents: offer.price_cents }] }

  function changePayment(key) {
    setMethod(key)
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
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
      const start = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ action: 'start' }) })
      const startData = await start.json()
      if (!start.ok) throw new Error(startData.error)
      if (!pendingRequest.current) {
        const get = key => String(values.get(key) || '').trim()
        if (config.confirm_email && get('email_confirmation').toLowerCase() !== get('email').toLowerCase()) throw new Error('Os emails não conferem.')
        const customer = { name: get('name'), email: get('email'), document: get('document'), phone: get('phone'), ...(needsAddress ? { address: { line_1: [get('address_number'), get('street'), get('district')].join(', '), street: get('street'), number: get('address_number'), district: get('district'), line_2: get('line_2'), zip_code: get('zip_code'), city: get('city'), state: get('state').toUpperCase() } } : {}) }
        const payload = { action: 'pay', customer, payment_method: method, installments, bumps: selectedBumps, email_confirmation: get('email_confirmation'), terms_accepted: values.get('terms_accepted') === 'on', privacy_accepted: values.get('privacy_accepted') === 'on', marketing_consent: (() => { try { return localStorage.getItem('sz-checkout-consent-v2') === 'granted' } catch { return false } })() }
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
  const paymentControls = (method === 'credit_card' ? <div className="cp-fields"><Field name="card_number" label="Número do cartão" autoComplete="cc-number" inputMode="numeric" wide minLength={13} maxLength={24} /><Field name="expiry" label="Validade (MM/AA)" autoComplete="cc-exp" placeholder="MM/AA" inputMode="numeric" pattern="[0-9]{2}/([0-9]{2}|[0-9]{4})" maxLength={7} /><Field name="cvv" label="Código de segurança" autoComplete="cc-csc" inputMode="numeric" type="password" pattern="[0-9]{3,4}" maxLength={4} /><Field name="holder_name" label="Nome do titular" autoComplete="cc-name" wide maxLength={64} /><label className="cp-field wide"><span>Selecione o número de parcelas</span><select value={installments} onChange={e => setInstallments(Number(e.target.value))}>{prices.filter(p => p.method === method).map(p => <option key={p.installments} value={p.installments}>{p.installments}x de {money(cartPrice(p).total_cents / p.installments)} — {cartPrice(p).interest_cents ? `total ${money(cartPrice(p).total_cents)}` : 'sem juros'}</option>)}</select></label></div> : <div className="cp-pix-info"><div><strong>Pagamento com Pix</strong><p>Após enviar seus dados, copie o código para pagar no seu banco.</p></div></div>
  )
  const color = { '--cp-bg': config.background, '--cp-panel': config.panel, '--cp-text': config.text, '--cp-accent': config.accent, '--cp-button-text': config.button_text_color, fontFamily: config.font }
  return <main className="pc-checkout" style={color}>
    <CheckoutCountdown config={config} onExpire={setCountdownExpired} />
    <CheckoutAnalytics config={config} enabled={data.analytics_enabled} viewCart={viewCart} currentCart={analyticsCart} started={attemptStarted} purchase={result?.purchase} />
    <div className={`cp-page ${config.layout === 'focused' ? 'focused' : config.layout === 'stacked' ? 'stacked' : config.layout === 'guru' ? 'guru' : config.layout === 'banner' ? 'banner' : ''}`}>
      {focused && <div className="cp-hero"><p>{config.store_name}</p><h1>{config.headline || config.product_display_name || product.name}{config.headline_highlight && <span>{config.headline_highlight}</span>}</h1></div>}
      {config.layout === 'banner' && config.headline && <div className="cp-model-headline">{config.headline}{config.headline_highlight && <span>{config.headline_highlight}</span>}</div>}
    <header className="cp-header"><div className="cp-brand">{config.logo_url ? <Asset src={config.logo_url} alt={config.store_name} className="cp-logo" /> : <span className="cp-brand-mark">SZ</span>}<strong>{config.store_name}</strong></div><span className="cp-security">Pagamento protegido</span></header>
      {!focused && <div className="pc-notice" role="status">{test.ready ? 'Ambiente de teste — disponível somente para o administrador.' : 'Checkout em preparação. Pagamentos ainda não disponíveis.'}</div>}
      {config.banner_url && <div className={`cp-banner ${config.mobile_banner_url ? 'pc-desktop-banner' : ''}`}><Asset src={config.banner_url} alt="Oferta" /></div>}
      {config.mobile_banner_url && <div className="cp-banner pc-mobile-banner"><Asset src={config.mobile_banner_url} alt="Oferta" /></div>}
      <div className="cp-columns">
        {focused && <div className="pc-country-note">BR · Pagamento em reais (R$)</div>}
        <aside className="cp-summary">{config.layout === 'guru' && <><div className="guru-seller">{config.logo_url ? <Asset src={config.logo_url} alt="" className="guru-seller-logo" /> : <span className="guru-seller-monogram">SZ</span>}<strong>{config.company_name || config.store_name}</strong></div><div className="guru-security"><svg width="16" height="18" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 2 3 6v7c0 5 9 11 9 11s9-6 9-11V6l-9-4Z"/><path d="m7 12 3 3 7-7"/></svg> Compra segura</div></>}<span className="cp-kicker">SUA ESCOLHA</span>{config.product_image_url ? <Asset src={config.product_image_url} alt={product.name} className="cp-product-image" /> : <div className="cp-product-placeholder"><span>SZ</span><strong>{config.product_display_name || product.name}</strong></div>}<SummaryHeading>{config.product_display_name || offer.name || product.name}</SummaryHeading>{config.layout === 'guru' && config.headline && <p className="guru-offer-headline">{config.headline} {config.headline_highlight}</p>}{focused && <p className="pc-producer">Por {config.store_name}</p>}{config.subtitle && (config.layout !== 'guru' || config.subtitle !== config.product_display_name) && <p className="cp-description">{config.subtitle}</p>}<div className="cp-price">{config.layout === 'guru' && <div className="guru-price-rows"><div><span>Produto</span><strong>{money(basePrice?.total_cents)}</strong></div><div><span>TOTAL</span><strong>{money(selected?.total_cents)}</strong></div></div>}<span>{product.type === 'subscription' ? 'Valor por cobrança' : 'Total da sua compra'}</span><strong>{money(focused ? basePrice?.total_cents : selected?.total_cents)}</strong>{installments > 1 && <small>{installments}x de {money(selected?.total_cents / installments)}{selected?.interest_cents ? ' com juros' : ' sem juros'}</small>}{product.type === 'subscription' && <small>A cada {offer.billing_interval_count} {({day:'dia(s)',week:'semana(s)',month:'mês(es)',year:'ano(s)'})[offer.billing_interval]}</small>}{product.type === 'subscription' && offer.billing_cycles > 0 && <small>Até {offer.billing_cycles} cobrança(s).</small>}{offer.trial_days > 0 && <small>Teste de {offer.trial_days} dias. O acesso será liberado após o pagamento.</small>}</div><div className="cp-assurances"><div><span>✓</span><p>Compra segura<small>Dados do cartão enviados diretamente ao Pagar.me.</small></p></div><div><span>✓</span><p>Acesso após a confirmação<small>Conforme o plano contratado.</small></p></div>{product.type !== 'subscription' && <div><span>✓</span><p>Pagamento único<small>Sem cobrança recorrente.</small></p></div>}</div></aside>
        <section className="cp-form-card">
          {result ? <div className="pc-result" aria-live="polite"><span className="pc-result-icon">{result.status === 'paid' ? '✓' : '◇'}</span><h2>{labels[result.status] || 'Aguardando confirmação'}</h2><p>{result.status === 'paid' ? 'Pagamento de teste confirmado. A liberação depende da configuração de teste do app.' : waiting(result.status) ? 'A confirmação será atualizada aqui automaticamente.' : 'Consulte o suporte se precisar de ajuda.'}</p><strong>{money(result.total_cents)}</strong>{result.pix_code && waiting(result.status) && <div className="pc-pix"><label>Código Pix copia e cola<textarea readOnly rows={4} value={result.pix_code} /></label><button type="button" className="pc-secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.pix_code); setCopied(true) } catch { setError('Selecione e copie o código acima.') } }}>{copied ? 'Copiado!' : 'Copiar código Pix'}</button>{result.pix_expires_at && <small>Válido até {new Date(result.pix_expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}</div>}{waiting(result.status) && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Conferir pagamento</button>}{result.redirect_url && <a className="cp-purchase-button" href={result.redirect_url}>Continuar →</a>}</div> : <form ref={form} onSubmit={submit} onInvalidCapture={event => { if (event.target.closest('.pc-address')) flushSync(() => setAddressOpen(true)) }}>
            <div className="cp-step"><span>1</span><div><h2>{config.layout === 'guru' ? 'Os seus dados' : 'Dados pessoais'}</h2><p>Informe os dados para receber o acesso.</p></div></div>
            <fieldset disabled={frozen}><div className="cp-fields">{config.layout === 'guru' && <Field name="name" label="Nome completo" autoComplete="name" wide maxLength={128} />}<Field name="email" label="Email" type="email" autoComplete="email" wide maxLength={254} />{config.confirm_email && <Field name="email_confirmation" label="Confirme seu email" type="email" autoComplete="off" wide maxLength={254} />}{config.layout !== 'guru' && <Field name="name" label="Nome completo" autoComplete="name" wide maxLength={128} />}<Field name="document" label="CPF ou CNPJ" inputMode="numeric" maxLength={18} /><Field name="phone" label="Celular" prefix={focused ? "+55" : undefined} type="tel" autoComplete="tel" maxLength={20} /></div>{needsAddress && <details className="pc-address" open={config.form_profile !== 'compact' || !focused || addressOpen} onToggle={event => setAddressOpen(event.currentTarget.open)}><summary>Endereço de cobrança e nota fiscal</summary><div className="cp-fields"><Field name="zip_code" label="CEP" autoComplete="postal-code" inputMode="numeric" maxLength={9} /><Field name="state" label="Estado (UF)" autoComplete="address-level1" pattern="[A-Za-z]{2}" maxLength={2} /><Field name="city" label="Cidade" autoComplete="address-level2" wide maxLength={64} /><Field name="street" label="Rua" autoComplete="address-line1" wide maxLength={128} /><Field name="address_number" label="Número (ou s/n)" maxLength={32} /><Field name="district" label="Bairro" maxLength={64} /><label className="cp-field wide"><span>Complemento (opcional)</span><input name="line_2" autoComplete="address-line2" maxLength={128} /></label></div></details>}<div className="cp-divider" /><div className="cp-step"><span>2</span><div><h2>{config.layout === 'guru' ? 'Método de pagamento' : 'Escolha a forma de pagamento'}</h2><p>Escolha a melhor forma para você.</p></div></div>{(focused || config.layout === 'guru') ? <div className="pc-payment-options">{[...new Set(prices.map(p => p.method))].map(key => <section key={key} className={`pc-payment-option ${method === key ? 'is-open' : ''}`}><button type="button" aria-expanded={method === key} aria-controls={`payment-panel-${key}`} onClick={() => changePayment(key)}><span className="pc-payment-radio" aria-hidden="true" /><PaymentSymbol method={key} />{key === 'pix' ? 'Pix' : 'Cartão de crédito'}</button>{method === key && <div id={`payment-panel-${key}`} className="pc-payment-body">{paymentControls}</div>}</section>)}</div> : <><div className="cp-payment-tabs">{[...new Set(prices.map(p => p.method))].map(key => <button type="button" key={key} aria-pressed={method === key} onClick={() => changePayment(key)}>{key === 'pix' ? 'Pix' : 'Cartão de crédito'}</button>)}</div>{paymentControls}</>}
            {bumps.length > 0 && <section className="pc-bumps" aria-label="Ofertas adicionais"><h3>Aproveite e compre junto:</h3>{bumps.map(bump => {
              const price = bumpPrice(bump)
              return <label key={bump.offer_id} className={`pc-bump ${selectedBumps.includes(bump.offer_id) ? 'is-selected' : ''} ${!price ? 'is-unavailable' : ''}`}><input type="checkbox" disabled={!price} checked={selectedBumps.includes(bump.offer_id)} onChange={event => setSelectedBumps(current => event.target.checked ? [...current, bump.offer_id] : current.filter(id => id !== bump.offer_id))} /><span><strong>{bump.headline}</strong><span className="pc-bump-name">{bump.product_name}</span>{bump.description && <span className="pc-bump-description">{bump.description}</span>}<b>{price ? `+ ${money(price.total_cents)}` : 'Indisponível nesta forma de pagamento'}</b></span>{focused && <span className="pc-bump-add">Adicionar produto</span>}</label>
            })}</section>}
            {(config.require_terms || config.require_privacy) && <div className="cp-legal">{config.require_terms && <label style={{display:'block',marginBottom:10}}><input type="checkbox" name="terms_accepted" required /> Li e aceito os <a href={config.terms_url} target="_blank" rel="noopener noreferrer">termos de uso</a>.</label>}{config.require_privacy && <label style={{display:'block'}}><input type="checkbox" name="privacy_accepted" required /> Li e aceito a <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">política de privacidade</a>.</label>}</div>}
            </fieldset>
            {(focused || selectedBumps.length > 0) && <div className="pc-order-summary">{focused && <h3>Detalhes da compra</h3>}<div><span>{config.product_display_name || offer.name}</span><strong>{money(basePrice.total_cents)}</strong></div>{bumps.filter(bump => selectedBumps.includes(bump.offer_id)).map(bump => <div key={bump.offer_id}><span>{bump.product_name}</span><strong>{money(bumpPrice(bump)?.total_cents)}</strong></div>)}</div>}
            {(!focused || selectedBumps.length > 0) && <div className="cp-total"><span>Total</span><strong>{money(selected?.total_cents)}</strong></div>}{error && <p className="pc-error" role="alert">{error}</p>}{attemptStarted && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Consultar pedido</button>}{focused && !test.ready && <p className="pc-preparation-note" role="status">Checkout em preparação. Pagamentos ainda não disponíveis.</p>}<button className="cp-purchase-button" type="submit" disabled={busy || countdownExpired || !test.ready || (method === 'credit_card' && !test.publicKey)}>{countdownExpired ? 'Prazo encerrado' : busy ? 'Processando…' : attemptStarted ? 'Reenviar a mesma tentativa' : config.button_text}</button><p className="cp-legal">Ao concluir, você concorda com os termos da compra.</p>{method === 'credit_card' && !test.publicKey && <p className="pc-note">Pagamento por cartão em preparação.</p>}<div className="cp-processor"><svg width="14" height="16" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="9" width="14" height="11" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3"/></svg><span>Pagamento processado por</span><strong>Pagar.me</strong></div>
          </form>}{result && error && <p role="alert" className="pc-error">{error}</p>}
        </section>
      </div><footer className="cp-footer"><strong>{config.store_name}</strong><p className="pc-company-note">{config.company_name}</p>{config.company_document && <p className="pc-company-note">CNPJ: {config.company_document}</p>}{config.company_address && <p className="pc-company-note">{config.company_address}</p>}{config.support_email && <a href={`mailto:${config.support_email}`}>{config.support_email}</a>}{config.support_phone && <span>{config.support_phone}</span>}<div>{config.terms_url && <a href={config.terms_url} target="_blank" rel="noopener noreferrer">Termos de uso</a>}{config.privacy_url && <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">Política de privacidade</a>}</div></footer>
    </div>
  </main>
}
