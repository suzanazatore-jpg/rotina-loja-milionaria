'use client'

import { useEffect, useMemo, useState } from 'react'
import AppIcon from '@/app/components/AppIcon'
import { normalizarPlanoCampanha } from '@/lib/campaignPlan'
import { supabase } from '@/lib/supabase'

export default function CampaignJourney({ item, userId, cores, ouro, ouroGrad, onDownload }) {
  const plano = useMemo(() => normalizarPlanoCampanha(item?.plano_interativo, { preencherPadrao: false }), [item?.plano_interativo])
  const [concluidas, setConcluidas] = useState(new Set())
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!userId || !item?.id) return
      setCarregando(true)
      setErro('')
      const { data, error } = await supabase
        .from('campaign_task_progress')
        .select('task_id')
        .eq('owner_id', userId)
        .eq('campaign_id', item.id)
      if (!ativo) return
      if (error) setErro('Não foi possível carregar seu progresso agora.')
      setConcluidas(new Set((data || []).map(registro => registro.task_id)))
      setCarregando(false)
    }
    void carregar()
    return () => { ativo = false }
  }, [item?.id, userId])

  async function alternar(etapa) {
    if (!userId || salvando) return
    const estavaConcluida = concluidas.has(etapa.id)
    const anterior = new Set(concluidas)
    const proxima = new Set(concluidas)
    if (estavaConcluida) proxima.delete(etapa.id)
    else proxima.add(etapa.id)
    setConcluidas(proxima)
    setSalvando(etapa.id)
    setErro('')

    const resultado = estavaConcluida
      ? await supabase.from('campaign_task_progress').delete().eq('owner_id', userId).eq('campaign_id', item.id).eq('task_id', etapa.id)
      : await supabase.from('campaign_task_progress').insert({ owner_id: userId, campaign_id: item.id, task_id: etapa.id })

    if (resultado.error) {
      setConcluidas(anterior)
      setErro('Não foi possível salvar. Tente novamente.')
    }
    setSalvando('')
  }

  const etapas = plano.etapas || []
  const total = etapas.length
  const feitas = etapas.filter(etapa => concluidas.has(etapa.id)).length
  const percentual = total ? Math.round((feitas / total) * 100) : 0
  const proximaEtapa = etapas.find(etapa => !concluidas.has(etapa.id))
  const proximaFase = proximaEtapa ? plano.fases.find(fase => fase.id === proximaEtapa.fase_id) : null
  const [ano, mes] = String(item.mes_ano || '').split('-').map(Number)
  const periodo = ano && mes ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(ano, mes - 1, 1)) : ''

  return <article className="campaign-journey" style={{ '--journey-card': cores.card, '--journey-card-2': cores.card2, '--journey-border': cores.borda, '--journey-text': cores.tx, '--journey-muted': cores.tx2, '--journey-gold': ouro }}>
    <header className="campaign-journey-header">
      <div className="campaign-journey-mark" style={{ background: ouroGrad }}><AppIcon name="campaigns" size={30} strokeWidth={1.7} /></div>
      <div>
        <small>{periodo.toUpperCase()}</small>
        <p>{item.titulo}</p>
        <span>{plano.objetivo || item.descricao || 'Execute a campanha por fases e acompanhe o avanço até o encerramento.'}</span>
      </div>
    </header>

    <div className="campaign-journey-status">
      <span>{plano.fases.length} {plano.fases.length === 1 ? 'fase' : 'fases'} · {total} {total === 1 ? 'ação' : 'ações'}</span>
      <span className={item.arquivo_url ? 'has-pdf' : ''}>{item.arquivo_url ? '✓ PDF disponível' : '○ Sem PDF complementar'}</span>
    </div>

    <section className="campaign-journey-progress" aria-label={`${feitas} de ${total} ações concluídas`}>
      <div><strong>{percentual}% concluída</strong><span>{feitas} de {total} ações</span></div>
      <div className="campaign-progress-track"><i style={{ width: `${percentual}%`, background: ouroGrad }} /></div>
      <p>{proximaEtapa
        ? <><b>Próximo passo{proximaFase?.titulo ? ` · ${proximaFase.titulo}` : ''}:</b> {proximaEtapa.titulo}</>
        : total
          ? <><b>Campanha concluída.</b> Revise os resultados e registre o que funcionou.</>
          : <><b>Campanha ainda sem ações.</b> O conteúdo interativo será publicado em breve.</>}</p>
    </section>

    <div className="campaign-journey-phases" aria-busy={carregando}>
      {plano.fases.map((fase, faseIndice) => {
        const totalFase = fase.etapas.length
        const feitasFase = fase.etapas.filter(etapa => concluidas.has(etapa.id)).length
        const faseConcluida = totalFase > 0 && feitasFase === totalFase

        return <section key={fase.id} className={`campaign-phase${faseConcluida ? ' is-done' : ''}`}>
          <header className="campaign-phase-header">
            <span className="campaign-phase-number">{faseConcluida ? '✓' : faseIndice + 1}</span>
            <div>
              <small>{fase.periodo || `FASE ${faseIndice + 1}`}</small>
              <h4>{fase.titulo}</h4>
              {fase.descricao && <p>{fase.descricao}</p>}
            </div>
            <b>{feitasFase}/{totalFase}</b>
          </header>

          {fase.etapas.length > 0 && <div className="campaign-journey-list">
            {fase.etapas.map((etapa, indice) => {
              const concluida = concluidas.has(etapa.id)
              return <button key={etapa.id} type="button" className={concluida ? 'is-done' : ''} onClick={() => alternar(etapa)} disabled={carregando || Boolean(salvando)} aria-pressed={concluida}>
                <span className="campaign-step-check">{concluida ? '✓' : indice + 1}</span>
                <i><AppIcon name={etapa.icone} size={19} /></i>
                <span className="campaign-step-copy"><strong>{etapa.titulo}</strong>{etapa.descricao && <small>{etapa.descricao}</small>}</span>
                <span className="campaign-step-action">{salvando === etapa.id ? '...' : concluida ? 'Feita' : 'Marcar'}</span>
              </button>
            })}
          </div>}

          {fase.orientacao && <aside className="campaign-phase-tip"><AppIcon name="assistant" size={18} /><p><strong>Orientação da Suzana</strong><span>{fase.orientacao}</span></p></aside>}
        </section>
      })}
    </div>

    {erro && <p className="campaign-journey-error" role="alert">{erro}</p>}

    {plano.orientacao && <aside className="campaign-journey-tip"><AppIcon name="assistant" size={20} /><p><strong>Orientação geral da Suzana</strong><span>{plano.orientacao}</span></p></aside>}

    {item.arquivo_url && <footer>
      <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer">Ver PDF completo do mês</a>
      <button type="button" onClick={onDownload} style={{ background: ouroGrad }}>Baixar PDF mensal</button>
    </footer>}
  </article>
}
