import styles from './CheckoutAssurances.module.css'

export default function CheckoutAssurances({config}) {
  const afterSignature = config.contract?.required && config.contract.gate_access !== false
  const access = afterSignature ? 'Acesso após assinatura' : 'Acesso imediato'
  const detail = afterSignature ? 'Confirme o pagamento e assine o contrato.' : 'Após a confirmação do pagamento.'

  if (!config.seven_day_guarantee) {
    return <div className="cp-assurances"><div><span>✓</span><p>{access}<small>{detail}</small></p></div></div>
  }
  return (
    <ul className={styles.list} aria-label="Acesso e garantia">
      <li title={detail}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13h6L10 22l9.5-13h-6L14 2z" /></svg>
        <span>{access}</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.2 3.1 7.5 7.5 9.5 4.4-2 7.5-5.3 7.5-9.5V6L12 3z" /><path d="m8.7 11.8 2.2 2.2 4.5-4.7" /></svg>
        <span>7 dias de garantia</span>
      </li>
    </ul>
  )
}
