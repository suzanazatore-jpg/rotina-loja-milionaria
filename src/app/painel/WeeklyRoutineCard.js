'use client'

import { useEffect, useMemo, useState } from 'react'
import AppIcon from '@/app/components/AppIcon'
import { DIAS_PLANO, normalizarPlanoDias } from '@/lib/dailyPlan'
import { supabase } from '@/lib/supabase'

function dataLocal(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

function dataDaSemana(inicio, chave) {
  const data = new Date(`${inicio}T12:00:00`)
  const deslocamento = chave === '0' ? 6 : Number(chave) - 1
  data.setDate(data.getDate() + deslocamento)
  return dataLocal(data)
}

function dataCurta(valor) {
  const [, mes, dia] = String(valor || '').split('-')
  return `${dia}/${mes}`
}

function rotuloSemana(inicio) {
  return `${dataCurta(inicio)} a ${dataCurta(dataDaSemana(inicio, '0'))}`
}

function chaveInicial(inicio) {
  const hoje = dataLocal(new Date())
  const fim = dataDaSemana(inicio, '0')
  if (hoje < inicio || hoje > fim) return '1'
  return String(new Date().getDay())
}

export default function WeeklyRoutineCard({ item, userId, cores, ouro, ouroGrad, onDownload }) {
  const plano = useMemo(() => normalizarPlanoDias(item?.plano_dias), [item?.plano_dias])
  const [diaAtivo, setDiaAtivo] = useState(() => chaveInicial(item.semana_inicio))
  const [concluidas, setConcluidas] = useState(() => new Set())
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!userId || !item?.semana_inicio) return
      setCarregando(true)
      setErro('')
      const fim = dataDaSemana(item.semana_inicio, '0')
      const { data, error } = await supabase
        .from('daily_task_progress')
        .select('task_date,task_id')
        .eq('owner_id', userId)
        .gte('task_date', item.semana_inicio)
        .lte('task_date', fim)
      if (!ativo) return
      if (error) setErro('Não foi possível carregar o progresso desta semana.')
      setConcluidas(new Set((data || []).map(registro => `${registro.task_date}|${registro.task_id}`)))
      setCarregando(false)
    }
    void carregar()
    return () => { ativo = false }
  }, [item?.semana_inicio, userId])

  async function alternar(tarefa) {
    if (!userId || salvando) return
    const dataTarefa = dataDaSemana(item.semana_inicio, diaAtivo)
    const chave = `${dataTarefa}|${tarefa.id}`
    const estavaConcluida = concluidas.has(chave)
    const anterior = new Set(concluidas)
    const proxima = new Set(concluidas)
    if (estavaConcluida) proxima.delete(chave)
    else proxima.add(chave)
    setConcluidas(proxima)
    setSalvando(chave)
    setErro('')

    const resultado = estavaConcluida
      ? await supabase.from('daily_task_progress').delete().eq('owner_id', userId).eq('task_date', dataTarefa).eq('task_id', tarefa.id)
      : await supabase.from('daily_task_progress').insert({ owner_id: userId, task_date: dataTarefa, task_id: tarefa.id })

    if (resultado.error) {
      setConcluidas(anterior)
      setErro('Não foi possível salvar. Toque novamente para tentar.')
    }
    setSalvando('')
  }

  const todasTarefas = DIAS_PLANO.flatMap(dia => (plano[dia.key]?.tarefas || []).filter(tarefa => tarefa.titulo).map(tarefa => ({ ...tarefa, dia: dia.key })))
  const totalConcluidas = todasTarefas.filter(tarefa => concluidas.has(`${dataDaSemana(item.semana_inicio, tarefa.dia)}|${tarefa.id}`)).length
  const percentual = todasTarefas.length ? Math.round(totalConcluidas / todasTarefas.length * 100) : 0
  const dia = DIAS_PLANO.find(opcao => opcao.key === diaAtivo) || DIAS_PLANO[0]
  const planoAtivo = plano[diaAtivo]
  const dataAtiva = dataDaSemana(item.semana_inicio, diaAtivo)
  const tarefasAtivas = (planoAtivo?.tarefas || []).filter(tarefa => tarefa.titulo)

  return <article className="routine-week-card" style={{ '--routine-card': cores.card, '--routine-card-2': cores.card2, '--routine-border': cores.borda, '--routine-text': cores.tx, '--routine-muted': cores.tx2, '--routine-gold': ouro }}>
    <header className="routine-week-header">
      <div className="routine-week-mark" style={{ background: ouroGrad }}><AppIcon name="routine" size={30} strokeWidth={1.7} /></div>
      <div><small>ROTINA DE {rotuloSemana(item.semana_inicio)}</small><h3>{item.titulo}</h3><p>{item.descricao || 'Ações organizadas para manter a loja e a equipe em movimento.'}</p></div>
    </header>

    <section className="routine-week-progress" aria-label={`${totalConcluidas} de ${todasTarefas.length} ações concluídas`}>
      <div><strong>{percentual}% concluída</strong><span>{totalConcluidas} de {todasTarefas.length} ações</span></div>
      <div className="routine-progress-track"><i style={{ width: `${percentual}%`, background: ouroGrad }} /></div>
    </section>

    <nav className="routine-week-days" aria-label="Dias da rotina">
      {DIAS_PLANO.map(opcao => {
        const tarefas = (plano[opcao.key]?.tarefas || []).filter(tarefa => tarefa.titulo)
        const feitas = tarefas.filter(tarefa => concluidas.has(`${dataDaSemana(item.semana_inicio, opcao.key)}|${tarefa.id}`)).length
        return <button key={opcao.key} type="button" className={diaAtivo === opcao.key ? 'is-active' : ''} onClick={() => setDiaAtivo(opcao.key)}><strong>{opcao.curto}</strong><small>{dataCurta(dataDaSemana(item.semana_inicio, opcao.key))}</small><span>{feitas}/{tarefas.length}</span></button>
      })}
    </nav>

    <section className="routine-day-focus">
      <small>{dia.nome.toUpperCase()} • FOCO COMERCIAL</small>
      <h4>{planoAtivo?.foco_titulo}</h4>
      <p>{planoAtivo?.foco_descricao}</p>
    </section>

    <div className="routine-week-tasks" aria-busy={carregando}>
      {tarefasAtivas.map(tarefa => {
        const chave = `${dataAtiva}|${tarefa.id}`
        const concluida = concluidas.has(chave)
        const descricao = String(tarefa.descricao || '').replace('{meta_diaria}', 'consulte sua meta de hoje')
        return <button key={tarefa.id} type="button" className={concluida ? 'is-done' : ''} onClick={() => alternar(tarefa)} disabled={carregando || Boolean(salvando)} aria-pressed={concluida}>
          <span className="routine-task-check">{concluida ? '✓' : ''}</span>
          <i><AppIcon name={tarefa.icone} size={19} /></i>
          <span><strong>{tarefa.titulo}</strong><small>{descricao}</small></span>
          <b>{salvando === chave ? '...' : concluida ? 'Feita' : 'Marcar'}</b>
        </button>
      })}
    </div>

    {erro && <p className="routine-week-error" role="alert">{erro}</p>}
    <aside className="routine-week-tip"><AppIcon name="assistant" size={20} /><div><strong>Orientação da Suzana</strong><p>{planoAtivo?.orientacao}</p></div></aside>

    {item.arquivo_url && <footer><a href={item.arquivo_url} target="_blank" rel="noopener noreferrer">Ver PDF da rotina</a><button type="button" onClick={onDownload} style={{ background: ouroGrad }}>Baixar PDF</button></footer>}
  </article>
}
