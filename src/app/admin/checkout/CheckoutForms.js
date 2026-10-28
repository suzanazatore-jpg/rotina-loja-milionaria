'use client'
import {useEffect,useRef,useState} from 'react'
import { totalParcelado } from '@/lib/checkoutPricing'

const ouro = 'var(--cv-gold)'
const ouroGrad = 'linear-gradient(135deg, var(--cv-gold), var(--cv-gold))'
const campo = {
  width: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', border: '1px solid var(--cv-border)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', marginTop: 5,
}
const rotulo = { display: 'block', fontSize: 13, color: 'var(--cv-text)' }
const dica = { display: 'block', color: 'var(--cv-muted)', fontSize: 11, marginTop: 5 }
const botaoSecundario = { background: 'var(--cv-field)', color: ouro, border: '1px solid var(--cv-border)', borderRadius: '7px', padding: '7px 10px', cursor: 'pointer', fontSize: 13 }

export const PRODUTO_VAZIO = { name: '', type: 'one_time', marketplace_id:'pagarme', plan_id: '', brevo_list_id: '', botconversa_tag: '', active: true }
export const OFERTA_VAZIA = {
  name: '', price: '', payment_methods: ['pix', 'credit_card'], max_installments: 12, free_installments: 1,
  monthly_interest_pct: '2.99', pix_discount_pct: '0', billing_interval: 'month', billing_interval_count: 1,
  interest_model: 'price', default_installments: 1, billing_cycles: 0, trial_days: 0, thank_you_url: '', active: true, bumps: [],
}

function moeda(centavos) {
  return ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function paraCentavos(valor) {
  const texto = String(valor || '').trim().replace(/[R$\s]/g, '')
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const numero = Number(normal)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}


export function FormProduto({ dados, planos, editando, onChange, marketplaces=[{id:'pagarme',name:'Pagar.me',active:true}] }) {
  const set = (campoNome, valor) => onChange({ ...dados, [campoNome]: valor })
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <label style={rotulo}>Código do produto<input inputMode="numeric" pattern="[0-9]{10}" value={dados.code || ''} onChange={e => set('code', e.target.value)} style={campo} placeholder="Gerado automaticamente" /><small style={dica}>Para um produto vindo do Guru, informe o mesmo código de 10 dígitos.</small></label>
      <label style={rotulo}>Nome *<input required value={dados.name} onChange={e => set('name', e.target.value)} style={campo} placeholder="Ex.: EVS — Equipe que Vende Sozinha" /></label>
      <label style={rotulo}>Marketplace *<select required value={dados.marketplace_id || 'pagarme'} onChange={e=>set('marketplace_id',e.target.value)} style={campo}>{marketplaces.filter(m=>m.active || m.id===dados.marketplace_id).map(m=><option key={m.id} value={m.id} disabled={!m.active}>{m.name}{!m.active?' (indisponível)':''}</option>)}</select></label>
      <label style={rotulo}>Tipo *<select value={dados.type} disabled={editando} onChange={e=>set('type',e.target.value)} style={campo}><option value="one_time">Produto — pagamento único</option><option value="subscription">Assinatura</option></select></label>
      <label style={rotulo}>Produtor<input readOnly value="Suzana Zatorre Educacional" style={campo}/></label>
      <details><summary style={{...rotulo,cursor:'pointer',padding:'8px 0'}}>Entrega e integrações (opcional)</summary><div style={{display:'grid',gap:14,paddingTop:12}}>
      <label style={rotulo}>Plano da Rotina liberado na compra
        <select value={dados.plan_id} onChange={e => set('plan_id', e.target.value)} style={campo}>
          <option value="">Nenhum (produto não libera acesso no app)</option>
          {planos.map(p => <option key={p.id} value={p.id}>{p.commercial_name || p.name}{p.period_days ? ` · ${p.period_days} dias` : ''}</option>)}
        </select>
        <small style={dica}>Cursos, conteúdos e prazo de acesso seguem a configuração deste plano no app.</small>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <label style={rotulo}>Lista do Brevo (ID)<input type="number" value={dados.brevo_list_id} onChange={e => set('brevo_list_id', e.target.value)} style={campo} placeholder="Opcional" /></label>
        <label style={rotulo}>Tag no BotConversa<input value={dados.botconversa_tag} onChange={e => set('botconversa_tag', e.target.value)} style={campo} placeholder="Opcional" /></label>
      </div>
      </div></details>
    </div>
  )
}

