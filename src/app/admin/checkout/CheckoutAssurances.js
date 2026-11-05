import styles from './CheckoutAssurances.module.css'

export default function CheckoutAssurances({config}) {
  const afterSignature = config.contract?.required && config.contract.gate_access !== false
  const access = afterSignature ? 'Acesso após assinatura' : 'Acesso imediato'
  const detail = afterSignature ? 'Confirme o pagamento e assine o contrato.' : 'Após a confirmação do pagamento.'

  return (
    <ul className={styles.list} aria-label="Acesso e garantia">
      <li title={detail}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{afterSignature
            ? <><path d="m5 14 10-10a2.1 2.1 0 0 1 3 3L8 17l-4 1 1-4z" /><path d="m13 6 3 3M4 21h16" /></>
            : <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7z" />}</svg>
        <span>{access}</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.2 3.1 7.5 7.5 9.5 4.4-2 7.5-5.3 7.5-9.5V6L12 3z" /><path d="m8.7 11.8 2.2 2.2 4.5-4.7" /></svg>
        <span>7 dias de garantia</span>
      </li>
    </ul>
  )
}
