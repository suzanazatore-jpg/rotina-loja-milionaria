'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = 'var(--cv-gold)'
const ouroGrad = 'linear-gradient(135deg, var(--cv-gold), var(--cv-gold))'
const campo = {
  width: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', border: '1px solid var(--cv-border)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', marginTop: 5,
}
const rotulo = { display: 'block', fontSize: 13, color: 'var(--cv-text)' }
const dica = { display: 'block', color: 'var(--cv-muted)', fontSize: 11, marginTop: 5 }
const botaoSecundario = { background: 'var(--cv-field)', color: ouro, border: '1px solid var(--cv-border)', borderRadius: '7px', padding: '7px 10px', cursor: 'pointer', fontSize: 13 }

const PRODUTO_VAZIO = { name: '', type: 'one_time', plan_id: '', access_days: '', brevo_list_id: '', botconversa_tag: '', active: true }
const OFERTA_VAZIA = {
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

export default function AdminCheckout() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [produtos, setProdutos] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [bumps, setBumps] = useState([])
  const [planos, setPlanos] = useState([])
  const [mensagem, setMensagem] = useState('')
  const [formProduto, setFormProduto] = useState(null) // { id?, dados }
  const [formOferta, setFormOferta] = useState(null)   // { id?, dados }
  const [salvando, setSalvando] = useState(false)

  const api = useCallback(async (metodo, corpo, tk = token) => {
    const resposta = await fetch('/api/admin/checkout', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const json = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(json.error || 'Erro inesperado.')
    return json
  }, [token])

  const carregar = useCallback(async (tk) => {
    try {
      const dados = await api('GET', null, tk)
      setProdutos(dados.produtos || []); setOfertas(dados.ofertas || [])
      setBumps(dados.bumps || []); setPlanos(dados.planos || [])
    } catch (e) { setMensagem(e.message) }
  }, [api])

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token)
      await carregar(session.access_token)
      setCarregando(false)
    }
    iniciar()
  }, [router, carregar])

  const nomePlano = useMemo(() => Object.fromEntries(planos.map(p => [p.id, p.commercial_name || p.name])), [planos])
  const ofertaPorId = useMemo(() => Object.fromEntries(ofertas.map(o => [o.id, o])), [ofertas])

  async function salvarProduto(e) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    try {
      await api('POST', { entidade: 'produto', id: formProduto.id, dados: formProduto.dados })
      setFormProduto(null); await carregar(); setMensagem('✓ Produto salvo.')
    } catch (err) { setMensagem(err.message) }
    setSalvando(false)
  }

  async function salvarOferta(e) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    try {
      await api('POST', { entidade: 'oferta', id: formOferta.id, dados: formOferta.dados })
      setFormOferta(null); await carregar(); setMensagem('✓ Oferta salva.')
    } catch (err) { setMensagem(err.message) }
    setSalvando(false)
  }

  async function alternar(entidade, item) {
    try {
      await api('PATCH', { entidade, id: item.id, active: !item.active })
      await carregar()
    } catch (err) { setMensagem(err.message) }
  }

  function editarProduto(p) {
    setMensagem('')
    setFormProduto({ id: p.id, dados: { ...PRODUTO_VAZIO, ...p, plan_id: p.plan_id || '', access_days: p.access_days ?? '', brevo_list_id: p.brevo_list_id ?? '', botconversa_tag: p.botconversa_tag || '' } })
  }

  function novaOferta(produto) {
    setMensagem('')
    const base = produto.type === 'subscription'
      ? { ...OFERTA_VAZIA, payment_methods: ['credit_card'], max_installments: 1, free_installments: 1, monthly_interest_pct: '0' }
      : OFERTA_VAZIA
    setFormOferta({ produto, dados: { ...base, product_id: produto.id } })
  }

  function editarOferta(produto, o) {
    setMensagem('')
    setFormOferta({
      id: o.id, produto,
      dados: {
        ...OFERTA_VAZIA, ...o, price: (o.price_cents / 100).toFixed(2).replace('.', ','),
        thank_you_url: o.thank_you_url || '',
        bumps: bumps.filter(b => b.offer_id === o.id).map(b => ({ bump_offer_id: b.bump_offer_id, headline: b.headline, description: b.description || '' })),
      },
    })
  }

  function linkCheckout(o) {
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/checkout/${o.slug}`
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return (
    <div style={{ minHeight: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
  <main style={{ width: '100%', margin: 0, padding: '26px 18px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>CHECKOUT</p>
            <h1 style={{ fontSize: '24px', margin: '5px 0' }}>Produtos e Ofertas</h1>
            <p style={{ color: 'var(--cv-muted)', margin: 0 }}>O produto é o que a aluna recebe. A oferta é como ele é vendido: preço, parcelas e link do checkout.</p>
          </div>
          <button onClick={() => { setMensagem(''); setFormProduto({ dados: { ...PRODUTO_VAZIO } }) }} style={{ background: 'var(--cv-gold)', color: 'var(--cv-on-gold)', border: 0, borderRadius: '999px', padding: '11px 18px', fontWeight: 900, cursor: 'pointer' }}>＋ Cadastrar produto</button>
        </div>

        {mensagem && <div style={{ background: 'var(--cv-selected)', border: '1px solid #5b4c17', color: 'var(--cv-gold)', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

        {!produtos.length && <div style={{ background: 'var(--cv-panel)', border: '1px dashed var(--cv-border)', borderRadius: 14, padding: 30, textAlign: 'center', color: 'var(--cv-muted)' }}>Nenhum produto ainda. Comece cadastrando o primeiro.</div>}

        {produtos.map(p => {
          const lista = ofertas.filter(o => o.product_id === p.id)
          return (
            <section key={p.id} style={{ background: 'var(--cv-panel)', border: '1px solid var(--cv-border)', borderRadius: 14, marginBottom: 16, opacity: p.active ? 1 : 0.55 }}>
              <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--cv-border)' }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{p.name}</strong>
                  {!p.active && <span style={{ marginLeft: 8, color: 'var(--cv-danger)', fontSize: 12 }}>inativo</span>}
                  <p style={{ color: 'var(--cv-muted)', fontSize: 12, margin: '5px 0 0' }}>
                    {p.type === 'subscription' ? 'Assinatura' : 'Pagamento único'} · Plano liberado: <span style={{ color: p.plan_id ? ouro : 'var(--cv-danger)' }}>{p.plan_id ? nomePlano[p.plan_id] || 'plano removido' : 'nenhum (não libera acesso)'}</span>
                    {p.access_days ? ` · ${p.access_days} dias` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => novaOferta(p)} style={botaoSecundario}>＋ Oferta</button>
                  <button onClick={() => editarProduto(p)} style={botaoSecundario}>Editar</button>
                  <button onClick={() => alternar('produto', p)} style={{ ...botaoSecundario, color: p.active ? 'var(--cv-danger)' : 'var(--cv-success)' }}>{p.active ? 'Desativar' : 'Ativar'}</button>
                </div>
              </div>
              {lista.map(o => {
                const bumpsOferta = bumps.filter(b => b.offer_id === o.id)
                const total = totalParcelado(o.price_cents, o.max_installments, o.free_installments, o.monthly_interest_pct)
                return (
                  <div key={o.id} style={{ padding: '13px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--cv-border)', opacity: o.active ? 1 : 0.5 }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700 }}>{o.name}</span> <span style={{ color: ouro, fontWeight: 800 }}>{moeda(o.price_cents)}</span>
                      {!o.active && <span style={{ marginLeft: 8, color: 'var(--cv-danger)', fontSize: 12 }}>inativa</span>}
                      <p style={{ color: 'var(--cv-muted)', fontSize: 12, margin: '4px 0 0' }}>
                        {o.payment_methods.map(m => m === 'pix' ? 'Pix' : 'Cartão').join(' + ')}
                        {o.max_installments > 1 && ` · até ${o.max_installments}x de ${moeda(Math.ceil(total / o.max_installments))}`}
                        {o.free_installments > 1 && ` · ${o.free_installments}x sem juros`}
                        {Number(o.pix_discount_pct) > 0 && ` · ${o.pix_discount_pct}% off no Pix`}
                        {o.billing_interval && ` · cobra a cada ${o.billing_interval_count} ${o.billing_interval === 'month' ? 'mês(es)' : 'ano(s)'}`}
                        {bumpsOferta.length > 0 && ` · ${bumpsOferta.length} order bump${bumpsOferta.length > 1 ? 's' : ''}`}
                      </p>
                      <p style={{ color: 'var(--cv-muted)', fontSize: 11, margin: '4px 0 0', wordBreak: 'break-all' }}>{linkCheckout(o)}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => navigator.clipboard?.writeText(linkCheckout(o)).then(() => setMensagem('✓ Link copiado.'))} style={botaoSecundario}>Copiar link</button>
                      <button onClick={() => editarOferta(p, o)} style={botaoSecundario}>Editar</button>
                      <button onClick={() => alternar('oferta', o)} style={{ ...botaoSecundario, color: o.active ? 'var(--cv-danger)' : 'var(--cv-success)' }}>{o.active ? 'Desativar' : 'Ativar'}</button>
                    </div>
                  </div>
                )
              })}
              {!lista.length && <p style={{ color: 'var(--cv-muted)', fontSize: 13, padding: '12px 16px', margin: 0 }}>Sem ofertas. Clique em ＋ Oferta para definir preço e link de venda.</p>}
            </section>
          )
        })}
      </main>

      {formProduto && (
        <Modal titulo={formProduto.id ? 'Editar produto' : 'Cadastrar produto'} sub="O que a aluna recebe ao comprar." onFechar={() => !salvando && setFormProduto(null)} onSalvar={salvarProduto} salvando={salvando} textoBotao="Salvar produto">
          <FormProduto dados={formProduto.dados} planos={planos} editando={!!formProduto.id} onChange={dados => setFormProduto(f => ({ ...f, dados }))} />
        </Modal>
      )}

      {formOferta && (
        <Modal titulo={formOferta.id ? 'Editar oferta' : 'Nova oferta'} sub={`Produto: ${formOferta.produto.name}`} onFechar={() => !salvando && setFormOferta(null)} onSalvar={salvarOferta} salvando={salvando} textoBotao="Salvar oferta">
          <FormOferta
            dados={formOferta.dados}
            produto={formOferta.produto}
            ofertaId={formOferta.id}
            ofertasBump={ofertas.filter(o => o.id !== formOferta.id && o.active && produtos.find(p => p.id === o.product_id)?.type === 'one_time')}
            produtoDe={o => produtos.find(p => p.id === o.product_id)?.name || ''}
            ofertaPorId={ofertaPorId}
            onChange={dados => setFormOferta(f => ({ ...f, dados }))}
          />
        </Modal>
      )}
    </div>
  )
}

function FormProduto({ dados, planos, editando, onChange }) {
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
        <small style={dica}>É o mesmo plano usado hoje pelo Guru: cursos, mentorias e conteúdos vêm dele.</small>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <label style={rotulo}>Prazo de acesso (dias)<input type="number" min="1" value={dados.access_days} onChange={e => set('access_days', e.target.value)} style={campo} placeholder="Usar o do plano" /></label>
        <label style={rotulo}>Lista do Brevo (ID)<input type="number" value={dados.brevo_list_id} onChange={e => set('brevo_list_id', e.target.value)} style={campo} placeholder="Opcional" /></label>
        <label style={rotulo}>Tag no BotConversa<input value={dados.botconversa_tag} onChange={e => set('botconversa_tag', e.target.value)} style={campo} placeholder="Opcional" /></label>
      </div>
    </div>
  )
}

function FormOferta({ dados, produto, ofertasBump, produtoDe, onChange }) {
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
    for (const n of [1, 2, 3, 6, 10, 12].filter(n => n <= max)) {
      const total = totalParcelado(preco, n, semJuros, dados.monthly_interest_pct)
      simulacao.push({ n, parcela: Math.ceil(total / n), total })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <label style={rotulo}>Nome da oferta<input value={dados.name} onChange={e => set('name', e.target.value)} style={campo} placeholder="Ex.: Lançamento outubro" /></label>
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
        <div style={{ background: '#151315', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 12, fontSize: 13, color: '#bbb' }}>
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
        <div style={{ background: '#151315', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>Como a cliente vai ver no checkout</p>
          {simulacao.map(s => <div key={s.n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#ccc', padding: '3px 0' }}><span>{s.n}x de {moeda(s.parcela)}{s.n <= semJuros ? ' sem juros' : ''}</span><span style={{ color: 'var(--cv-muted)' }}>total {moeda(s.total)}</span></div>)}
        </div>
      )}

      <label style={rotulo}>Página de obrigado (opcional)<input value={dados.thank_you_url} onChange={e => set('thank_you_url', e.target.value)} style={campo} placeholder="https://" /><small style={dica}>Se ficar vazio, a cliente vê a página de obrigado padrão do checkout.</small></label>

      {!assinatura && (
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
            <div key={b.bump_offer_id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 10, background: '#151315', border: '1px solid var(--cv-border)', borderRadius: 10, padding: 10 }}>
              <label style={rotulo}>Chamada do bump<input value={b.headline} onChange={e => editarBump(b.bump_offer_id, 'headline', e.target.value)} style={campo} /></label>
              <label style={rotulo}>Descrição<input value={b.description} onChange={e => editarBump(b.bump_offer_id, 'description', e.target.value)} style={campo} placeholder="Opcional" /></label>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function Modal({ titulo, sub, onFechar, onSalvar, salvando, textoBotao, children }) {
  return (
    <div onMouseDown={e => e.target === e.currentTarget && onFechar()} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <form onSubmit={onSalvar} style={{ width: 'min(760px,100%)', maxHeight: '92vh', overflowY: 'auto', background: '#141214', border: '1px solid #373238', borderRadius: 18, boxShadow: '0 28px 90px #000', color: 'var(--cv-text)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '18px 20px', background: 'var(--cv-panel)', borderBottom: '1px solid var(--cv-border)' }}>
          <div><h2 style={{ fontSize: 18, margin: 0 }}>{titulo}</h2><p style={{ color: 'var(--cv-muted)', fontSize: 12, margin: '4px 0 0' }}>{sub}</p></div>
          <button type="button" onClick={onFechar} disabled={salvando} aria-label="Fechar" style={{ width: 34, height: 34, background: '#242024', color: 'var(--cv-muted)', border: '1px solid #3c373c', borderRadius: 9, fontSize: 20, cursor: 'pointer' }}>×</button>
        </header>
        <div style={{ padding: 20 }}>{children}</div>
        <footer style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', background: 'var(--cv-panel)', borderTop: '1px solid var(--cv-border)' }}>
          <button type="button" onClick={onFechar} disabled={salvando} style={{ background: '#242124', color: 'var(--cv-text)', border: '1px solid #3c373c', borderRadius: 9, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
          <button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: 9, padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{salvando ? 'Salvando...' : textoBotao}</button>
        </footer>
      </form>
    </div>
  )
}

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100%', background: 'var(--cv-bg)', color: 'var(--cv-muted)', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
