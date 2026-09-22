'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MARGEM_MINIMA = 20
const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = valor => Number(String(valor || '').replace(',', '.')) || 0
const dataHora = valor => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(valor))

function nomeArquivo(valor) {
  return String(valor || 'produto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'produto'
}

function desenharResumo(dados) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  const gold = '#E4BA36'
  const white = '#FFFFFF'
  const muted = '#AAA79F'

  ctx.fillStyle = '#090909'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, 'rgba(228,186,54,.18)')
  gradient.addColorStop(.42, 'rgba(228,186,54,.03)')
  gradient.addColorStop(1, 'rgba(228,186,54,.10)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = gold
  ctx.fillRect(72, 68, 110, 8)
  ctx.font = '800 28px Arial, sans-serif'
  ctx.fillText('ROTINA DA LOJA MILIONÁRIA', 72, 132)

  ctx.fillStyle = white
  ctx.font = '900 58px Arial, sans-serif'
  ctx.fillText('Resumo da Precificação', 72, 220)
  ctx.fillStyle = muted
  ctx.font = '400 27px Arial, sans-serif'
  ctx.fillText('Preço calculado para vender com margem e segurança.', 72, 268)

  ctx.fillStyle = '#151515'
  ctx.strokeStyle = '#363126'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(72, 330, 936, 205, 28)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = gold
  ctx.font = '800 23px Arial, sans-serif'
  ctx.fillText('PRODUTO', 112, 388)
  ctx.fillStyle = white
  ctx.font = '900 45px Arial, sans-serif'
  const produto = String(dados.produto || 'Produto').slice(0, 34)
  ctx.fillText(produto, 112, 455)
  ctx.fillStyle = muted
  ctx.font = '400 23px Arial, sans-serif'
  ctx.fillText(`Calculado em ${dados.data}`, 112, 500)

  ctx.fillStyle = '#201C10'
  ctx.strokeStyle = gold
  ctx.beginPath()
  ctx.roundRect(72, 575, 936, 245, 28)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = gold
  ctx.font = '800 24px Arial, sans-serif'
  ctx.fillText('PREÇO IDEAL DE VENDA', 112, 640)
  ctx.fillStyle = white
  ctx.font = '900 86px Arial, sans-serif'
  ctx.fillText(brl(dados.preco), 112, 746)
  ctx.fillStyle = muted
  ctx.font = '500 25px Arial, sans-serif'
  ctx.fillText(`${Number(dados.margem || 0).toFixed(0)}% de margem desejada`, 112, 790)

  const cards = [
    ['CUSTO TOTAL', brl(dados.custo)],
    ['LUCRO POR PEÇA', brl(dados.lucro)],
    ['MARKUP', `${Number(dados.markup || 0).toFixed(2)}x`],
  ]
  cards.forEach(([label, value], index) => {
    const x = 72 + index * 320
    ctx.fillStyle = '#151515'
    ctx.strokeStyle = '#302D27'
    ctx.beginPath()
    ctx.roundRect(x, 862, 296, 180, 22)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = muted
    ctx.font = '700 18px Arial, sans-serif'
    ctx.fillText(label, x + 28, 918)
    ctx.fillStyle = white
    ctx.font = '900 33px Arial, sans-serif'
    ctx.fillText(value, x + 28, 982)
  })

  ctx.fillStyle = gold
  ctx.font = '800 23px Arial, sans-serif'
  ctx.fillText('Lembrete da Suzana', 72, 1122)
  ctx.fillStyle = white
  ctx.font = '600 27px Arial, sans-serif'
  ctx.fillText('Preço baixo sem margem não é venda. É prejuízo.', 72, 1172)
  ctx.fillStyle = muted
  ctx.font = '400 21px Arial, sans-serif'
  ctx.fillText('Use este valor como direção e proteja o lucro da sua loja.', 72, 1212)

  ctx.fillStyle = '#2B271C'
  ctx.fillRect(72, 1280, 936, 2)
  ctx.fillStyle = muted
  ctx.font = '500 19px Arial, sans-serif'
  ctx.fillText('Gerado no aplicativo Rotina da Loja Milionária', 72, 1322)
  return canvas
}

function canvasParaBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível criar a imagem.')), 'image/png', 1)
  })
}