function InstallmentDialog({rows,onClose}){const ref=useRef(null);useEffect(()=>{ref.current.showModal()},[]);return <dialog className="cv-installment-dialog" ref={ref} onCancel={e=>{e.preventDefault();onClose()}} aria-labelledby="installment-title"><header><h2 id="installment-title">Parcelamento</h2><button type="button" className="central-action" onClick={onClose}>× Fechar</button></header><div className="cv-installment-body"><table><thead><tr><th>Parcelas</th><th>Valor total</th></tr></thead><tbody>{rows.map(s=><tr key={s.n}><td>{s.n} × {moeda(s.parcela)}{s.interest?' *':''}</td><td>{moeda(s.total)}</td></tr>)}</tbody></table><p>* Parcelas com juros. A simulação segue os valores e a taxa desta oferta.</p></div><footer><button type="button" className="central-primary" onClick={onClose}>Fechar</button></footer></dialog>}
export function FormOferta({dados,produto,onChange}){
 const [simulation,setSimulation]=useState(false)
 const set=(key,value)=>onChange({...dados,[key]:value}),assinatura=produto.type==='subscription',preco=paraCentavos(dados.price),cartao=dados.payment_methods.includes('credit_card'),pix=dados.payment_methods.includes('pix'),max=Number(dados.max_installments)||1,semJuros=Math.min(Number(dados.free_installments)||1,max)
 const rows=Array.from({length:Math.min(18,max)},(_,i)=>{const n=i+1,total=totalParcelado(preco,n,semJuros,dados.monthly_interest_pct,dados.interest_model);return {n,total,parcela:Math.round(total/n),interest:total>preco}})
 function method(key){set('payment_methods',dados.payment_methods.includes(key)?dados.payment_methods.filter(m=>m!==key):[...dados.payment_methods,key])}
 return <div className="cv-offer-fields"><div className="cv-offer-field-grid"><label className="cv-wide">Nome *<input required value={dados.name} onChange={e=>set('name',e.target.value)}/></label><label className="cv-wide">URL amigável<input value={dados.slug || ''} onChange={e=>set('slug',e.target.value)}/></label><label>Tipo de documento<select value={dados.checkout_config?.document_type || 'cpf_cnpj'} onChange={e=>set('checkout_config',{...dados.checkout_config,document_type:e.target.value})}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="cpf_cnpj">CPF / CNPJ</option></select></label><div><span className="cv-offer-label">Formas de pagamento *</span><details className="cv-method-select"><summary>{dados.payment_methods.length} opção(ões) selecionada(s) <span>⌄</span></summary><div>{[['credit_card','Cartão de crédito'],['pix','Pix']].map(([key,label])=><label key={key}><input type="checkbox" disabled={assinatura} checked={dados.payment_methods.includes(key)} onChange={()=>method(key)}/>{label}</label>)}<label><input type="checkbox" disabled/>Boleto bancário <small>Em breve</small></label></div></details></div><label>Valor (R$) *{assinatura&&' por cobrança'}<input required inputMode="decimal" value={dados.price} onChange={e=>set('price',e.target.value)}/></label><label>Quantidade de itens<input value="1" readOnly/></label></div>
 {assinatura&&<section><h3>Recorrência</h3><p>Renovação automática no cartão de crédito.</p><div className="cv-offer-field-grid"><label>Cobrar a cada<input type="number" min="1" max="365" value={dados.billing_interval_count} onChange={e=>set('billing_interval_count',e.target.value)}/></label><label>Período<select value={dados.billing_interval} onChange={e=>set('billing_interval',e.target.value)}>{[['day','Dia(s)'],['week','Semana(s)'],['month','Mês(es)'],['year','Ano(s)']].map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label>Máximo de cobranças<input type="number" min="0" max="999" value={dados.billing_cycles || 0} onChange={e=>set('billing_cycles',e.target.value)}/><small>0 = até cancelar.</small></label><label>Dias de teste<input type="number" min="0" value={dados.trial_days} onChange={e=>set('trial_days',e.target.value)}/></label></div></section>}
 {!assinatura&&pix&&<section><h3>Desconto no pagamento à vista</h3><details className="cv-discount"><summary>Configurar desconto no Pix {Number(dados.pix_discount_pct)>0?`· ${dados.pix_discount_pct}%`:''}</summary><label>Desconto no Pix (%)<input inputMode="decimal" value={dados.pix_discount_pct} onChange={e=>set('pix_discount_pct',e.target.value)}/></label></details></section>}
 {!assinatura&&cartao&&<><section><h3>Parcelamento</h3><div className="cv-offer-field-grid"><label>Parcelamento máximo sem juros<select value={semJuros} onChange={e=>set('free_installments',Number(e.target.value))}>{Array.from({length:max},(_,i)=>i+1).map(n=><option value={n} key={n}>{n}</option>)}</select></label><label>Parcelamento máximo com juros<select value={max} onChange={e=>onChange({...dados,max_installments:Number(e.target.value),free_installments:Math.min(semJuros,Number(e.target.value)),default_installments:Math.min(Number(dados.default_installments)||1,Number(e.target.value))})}>{Array.from({length:18},(_,i)=>i+1).map(n=><option value={n} key={n}>{n}</option>)}</select></label><label>Parcela selecionada<select value={Math.min(Number(dados.default_installments)||1,max)} onChange={e=>set('default_installments',Number(e.target.value))}>{Array.from({length:max},(_,i)=>i+1).map(n=><option value={n} key={n}>{n}</option>)}</select></label></div></section><section><h3>Taxa de juros</h3><div className="cv-offer-field-grid"><label>Cálculo dos juros<select value={dados.interest_model || 'price'} onChange={e=>set('interest_model',e.target.value)}><option value="simple">Taxa única — modelo Guru</option><option value="price">Tabela Price</option></select></label><label>Taxa de juros (%)<input inputMode="decimal" value={dados.monthly_interest_pct} onChange={e=>set('monthly_interest_pct',e.target.value)}/></label></div><button type="button" className="central-action" onClick={()=>setSimulation(true)}>Ver parcelamento</button></section></>}
 {simulation&&<InstallmentDialog rows={rows} onClose={()=>setSimulation(false)}/>}
 </div>
}
