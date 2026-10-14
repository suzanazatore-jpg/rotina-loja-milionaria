'use client'
import Image from 'next/image'
import CheckoutAnalytics from './CheckoutAnalytics'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import '../../admin/checkout/checkout-preview.css'
import './public-checkout.css'

const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const waiting = status => ['pending','waiting_payment'].includes(status)
const labels = { paid: 'Pagamento confirmado!', failed: 'Pagamento não aprovado', canceled: 'Pagamento cancelado', refunded: 'Pagamento reembolsado', chargedback: 'Pagamento contestado', pending: 'Aguardando confirmação', waiting_payment: 'Aguardando pagamento' }
function Field({ name, label, wide = false, ...props }) { return <label className={`cp-field ${wide ? 'wide' : ''}`}><span>{label}</span><input name={name} required {...props} /></label> }
function Asset({ src, alt, className = '' }) { return <Image unoptimized src={src} alt={alt} width={800} height={400} className={className} /> }

export default function PublicCheckout({ data }) {
  const { offer, product, config, prices, test, bumps = [] } = data
  const [method, setMethod] = useState(prices[0]?.method || 'pix')
  const [installments, setInstallments] = useState(1)
  const [selectedBumps, setSelectedBumps] = useState([])
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
        const customer = { name: get('name'), email: get('email'), document: get('document'), phone: get('phone'), address: { line_1: get('line_1'), line_2: get('line_2'), zip_code: get('zip_code'), city: get('city'), state: get('state').toUpperCase() } }
        const payload = { action: 'pay', customer, payment_method: method, installments, bumps: selectedBumps }
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
  const color = { '--cp-bg': config.background, '--cp-panel': config.panel, '--cp-text': config.text, '--cp-accent': config.accent, '--cp-button-text': config.button_text_color, fontFamily: config.font }
  return <main className="pc-checkout" style={color}>
    <CheckoutAnalytics config={config} enabled={data.analytics_enabled} viewCart={viewCart} currentCart={analyticsCart} started={attemptStarted} purchase={result?.purchase} />
    <div className={`cp-page ${config.layout === 'stacked' ? 'stacked' : ''}`}>
      <header className="cp-header"><div className="cp-brand">{config.logo_url ? <Asset src={config.logo_url} alt={config.store_name} className="cp-logo" /> : <span className="cp-brand-mark">SZ</span>}<strong>{config.store_name}</strong></div><span className="cp-security">Pagamento protegido</span></header>
      <div className="pc-notice" role="status">{test.ready ? 'Ambiente de teste — disponível somente para o administrador.' : 'Checkout em preparação. Pagamentos ainda não disponíveis.'}</div>
      {config.banner_url && <div className={`cp-banner ${config.mobile_banner_url ? 'pc-desktop-banner' : ''}`}><Asset src={config.banner_url} alt="Oferta" /></div>}
      {config.mobile_banner_url && <div className="cp-banner pc-mobile-banner"><Asset src={config.mobile_banner_url} alt="Oferta" /></div>}
      <div className="cp-columns">
        <aside className="cp-summary"><span className="cp-kicker">SUA ESCOLHA</span>{config.product_image_url ? <Asset src={config.product_image_url} alt={product.name} className="cp-product-image" /> : <div className="cp-product-placeholder"><span>SZ</span><strong>{product.name}</strong></div>}<h1>{offer.name || product.name}</h1>{config.subtitle && <p className="cp-description">{config.subtitle}</p>}<div className="cp-price"><span>{product.type === 'subscription' ? 'Valor por cobrança' : 'Total da sua compra'}</span><strong>{money(selected?.total_cents)}</strong>{installments > 1 && <small>{installments}x de {money(selected?.total_cents / installments)}{selected?.interest_cents ? ' com juros' : ' sem juros'}</small>}{product.type === 'subscription' && <small>A cada {offer.billing_interval_count} {offer.billing_interval === 'year' ? 'ano(s)' : 'mês(es)'}</small>}{offer.trial_days > 0 && <small>Teste de {offer.trial_days} dias. O acesso será liberado após o pagamento.</small>}</div><div className="cp-assurances"><div><span>✓</span><p>Pagamento protegido<small>Dados do cartão enviados diretamente ao Pagar.me.</small></p></div><div><span>✓</span><p>Acesso após a confirmação<small>Conforme o plano contratado.</small></p></div></div></aside>
        <section className="cp-form-card">
          {result ? <div className="pc-result" aria-live="polite"><span className="pc-result-icon">{result.status === 'paid' ? '✓' : '◇'}</span><h2>{labels[result.status] || 'Aguardando confirmação'}</h2><p>{result.status === 'paid' ? 'Pagamento de teste confirmado. A liberação depende da configuração de teste do app.' : waiting(result.status) ? 'A confirmação será atualizada aqui automaticamente.' : 'Consulte o suporte se precisar de ajuda.'}</p><strong>{money(result.total_cents)}</strong>{result.pix_code && waiting(result.status) && <div className="pc-pix"><label>Código Pix copia e cola<textarea readOnly rows={4} value={result.pix_code} /></label><button type="button" className="pc-secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.pix_code); setCopied(true) } catch { setError('Selecione e copie o código acima.') } }}>{copied ? 'Copiado!' : 'Copiar código Pix'}</button>{result.pix_expires_at && <small>Válido até {new Date(result.pix_expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}</div>}{waiting(result.status) && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Conferir pagamento</button>}{result.redirect_url && <a className="cp-purchase-button" href={result.redirect_url}>Continuar →</a>}</div> : <form ref={form} onSubmit={submit}>
            <div className="cp-step"><span>1</span><div><h2>Seus dados</h2><p>Informe os dados para receber o acesso.</p></div></div>
            <fieldset disabled={frozen}><div className="cp-fields"><Field name="name" label="Nome completo" autoComplete="name" wide maxLength={128} /><Field name="email" label="Email" type="email" autoComplete="email" wide maxLength={254} /><Field name="document" label="CPF ou CNPJ" inputMode="numeric" maxLength={18} /><Field name="phone" label="Celular" type="tel" autoComplete="tel" maxLength={20} /><Field name="zip_code" label="CEP" autoComplete="postal-code" inputMode="numeric" maxLength={9} /><Field name="state" label="Estado (UF)" autoComplete="address-level1" pattern="[A-Za-z]{2}" maxLength={2} /><Field name="city" label="Cidade" autoComplete="address-level2" wide maxLength={64} /><Field name="line_1" label="Rua, número e bairro" autoComplete="address-line1" wide maxLength={256} /><label className="cp-field wide"><span>Complemento (opcional)</span><input name="line_2" autoComplete="address-line2" maxLength={128} /></label></div><div className="cp-divider" /><div className="cp-step"><span>2</span><div><h2>Pagamento</h2><p>Escolha a melhor forma para você.</p></div></div><div className="cp-payment-tabs">{[...new Set(prices.map(p => p.method))].map(key => <button type="button" key={key} aria-pressed={method === key} onClick={() => { setMethod(key); setInstallments(1); setSelectedBumps(current => current.filter(id => bumps.find(bump => bump.offer_id === id)?.prices.some(price => price.method === key))) }}>{key === 'pix' ? 'Pix' : 'Cartão de crédito'}</button>)}</div>
            {method === 'credit_card' ? <div className="cp-fields"><Field name="card_number" label="Número do cartão" autoComplete="cc-number" inputMode="numeric" wide minLength={13} maxLength={24} /><Field name="holder_name" label="Nome no cartão" autoComplete="cc-name" wide maxLength={64} /><Field name="expiry" label="Validade (MM/AA)" autoComplete="cc-exp" placeholder="MM/AA" inputMode="numeric" pattern="[0-9]{2}/([0-9]{2}|[0-9]{4})" maxLength={7} /><Field name="cvv" label="Código de segurança" autoComplete="cc-csc" inputMode="numeric" type="password" pattern="[0-9]{3,4}" maxLength={4} /><label className="cp-field wide"><span>Parcelas</span><select value={installments} onChange={e => setInstallments(Number(e.target.value))}>{prices.filter(p => p.method === method).map(p => <option key={p.installments} value={p.installments}>{p.installments}x de {money(cartPrice(p).total_cents / p.installments)} — {cartPrice(p).interest_cents ? `total ${money(cartPrice(p).total_cents)}` : 'sem juros'}</option>)}</select></label></div> : <div className="cp-pix-info"><div><strong>Pagamento com Pix</strong><p>Após enviar seus dados, copie o código para pagar no seu banco.</p></div></div>}
            {bumps.length > 0 && <section className="pc-bumps" aria-label="Ofertas adicionais"><h3>Complete sua compra</h3>{bumps.map(bump => {
              const price = bumpPrice(bump)
              return <label key={bump.offer_id} className={`pc-bump ${selectedBumps.includes(bump.offer_id) ? 'is-selected' : ''} ${!price ? 'is-unavailable' : ''}`}><input type="checkbox" disabled={!price} checked={selectedBumps.includes(bump.offer_id)} onChange={event => setSelectedBumps(current => event.target.checked ? [...current, bump.offer_id] : current.filter(id => id !== bump.offer_id))} /><span><strong>{bump.headline}</strong><span className="pc-bump-name">{bump.product_name}</span>{bump.description && <span className="pc-bump-description">{bump.description}</span>}<b>{price ? `+ ${money(price.total_cents)}` : 'Indisponível nesta forma de pagamento'}</b></span></label>
            })}</section>}
            </fieldset>
            {selectedBumps.length > 0 && <div className="pc-order-summary"><div><span>{offer.name}</span><strong>{money(basePrice.total_cents)}</strong></div>{bumps.filter(bump => selectedBumps.includes(bump.offer_id)).map(bump => <div key={bump.offer_id}><span>{bump.product_name}</span><strong>{money(bumpPrice(bump)?.total_cents)}</strong></div>)}</div>}
            <div className="cp-total"><span>Total</span><strong>{money(selected?.total_cents)}</strong></div>{error && <p className="pc-error" role="alert">{error}</p>}{attemptStarted && <button type="button" className="pc-secondary" onClick={() => checkStatus().catch(e => setError(e.message))}>Consultar pedido</button>}<button className="cp-purchase-button" type="submit" disabled={busy || !test.ready || (method === 'credit_card' && !test.publicKey)}>{busy ? 'Processando…' : attemptStarted ? 'Reenviar a mesma tentativa' : config.button_text}</button><p className="cp-legal">Ao concluir, você concorda com os termos da compra.</p>{method === 'credit_card' && !test.publicKey && <p className="pc-note">Pagamento por cartão em preparação.</p>}<div className="cp-processor"><span>Processamento de pagamento</span><strong>Pagar.me</strong></div>
          </form>}{result && error && <p role="alert" className="pc-error">{error}</p>}
        </section>
      </div><footer className="cp-footer"><strong>{config.store_name}</strong>{config.support_email && <a href={`mailto:${config.support_email}`}>{config.support_email}</a>}{config.support_phone && <span>{config.support_phone}</span>}<div>{config.terms_url && <a href={config.terms_url} target="_blank" rel="noopener noreferrer">Termos de uso</a>}{config.privacy_url && <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">Política de privacidade</a>}</div></footer>
    </div>
  </main>
}
