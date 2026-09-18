'use client'

import { useEffect, useMemo, useState } from 'react'
import AppIcon from '@/app/components/AppIcon'
import { normalizarPlanoCampanha } from '@/lib/campaignPlan'
import { supabase } from '@/lib/supabase'

export default function CampaignJourney({ item, userId, cores, ouro, ouroGrad, onDownload }) {
  const plano = useMemo(() => normalizarPlanoCampanha(item?.plano_interativo), [item?.plano_interativo])
  const [concluidas, setConcluidas] = useState(new Set())
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    async function carregar() {
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
    if (userId && item?.id) void carregar()
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

  const total = plano.etapas.length
  const feitas = plano.etapas.filter(etapa => concluidas.has(etapa.id)).length
  const percentual = total ? Math.round((feitas / total) * 100) : 0
  const proximaEtapa = plano.etapas.find(etapa => !concluidas.has(etapa.id))

  return <article className="campaign-journey" style={{ '--journey-card': cores.card, '--journey-card-2': cores.card2, '--journey-border': cores.borda, '--journey-text': cores.tx, '--journey-muted': cores.tx2, '--journey-gold': ouro }}>
    <header className="campaign-journey-header">
      <div className="campaign-journey-mark" style={{ background: ouroGrad }}><AppIcon name="campaigns" size={30} strokeWidth={1.7} /></div>
      <div>
        <p>{item.titulo}</p>
        <span>{plano.objetivo}</span>
      </div>
    </header>

    <section className="campaign-journey-progress" aria-label={`${feitas} de ${total} etapas concluídas`}>
      <div><strong>{percentual}% concluída</strong><span>{feitas} de {total} etapas</span></div>
      <div className="campaign-progress-track"><i style={{ width: `${percentual}%`, background: ouroGrad }} /></div>
      <p>{proximaEtapa ? <><b>Próximo passo:</b> {proximaEtapa.titulo}</> : <><b>Campanha concluída.</b> Revise os resultados e repita o que funcionou.</>}</p>
    </section>

    <div className="campaign-journey-list" aria-busy={carregando}>
      {plano.etapas.map((etapa, indice) => {
        const concluida = concluidas.has(etapa.id)
        return <button key={etapa.id} type="button" className={concluida ? 'is-done' : ''} onClick={() => alternar(etapa)} disabled={carregando || Boolean(salvando)} aria-pressed={concluida}>
          <span className="campaign-step-check">{concluida ? '✓' : indice + 1}</span>
          <i><AppIcon name={etapa.icone} size={19} /></i>
          <span className="campaign-step-copy"><strong>{etapa.titulo}</strong><small>{etapa.descricao}</small></span>
          <span className="campaign-step-action">{salvando === etapa.id ? '...' : concluida ? 'Feita' : 'Marcar'}</span>
        </button>
      })}
    </div>

    {erro && <p className="campaign-journey-error" role="alert">{erro}</p>}
    <aside className="campaign-journey-tip"><AppIcon name="assistant" size={20} /><p><strong>Orientação da Suzana</strong><span>{plano.orientacao}</span></p></aside>

    {item.arquivo_url && <footer>
      <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer">Ver material complementar</a>
      <button type="button" onClick={onDownload} style={{ background: ouroGrad }}>Baixar PDF</button>
    </footer>}
  </article>
}
