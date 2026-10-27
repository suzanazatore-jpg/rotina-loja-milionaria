'use client'
import styles from './ContractFields.module.css'
const TEMPLATES = [['cvm', 'CVM — Mentoria'], ['evs', 'EVS — Treinamento de Equipe'], ['trafego', 'Gestão de Tráfego Pago']]

export default function ContractOfferSettings({ value, onChange, offer, product }) {
  const contract = value?.contract || { required: false }
  const recurring = product?.type === 'subscription'
  const set = patch => onChange({ ...value, contract: { gate_access: true, term_months: recurring ? 1 : 3, template: 'cvm', platform_months: 12, ...contract, ...patch } })
  return <section className="central-chart-panel">
    <h2>Contrato</h2>
    <p className="central-data-note">Quando ativo, cada compra aprovada desta oferta gera o contrato com os dados do pedido (nome, CPF, endereço, valor pago, forma de pagamento e parcelas) e envia o link de assinatura por WhatsApp e e-mail.</p>
    <label className="central-active-switch"><input type="checkbox" checked={contract.required === true} onChange={e => e.target.checked ? set({ required: true }) : onChange({ ...value, contract: { required: false } })} />Exige contrato</label>
    {contract.required && <div className="central-offer-grid">
      <div className={styles.fields}>
        <label>Modelo de contrato<select value={contract.template || 'cvm'} onChange={e => set({ template: e.target.value })}>{TEMPLATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>{recurring ? 'Período de cada ciclo (meses)' : 'Prazo do contrato (meses)'}<input type="number" min={1} max={60} value={contract.term_months ?? ''} onChange={e => set({ term_months: Number(e.target.value) })} /></label>
        {contract.template === 'cvm' && <label>Acesso à plataforma (meses)<input type="number" min={1} max={120} value={contract.platform_months ?? 12} onChange={e => set({ platform_months: Number(e.target.value) })} /></label>}
        <label>Nome do programa no contrato<input value={contract.program_name || ''} placeholder={offer?.name || 'Usa o nome da oferta'} onChange={e => set({ program_name: e.target.value })} /></label>
        <label className="central-active-switch"><input type="checkbox" checked={contract.gate_access !== false} onChange={e => set({ gate_access: e.target.checked })} />Liberar acesso só depois da assinatura</label>
      </div>
      <aside className="central-offer-summary">
        <h3>Como vai sair no contrato</h3>
        <dl>
          <dt>Programa</dt><dd>{contract.program_name || offer?.name || '—'}</dd>
          <dt>Prazo</dt><dd>{contract.term_months || '—'} {Number(contract.term_months) === 1 ? 'mês' : 'meses'}{recurring ? ', com renovação automática' : ''}</dd>
          <dt>Valor</dt><dd>Valor efetivamente pago no pedido</dd>
        </dl>
        {recurring && <p className="central-data-note">Assinaturas: o contrato é assinado só na primeira compra; as renovações não geram contrato novo.</p>}
      </aside>
    </div>}
  </section>
}
