'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AppIcon from '@/app/components/AppIcon'

const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function HomeDashboard({ nome, saudacao, banners, bannerAtual, setBannerAtual, cores, ouro, ouroGrad, irPara, tema, setTema, mentoriaLiberada, temAcessoPremium, assistenteLiberado }) {
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
  const atalhosBase = [
    ['quickCalendar', 'Calendário', 'Conteúdo do mês', 'calendario'],
    ['quickCampaigns', 'Campanhas', 'Vendas prontas', 'campanhas'],
    ['quickRoutine', 'Rotina', '15 minutos por dia', 'rotina'],
    ['quickTeam', 'Meta da Equipe', 'Metas e resultados', 'vendas'],
    ['quickCourses', 'Meus Cursos', 'Aulas liberadas', 'cursos'],
  ]
  const atalhos = [
    ...atalhosBase.slice(0, 5),
    ['content', 'Precificação', 'Markup e descontos', 'precificacao'],
    ...(mentoriaLiberada ? [['quickCourses', 'Mentorias', 'Aulas gravadas', 'mentoria']] : []),
    ...(temAcessoPremium ? [['premium', 'Conteúdo Premium', 'Aulas exclusivas', 'premium']] : []),
    ...(assistenteLiberado ? [['quickAssistant', 'Assistente AI', 'Ajuda inteligente', 'assistente']] : []),
  ]

  const GradeAtalhos = ({ mobile = false }) => {
    const itens = mobile && assistenteLiberado ? [...atalhosBase, ['quickAssistant', 'Assistente AI', 'Ajuda inteligente', 'assistente']] : (mobile ? atalhosBase : atalhos)
    return <div className={`${mobile ? 'premium-mobile-shortcuts' : 'premium-shortcuts'}`}>{itens.map(([icon, title, subtitle, target]) => <button key={target} onClick={() => irPara(target)}><i><AppIcon name={icon} size={mobile ? 36 : 30} strokeWidth={1.45} /></i><strong>{title}</strong>{!mobile && <span>{subtitle}</span>}</button>)}</div>
  }

  return <div className="premium-home">
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

    <GradeAtalhos mobile />

    <section className="premium-goal-card">
      <div><small>VENDAS DO MÊS</small><strong>{brl(resumo.mes)}</strong><span>{resumo.meta ? `de ${brl(resumo.meta)}` : 'Defina sua primeira meta mensal'}</span></div>
      <div className="premium-goal-side"><b>{pct}%</b><span>da meta</span></div>
      <div className="premium-progress"><i style={{ width: `${Math.min(100, pct)}%`, background: ouroGrad }} /></div>
      <button onClick={() => irPara('vendas')}>{resumo.meta ? 'Lançar vendas' : 'Definir meta mensal'} →</button>
    </section>

    <div className="premium-stats"><article><span>Vendas de hoje</span><strong>{brl(resumo.hoje)}</strong></article><article><span>Progresso mensal</span><strong style={{ color: ouro }}>{pct}%</strong></article></div>

    <div className="premium-section-title"><h2>Acessos rápidos</h2></div>
    <GradeAtalhos />

    <div className="premium-help-card"><div><small>SUPORTE</small><h2>Fale com o Suporte</h2><p>Envie sua dúvida e acompanhe a resposta da nossa equipe pelo aplicativo.</p></div><button onClick={() => irPara('suporte')}>Abrir suporte</button></div>
  </div>
}
