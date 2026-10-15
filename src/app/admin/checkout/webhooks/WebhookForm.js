'use client'
import { useEffect, useRef, useState } from 'react'
import { WEBHOOK_EVENTS } from '@/lib/checkoutWebhookSettings'
export const newWebhook = () => ({ name: '', url: '', events: ['order.paid'], product_ids: null, active: false })
export function Switch({ checked, disabled, label, onChange }) {
  return <button type="button" className="webhook-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
}
export function WebhookForm({ value, products, busy, onChange, onSubmit, onCancel, dates }) {
  const set = (key, next) => onChange({ ...value, [key]: next })
  const options = [...Object.entries(WEBHOOK_EVENTS), ...value.events.filter(event => !Object.hasOwn(WEBHOOK_EVENTS, event)).map(event => [event, event])]
  return <form className="webhook-form" onSubmit={event => { event.preventDefault(); onSubmit() }}>
    <fieldset disabled={busy} className="webhook-form-fields">
      <label className="webhook-field">Nome *<input required maxLength={120} value={value.name} onChange={event => set('name', event.target.value)} /></label>
      <label className="webhook-field">URL *<input type="url" required maxLength={2048} value={value.url} onChange={event => set('url', event.target.value)} placeholder="https://" /></label>
      <fieldset className="webhook-status-field"><legend>Status</legend><details className="webhook-picker"><summary>{value.events.length ? value.events.map(event => WEBHOOK_EVENTS[event] || event).join(', ') : 'Selecione os status'}</summary><div>{options.map(([key, label]) => <label key={key}><input type="checkbox" checked={value.events.includes(key)} onChange={event => set('events', event.target.checked ? [...value.events, key] : value.events.filter(item => item !== key))} />{label}</label>)}</div></details></fieldset>
      <fieldset className="webhook-product-filter"><legend>Filtrar por</legend><div className="webhook-radio-row"><label><input type="radio" name={`filter-${value.id || 'new'}`} checked={value.product_ids === null} onChange={() => set('product_ids', null)} />Todos</label><label><input type="radio" name={`filter-${value.id || 'new'}`} checked={value.product_ids !== null} onChange={() => set('product_ids', [])} />Produtos</label></div>
        {value.product_ids !== null && <><span className="webhook-field">Produtos</span><details className="webhook-picker"><summary>{value.product_ids.length ? value.product_ids.map(id => products.find(item => item.id === id)?.name || 'Produto indisponível').join(', ') : 'Selecione os produtos'}</summary><div>{products.map(product => <label key={product.id}><input type="checkbox" checked={value.product_ids.includes(product.id)} onChange={event => set('product_ids', event.target.checked ? [...value.product_ids, product.id] : value.product_ids.filter(id => id !== product.id))} />{product.name}{product.code ? ` (${product.code})` : ''}</label>)}{!products.length && <p>Cadastre os produtos em Produtos e Ofertas.</p>}</div></details></>}
      </fieldset>
      <div className="webhook-active"><Switch checked={value.active} disabled={busy} label="Webhook ativo" onChange={next => set('active', next)} /><span>Ativo</span></div>
      {dates && <div className="webhook-dates"><div><span>Criado em</span><p>{dates.created}</p></div><div><span>Atualizado em</span><p>{dates.updated}</p></div></div>}
    </fieldset>
    <div className="webhook-form-footer"><button type="button" className="central-action" disabled={busy} onClick={onCancel}>{dates ? 'Voltar' : 'Cancelar'}</button><button type="submit" className="central-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
  </form>
}
export function CreateDialog({ products, busy, error, onClose, onSave }) {
  const ref = useRef(null)
  const [draft, setDraft] = useState(newWebhook)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="webhook-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="new-webhook-title">
    <div className="webhook-dialog-heading"><h2 id="new-webhook-title">Adicionar Webhook</h2><button type="button" disabled={busy} aria-label="Fechar cadastro" onClick={onClose}>×</button></div>
    <div className="webhook-dialog-body">{error && <p className="central-editor-message" role="alert">{error}</p>}<WebhookForm value={draft} products={products} busy={busy} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onClose} /></div>
  </dialog>
}
