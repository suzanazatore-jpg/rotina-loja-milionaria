import { checkoutAccessDetails, CHECKOUT_GUARANTEE_LABEL } from '../../admin/checkout/CheckoutAssurances'

const icons = {
  shield: 'M12 3 4.5 6v5.5c0 4.2 3.1 7.5 7.5 9.5 4.4-2 7.5-5.3 7.5-9.5V6L12 3z M8.7 11.8l2.2 2.2 4.5-4.7',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7l1-7z',
  signature: 'm5 14 10-10a2.1 2.1 0 0 1 3 3L8 17l-4 1 1-4z M13 6l3 3 M4 21h16',
  card: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 10h18 M7 15h4',
  lock: 'M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z M8 10V7a4 4 0 0 1 8 0v3 M12 15v2',
}

function TrustIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  )
}

export function CompactTrustStrip({ config, subscription }) {
  const { afterSignature, label, detail } = checkoutAccessDetails(config)
  return (
    <ul className="compact-trust" aria-label="Segurança, acesso e pagamento">
      <li><TrustIcon name="shield" /><span>Compra segura</span></li>
      <li title={detail}><TrustIcon name={afterSignature ? 'signature' : 'bolt'} /><span>{label}</span></li>
      <li><TrustIcon name="card" /><span>{subscription ? 'Pagamento recorrente' : 'Pagamento único'}</span></li>
    </ul>
  )
}

export function CompactBuyerNotices() {
  return (
    <section className="compact-notices" aria-label="Segurança e garantia">
      <div className="compact-notice">
        <TrustIcon name="lock" />
        <div>
          <h2>Ambiente seguro</h2>
          <p>Pagamento processado pelo Pagar.me.</p>
        </div>
      </div>
      <div className="compact-notice compact-guarantee">
        <TrustIcon name="shield" />
        <div>
          <h2>{CHECKOUT_GUARANTEE_LABEL}</h2>
          <p>Se precisar acionar a garantia, entre em contato com nosso suporte.</p>
        </div>
      </div>
    </section>
  )
}
