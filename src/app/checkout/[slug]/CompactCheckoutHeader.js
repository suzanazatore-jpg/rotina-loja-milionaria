import Image from 'next/image'
import CheckoutAssurances from '../../admin/checkout/CheckoutAssurances'

const billingUnits = { day: 'dia(s)', week: 'semana(s)', month: 'mês(es)', year: 'ano(s)' }

export default function CompactCheckoutHeader({ config, offer, product, prices, money }) {
  const title = config.product_display_name || offer.name || product.name
  const cash = prices.find(price => price.method === 'pix') || prices.find(price => price.installments === 1)
  const longest = prices.findLast(price => price.method === 'credit_card' && price.installments > 1)
  const subscription = product.type === 'subscription'

  return (
    <>
      <header className="compact-brand">
        <span>{config.store_name}</span>
      </header>
      <section className="compact-product" aria-labelledby="checkout-product">
        <div className="compact-product-main">
          <div className="compact-product-photo">
            {config.product_image_url
              ? <Image unoptimized src={config.product_image_url} alt="" width={80} height={80} />
              : <span aria-hidden="true">SZ</span>}
          </div>
          <div>
            <h1 id="checkout-product">{title}</h1>
            {config.subtitle && config.subtitle !== title && <p>{config.subtitle}</p>}
          </div>
        </div>
        <div className="compact-product-price">
          {longest ? (
            <>
              <strong>{longest.installments} × {money(longest.total_cents / longest.installments)}</strong>
              <small>{longest.interest_cents === 0 ? 'Sem juros · ' : ''}{cash && `${money(cash.total_cents)} à vista`}</small>
            </>
          ) : (
            <>
              <strong>{money(cash?.total_cents ?? offer.price_cents)}</strong>
              {subscription
                ? <small>A cada {offer.billing_interval_count} {billingUnits[offer.billing_interval]}</small>
                : <small>Pagamento único</small>}
            </>
          )}
          {subscription && offer.billing_cycles > 0 && <small>Até {offer.billing_cycles} cobranças</small>}
          {offer.trial_days > 0 && <small>Teste de {offer.trial_days} dias. Acesso após o pagamento.</small>}
        </div>
      </section>
      <div className="compact-trust">
        <span className="compact-secure">
          <svg width="18" height="18" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="9" width="14" height="11" rx="2" /><path d="M6 9V6a4 4 0 0 1 8 0v3" /></svg>
          Compra segura
        </span>
        <CheckoutAssurances config={config} />
      </div>
    </>
  )
}
