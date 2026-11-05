import { effectiveFormProfile } from '@/lib/checkoutSettings'

export default function CheckoutProfileField({value, onChange}) {
  const profile = effectiveFormProfile(value)
  function select(next) {
    onChange({
      ...value,
      form_profile: next,
      ...(next === 'compact' ? {contract: {required: false}} : {}),
    })
  }
  return <div>
    <label>Tipo de checkout
      <select value={profile} onChange={event=>select(event.target.value)}>
        <option value="complete">Completo · dados fiscais e contrato</option>
        <option value="compact">Simplificado · compra rápida</option>
      </select>
    </label>
    <p className="central-data-note">{profile === 'compact'
      ? 'Pede os dados básicos da cliente. No cartão, inclui o endereço de cobrança. Esta oferta fica sem contrato e sem cadastro para nota fiscal.'
      : 'Coleta identificação e endereço para a nota fiscal. Para exigir assinatura, escolha o modelo na aba Contrato.'}</p>
  </div>
}