function CampoNumero({ label, value, onChange, prefix = 'R$', suffix = '', min = 0, max, step = '0.01', hint, placeholder = 'Ex.: 0,00' }) {
  return <label className="pricing-field">
    <span>{label}</span>
    <div className="pricing-input-wrap">
      {prefix && <b>{prefix}</b>}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {suffix && <b>{suffix}</b>}
    </div>
    {hint && <small>{hint}</small>}
  </label>
}

function Indicador({ label, value, destaque = false, hint }) {
  return <div className={`pricing-indicator${destaque ? ' pricing-indicator-main' : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {hint && <small>{hint}</small>}
  </div>
}

export default function PricingCenter({ userId, cores, ouro, ouroGrad }) {
  const [produto, setProduto] = useState('')
  const [custo, setCusto] = useState('')
  const [taxas, setTaxas] = useState('')
  const [extras, setExtras] = useState('')
  const [margem, setMargem] = useState('50')
  const [desconto, setDesconto] = useState(15)
  const [historico, setHistorico] = useState([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState(null)

  const calculo = useMemo(() => {
    const custoTotal = numero(custo) + numero(taxas) + numero(extras)
    const margemDesejada = numero(margem)
    const valido = custoTotal > 0 && margemDesejada > MARGEM_MINIMA && margemDesejada <= 90
    const preco = valido ? custoTotal / (1 - margemDesejada / 100) : 0
    const lucro = Math.max(0, preco - custoTotal)
    const markup = custoTotal ? preco / custoTotal : 0
    const precoMinimo = custoTotal ? custoTotal / (1 - MARGEM_MINIMA / 100) : 0
    const precoPromocional = preco * (1 - Number(desconto) / 100)
    const lucroPromocional = precoPromocional - custoTotal
    const margemPromocional = precoPromocional > 0 ? lucroPromocional / precoPromocional * 100 : 0

    return {
      custoTotal, margemDesejada, valido, preco, lucro, markup, precoMinimo,
      precoPromocional, lucroPromocional, margemPromocional,
      seguro: valido && margemPromocional >= MARGEM_MINIMA,
    }
  }, [custo, desconto, extras, margem, taxas])

  useEffect(() => {
    let ativo = true

    async function carregar() {
      if (!userId) return
      const { data, error } = await supabase
        .from('pricing_calculations')
        .select('id,product_name,item_cost,fees,extra_costs,desired_margin,total_cost,suggested_price,profit,markup,created_at')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!ativo) return
      if (!error) setHistorico(data || [])
      setCarregandoHistorico(false)
    }

    void carregar()
    return () => { ativo = false }
  }, [userId])

  async function salvar() {
    setMensagem(null)
    if (!produto.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Digite o nome do produto para salvar.' })
      return
    }
    if (!calculo.valido) {
      setMensagem({ tipo: 'erro', texto: 'Informe o custo e uma margem entre 21% e 90%.' })
      return
    }

    setSalvando(true)
    const { data, error } = await supabase
      .from('pricing_calculations')
      .insert({
        owner_id: userId,
        product_name: produto.trim(),
        item_cost: numero(custo),
        fees: numero(taxas),
        extra_costs: numero(extras),
        desired_margin: calculo.margemDesejada,
        minimum_margin: MARGEM_MINIMA,
      })
      .select('id,product_name,item_cost,fees,extra_costs,desired_margin,total_cost,suggested_price,profit,markup,created_at')
      .single()

    setSalvando(false)
    if (error) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar. Confira se este módulo está liberado no seu plano.' })
      return
    }

    setHistorico(atual => [data, ...atual].slice(0, 50))
    setMensagem({ tipo: 'sucesso', texto: 'Cálculo salvo no seu histórico.' })
  }

  function reutilizar(item) {
    setProduto(item.product_name || '')
    setCusto(String(item.item_cost || ''))
    setTaxas(String(item.fees || ''))
    setExtras(String(item.extra_costs || ''))
    setMargem(String(item.desired_margin || '50'))
    setMensagem({ tipo: 'sucesso', texto: 'Valores carregados. Você já pode ajustar e salvar um novo cálculo.' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir o cálculo de “${item.product_name}”?`)) return
    const { error } = await supabase.from('pricing_calculations').delete().eq('id', item.id).eq('owner_id', userId)
    if (error) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível excluir este cálculo.' })
      return
    }
    setHistorico(atual => atual.filter(registro => registro.id !== item.id))
    setMensagem({ tipo: 'sucesso', texto: 'Cálculo excluído.' })
  }

  async function compartilharResumo(item = null) {
    const dados = item ? {
      produto: item.product_name,
      custo: item.total_cost,
      preco: item.suggested_price,
      lucro: item.profit,
      margem: item.desired_margin,
      markup: item.markup,
      data: dataHora(item.created_at),
    } : {
      produto: produto.trim(),
      custo: calculo.custoTotal,
      preco: calculo.preco,
      lucro: calculo.lucro,
      margem: calculo.margemDesejada,
      markup: calculo.markup,
      data: dataHora(new Date()),
    }

    if (!dados.produto || !Number(dados.preco)) {
      setMensagem({ tipo: 'erro', texto: 'Preencha o produto e os valores antes de gerar o resumo.' })
      return
    }

    try {
      const canvas = desenharResumo(dados)
      const blob = await canvasParaBlob(canvas)
      const arquivo = new File([blob], `precificacao-${nomeArquivo(dados.produto)}.png`, { type: 'image/png' })

      if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({
          title: `Precificação — ${dados.produto}`,
          text: 'Resumo da precificação feito no aplicativo Rotina da Loja Milionária.',
          files: [arquivo],
        })
        setMensagem({ tipo: 'sucesso', texto: 'Resumo pronto para compartilhar ou salvar.' })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = arquivo.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMensagem({ tipo: 'sucesso', texto: 'Imagem do resumo baixada no seu aparelho.' })
    } catch (error) {
      if (error?.name !== 'AbortError') setMensagem({ tipo: 'erro', texto: 'Não foi possível gerar o resumo. Tente novamente.' })
    }
  }

  const larguraSegura = calculo.valido ? Math.max(0, Math.min(100, (calculo.margemPromocional / calculo.margemDesejada) * 100)) : 0

  return <div className="pricing-center" style={{ '--pricing-gold': ouro, '--pricing-card': cores.card, '--pricing-card-2': cores.card2, '--pricing-border': cores.borda, '--pricing-text': cores.tx, '--pricing-muted': cores.tx2, '--pricing-muted-2': cores.tx3 }}>
    <header className="pricing-hero">
      <div>
        <small>GESTÃO DE LUCRO</small>
        <h1>Precificação e Lucro</h1>
        <p>Descubra o preço certo, proteja sua margem e simule descontos antes de vender.</p>
      </div>
      <div className="pricing-safety"><span>Margem de referência</span><strong>{MARGEM_MINIMA}%</strong><small>abaixo disso: perigo</small></div>
    </header>

    {mensagem && <div role="status" className={`pricing-message ${mensagem.tipo}`}>{mensagem.tipo === 'sucesso' ? '✓' : '!'} {mensagem.texto}</div>}

    <section className="pricing-main-grid">
      <div className="pricing-panel pricing-form-panel">
        <div className="pricing-title"><span>1</span><div><h2>Conte quanto custa esse produto</h2><p>Preencha um campo de cada vez. O resultado aparece automaticamente ao lado.</p></div></div>

        <div className="pricing-form-help"><b>É bem simples:</b> informe o valor pago na peça e os gastos que existem em cada venda. Se não tiver taxa ou gasto extra, digite <strong>0</strong>.</div>

        <label className="pricing-field pricing-product-field">
          <span>Qual produto você está precificando?</span>
          <div className="pricing-input-wrap"><input type="text" maxLength={120} value={produto} onChange={event => setProduto(event.target.value)} placeholder="Ex.: Vestido de alfaiataria" /></div>
          <small>Digite um nome que você reconheça depois no histórico.</small>
        </label>

        <div className="pricing-fields-grid">
          <CampoNumero label="Quanto você pagou na peça?" value={custo} onChange={setCusto} placeholder="Ex.: 45,00" hint="Digite o custo de compra de uma unidade." />
          <CampoNumero label="Quanto paga de taxas na venda?" value={taxas} onChange={setTaxas} placeholder="Ex.: 5,00" hint="Cartão, marketplace ou imposto. Se não tiver, digite 0." />
          <CampoNumero label="Tem embalagem, frete ou outro gasto?" value={extras} onChange={setExtras} placeholder="Ex.: 3,50" hint="Some os outros gastos de uma peça. Se não tiver, digite 0." />
          <CampoNumero label="Qual margem de lucro você deseja?" value={margem} onChange={setMargem} prefix="" suffix="%" min={21} max={90} step="1" placeholder="Ex.: 50" hint="Exemplo: para uma margem de 50%, digite 50." />
        </div>

        <div className="pricing-cost-total"><span>Custo total do produto</span><strong>{brl(calculo.custoTotal)}</strong></div>
      </div>

      <div className="pricing-panel pricing-result-panel">
        <div className="pricing-title"><span>2</span><div><h2>Preço recomendado</h2><p>Resultado baseado na margem desejada.</p></div></div>

        <div className="pricing-price-main">
          <small>PREÇO IDEAL DE VENDA</small>
          <strong>{brl(calculo.preco)}</strong>
          <span>{calculo.valido ? `${calculo.margemDesejada.toFixed(0)}% de margem` : 'Preencha os dados ao lado'}</span>
        </div>

        <div className="pricing-indicators">
          <Indicador label="Lucro por peça" value={brl(calculo.lucro)} />
          <Indicador label="Markup" value={calculo.markup ? `${calculo.markup.toFixed(2)}x` : '0,00x'} />
          <Indicador label="Preço com margem de 20%" value={brl(calculo.precoMinimo)} hint="mantém 20% de margem" />
        </div>

        <div className="pricing-result-actions">
          <button className="pricing-save" type="button" onClick={salvar} disabled={salvando || !userId} style={{ background: ouroGrad }}>
            {salvando ? 'Salvando...' : 'Salvar no histórico'}
          </button>
          <button className="pricing-share" type="button" onClick={() => compartilharResumo()} disabled={!calculo.valido || !produto.trim()}>
            Compartilhar ou salvar resumo
          </button>
        </div>
      </div>
    </section>

    <section className="pricing-panel pricing-discount">
      <div className="pricing-title"><span>3</span><div><h2>Simulador de desconto</h2><p>Simule seu desconto. Margens abaixo de 20% são aceitas, mas recebem um alerta de perigo.</p></div></div>

      <div className="pricing-discount-grid">
        <div className="pricing-range">
          <div><span>Desconto aplicado</span><strong>{desconto}%</strong></div>
          <input type="range" min="0" max="60" step="1" value={desconto} onChange={event => setDesconto(Number(event.target.value))} aria-label="Percentual de desconto" />
          <div className="pricing-range-labels"><span>0%</span><span>60%</span></div>
        </div>

        <div className="pricing-promo-result">
          <Indicador label="Preço promocional" value={brl(calculo.precoPromocional)} destaque />
          <Indicador label="Lucro restante" value={brl(calculo.lucroPromocional)} />
          <Indicador label="Margem final" value={`${calculo.margemPromocional.toFixed(1)}%`} />
        </div>
      </div>

      <div role="status" aria-live="polite" className={`pricing-status ${!calculo.valido ? 'neutral' : calculo.seguro ? 'safe' : 'danger'}`}>
        <span aria-hidden="true">{!calculo.valido ? 'i' : calculo.seguro ? '✓' : '!'}</span>
        <div>
          <strong>{!calculo.valido ? 'Preencha os dados para simular' : calculo.seguro ? 'Desconto dentro da margem de referência' : 'MARGEM PERIGOSA — ABAIXO DE 20%'}</strong>
          <small>{!calculo.valido
            ? 'Informe o custo e a margem desejada para calcular o efeito do desconto.'
            : calculo.seguro
              ? 'Este desconto mantém uma margem de pelo menos 20%, considerando os custos informados.'
              : calculo.lucroPromocional < 0
                ? `Desconto aceito na simulação, mas o preço fica abaixo do custo informado. PREJUÍZO DE ${brl(Math.abs(calculo.lucroPromocional))} POR PEÇA. Reveja antes de vender.`
                : calculo.lucroPromocional === 0
                  ? 'Desconto aceito na simulação, mas você fica SEM LUCRO por peça. Qualquer gasto não informado pode gerar prejuízo.'
                  : `Desconto aceito na simulação, mas a margem final de ${calculo.margemPromocional.toFixed(1)}% É PERIGOSA. Sobra pouco lucro e gastos não informados podem gerar prejuízo. Use com muita cautela.`}</small>
        </div>
        <i><em style={{ width: `${larguraSegura}%` }} /></i>
      </div>
    </section>

    <section className="pricing-panel pricing-history">
      <div className="pricing-title"><span>4</span><div><h2>Cálculos salvos</h2><p>Consulte ou reutilize suas últimas precificações.</p></div></div>

      {carregandoHistorico ? <div className="pricing-empty">Carregando histórico...</div> : historico.length === 0 ? <div className="pricing-empty"><strong>Seu histórico começa aqui</strong><span>Salve o primeiro cálculo para consultar depois.</span></div> : <div className="pricing-history-list">
        {historico.map(item => <article key={item.id}>
          <div className="pricing-history-product"><span>📦</span><div><strong>{item.product_name}</strong><small>{dataHora(item.created_at)} · custo {brl(item.total_cost)}</small></div></div>
          <div className="pricing-history-number"><small>Preço ideal</small><strong>{brl(item.suggested_price)}</strong></div>
          <div className="pricing-history-number"><small>Lucro</small><strong>{brl(item.profit)}</strong></div>
          <div className="pricing-history-actions"><button type="button" className="share" onClick={() => compartilharResumo(item)}>Compartilhar</button><button type="button" onClick={() => reutilizar(item)}>Reutilizar</button><button type="button" className="delete" onClick={() => excluir(item)} aria-label={`Excluir ${item.product_name}`}>Excluir</button></div>
        </article>)}
      </div>}
    </section>

    <style jsx global>{`
      .pricing-center{max-width:1040px;margin:0 auto;color:var(--pricing-text)}
      .pricing-hero{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-bottom:18px;padding:5px 2px}
      .pricing-hero small{color:var(--pricing-gold);font-size:10px;font-weight:900;letter-spacing:.14em}
      .pricing-hero h1{font-size:27px;line-height:1.1;margin:7px 0 6px;font-weight:900}
      .pricing-hero p{margin:0;color:var(--pricing-muted);font-size:13px;line-height:1.5}
      .pricing-safety{min-width:142px;background:var(--pricing-card);border:1px solid var(--pricing-border);border-radius:15px;padding:13px 16px;text-align:center}
      .pricing-safety span,.pricing-safety small{display:block;color:var(--pricing-muted);font-size:10px}
      .pricing-safety strong{display:block;color:var(--pricing-gold);font-size:24px;margin:2px 0}
      .pricing-message{border-radius:10px;padding:11px 13px;margin-bottom:13px;font-size:12px;font-weight:700}
      .pricing-message.sucesso{color:#218a4a;background:#e7f8ec;border:1px solid #aee4bf}.pricing-message.erro{color:#be3f45;background:#fff0f0;border:1px solid #f2b7ba}
      :global(.tema-escuro) .pricing-message.sucesso{background:#0f2918;border-color:#285c38;color:#76d493}:global(.tema-escuro) .pricing-message.erro{background:#311517;border-color:#6a3034;color:#ff8c92}
      .pricing-main-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:14px;margin-bottom:14px}
      .pricing-panel{background:var(--pricing-card);border:1px solid var(--pricing-border);border-radius:18px;padding:20px}
      .pricing-title{display:flex;align-items:flex-start;gap:11px;margin-bottom:18px}.pricing-title>span{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:#fff5cf;color:#7c6200;font-size:12px;font-weight:900;flex:none}.pricing-title h2{font-size:16px;margin:0 0 3px;font-weight:850}.pricing-title p{font-size:11px;color:var(--pricing-muted);margin:0;line-height:1.4}
      :global(.tema-escuro) .pricing-title>span{background:#2b250e;color:var(--pricing-gold)}
      .pricing-form-help{margin:-5px 0 16px;padding:11px 12px;border-left:3px solid var(--pricing-gold);border-radius:0 9px 9px 0;background:color-mix(in srgb,var(--pricing-gold) 8%,var(--pricing-card));color:var(--pricing-muted);font-size:10px;line-height:1.55}.pricing-form-help b,.pricing-form-help strong{color:var(--pricing-text)}
      .pricing-field{display:block}.pricing-field>span{display:block;font-size:12px;font-weight:850;margin-bottom:7px;line-height:1.35}.pricing-field>small{display:block;color:var(--pricing-muted);font-size:9px;line-height:1.4;margin-top:6px}.pricing-product-field{margin-bottom:16px}
      .pricing-input-wrap{display:flex!important;align-items:center!important;min-height:52px;background:var(--pricing-card-2)!important;border:1px solid var(--pricing-border)!important;border-radius:10px!important;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.03);transition:border .2s,box-shadow .2s}.pricing-input-wrap:focus-within{border-color:var(--pricing-gold)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--pricing-gold) 14%,transparent)}.pricing-input-wrap b{display:block;color:var(--pricing-gold);font-size:13px;font-weight:900;padding-left:13px;white-space:nowrap}.pricing-input-wrap b:last-child{padding:0 13px 0 3px}.pricing-input-wrap input{display:block!important;min-width:0;width:100%!important;height:52px!important;border:0!important;outline:0!important;background:transparent!important;color:var(--pricing-text)!important;font-size:16px!important;font-weight:750!important;padding:0 12px!important;box-shadow:none!important}.pricing-input-wrap input::placeholder{color:var(--pricing-muted-2)!important;font-weight:500;opacity:.9}.pricing-input-wrap input[type=number]{appearance:textfield}.pricing-input-wrap input::-webkit-outer-spin-button,.pricing-input-wrap input::-webkit-inner-spin-button{appearance:none;margin:0}
      .pricing-fields-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 12px}.pricing-cost-total{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:13px 14px;background:var(--pricing-card-2);border-radius:10px}.pricing-cost-total span{font-size:11px;color:var(--pricing-muted)}.pricing-cost-total strong{font-size:15px}
      .pricing-result-panel{background:linear-gradient(145deg,var(--pricing-card),var(--pricing-card-2))}.pricing-price-main{text-align:center;border:1px solid color-mix(in srgb,var(--pricing-gold) 45%,var(--pricing-border));background:color-mix(in srgb,var(--pricing-gold) 7%,var(--pricing-card));border-radius:14px;padding:20px 12px;margin-bottom:11px}.pricing-price-main small{display:block;color:var(--pricing-gold);font-size:9px;font-weight:900;letter-spacing:.1em}.pricing-price-main strong{display:block;font-size:31px;line-height:1.1;margin:7px 0 4px}.pricing-price-main span{font-size:10px;color:var(--pricing-muted)}
      .pricing-indicators{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.pricing-indicator{min-width:0;background:var(--pricing-card);border:1px solid var(--pricing-border);border-radius:10px;padding:10px}.pricing-indicator span,.pricing-indicator small{display:block;color:var(--pricing-muted);font-size:9px}.pricing-indicator strong{display:block;font-size:13px;margin-top:4px;overflow-wrap:anywhere}.pricing-indicator small{font-size:8px;margin-top:2px}.pricing-indicator-main strong{color:var(--pricing-gold);font-size:18px}.pricing-result-actions{display:grid;gap:8px;margin-top:13px}.pricing-save,.pricing-share{width:100%;border-radius:10px;padding:12px 16px;font-size:12px;font-weight:900;cursor:pointer}.pricing-save{border:0;color:#090909}.pricing-share{border:1px solid var(--pricing-gold);background:transparent;color:var(--pricing-gold)}.pricing-save:disabled,.pricing-share:disabled{opacity:.45;cursor:not-allowed}
      .pricing-discount{margin-bottom:14px}.pricing-discount-grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:18px;align-items:end}.pricing-range>div:first-child{display:flex;justify-content:space-between;align-items:center;font-size:11px}.pricing-range>div:first-child strong{color:var(--pricing-gold);font-size:22px}.pricing-range input{width:100%;accent-color:var(--pricing-gold);margin:14px 0 4px}.pricing-range-labels{display:flex;justify-content:space-between;color:var(--pricing-muted-2);font-size:9px}.pricing-promo-result{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px}
      .pricing-status{display:grid;grid-template-columns:auto 1fr 150px;gap:11px;align-items:center;border-radius:11px;padding:11px 13px;margin-top:15px}.pricing-status>span{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;font-weight:900}.pricing-status strong,.pricing-status small{display:block}.pricing-status strong{font-size:11px}.pricing-status small{font-size:9px;margin-top:2px}.pricing-status i{display:block;height:5px;border-radius:8px;background:rgba(0,0,0,.12);overflow:hidden}.pricing-status em{display:block;height:100%;border-radius:inherit}.pricing-status.safe{background:#e9f8ee;color:#237341}.pricing-status.safe>span{background:#c8edd5}.pricing-status.safe em{background:#3faf68}.pricing-status.neutral{background:var(--pricing-card-2);color:var(--pricing-muted)}.pricing-status.danger{background:#fff0f0;color:#aa3038;border:2px solid #dc555c;padding:16px}.pricing-status.danger strong{font-size:15px;font-weight:900;line-height:1.4}.pricing-status.danger small{font-size:12px;line-height:1.6;margin-top:6px;font-weight:700}.pricing-status.danger>span{background:#f8d1d3}.pricing-status.danger em{background:#dc555c}:global(.tema-escuro) .pricing-status.safe{background:#10291a;color:#78d697}:global(.tema-escuro) .pricing-status.danger{background:#311517;color:#ff8c92}
      .pricing-history-list{display:grid;gap:8px}.pricing-history-list article{display:grid;grid-template-columns:minmax(190px,1fr) 120px 110px auto;gap:12px;align-items:center;background:var(--pricing-card-2);border:1px solid var(--pricing-border);border-radius:11px;padding:11px 12px}.pricing-history-product{display:flex;align-items:center;gap:10px;min-width:0}.pricing-history-product>span{width:35px;height:35px;display:grid;place-items:center;background:var(--pricing-card);border-radius:9px}.pricing-history-product div{min-width:0}.pricing-history-product strong,.pricing-history-product small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pricing-history-product strong{font-size:12px}.pricing-history-product small,.pricing-history-number small{font-size:9px;color:var(--pricing-muted);margin-top:3px}.pricing-history-number strong{display:block;font-size:12px;margin-top:3px}.pricing-history-actions{display:flex;gap:5px}.pricing-history-actions button{border:1px solid var(--pricing-border);background:var(--pricing-card);color:var(--pricing-text);border-radius:8px;padding:8px 9px;font-size:10px;font-weight:750;cursor:pointer}.pricing-history-actions .share{color:var(--pricing-gold);border-color:color-mix(in srgb,var(--pricing-gold) 45%,var(--pricing-border))}.pricing-history-actions .delete{color:#cf4f56}.pricing-empty{display:flex;flex-direction:column;align-items:center;text-align:center;color:var(--pricing-muted);font-size:11px;padding:26px}.pricing-empty strong{color:var(--pricing-text);font-size:13px;margin-bottom:4px}
      @media(max-width:820px){.pricing-main-grid{grid-template-columns:1fr}.pricing-discount-grid{grid-template-columns:1fr}.pricing-history-list article{grid-template-columns:1fr 1fr}.pricing-history-product{grid-column:1/-1}.pricing-history-actions{justify-content:flex-end}}
      @media(max-width:560px){.pricing-center{margin:-4px}.pricing-hero{align-items:flex-start}.pricing-hero h1{font-size:23px}.pricing-hero p{font-size:12px}.pricing-safety{min-width:92px;padding:10px}.pricing-safety strong{font-size:20px}.pricing-panel{padding:16px;border-radius:15px}.pricing-fields-grid{grid-template-columns:1fr;gap:18px}.pricing-field>span{font-size:13px}.pricing-field>small{font-size:10px}.pricing-input-wrap{min-height:56px}.pricing-input-wrap input{height:56px!important}.pricing-indicators,.pricing-promo-result{grid-template-columns:1fr 1fr}.pricing-indicators .pricing-indicator:last-child,.pricing-promo-result .pricing-indicator:first-child{grid-column:1/-1}.pricing-status{grid-template-columns:auto 1fr}.pricing-status i{grid-column:1/-1}.pricing-history-list article{grid-template-columns:1fr 1fr;gap:9px}.pricing-history-actions{grid-column:1/-1}.pricing-history-actions button{flex:1}.pricing-title{margin-bottom:15px}.pricing-form-help{font-size:11px;margin-bottom:18px}}
    `}</style>
  </div>
}
