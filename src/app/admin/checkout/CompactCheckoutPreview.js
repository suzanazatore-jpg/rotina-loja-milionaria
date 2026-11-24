'use client'

import { useState } from 'react'
import { totalParcelado } from '@/lib/checkoutPricing'
import CompactCheckoutHeader from '../../checkout/[slug]/CompactCheckoutHeader'
import { CompactBuyerNotices } from '../../checkout/[slug]/CompactCheckoutTrust'
import CheckoutCountdown from './CheckoutCountdown'
import '../../checkout/[slug]/public-checkout.css'
import '../../checkout/[slug]/checkout-compact.css'
import styles from './CompactCheckoutPreview.module.css'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const money = cents => currency.format(cents / 100)

function Field({ label, placeholder, wide }) {
  return (
    <div className={`cp-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <div className={styles.field}>{placeholder}</div>
    </div>
  )
}

function pricesFor(offer, price, methods, installmentCount, terms) {
  return methods.flatMap(method => Array.from({ length: method === 'pix' ? 1 : installmentCount }, (_, index) => {
    const installments = index + 1
    const total = method === 'pix'
      ? price - Math.round(price * Number(String(offer.pix_discount_pct || 0).replace(',', '.')) / 100)
      : totalParcelado(price, installments, Number(terms.free_installments) || installmentCount,
        terms.monthly_interest_pct, terms.interest_model)
    return { method, installments, total_cents: total, interest_cents: method === 'pix' ? 0 : total - price }
  }))
}

const labels = { pix: 'Pix', credit_card: 'Cartão de crédito' }
const documents = { cpf: 'CPF', cnpj: 'CNPJ' }

export default function CompactCheckoutPreview({ config, offer, product, catalog, device }) {
  const [selectedMethod, setSelectedMethod] = useState('')
  const [selectedInstallments, setSelectedInstallments] = useState(null)
  const [selectedBumps, setSelectedBumps] = useState([])
  const subscription = product.type === 'subscription'
  const methods = (offer.payment_methods || []).filter(method => method in labels && (!subscription || method === 'credit_card'))
  const method = methods.includes(selectedMethod) ? selectedMethod : methods.includes('pix') ? 'pix' : methods[0]
  const card = method === 'credit_card'
  const value = String(offer.price ?? '').trim()
  const price = value
    ? Math.max(0, Math.round(Number(value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value) * 100) || 0)
    : Number(offer.price_cents) || 0
  const max = subscription ? 1 : Math.min(18, Math.max(1, Number(offer.max_installments) || 1))
  const count = Math.min(max, Math.max(1, selectedInstallments ?? (Number(offer.default_installments) || 1)))
  const installments = card ? count : 1
  const prices = pricesFor(offer, price, methods, max, offer)
  const quote = (rows, count) => rows.find(item => item.method === method && item.installments === count)
  const base = quote(prices, installments)?.total_cents ?? price
  const bumps = subscription ? [] : (offer.bumps || []).flatMap(bump => {
    const extra = catalog?.ofertas.find(item => item.id === bump.bump_offer_id && item.active)
    const extraProduct = extra && catalog.produtos.find(item => item.id === extra.product_id && item.active)
    if (!extraProduct || extraProduct.type !== 'one_time' || !extraProduct.plan_id ||
      (extraProduct.marketplace_id && extraProduct.marketplace_id !== 'pagarme') ||
      !extra.payment_methods?.includes(method)) return []
    return [{ id: extra.id, name: extraProduct.name, description: bump.description,
      prices: pricesFor(extra, extra.price_cents, [method], max, offer) }]
  })
  const selected = bumps.filter(item => selectedBumps.includes(item.id))
  const bumpTotal = number => selected.reduce((total, item) => total + (quote(item.prices, number)?.total_cents ?? 0), 0)
  const format = amount => installments > 1 ? `${installments} × ${money(amount / installments)}` : money(amount)
  const name = config.product_display_name || offer.name || product.name
  const previewConfig = { ...config, product_image_url: config.product_image_url || product.image_url }

  function changeMethod(next) {
    if (next === method) return
    setSelectedMethod(next)
    setSelectedInstallments(null)
    setSelectedBumps([])
  }

  return (
    <div className={`cp-viewport ${device} ${styles.viewport}`}>
      <div className="pc-checkout compact-checkout">
        <CheckoutCountdown config={previewConfig} preview />
        <div className="cp-page compact">
          <CompactCheckoutHeader config={previewConfig} offer={{ ...offer, price_cents: price }} product={product} prices={prices} money={money} />
          <div className={styles.sections}>
            <section className="compact-data">
              <h2>Seus dados</h2>
              <div className="cp-fields">
                <Field label="Nome e sobrenome" placeholder="Digite seu nome completo" wide />
                <Field label="E-mail" placeholder="Digite seu email para receber a compra" wide />
                {config.confirm_email && <Field label="Confirme seu email" placeholder="Digite novamente seu email" wide />}
                <Field label="Celular" placeholder="BR +55  (11) 99999-9999" />
                <Field label={documents[config.document_type] || 'CPF / CNPJ'} placeholder="Digite seu documento" />
              </div>
            </section>
            <section className="compact-payment">
              <h2>Forma de pagamento</h2>
              <div className="cp-payment-tabs">
                {methods.map(key => <button type="button" key={key} aria-pressed={key === method} onClick={() => changeMethod(key)}>{labels[key]}</button>)}
              </div>
              {method === 'pix' && <p className="compact-pix-note">Gere o código Pix e pague no app do seu banco.</p>}
            </section>
            {card && <section className="compact-card">
              <h2>Dados do cartão</h2>
              <div className="cp-fields compact-card-fields">
                <label className="cp-field pc-installments wide">
                  <span>Nº de parcelas</span>
                  <select value={installments} onChange={event => setSelectedInstallments(Number(event.target.value))}>
                    {prices.filter(item => item.method === method).map(item => (
                      <option key={item.installments} value={item.installments}>
                        {item.installments === 1
                          ? `À vista: ${money(item.total_cents + bumpTotal(1))}`
                          : `${item.installments} × ${money((item.total_cents + bumpTotal(item.installments)) / item.installments)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <Field placeholder="Número do cartão" wide />
                <Field placeholder="Nome impresso no cartão" wide />
                <Field placeholder="Validade (MM/AA)" />
                <Field placeholder="CVV" />
              </div>
            </section>}
            {method && (card || (config.layout !== 'guru' && config.form_profile !== 'compact')) && (
              <details className="pc-address compact-card-address">
                <summary>Endereço de cobrança (obrigatório)</summary>
                <div className="cp-fields">
                  <Field label="CEP" placeholder="00000-000" />
                  <Field label="Estado (UF)" placeholder="UF" />
                  <Field label="Cidade" placeholder="Sua cidade" wide />
                  <Field label="Rua" placeholder="Rua" wide />
                  <Field label="Número" placeholder="Número" />
                  <Field label="Bairro" placeholder="Bairro" />
                </div>
              </details>
            )}
            {bumps.length > 0 && <section className="pc-bumps">
              <h3>Adicionais opcionais</h3>
              {bumps.map(item => (
                <label key={item.id} className={`pc-bump ${selectedBumps.includes(item.id) ? 'is-selected' : ''}`}>
                  <input type="checkbox" checked={selectedBumps.includes(item.id)}
                    onChange={event => setSelectedBumps(current => event.target.checked
                      ? [...current, item.id] : current.filter(id => id !== item.id))} />
                  <span>
                    <strong>{item.name}</strong>
                    {item.description && <span className="pc-bump-description">{item.description}</span>}
                    <b>+ {format(quote(item.prices, installments).total_cents)}</b>
                  </span>
                </label>
              ))}
            </section>}
            <section className="compact-review">
              <div className="pc-order-summary"><h3>Resumo do pedido</h3><div><span>{name}</span><strong>{format(base)}</strong></div>
                {selected.map(item => <div key={item.id}><span>{item.name}</span><strong>{format(quote(item.prices, installments).total_cents)}</strong></div>)}
              </div>
              <div className="cp-total" aria-live="polite"><span>Total</span><strong>{format(base + bumpTotal(installments))}</strong></div>
              <button type="button" className="cp-purchase-button" disabled>{method === 'pix' ? 'Gerar código Pix' : config.button_text}</button>
            </section>
          </div>
          <CompactBuyerNotices />
          <footer className="cp-footer">
            <div className="compact-company"><strong>Suzana Zatorre Educacional</strong><span>CNPJ 51.557.598/0001-55</span></div>
          </footer>
        </div>
      </div>
    </div>
  )
}
