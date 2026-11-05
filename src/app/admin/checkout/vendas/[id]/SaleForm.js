'use client'
import { useState } from 'react'
import { api, Modal } from './SaleUI'
import { money } from '../../CentralUI'
export const addressFields = [
  ['country', 'País'],
  ['street', 'Rua'],
  ['number', 'Número'],
  ['line_2', 'Complemento'],
  ['district', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'Estado'],
  ['zip_code', 'CEP'],
]
const buyerFields = [
  ['name', 'Nome'],
  ['email', 'Email', 'email'],
  ['document', 'Documento'],
  ['phone', 'Celular'],
  ['company', 'Nome da Empresa'],
]
const invoiceFields = [
  ['number', 'ID'],
  ['key', 'Chave'],
  ['issued', 'Data de emissão', 'date'],
  ['xml', 'URL XML', 'url'],
  ['pdf', 'URL PDF', 'url'],
]
export const actionTitles = {
  buyer: 'Editar Comprador',
  refund: 'Reembolsar',
  chargeback: 'Marcar como Chargeback',
  invoice: 'Informar Nota Fiscal',
}
export default function SaleForm({ action, buyer, invoice, record, endpoint, close, saved }) {
  const address = buyer.billing_address || {}
  const [data, setData] = useState(
    action === 'buyer'
      ? { ...buyer, ...address, street: address.street || address.line_1 || '' }
      : action === 'invoice'
        ? { ...invoice }
        : {},
  )
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const financial = ['refund', 'chargeback'].includes(action)
  function input([key, label, type = 'text']) {
    return (
      <label key={key}>
        {label}
        <input
          type={type}
          required={
            ['name', 'email', 'issued', 'number'].includes(key) &&
            !(key === 'number' && action === 'buyer')
          }
          value={data[key] || ''}
          onChange={(e) => setData({ ...data, [key]: e.target.value })}
        />
      </label>
    )
  }
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload =
        action === 'buyer'
          ? {
              ...data,
              billing_address: Object.fromEntries(addressFields.map(([k]) => [k, data[k] || ''])),
            }
          : data
      const r = await api(endpoint, { ...payload, action, requestId: crypto.randomUUID() })
      saved(r.message)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={actionTitles[action]} close={close} busy={busy}>
      <form onSubmit={submit}>
        <div className="sv-dialog-body sv-form">
          {action === 'buyer' && (
            <>
              {buyerFields.map(input)}
              <h3>Endereço</h3>
              {addressFields.map(input)}
            </>
          )}
          {action === 'invoice' && invoiceFields.map(input)}
          {financial && (
            <>
              <label>
                Motivo
                <textarea
                  required
                  maxLength={1000}
                  value={data.reason || ''}
                  onChange={(e) => setData({ ...data, reason: e.target.value })}
                />
              </label>
              <label className="sv-check">
                <input
                  type="checkbox"
                  required
                  checked={!!data.confirm}
                  onChange={(e) => setData({ ...data, confirm: e.target.checked })}
                />{' '}
                {action === 'refund'
                  ? 'Confirmo o reembolso integral de ' + money(record.total_cents) + '.'
                  : 'Conferir e registrar o chargeback confirmado pelo provedor.'}
              </label>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <footer>
          <button type="button" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button className="sv-primary" disabled={busy}>
            {busy ? 'Processando…' : 'Enviar'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
