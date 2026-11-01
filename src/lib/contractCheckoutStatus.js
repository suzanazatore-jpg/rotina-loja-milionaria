// Dados mínimos para orientar a compradora; não expõe texto, CPF, OTP ou metadados internos.
export function contractCheckoutStatus(contract, policy, url) {
  const required = Boolean(contract || policy?.required)
  if (!contract) return { contract_required: required, contract: null, blocked: required && policy.gate_access !== false }
  const gated = contract.fields?._gate_access ?? contract.fulfillment_status !== 'not_gated'
  return { contract_required: true, blocked: contract.status === 'canceled' || gated && (contract.status !== 'signed' || contract.fulfillment_status !== 'completed'), contract: { status: contract.status, access_status: contract.fulfillment_status, signing_url: contract.status === 'canceled' ? null : url, has_pdf: Boolean(contract.signed_pdf_path) } }
}
