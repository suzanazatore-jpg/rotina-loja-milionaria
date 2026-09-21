'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AppIcon from '@/app/components/AppIcon'

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function hojeIso() {
  const data = new Date()
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

function dataBr(valor) {
  const [ano, mes, dia] = String(valor || '').split('-')
  return `${dia}/${mes}/${ano}`
}

function statusDaAcao(progresso, id) {
  return progresso[id] || 'pendente'
}

export default function InteractiveCalendar({ mesAno, actions = [], pdfItem, userId, cores, ouro, ouroGrad, onDownload }) {
  const [dataSelecionada, setDataSelecionada] = useState('')
  const [progresso, setProgresso] = useState({})
  const [salvando, setSalvando] = useState(() => new Set())
  const [erro, setErro] = useState('')
  const hoje = useMemo(() => hojeIso(), [])
  const [ano, mes] = mesAno.split('-').map(Number)
  const actionIdsKey = actions.map(acao => acao.id).join(',')

  const porData = useMemo(() => actions.reduce((mapa, acao) => {
    if (!mapa[acao.action_date]) mapa[acao.action_date] = []
    mapa[acao.action_date].push(acao)
    return mapa
  }, {}), [actions])

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!userId || !actionIdsKey) { setProgresso({}); return }
      const ids = actionIdsKey.split(',')
      const { data, error } = await supabase.from('calendar_action_progress').select('action_id,status').eq('owner_id', userId).in('action_id', ids)
      if (!ativo) return
      if (error) { setErro('Não foi possível carregar seu progresso.'); return }
      setProgresso((data || []).reduce((mapa, item) => ({ ...mapa, [item.action_id]: item.status }), {}))
    }
    void carregar()
    return () => { ativo = false }
  }, [actionIdsKey, userId])

  async function alterarStatus(acao, novoStatus) {
    if (!userId || salvando.has(acao.id)) return
    const anterior = progresso[acao.id]
    setErro('')
    setSalvando(atual => new Set(atual).add(acao.id))
    setProgresso(atual => {
      const proximo = { ...atual }
      if (novoStatus === 'pendente') delete proximo[acao.id]
      else proximo[acao.id] = novoStatus
      return proximo
    })

    const resultado = novoStatus === 'pendente'
      ? await supabase.from('calendar_action_progress').delete().eq('owner_id', userId).eq('action_id', acao.id)
      : await supabase.from('calendar_action_progress').upsert({ owner_id: userId, action_id: acao.id, status: novoStatus, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,action_id' })

    if (resultado.error) {
      setProgresso(atual => {
        const restaurado = { ...atual }
        if (anterior) restaurado[acao.id] = anterior
        else delete restaurado[acao.id]
        return restaurado
      })
      setErro('Não foi possível salvar. Tente novamente.')
    }
    setSalvando(atual => { const proximo = new Set(atual); proximo.delete(acao.id); return proximo })
  }

  const primeiroDia = new Date(ano, mes - 1, 1).getDay()
  const totalDias = new Date(ano, mes, 0).getDate()
  const dias = [...Array(primeiroDia).fill(null), ...Array.from({ length: totalDias }, (_, indice) => indice + 1)]
  const datasComAcoes = Object.keys(porData).sort()
  const datasExtras = datasComAcoes.filter(data => !data.startsWith(`${mesAno}-`))
  const dataAtiva = porData[dataSelecionada] ? dataSelecionada : (porData[hoje] ? hoje : datasComAcoes[0] || `${mesAno}-01`)
  const selecionadas = porData[dataAtiva] || []
  const concluidas = actions.filter(acao => progresso[acao.id] === 'concluido').length
  const percentual = actions.length ? Math.round(concluidas / actions.length * 100) : 0

  return <article className="interactive-calendar interactive-calendar-package" style={{ background: cores.card, borderColor: ouro }}>
    <section className="interactive-calendar-summary interactive-calendar-package-header" style={{ borderColor: cores.borda }}>
      <div><small style={{ color: ouro }}>PLANEJAMENTO COMPLETO DO MÊS</small><h3 style={{ color: cores.tx }}>{pdfItem?.titulo || `${MESES[mes - 1]} de ${ano}`}</h3><p style={{ color: cores.tx2 }}>{pdfItem?.descricao || 'PDF completo e estratégias organizadas para colocar em prática.'}</p></div>
      <div className="interactive-calendar-package-side">
        {actions.length > 0 && <div className="interactive-calendar-progress"><strong style={{ color: ouro }}>{percentual}%</strong><span style={{ background: cores.card2 }}><i style={{ width: `${percentual}%`, background: ouroGrad }} /></span><small style={{ color: cores.tx2 }}>{concluidas} de {actions.length} concluídas</small></div>}
        {pdfItem?.arquivo_url && <div className="interactive-calendar-package-pdf"><a href={pdfItem.arquivo_url} target="_blank" rel="noopener noreferrer">Ver PDF</a><button type="button" onClick={onDownload} style={{ background: ouroGrad }}>Baixar PDF</button></div>}
      </div>
    </section>

    <div className="interactive-calendar-package-status"><span style={{ color: pdfItem?.arquivo_url ? '#55c99a' : cores.tx3 }}>{pdfItem?.arquivo_url ? '✓ PDF disponível' : '○ Sem PDF'}</span><span style={{ color: actions.length ? ouro : cores.tx3 }}>{actions.length} {actions.length === 1 ? 'ação interativa' : 'ações interativas'}</span></div>

    <div className="interactive-calendar-package-body">
      {actions.length > 0 && <>

      {porData[hoje]?.length > 0 && <button type="button" className="interactive-calendar-today" onClick={() => setDataSelecionada(hoje)} style={{ borderColor: ouro, background: cores.card, color: cores.tx }}><AppIcon name="calendar" size={18} /><span><strong>Você tem {porData[hoje].length} {porData[hoje].length === 1 ? 'ação' : 'ações'} para hoje</strong><small style={{ color: cores.tx2 }}>Toque para abrir o plano do dia</small></span><b style={{ color: ouro }}>→</b></button>}

      <section className="interactive-calendar-grid" style={{ background: cores.card, borderColor: cores.borda }}>
        <header>{DIAS.map(dia => <span key={dia} style={{ color: cores.tx3 }}>{dia}</span>)}</header>
        <div>{dias.map((dia, indice) => {
          if (!dia) return <span key={`vazio-${indice}`} />
          const data = `${mesAno}-${String(dia).padStart(2, '0')}`
          const acoesDia = porData[data] || []
          const todasConcluidas = acoesDia.length > 0 && acoesDia.every(acao => progresso[acao.id] === 'concluido')
          const selecionado = dataAtiva === data
          return <button key={data} type="button" onClick={() => setDataSelecionada(data)} className={`${selecionado ? 'selected ' : ''}${data === hoje ? 'today ' : ''}${todasConcluidas ? 'done' : ''}`} style={{ color: cores.tx, borderColor: selecionado ? ouro : 'transparent', background: selecionado ? cores.card2 : 'transparent' }}><b>{dia}</b>{acoesDia.length > 0 && <small style={{ background: todasConcluidas ? '#55c99a' : ouro, color: '#101010' }}>{acoesDia.length}</small>}</button>
        })}</div>
      </section>

      {datasExtras.length > 0 && <section className="interactive-calendar-continuation" style={{ borderColor: cores.borda, background: cores.card }}>
        <div><small style={{ color: ouro }}>CONTINUAÇÃO DO PLANEJAMENTO</small><strong style={{ color: cores.tx }}>Primeiros dias do mês seguinte</strong><span style={{ color: cores.tx2 }}>Essas ações fazem parte deste mesmo calendário mensal.</span></div>
        <div>{datasExtras.map(data => {
          const acoesDia = porData[data] || []
          const todasConcluidas = acoesDia.length > 0 && acoesDia.every(acao => progresso[acao.id] === 'concluido')
          const selecionado = dataAtiva === data
          return <button key={data} type="button" onClick={() => setDataSelecionada(data)} className={`${selecionado ? 'selected ' : ''}${todasConcluidas ? 'done' : ''}`} style={{ borderColor: selecionado ? ouro : cores.borda, background: selecionado ? cores.card2 : 'transparent', color: cores.tx }}><b>{dataBr(data).slice(0, 5)}</b><small style={{ color: todasConcluidas ? '#55c99a' : ouro }}>{acoesDia.length} {acoesDia.length === 1 ? 'ação' : 'ações'}</small></button>
        })}</div>
      </section>}

      <section className="interactive-calendar-day">
        <div className="interactive-calendar-day-heading"><div><small style={{ color: ouro }}>PLANO DO DIA</small><h3 style={{ color: cores.tx }}>{dataBr(dataAtiva)}</h3></div><span style={{ color: cores.tx2 }}>{selecionadas.length} {selecionadas.length === 1 ? 'ação' : 'ações'}</span></div>
        {selecionadas.map(acao => {
          const status = statusDaAcao(progresso, acao.id)
          return <article key={acao.id} className={`interactive-calendar-action status-${status}`} style={{ background: cores.card, borderColor: cores.borda }}>
            <header><div><small>{[acao.channel, acao.content_format].filter(Boolean).join(' • ') || 'AÇÃO COMERCIAL'}</small><h4 style={{ color: cores.tx }}>{acao.title}</h4></div><span>{status === 'concluido' ? 'Concluída' : status === 'iniciado' ? 'Em andamento' : 'Pendente'}</span></header>
            {acao.description && <p style={{ color: cores.tx2 }}>{acao.description}</p>}
            {acao.product_cta && <div className="interactive-calendar-detail"><small style={{ color: cores.tx3 }}>PRODUTO E CHAMADA</small><strong style={{ color: cores.tx }}>{acao.product_cta}</strong></div>}
            {acao.content_text && <div className="interactive-calendar-copy" style={{ background: cores.card2, color: cores.tx2 }}>{acao.content_text}</div>}
            <footer>
              {acao.material_url && <a href={acao.material_url} target="_blank" rel="noopener noreferrer">Abrir material ↗</a>}
              <div>{status !== 'pendente' && <button type="button" onClick={() => alterarStatus(acao, 'pendente')} disabled={salvando.has(acao.id)}>Reabrir</button>}{status === 'pendente' && <button type="button" onClick={() => alterarStatus(acao, 'iniciado')} disabled={salvando.has(acao.id)}>Começar</button>}{status !== 'concluido' && <button type="button" className="primary" onClick={() => alterarStatus(acao, 'concluido')} disabled={salvando.has(acao.id)}>✓ Marcar como concluída</button>}</div>
            </footer>
          </article>
        })}
        {!selecionadas.length && <div className="interactive-calendar-empty" style={{ background: cores.card, borderColor: cores.borda, color: cores.tx2 }}>Nenhuma ação programada para esta data.</div>}
      </section>
      {erro && <p className="interactive-calendar-error">{erro}</p>}
      </>}
      {!actions.length && <div className="interactive-calendar-empty" style={{ background: cores.card2, borderColor: cores.borda, color: cores.tx2 }}>{pdfItem?.arquivo_url ? 'O PDF deste mês está disponível. As estratégias interativas serão adicionadas aqui.' : 'O planejamento deste mês ainda não foi publicado.'}</div>}
    </div>
  </article>
}
