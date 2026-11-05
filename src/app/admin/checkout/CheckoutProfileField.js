import { effectiveFormProfile } from '@/lib/checkoutSettings'

export default function CheckoutProfileField({value, onChange}) {
  const profile = effectiveFormProfile(value)
  function select(next) {
    onChange({
      ...value,
      form_profile: next,
      ...(next === 'compact' ? {contract: {required: false}, document_type: 'cpf', confirm_email: false} : {}),
    })
  }
  return <div>
    <label>Tipo de checkout
      <select value={profile} onChange={event=>select(event.target.value)}>
        <option value="complete">Completo · dados fiscais e contrato</option>
        <option value="compact">Low Ticket · sem endereço</option>
      </select>
    </label>
    <p className="central-data-note">{profile === 'compact'
      ? 'Nome, e-mail, celular e CPF. Cartão e Pix sem endereço, contrato ou cadastro para nota fiscal.'
      : 'Coleta identificação e endereço para a nota fiscal. Para exigir assinatura, escolha o modelo na aba Contrato.'}</p>
  </div>
}
