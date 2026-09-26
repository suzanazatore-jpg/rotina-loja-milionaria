'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import ProtocolAccess from './ProtocolAccess'
import AppIcon from '@/app/components/AppIcon'
import { planoDoDia } from '@/lib/dailyPlan'
import { supabase } from '@/lib/supabase'

const DEFAULT_WEIGHTS = { 0: 0, 1: 10, 2: 10, 3: 12, 4: 15, 5: 23, 6: 30 }
const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
const homeSummaryCache = new Map()
const homeProgressCache = new Map()

function capitalizar(valor) {
  return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : ''
}

function datasAbertasNoMes(data, pesos, datasFechadas = []) {
  const resultado = []
  const fechadas = new Set(datasFechadas || [])
  const ano = data.getFullYear()
  const mes = data.getMonth()

  for (let dia = new Date(ano, mes, 1); dia.getMonth() === mes; dia.setDate(dia.getDate() + 1)) {
    const iso = dataLocal(dia)
    if (Number(pesos?.[dia.getDay()] || 0) > 0 && !fechadas.has(iso)) resultado.push({ iso, diaSemana: dia.getDay() })
  }

  return resultado
}

export default function HomeDashboard({
  userId,
  cores,
  protocols = [],
  rotinaLiberada = false,
  campanhasLiberadas = false,
  calendarioLiberado = false,
  nome,
  saudacao,
  irPara,
  tema,
  setTema,
  mentoriaLiberada,
  assistenteLiberado,
  metasLiberadas,
  precificacaoLiberada,
  rotinaSemanal,
  calendarActions = [],
  campaign = null,
  banners = [],
  bannerAtual = 0,
  setBannerAtual = () => {},
}) {
  const [resumo, setResumo] = useState(() => homeSummaryCache.get(userId) || { meta: 0, mes: 0, hoje: 0, pesos: DEFAULT_WEIGHTS, datasFechadas: [] })
  const [concluidas, setConcluidas] = useState(() => new Set(homeProgressCache.get(userId) || []))
  const hoje = useMemo(() => new Date(), [])
  const dataHoje = useMemo(() => dataLocal(hoje), [hoje])
  const planoHoje = useMemo(() => planoDoDia(rotinaSemanal?.plano_dias, hoje), [hoje, rotinaSemanal?.plano_dias])
  const acoesHoje = useMemo(() => calendarActions.filter(acao => acao.action_date === dataHoje), [calendarActions, dataHoje])

  useEffect(() => {
    let ativo = true

    async function carregarResumo() {
      if (!userId || !metasLiberadas) return
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
      const [{ data: goal }, { data: sales }] = await Promise.all([
        supabase.from('sales_goals').select('monthly_target,weekday_weights,closed_dates').eq('owner_id', userId).eq('month_start', inicioMes).maybeSingle(),
        supabase.from('daily_sales').select('sale_date,amount').eq('owner_id', userId).gte('sale_date', inicioMes),
      ])
      if (!ativo) return

      const lista = sales || []
      const nextSummary = {
        meta: Number(goal?.monthly_target || 0),
        mes: lista.reduce((soma, item) => soma + Number(item.amount || 0), 0),
        hoje: lista.filter(item => item.sale_date === dataHoje).reduce((soma, item) => soma + Number(item.amount || 0), 0),
        pesos: goal?.weekday_weights || DEFAULT_WEIGHTS,
        datasFechadas: goal?.closed_dates || [],
      }
      homeSummaryCache.set(userId, nextSummary)
      setResumo(nextSummary)
    }

    void carregarResumo()
    return () => { ativo = false }
  }, [dataHoje, hoje, userId, metasLiberadas])

  useEffect(() => {
    let ativo = true

    async function carregarProgresso() {
      if (!userId || !rotinaLiberada) return
      const { data } = await supabase.from('daily_task_progress').select('task_id').eq('owner_id', userId).eq('task_date', dataHoje)
      if (ativo) {
        const ids = (data || []).map(item => item.task_id)
        homeProgressCache.set(userId, ids)
        setConcluidas(new Set(ids))
      }
    }

    void carregarProgresso()
    return () => { ativo = false }
  }, [dataHoje, userId, rotinaLiberada])

  const pct = resumo.meta ? Math.round(resumo.mes / resumo.meta * 100) : 0
  const diasAbertos = datasAbertasNoMes(hoje, resumo.pesos, resumo.datasFechadas)
  const pesoTotal = Object.values(resumo.pesos).reduce((soma, valor) => soma + Number(valor || 0), 0) || 1
  const ocorrenciasHoje = diasAbertos.filter(item => item.diaSemana === hoje.getDay()).length
  const metaHoje = ocorrenciasHoje ? resumo.meta * Number(resumo.pesos[hoje.getDay()] || 0) / pesoTotal / ocorrenciasHoje : 0
  const faltaHoje = Math.max(0, metaHoje - resumo.hoje)
  const tarefasHoje = rotinaSemanal ? planoHoje.tarefas.filter(tarefa => tarefa.titulo) : []
  const proximaTarefa = tarefasHoje.find(tarefa => !concluidas.has(tarefa.id))
  const totalConcluidas = tarefasHoje.filter(tarefa => concluidas.has(tarefa.id)).length
  const acaoDestaque = acoesHoje[0]
  const dataPorExtenso = capitalizar(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(hoje))
  const mesAtual = capitalizar(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(hoje))
  const atalhosRapidos = [
    ['quickCourses', 'Meus Cursos', 'Aulas liberadas', 'cursos'],
    ...(mentoriaLiberada ? [['quickCourses', 'Mentorias', 'Encontros e gravações', 'mentoria']] : []),
    ...(precificacaoLiberada ? [['content', 'Precificação e Lucro', 'Preço, margem e descontos', 'precificacao']] : []),
  ]

  return <div className="premium-home premium-home-simple">
    <header className="premium-simple-mobile-header">
      <div className="premium-brand"><b>R</b><span>ROTINA DA<strong>LOJA MILIONÁRIA</strong></span></div>
      <div className="premium-theme-switch" aria-label="Escolher tema">
        <button className={tema === 'claro' ? 'on' : ''} onClick={() => setTema('claro')} aria-label="Usar tema claro">☀</button>
        <button className={tema === 'escuro' ? 'on' : ''} onClick={() => setTema('escuro')} aria-label="Usar tema escuro">☾</button>
      </div>
    </header>

    <section className="premium-simple-hero">
      <div className="premium-simple-hero-copy">
        <small>{dataPorExtenso}</small>
        <p>{saudacao},</p>
        <h1>{nome}!</h1>
        <span>Vamos colocar sua loja em movimento?</span>
        {metasLiberadas && <div className="premium-simple-month-progress">
          <div><span>Meta de {mesAtual}</span><b>{pct}%</b></div>
          <i><em style={{ width: `${Math.min(100, pct)}%` }} /></i>
          <small>{brl(resumo.mes)} de {brl(resumo.meta)}</small>
        </div>}
      </div>
      <div className="premium-simple-photo"><Image src="/suzana-autoridade.jpg" alt="Suzana Zatorre" fill sizes="(max-width: 899px) 58vw, 55vw" priority /></div>
    </section>

    <ProtocolAccess protocols={protocols} cores={cores} />

    {(metasLiberadas || rotinaLiberada) && <section className="premium-simple-section" aria-labelledby="fazer-agora">
      <div className="premium-simple-heading">
        <div><small>PRIORIDADE DO DIA</small><h2 id="fazer-agora">O que fazer agora</h2></div>
        <span>{dataPorExtenso}</span>
      </div>

      <article className="premium-simple-priority">
        {metasLiberadas && <div className="premium-simple-number">
          <small>{faltaHoje > 0 ? 'FALTA VENDER HOJE' : metaHoje ? 'RESULTADO DE HOJE' : 'META DE HOJE'}</small>
          <strong>{metaHoje ? (faltaHoje > 0 ? brl(faltaHoje) : 'Meta batida!') : 'Defina sua meta'}</strong>
          <span>Vendido hoje: <b>{brl(resumo.hoje)}</b></span>
        </div>}

        {rotinaLiberada && <div className="premium-simple-next">
          <i><AppIcon name="routine" size={24} /></i>
          <div>
            <small>PRÓXIMA AÇÃO DA ROTINA</small>
            <strong>{proximaTarefa?.titulo || (tarefasHoje.length ? 'Plano de hoje concluído' : 'Rotina ainda não publicada')}</strong>
            <span>{proximaTarefa?.descricao?.replace('{meta_diaria}', brl(metaHoje)) || planoHoje.orientacao}</span>
            {tarefasHoje.length > 0 && <em>{totalConcluidas} de {tarefasHoje.length} ações concluídas</em>}
          </div>
        </div>}

        <div className="premium-simple-buttons">
          {metasLiberadas && <button className="primary" type="button" onClick={() => irPara('lancar-venda')}>＋ Lançar venda</button>}
          {rotinaLiberada && <button type="button" onClick={() => irPara('rotina')}>Abrir rotina →</button>}
        </div>
      </article>
    </section>}

    {(campanhasLiberadas || calendarioLiberado) && <section className="premium-simple-section premium-simple-other" aria-labelledby="outras-acoes">
      <div className="premium-simple-heading"><div><small>DEPOIS DA PRIORIDADE</small><h2 id="outras-acoes">Outras ações de hoje</h2></div></div>

      <div className="premium-simple-action-list">
        {campanhasLiberadas && <article>
          <i><AppIcon name="campaigns" size={22} /></i>
          <div><small>CAMPANHA DO MÊS</small><strong>{campaign?.titulo || 'Campanha mensal'}</strong><span>{campaign?.descricao || 'Abra para acompanhar a estratégia e as etapas da campanha.'}</span></div>
          <button type="button" onClick={() => irPara('campanhas')}>Abrir campanha</button>
        </article>}

        {calendarioLiberado && <article>
          <i><AppIcon name="calendar" size={22} /></i>
          <div><small>CALENDÁRIO DE CONTEÚDO</small><strong>{acaoDestaque?.title || 'Calendário de hoje'}</strong><span>{acaoDestaque ? [acaoDestaque.channel, acaoDestaque.content_format].filter(Boolean).join(' • ') || `${acoesHoje.length} ação programada` : 'Nenhuma ação programada para hoje. Consulte os próximos dias.'}</span></div>
          <button type="button" onClick={() => irPara('calendario')}>Ver calendário</button>
        </article>}
      </div>
    </section>}

    <section className="premium-simple-section premium-simple-access" aria-labelledby="acessos-rapidos">
      <div className="premium-simple-heading"><div><small>ATALHOS</small><h2 id="acessos-rapidos">Acessos rápidos</h2></div></div>
      <div className="premium-shortcuts">
        {atalhosRapidos.map(([icone, titulo, descricao, destino]) => <button key={destino} type="button" onClick={() => irPara(destino)}>
          <i><AppIcon name={icone} size={30} strokeWidth={1.45} /></i>
          <div><strong>{titulo}</strong><span>{descricao}</span></div>
        </button>)}
      </div>
    </section>

    {banners.length > 0 && <section className="premium-banner premium-mobile-home-carousel" aria-label="Novidades e avisos">
      <div className="premium-banner-track" style={{ transform: `translateX(-${(bannerAtual % banners.length) * 100}%)` }}>
        {banners.map((banner, index) => <article key={banner.id || `${banner.titulo}-${index}`} aria-hidden={index !== bannerAtual % banners.length}>
          {banner.imagem ? (
            banner.link ? <a href={banner.link} target="_blank" rel="noopener noreferrer" aria-label={banner.titulo || 'Abrir aviso'}><img src={banner.imagem} alt={banner.titulo || 'Aviso'} loading="lazy" /></a> : <img src={banner.imagem} alt={banner.titulo || 'Aviso'} loading="lazy" />
          ) : <div className="premium-banner-copy"><small>{banner.tag || 'NOVIDADE'}</small><h2>{banner.titulo}</h2><p>{banner.texto}</p>{banner.link && <a href={banner.link} target="_blank" rel="noopener noreferrer">Saiba mais</a>}</div>}
        </article>)}
      </div>
      {banners.length > 1 && <div className="premium-banner-dots">{banners.map((banner, index) => <button key={banner.id || index} type="button" className={index === bannerAtual % banners.length ? 'on' : ''} onClick={() => setBannerAtual(index)} aria-label={`Mostrar aviso ${index + 1}`} />)}</div>}
    </section>}

    <section className="premium-help-card premium-simple-support">
      <div><small>SUPORTE</small><h2>Suporte e Assistente AI</h2><p>Envie sua dúvida para nossa equipe ou use o Assistente AI para uma orientação rápida dentro do aplicativo.</p></div>
      <div className="premium-simple-support-actions">
        <button type="button" onClick={() => irPara('suporte')}>Abrir suporte</button>
        {assistenteLiberado && <button type="button" onClick={() => irPara('assistente')}>Assistente AI</button>}
      </div>
    </section>
  </div>
}
