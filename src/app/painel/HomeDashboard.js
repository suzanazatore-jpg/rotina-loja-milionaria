'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AppIcon from '@/app/components/AppIcon'

const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function GradeAtalhos({ mobile = false, atalhos, atalhosBase, irPara, mentoriaLiberada, metasLiberadas }) {
  const itensMobile = [
    ...atalhosBase.slice(0, 4),
    ['quickCourses', 'Meus Cursos', 'Aulas liberadas', 'cursos'],
    ...(mentoriaLiberada ? [['quickCourses', 'Mentorias', 'Aulas gravadas', 'mentoria']] : []),
    ...(metasLiberadas ? [['quickTeam', 'Meta da Equipe', 'Metas e ranking', 'vendas']] : []),
    ['content', 'Materiais', 'Conteúdos liberados', 'conteudos'],
  ]
  const itens = mobile ? itensMobile : atalhos

  return <div className={mobile ? 'premium-mobile-shortcuts' : 'premium-shortcuts'}>{itens.map(([icon, title, subtitle, target]) => <button key={`${target}-${title}`} onClick={() => irPara(target)}><i><AppIcon name={icon} size={mobile ? 36 : 30} strokeWidth={1.45} /></i><strong>{title}</strong>{!mobile && <span>{subtitle}</span>}</button>)}</div>
}

export default function HomeDashboard({ nome, saudacao, banners, bannerAtual, setBannerAtual, cores, ouro, ouroGrad, irPara, tema, setTema, mentoriaLiberada, temAcessoPremium, assistenteLiberado, metasLiberadas }) {
  const [resumo, setResumo] = useState({ meta: 0, mes: 0, hoje: 0 })
  const hoje = useMemo(() => new Date(), [])

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
      const dataHoje = hoje.toISOString().slice(0, 10)
      const [{ data: goal }, { data: sales }] = await Promise.all([
        supabase.from('sales_goals').select('monthly_target').eq('owner_id', user.id).eq('month_start', inicioMes).maybeSingle(),
        supabase.from('daily_sales').select('sale_date,amount').eq('owner_id', user.id).gte('sale_date', inicioMes),
      ])
      const lista = sales || []
      setResumo({ meta: Number(goal?.monthly_target || 0), mes: lista.reduce((s, i) => s + Number(i.amount || 0), 0), hoje: lista.filter(i => i.sale_date === dataHoje).reduce((s, i) => s + Number(i.amount || 0), 0) })
    }
    carregar()
  }, [hoje])

  const pct = resumo.meta ? Math.round(resumo.mes / resumo.meta * 100) : 0
  const falta = Math.max(0, resumo.meta - resumo.mes)
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diasRestantes = Math.max(1, diasNoMes - hoje.getDate() + 1)
  const mediaDiaria = falta / diasRestantes
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

      <section className="premium-banner premium-mobile-banner" aria-label="Novidades">
        <div className="premium-banner-track" style={{ transform: `translateX(-${bannerAtual * 100}%)` }}>
          {banners.map((banner, index) => <article key={banner.id || index}>
            {banner.imagem ? <img src={banner.imagem} alt={banner.titulo || 'Novidade'} /> : <div className="premium-banner-copy"><small>{banner.tag || 'NOVIDADE'}</small><h2>{banner.titulo}</h2><p>{banner.texto}</p>{banner.link && <a href={banner.link} target="_blank" rel="noopener noreferrer">Ver conteúdo</a>}</div>}
          </article>)}
        </div>
        {banners.length > 1 && <div className="premium-banner-dots">{banners.map((_, index) => <button key={index} onClick={() => setBannerAtual(index)} className={index === bannerAtual ? 'on' : ''} aria-label={`Ver banner ${index + 1}`} />)}</div>}
      </section>

      <section className="premium-mobile-sales">
        <h2>Vendas do mês</h2>
        <div>
          <span><i><AppIcon name="campaigns" size={21} /></i><small>Vendido</small><strong>{brl(resumo.mes)}</strong></span>
          <span><i><AppIcon name="goals" size={21} /></i><small>Falta</small><strong>{brl(falta)}</strong></span>
          <span><i><AppIcon name="calendar" size={21} /></i><small>Média diária</small><strong>{brl(mediaDiaria)}</strong></span>
        </div>
      </section>

      <section className="premium-mobile-access">
        <div className="premium-mobile-section-heading"><h2>Acessos rápidos</h2><button onClick={() => irPara('acessos')}>Ver todos <span>›</span></button></div>
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

    <GradeAtalhos mobile atalhos={atalhos} atalhosBase={atalhosBase} irPara={irPara} mentoriaLiberada={mentoriaLiberada} metasLiberadas={metasLiberadas} />

    <section className="premium-goal-card">
      <div><small>VENDAS DO MÊS</small><strong>{brl(resumo.mes)}</strong><span>{resumo.meta ? `de ${brl(resumo.meta)}` : 'Defina sua primeira meta mensal'}</span></div>
      <div className="premium-goal-side"><b>{pct}%</b><span>da meta</span></div>
      <div className="premium-progress"><i style={{ width: `${Math.min(100, pct)}%`, background: ouroGrad }} /></div>
      <div className="premium-goal-footer">
        <span>Vendas de hoje <strong>{brl(resumo.hoje)}</strong></span>
        <button onClick={() => irPara('vendas')}>{resumo.meta ? 'Lançar vendas' : 'Definir meta mensal'} →</button>
      </div>
    </section>

    <div className="premium-section-title"><h2>Acessos rápidos</h2></div>
    <GradeAtalhos atalhos={atalhos} atalhosBase={atalhosBase} irPara={irPara} mentoriaLiberada={mentoriaLiberada} metasLiberadas={metasLiberadas} />

    <div className="premium-help-card"><div><small>SUPORTE</small><h2>Fale com o Suporte</h2><p>Envie sua dúvida e acompanhe a resposta da nossa equipe pelo aplicativo.</p></div><button onClick={() => irPara('suporte')}>Abrir suporte</button></div>
  </div>
}
