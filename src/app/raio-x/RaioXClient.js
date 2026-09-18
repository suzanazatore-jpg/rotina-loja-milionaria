'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { EIXOS_RAIO_X, PERGUNTAS_RAIO_X } from '@/lib/raioX'

const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function formatarWhatsapp(valor) {
  const numeros = valor.replace(/\D/g, '').slice(0, 11)
  if (numeros.length <= 2) return numeros
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
}

function Marca() {
  return <div className="rx-brand"><b>R</b><span>ROTINA DA<strong>LOJA MILIONÁRIA</strong></span></div>
}

export default function RaioXClient() {
  const [etapa, setEtapa] = useState('inicio')
  const [indice, setIndice] = useState(0)
  const [respostas, setRespostas] = useState({})
  const [dados, setDados] = useState({ nome: '', email: '', whatsapp: '', consentimento: false, website: '' })
  const [diagnostico, setDiagnostico] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pergunta = PERGUNTAS_RAIO_X[indice]
  const progresso = Math.round((indice + 1) / PERGUNTAS_RAIO_X.length * 100)

  const utm = useMemo(() => {
    if (typeof window === 'undefined') return {}
    const params = new URLSearchParams(window.location.search)
    return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map(chave => [chave, params.get(chave)]).filter(([, valor]) => valor))
  }, [])

  function avancar() {
    if (!respostas[pergunta.id]) { setErro('Escolha uma opção para continuar.'); return }
    setErro('')
    if (indice === PERGUNTAS_RAIO_X.length - 1) setEtapa('captura')
    else setIndice(atual => atual + 1)
  }

  function voltar() {
    setErro('')
    if (indice === 0) setEtapa('inicio')
    else setIndice(atual => atual - 1)
  }

  async function gerarDiagnostico(evento) {
    evento.preventDefault(); setErro(''); setEnviando(true)
    try {
      const resposta = await fetch('/api/raio-x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dados, respostas, utm }),
      })
      const resultado = await resposta.json()
      if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível gerar o diagnóstico.')
      setDiagnostico(resultado.diagnostico)
      setEtapa('resultado')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  const eixo = diagnostico ? EIXOS_RAIO_X[diagnostico.gargalo] : null
  const whatsappVenda = diagnostico
    ? `https://wa.me/558499814124?text=${encodeURIComponent(`Oi! Fiz o Raio-X da Loja Lucrativa. Meu principal gargalo foi ${eixo.nome} e quero liberar minha rotina completa.`)}`
    : '#'

  return <main className="rx-shell">
    <header className="rx-header"><Marca /><span>Diagnóstico gratuito</span></header>

    {etapa === 'inicio' && <section className="rx-hero">
      <div className="rx-hero-copy">
        <small>RAIO-X DA LOJA LUCRATIVA</small>
        <h1>Descubra o que está travando o crescimento da sua loja.</h1>
        <p>Em poucos minutos, você identifica seu principal gargalo, estima quanto pode estar deixando de vender e recebe um plano personalizado de 7 dias.</p>
        <ul><li>Diagnóstico de vendas, equipe, estoque e gestão</li><li>Plano prático feito a partir das suas respostas</li><li>Primeira ação pronta para executar hoje</li></ul>
        <button onClick={() => setEtapa('quiz')}>Começar meu diagnóstico <b>→</b></button>
        <span className="rx-safe">Gratuito • Resultado imediato • Sem compromisso</span>
      </div>
      <div className="rx-hero-visual">
        <div className="rx-photo"><Image src="/suzana-autoridade.jpg" alt="Suzana Zatorre, mentora de lojistas" width={900} height={1100} priority /></div>
        <div className="rx-authority"><strong>Suzana Zatorre</strong><span>24 anos no varejo • Mais de 5 mil lojistas impactadas</span></div>
        <div className="rx-preview-card"><small>SEU RESULTADO</small><strong>4 áreas analisadas</strong><div><i /><i /><i /><i /></div></div>
      </div>
    </section>}

    {etapa === 'quiz' && <section className="rx-quiz-wrap">
      <div className="rx-progress"><span>PERGUNTA {indice + 1} DE {PERGUNTAS_RAIO_X.length}</span><b>{progresso}%</b><div><i style={{ width: `${progresso}%` }} /></div></div>
      <article className="rx-question">
        <small>DIAGNÓSTICO DA SUA LOJA</small>
        <h1>{pergunta.titulo}</h1>
        <p>{pergunta.apoio}</p>
        <div className="rx-options">{pergunta.opcoes.map(([id, rotulo], posicao) => <button key={id} type="button" className={respostas[pergunta.id] === id ? 'selected' : ''} onClick={() => { setRespostas(atual => ({ ...atual, [pergunta.id]: id })); setErro('') }}><b>{String.fromCharCode(65 + posicao)}</b><span>{rotulo}</span><i>{respostas[pergunta.id] === id ? '✓' : '›'}</i></button>)}</div>
        {erro && <div className="rx-error">{erro}</div>}
        <footer><button type="button" className="rx-back" onClick={voltar}>← Voltar</button><button type="button" className="rx-next" onClick={avancar}>Continuar →</button></footer>
      </article>
    </section>}

    {etapa === 'captura' && <section className="rx-capture">
      <div className="rx-capture-copy"><small>DIAGNÓSTICO CONCLUÍDO</small><h1>Seu resultado está pronto.</h1><p>Preencha seus dados para liberar agora o gargalo principal e o plano personalizado de 7 dias.</p><div><b>✓</b><span>Resultado calculado a partir das suas 8 respostas</span></div><div><b>✓</b><span>Seus dados não serão exibidos publicamente</span></div></div>
      <form onSubmit={gerarDiagnostico}>
        <label>Seu nome<input value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} placeholder="Como podemos chamar você?" required minLength={2} maxLength={100} /></label>
        <label>Seu melhor WhatsApp<input inputMode="tel" value={dados.whatsapp} onChange={e => setDados({ ...dados, whatsapp: formatarWhatsapp(e.target.value) })} placeholder="(84) 99999-9999" required /></label>
        <label>Seu e-mail<input type="email" value={dados.email} onChange={e => setDados({ ...dados, email: e.target.value })} placeholder="voce@email.com" required maxLength={180} /></label>
        <label className="rx-honeypot" aria-hidden="true">Não preencha<input tabIndex={-1} autoComplete="off" value={dados.website} onChange={e => setDados({ ...dados, website: e.target.value })} /></label>
        <label className="rx-consent"><input type="checkbox" checked={dados.consentimento} onChange={e => setDados({ ...dados, consentimento: e.target.checked })} required /><span>Autorizo o uso destes dados para receber meu diagnóstico e comunicações da Suzana Zatorre. Posso cancelar a qualquer momento.</span></label>
        {erro && <div className="rx-error">{erro}</div>}
        <button className="rx-submit" disabled={enviando}>{enviando ? 'Montando seu plano...' : 'Ver meu diagnóstico agora →'}</button>
        <button type="button" className="rx-back rx-capture-back" onClick={() => { setEtapa('quiz'); setIndice(PERGUNTAS_RAIO_X.length - 1); setErro('') }}>← Corrigir uma resposta</button>
      </form>
    </section>}

    {etapa === 'resultado' && diagnostico && <section className="rx-result">
      <div className="rx-result-head"><small>RAIO-X CONCLUÍDO</small><h1>{dados.nome.split(' ')[0]}, sua loja tem potencial. O ponto que mais pede atenção agora é <em>{eixo.nome}</em>.</h1><p>Seu diagnóstico indica que o maior ganho pode vir ao melhorar {eixo.descricao}.</p></div>

      <div className="rx-score-grid">{Object.entries(diagnostico.pontuacoes).map(([id, nota]) => <article key={id} className={id === diagnostico.gargalo ? 'critical' : ''}><header><span>{EIXOS_RAIO_X[id].nome}</span><b>{nota}/100</b></header><div><i style={{ width: `${nota}%` }} /></div><small>{nota >= 75 ? 'Ponto forte' : nota >= 50 ? 'Precisa de consistência' : 'Prioridade de ação'}</small></article>)}</div>

      <article className="rx-loss"><span>OPORTUNIDADES NÃO APROVEITADAS</span><h2>Você pode estar deixando de movimentar até <strong>{brl(diagnostico.perdaEstimada)}</strong> por mês.</h2><p>Esta é uma estimativa educativa baseada no faturamento informado e na maturidade das quatro áreas. Não representa promessa de resultado.</p></article>

      <div className="rx-plan-title"><small>SEU PRÓXIMO PASSO</small><h2>Plano de ação de 7 dias</h2><p>Comece por estas ações para atacar o gargalo de {eixo.nome.toLowerCase()}.</p></div>
      <div className="rx-plan">{diagnostico.plano.map(([dia, titulo, descricao], posicao) => <article key={dia} className={posicao === 0 ? 'today' : ''}><b>{posicao === 0 ? 'HOJE' : dia.toUpperCase()}</b><div><strong>{titulo}</strong><p>{descricao}</p></div><span>{posicao === 0 ? '→' : String(posicao + 1).padStart(2, '0')}</span></article>)}</div>

      <article className="rx-app-preview"><div><small>ROTINA DA LOJA MILIONÁRIA</small><h2>O diagnóstico mostrou o caminho. O aplicativo ajuda você a executar todos os dias.</h2><p>Tenha foco comercial, tarefas diárias, campanhas, metas, acompanhamento da equipe e orientação da Suzana em um só lugar.</p><a href={whatsappVenda} target="_blank" rel="noopener noreferrer">Liberar minha rotina completa →</a><a className="rx-login" href="/login">Já sou aluna: entrar no aplicativo</a></div><div className="rx-phone"><header><i>R</i><span>Seu plano de hoje</span></header><section><small>FOCO COMERCIAL</small><strong>{diagnostico.plano[0][1]}</strong></section>{diagnostico.plano.slice(0, 3).map(([, titulo], indiceItem) => <p key={titulo}><b>{indiceItem === 0 ? '✓' : ''}</b><span>{titulo}</span></p>)}</div></article>
    </section>}

    <footer className="rx-footer">© {new Date().getFullYear()} Suzana Zatorre Educacional • Seus dados são tratados com segurança.</footer>
  </main>
}
