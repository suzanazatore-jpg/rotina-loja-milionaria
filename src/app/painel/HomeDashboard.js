'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AppIcon from '@/app/components/AppIcon'
import { planoDoDia } from '@/lib/dailyPlan'

const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`

function capitalizar(valor) {
  return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : ''
}

function GradeAtalhos({ mobile = false, atalhos, atalhosBase, irPara, mentoriaLiberada, metasLiberadas }) {
  const itensMobile = [
    ...atalhosBase.slice(0, 4),
    ['quickCourses', 'Meus Cursos', 'Aulas liberadas', 'cursos'],
    ...(mentoriaLiberada ? [['quickCourses', 'Mentorias', 'Aulas gravadas', 'mentoria']] : []),

  ]
  const itens = mobile ? itensMobile : atalhos

  return <div className={mobile ? 'premium-mobile-shortcuts' : 'premium-shortcuts'}>{itens.map(([icon, title, subtitle, target]) => <button key={`${target}-${title}`} onClick={() => irPara(target)}><i><AppIcon name={icon} size={mobile ? 36 : 30} strokeWidth={1.45} /></i><strong>{title}</strong>{!mobile && <span>{subtitle}</span>}</button>)}</div>
}

function PlanoHoje({ plano, concluidas, salvando, erro, alternar, mediaDiaria, irPara, mobile = false }) {
  const tarefas = plano.tarefas.filter(tarefa => tarefa.titulo)
  const totalConcluidas = tarefas.filter(tarefa => concluidas.has(tarefa.id)).length
  const percentual = tarefas.length ? Math.round(totalConcluidas / tarefas.length * 100) : 0

  return <section className={`premium-daily-plan ${mobile ? 'premium-daily-plan-mobile' : ''}`} aria-labelledby={mobile ? 'plano-hoje-mobile' : 'plano-hoje-desktop'}>
    <article className="premium-daily-focus">
      <small><AppIcon name="goals" size={15} /> FOCO COMERCIAL DO DIA</small>
      <h2>{plano.foco_titulo}</h2>
      <p>{plano.foco_descricao}</p>
    </article>

    <div className="premium-daily-heading">
      <h2 id={mobile ? 'plano-hoje-mobile' : 'plano-hoje-desktop'}>Seu plano de hoje</h2>
      <span>{totalConcluidas} de {tarefas.length} concluídas</span>
    </div>
    <div className="premium-daily-progress" aria-label={`${percentual}% do plano concluído`}><i style={{ width: `${percentual}%` }} /></div>

    <div className="premium-daily-tasks">
      {tarefas.map(tarefa => {
        const concluida = concluidas.has(tarefa.id)
        const descricao = tarefa.descricao.replace('{meta_diaria}', brl(mediaDiaria))
        return <button key={tarefa.id} type="button" className={concluida ? 'done' : ''} onClick={() => alternar(tarefa.id)} disabled={salvando.has(tarefa.id)} aria-pressed={concluida}>
          <span className="premium-daily-check" aria-hidden="true">{concluida ? '✓' : ''}</span>
          <span className="premium-daily-task-copy"><strong>{tarefa.titulo}</strong><small>{descricao}</small></span>
          <AppIcon name={tarefa.icone} size={18} />
        </button>
      })}
    </div>

    {erro && <p className="premium-daily-error" role="status">{erro}</p>}

    <article className="premium-daily-guidance">
      <span aria-hidden="true">✣</span>
      <div><strong>Próxima orientação da Suzana</strong><p>{plano.orientacao}</p></div>
      <button type="button" onClick={() => irPara('rotina')}>Ver rotina</button>
    </article>
  </section>
}

function AgendaCalendarioHoje({ acoes, irPara }) {
  if (!acoes.length) return null
  return <section className="premium-calendar-today-card">
    <header><div><small>CALENDÁRIO DE CONTEÚDO</small><h2>{acoes.length === 1 ? '1 ação programada para hoje' : `${acoes.length} ações programadas para hoje`}</h2></div><AppIcon name="calendar" size={22} /></header>
    <div>{acoes.slice(0, 3).map(acao => <article key={acao.id}><span>•</span><div><strong>{acao.title}</strong><small>{[acao.channel, acao.content_format].filter(Boolean).join(' • ') || 'Abra para ver a orientação completa'}</small></div></article>)}</div>
    <button type="button" onClick={() => irPara('calendario')}>Abrir ações de hoje →</button>
  </section>
}

export default function HomeDashboard({ userId, nome, saudacao, banners, bannerAtual, setBannerAtual, cores, ouro, ouroGrad, irPara, tema, setTema, mentoriaLiberada, temAcessoPremium, assistenteLiberado, metasLiberadas, rotinaSemanal, calendarActions = [] }) {
  const [resumo, setResumo] = useState({ meta: 0, mes: 0, hoje: 0 })
  const [concluidas, setConcluidas] = useState(() => new Set())
  const [salvandoTarefas, setSalvandoTarefas] = useState(() => new Set())
  const [erroProgresso, setErroProgresso] = useState('')
  const hoje = useMemo(() => new Date(), [])
  const dataHoje = useMemo(() => dataLocal(hoje), [hoje])
  const planoHoje = useMemo(() => planoDoDia(rotinaSemanal?.plano_dias, hoje), [hoje, rotinaSemanal?.plano_dias])
  const acoesHoje = useMemo(() => calendarActions.filter(acao => acao.action_date === dataHoje), [calendarActions, dataHoje])

  useEffect(() => {
    async function carregar() {
      if (!userId) return
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
      const [{ data: goal }, { data: sales }] = await Promise.all([
        supabase.from('sales_goals').select('monthly_target').eq('owner_id', userId).eq('month_start', inicioMes).maybeSingle(),
        supabase.from('daily_sales').select('sale_date,amount').eq('owner_id', userId).gte('sale_date', inicioMes),
      ])
      const lista = sales || []
      setResumo({ meta: Number(goal?.monthly_target || 0), mes: lista.reduce((s, i) => s + Number(i.amount || 0), 0), hoje: lista.filter(i => i.sale_date === dataHoje).reduce((s, i) => s + Number(i.amount || 0), 0) })
    }
    carregar()
  }, [dataHoje, hoje, userId])

  useEffect(() => {
    let ativo = true
    async function carregarProgresso() {
      if (!userId) return
      const { data, error } = await supabase.from('daily_task_progress').select('task_id').eq('owner_id', userId).eq('task_date', dataHoje)
      if (!ativo) return
      if (error) {
        setErroProgresso('Não foi possível carregar seu progresso agora.')
        return
      }
      setConcluidas(new Set((data || []).map(item => item.task_id)))
    }
    void carregarProgresso()
    return () => { ativo = false }
  }, [dataHoje, userId])

  async function alternarTarefa(taskId) {
    if (!userId || salvandoTarefas.has(taskId)) return
    const estavaConcluida = concluidas.has(taskId)
    setErroProgresso('')
    setSalvandoTarefas(atual => new Set(atual).add(taskId))
    setConcluidas(atual => {
      const proximo = new Set(atual)
      if (estavaConcluida) proximo.delete(taskId)
      else proximo.add(taskId)
      return proximo
    })

    const resultado = estavaConcluida
      ? await supabase.from('daily_task_progress').delete().eq('owner_id', userId).eq('task_date', dataHoje).eq('task_id', taskId)
      : await supabase.from('daily_task_progress').insert({ owner_id: userId, task_date: dataHoje, task_id: taskId })

    if (resultado.error) {
      setConcluidas(atual => {
        const restaurado = new Set(atual)
        if (estavaConcluida) restaurado.add(taskId)
        else restaurado.delete(taskId)
        return restaurado
      })
      setErroProgresso('Não foi possível salvar. Toque novamente para tentar.')
    }
    setSalvandoTarefas(atual => { const proximo = new Set(atual); proximo.delete(taskId); return proximo })
  }

  const pct = resumo.meta ? Math.round(resumo.mes / resumo.meta * 100) : 0
  const falta = Math.max(0, resumo.meta - resumo.mes)
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diasRestantes = Math.max(1, diasNoMes - hoje.getDate() + 1)
  const mediaDiaria = falta / diasRestantes
  const dataPorExtenso = capitalizar(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(hoje))
  const mesAtual = capitalizar(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(hoje))
  const atalhosBase = [
    ['quickCalendar', 'Calendário', 'Conteúdo do mês', 'calendario'],
    ['quickCampaigns', 'Campanhas', 'Vendas prontas', 'campanhas'],
    ['quickRoutine', 'Rotina', '15 minutos por dia', 'rotina'],
    ['quickTeam', 'Calculadora de Metas', metasLiberadas ? 'Metas, ranking e histórico' : 'Conteúdo do plano', 'vendas'],
    ['quickCourses', 'Meus Cursos', 'Aulas liberadas', 'cursos'],
  ]
  const atalhos = [
    ...atalhosBase.slice(0, 5),
    ['content', 'Precificação', 'Markup e descontos', 'precificacao'],
    ...(mentoriaLiberada ? [['quickCourses', 'Mentorias', 'Aulas gravadas', 'mentoria']] : []),
    ...(temAcessoPremium ? [['premium', 'Conteúdo Premium', 'Aulas exclusivas', 'premium']] : []),
    ...(assistenteLiberado ? [['quickAssistant', 'Assistente AI', 'Ajuda inteligente', 'assistente']] : []),
  ]

  return <div className="premium-home">
    <div className="premium-mobile-home">
      <section className="premium-mobile-top">
        <header className="premium-mobile-header">
          <div className="premium-brand"><b>R</b><span>ROTINA DA<strong>LOJA MILIONÁRIA</strong></span></div>
          <div className="premium-theme-switch" aria-label="Escolher tema"><button className={tema === 'claro' ? 'on' : ''} onClick={() => setTema('claro')} aria-label="Usar tema claro">☀</button><button className={tema === 'escuro' ? 'on' : ''} onClick={() => setTema('escuro')} aria-label="Usar tema escuro">☾</button></div>
        </header>

        <p className="premium-mobile-greeting">{saudacao}, <strong>{nome}</strong></p>

        <div className="premium-mobile-goal" aria-label="Boas-vindas">
          <div className="premium-mobile-goal-copy">
            <span>ROTINA DA LOJA MILIONÁRIA</span>
            <strong>Vamos colocar sua loja em movimento?</strong>
          </div>
          <div className="premium-mobile-goal-photo" aria-hidden="true"><img src="/suzana-autoridade.jpg" alt="" /></div>
        </div>
      </section>

      <section className="premium-mobile-today">
        <p className="premium-mobile-date"><AppIcon name="calendar" size={14} /> {dataPorExtenso}</p>
        <article className="premium-mobile-month-goal">
          <header><strong>META DA LOJA</strong><span>{mesAtual}</span></header>
          <div className="premium-mobile-month-values">
            <span><small>Meta</small><b>{brl(resumo.meta)}</b></span>
            <span><small>Vendido</small><b>{brl(resumo.mes)}</b></span>
            <span><small>Faltam</small><b>{brl(falta)}</b></span>
          </div>
          <div className="premium-mobile-month-progress"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <footer><span>{pct}% da meta alcançada</span><span>{diasRestantes} {diasRestantes === 1 ? 'dia restante' : 'dias restantes'}</span></footer>
        </article>
        <article className="premium-mobile-today-sales">
          <span><small>VENDAS REGISTRADAS HOJE</small><strong>{brl(resumo.hoje)}</strong></span>
          <button type="button" onClick={() => irPara('lancar-venda')}><b>＋ Lançar venda de hoje</b><small>Registre o resultado da equipe</small></button>
        </article>
      </section>

      <PlanoHoje plano={planoHoje} concluidas={concluidas} salvando={salvandoTarefas} erro={erroProgresso} alternar={alternarTarefa} mediaDiaria={mediaDiaria} irPara={irPara} mobile />
      <AgendaCalendarioHoje acoes={acoesHoje} irPara={irPara} />

      <section className="premium-banner premium-mobile-banner" aria-label="Novidades">
        <div className="premium-banner-track" style={{ transform: `translateX(-${bannerAtual * 100}%)` }}>
          {banners.map((banner, index) => <article key={banner.id || index}>
            {banner.imagem ? <img src={banner.imagem} alt={banner.titulo || 'Novidade'} /> : <div className="premium-banner-copy"><small>{banner.tag || 'NOVIDADE'}</small><h2>{banner.titulo}</h2><p>{banner.texto}</p>{banner.link && <a href={banner.link} target="_blank" rel="noopener noreferrer">Ver conteúdo</a>}</div>}
          </article>)}
        </div>
        {banners.length > 1 && <div className="premium-banner-dots">{banners.map((_, index) => <button key={index} onClick={() => setBannerAtual(index)} className={index === bannerAtual ? 'on' : ''} aria-label={`Ver banner ${index + 1}`} />)}</div>}
      </section>

      <section className="premium-mobile-access">
        <div className="premium-mobile-section-heading"><h2>Acessos rápidos</h2></div>
        <GradeAtalhos mobile atalhos={atalhos} atalhosBase={atalhosBase} irPara={irPara} mentoriaLiberada={mentoriaLiberada} metasLiberadas={metasLiberadas} />
      </section>

      <section className="premium-mobile-continue">
        <h2>Continue de onde parou</h2>
        <button onClick={() => irPara('cursos')}>
          <i><AppIcon name="quickCourses" size={28} /></i>
          <span><strong>Continue seus estudos</strong><small>Acesse suas aulas liberadas</small></span>
          <b>›</b>
        </button>
      </section>

      <section className="premium-mobile-support-card">
        <div><small>SUPORTE</small><h2>Fale com o Suporte</h2><p>Envie sua dúvida e acompanhe a resposta da nossa equipe pelo aplicativo.</p></div>
        <button onClick={() => irPara('suporte')}>Abrir suporte</button>
      </section>
    </div>

    <header className="premium-welcome">
      <div className="premium-brand"><b>R</b><span>ROTINA DA<strong>LOJA MILIONÁRIA</strong></span></div>
      <div className="premium-welcome-copy"><p>{saudacao},</p><h1>{nome}!</h1><span>Vamos colocar sua loja em movimento?</span></div>
      <div className="premium-header-goal"><span>Meta do mês <b>{pct}%</b></span><div><i style={{ width: `${Math.min(100, pct)}%` }} /></div></div>
      <div className="premium-suzana-photo" aria-hidden="true"><img src="/suzana-autoridade.jpg" alt="" /></div>
      <div className="premium-theme-switch" aria-label="Escolher tema"><button className={tema === 'claro' ? 'on' : ''} onClick={() => setTema('claro')} aria-label="Usar tema claro">☀</button><button className={tema === 'escuro' ? 'on' : ''} onClick={() => setTema('escuro')} aria-label="Usar tema escuro">☾</button></div>
      <section className="premium-banner" aria-label="Novidades">
        <div className="premium-banner-track" style={{ transform: `translateX(-${bannerAtual * 100}%)` }}>
          {banners.map((banner, index) => <article key={banner.id || index}>
            {banner.imagem ? <img src={banner.imagem} alt={banner.titulo || 'Novidade'} /> : <div className="premium-banner-copy"><small>{banner.tag || 'NOVIDADE'}</small><h2>{banner.titulo}</h2><p>{banner.texto}</p>{banner.link && <a href={banner.link} target="_blank" rel="noopener noreferrer">Ver agora</a>}</div>}
          </article>)}
        </div>
        {banners.length > 1 && <div className="premium-banner-dots">{banners.map((_, index) => <button key={index} onClick={() => setBannerAtual(index)} className={index === bannerAtual ? 'on' : ''} aria-label={`Ver banner ${index + 1}`} />)}</div>}
      </section>
    </header>

    <section className="premium-goal-card">
      <div><small>VENDAS DO MÊS</small><strong>{brl(resumo.mes)}</strong><span>{resumo.meta ? `de ${brl(resumo.meta)}` : 'Defina sua primeira meta mensal'}</span></div>
      <div className="premium-goal-side"><b>{pct}%</b><span>da meta</span></div>
      <div className="premium-progress"><i style={{ width: `${Math.min(100, pct)}%`, background: ouroGrad }} /></div>
      <div className="premium-goal-footer">
        <span>Vendas de hoje <strong>{brl(resumo.hoje)}</strong></span>
        <button onClick={() => irPara('lancar-venda')}>＋ Lançar venda de hoje →</button>
      </div>
    </section>

    <PlanoHoje plano={planoHoje} concluidas={concluidas} salvando={salvandoTarefas} erro={erroProgresso} alternar={alternarTarefa} mediaDiaria={mediaDiaria} irPara={irPara} />
    <AgendaCalendarioHoje acoes={acoesHoje} irPara={irPara} />

    <div className="premium-section-title"><h2>Acessos rápidos</h2></div>
    <GradeAtalhos atalhos={atalhos} atalhosBase={atalhosBase} irPara={irPara} mentoriaLiberada={mentoriaLiberada} metasLiberadas={metasLiberadas} />

    <div className="premium-help-card"><div><small>SUPORTE</small><h2>Fale com o Suporte</h2><p>Envie sua dúvida e acompanhe a resposta da nossa equipe pelo aplicativo.</p></div><button onClick={() => irPara('suporte')}>Abrir suporte</button></div>
  </div>
}
