'use client'

const ouro = 'var(--cv-gold)'
const ouroGrad = 'linear-gradient(135deg, var(--cv-gold), var(--cv-gold))'
const campo = {
  width: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', border: '1px solid var(--cv-border)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', marginTop: 5,
}
const rotulo = { display: 'block', fontSize: 13, color: 'var(--cv-text)' }
const dica = { display: 'block', color: 'var(--cv-muted)', fontSize: 11, marginTop: 5 }
const botaoSecundario = { background: 'var(--cv-field)', color: ouro, border: '1px solid var(--cv-border)', borderRadius: '7px', padding: '7px 10px', cursor: 'pointer', fontSize: 13 }

export const PRODUTO_VAZIO = { name: '', type: 'one_time', plan_id: '', brevo_list_id: '', botconversa_tag: '', active: true }
export const OFERTA_VAZIA = {
  name: '', price: '', payment_methods: ['pix', 'credit_card'], max_installments: 12, free_installments: 1,
  monthly_interest_pct: '2.99', pix_discount_pct: '0', billing_interval: 'month', billing_interval_count: 1,
  trial_days: 0, thank_you_url: '', active: true, bumps: [],
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

function totalParcelado(preco, parcelas, semJuros, jurosPct) {
  const i = Number(String(jurosPct || 0).replace(',', '.')) / 100
  if (parcelas <= semJuros || !i) return preco
  const f = Math.pow(1 + i, parcelas)
  return Math.ceil(preco * (i * f) / (f - 1)) * parcelas
}

export function FormProduto({ dados, planos, editando, onChange }) {
  const set = (campoNome, valor) => onChange({ ...dados, [campoNome]: valor })
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <label style={rotulo}>Nome do produto<input value={dados.name} onChange={e => set('name', e.target.value)} style={campo} placeholder="Ex.: EVS — Equipe que Vende Sozinha" /></label>
      <div>
        <span style={rotulo}>Tipo</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {[['one_time', 'Pagamento único'], ['subscription', 'Assinatura recorrente']].map(([valor, texto]) => (
            <button key={valor} type="button" disabled={editando} onClick={() => set('type', valor)} style={{ flex: 1, border: dados.type === valor ? `1px solid ${ouro}` : '1px solid var(--cv-border)', background: dados.type === valor ? 'var(--cv-selected)' : 'var(--cv-field)', color: 'var(--cv-text)', borderRadius: 10, padding: 11, cursor: editando ? 'not-allowed' : 'pointer' }}>{dados.type === valor ? '✓ ' : ''}{texto}</button>
          ))}
        </div>
        {editando && <small style={dica}>O tipo não pode ser alterado depois de criado.</small>}
      </div>
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
    </div>
  )
}

export function FormOferta({ dados, produto, ofertasBump, produtoDe, onChange, showBumps = true }) {
  const set = (campoNome, valor) => onChange({ ...dados, [campoNome]: valor })
  const assinatura = produto.type === 'subscription'
  const preco = paraCentavos(dados.price)
  const cartao = dados.payment_methods.includes('credit_card')
  const pix = dados.payment_methods.includes('pix')
  const max = Number(dados.max_installments) || 1
  const semJuros = Math.min(Number(dados.free_installments) || 1, max)

  function alternarMetodo(m) {
    const atual = dados.payment_methods
    set('payment_methods', atual.includes(m) ? atual.filter(x => x !== m) : [...atual, m])
  }

  function alternarBump(id) {
    const existe = dados.bumps.find(b => b.bump_offer_id === id)
    set('bumps', existe ? dados.bumps.filter(b => b.bump_offer_id !== id) : [...dados.bumps, { bump_offer_id: id, headline: 'Sim, quero adicionar!', description: '' }])
  }

  function editarBump(id, campoNome, valor) {
    set('bumps', dados.bumps.map(b => b.bump_offer_id === id ? { ...b, [campoNome]: valor } : b))
  }

  const simulacao = []
  if (preco > 0 && cartao && !assinatura) {
    for (const n of Array.from({ length: max }, (_, i) => i + 1)) {
      const total = totalParcelado(preco, n, semJuros, dados.monthly_interest_pct)
      simulacao.push({ n, parcela: Math.ceil(total / n), total })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <label style={rotulo}>Nome da oferta<input value={dados.name} onChange={e => set('name', e.target.value)} style={campo} placeholder="Ex.: Lançamento outubro" /></label>
        <label style={rotulo}>Link amigável<input value={dados.slug || ''} onChange={e => set('slug', e.target.value)} style={campo} placeholder="Gerado pelo nome ao salvar" /></label>
        <label style={rotulo}>Preço (R$){assinatura && ' por cobrança'}<input value={dados.price} onChange={e => set('price', e.target.value)} style={campo} placeholder="Ex.: 1.997,00" /></label>
      </div>

      {!assinatura ? (
        <div>
          <span style={rotulo}>Formas de pagamento</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {[['pix', 'Pix'], ['credit_card', 'Cartão de crédito']].map(([m, texto]) => (
              <button key={m} type="button" onClick={() => alternarMetodo(m)} style={{ flex: 1, border: dados.payment_methods.includes(m) ? `1px solid ${ouro}` : '1px solid var(--cv-border)', background: dados.payment_methods.includes(m) ? 'var(--cv-selected)' : 'var(--cv-field)', color: 'var(--cv-text)', borderRadius: 10, padding: 11, cursor: 'pointer' }}>{dados.payment_methods.includes(m) ? '✓ ' : ''}{texto}</button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--cv-field)', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 12, fontSize: 13, color: 'var(--cv-muted)' }}>
          Assinatura cobra automaticamente no <strong>cartão de crédito</strong>.
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 10 }}>
            <label style={rotulo}>Cobrar a cada<input type="number" min="1" max="12" value={dados.billing_interval_count} onChange={e => set('billing_interval_count', e.target.value)} style={campo} /></label>
            <label style={rotulo}>Período<select value={dados.billing_interval} onChange={e => set('billing_interval', e.target.value)} style={campo}><option value="month">mês(es)</option><option value="year">ano(s)</option></select></label>
            <label style={rotulo}>Dias grátis<input type="number" min="0" value={dados.trial_days} onChange={e => set('trial_days', e.target.value)} style={campo} /></label>
          </div>
        </div>
      )}

      {!assinatura && cartao && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <label style={rotulo}>Máximo de parcelas<select value={dados.max_installments} onChange={e => set('max_installments', Number(e.target.value))} style={campo}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}</select></label>
          <label style={rotulo}>Sem juros até<select value={semJuros} onChange={e => set('free_installments', Number(e.target.value))} style={campo}>{Array.from({ length: max }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'à vista' : `${n}x`}</option>)}</select></label>
          <label style={rotulo}>Juros ao mês (%)<input value={dados.monthly_interest_pct} disabled={semJuros >= max} onChange={e => set('monthly_interest_pct', e.target.value)} style={campo} /><small style={dica}>Repassado à cliente acima das parcelas sem juros.</small></label>
        </div>
      )}

      {!assinatura && pix && (
        <label style={rotulo}>Desconto no Pix (%)<input value={dados.pix_discount_pct} onChange={e => set('pix_discount_pct', e.target.value)} style={campo} />{preco > 0 && Number(String(dados.pix_discount_pct).replace(',', '.')) > 0 && <small style={dica}>No Pix sai por {moeda(Math.round(preco * (1 - Number(String(dados.pix_discount_pct).replace(',', '.')) / 100)))}</small>}</label>
      )}

      {simulacao.length > 0 && (
        <div style={{ background: 'var(--cv-field)', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>Como a cliente vai ver no checkout</p>
          {simulacao.map(s => <div key={s.n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--cv-text)', padding: '3px 0' }}><span>{s.n}x de {moeda(s.parcela)}{s.n <= semJuros ? ' sem juros' : ''}</span><span style={{ color: 'var(--cv-muted)' }}>total {moeda(s.total)}</span></div>)}
        </div>
      )}

      <label style={rotulo}>Página de obrigado (opcional)<input value={dados.thank_you_url} onChange={e => set('thank_you_url', e.target.value)} style={campo} placeholder="https://" /><small style={dica}>Se ficar vazio, a cliente vê a página de obrigado padrão do checkout.</small></label>

      {showBumps && !assinatura && (
        <section style={{ paddingTop: 14, borderTop: '1px solid var(--cv-border)' }}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14 }}>Order bumps</p>
          <p style={{ margin: '0 0 10px', color: 'var(--cv-muted)', fontSize: 12 }}>Ofertas que aparecem como caixinha de &quot;adicionar também&quot; neste checkout.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ofertasBump.map(o => {
              const ativo = dados.bumps.some(b => b.bump_offer_id === o.id)
              return <button key={o.id} type="button" onClick={() => alternarBump(o.id)} style={{ border: ativo ? `1px solid ${ouro}` : '1px solid var(--cv-border)', background: ativo ? 'var(--cv-selected)' : 'var(--cv-field)', color: 'var(--cv-text)', borderRadius: 999, padding: '8px 11px', cursor: 'pointer', fontSize: 13 }}>{ativo ? '✓ ' : ''}{produtoDe(o)} — {o.name} ({moeda(o.price_cents)})</button>
            })}
            {!ofertasBump.length && <span style={{ color: 'var(--cv-muted)', fontSize: 13 }}>Cadastre outras ofertas de pagamento único para usar como bump.</span>}
          </div>
          {dados.bumps.map(b => (
            <div key={b.bump_offer_id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 10, background: 'var(--cv-field)', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 10 }}>
              <label style={rotulo}>Chamada do bump<input value={b.headline} onChange={e => editarBump(b.bump_offer_id, 'headline', e.target.value)} style={campo} /></label>
              <label style={rotulo}>Descrição<input value={b.description} onChange={e => editarBump(b.bump_offer_id, 'description', e.target.value)} style={campo} placeholder="Opcional" /></label>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

