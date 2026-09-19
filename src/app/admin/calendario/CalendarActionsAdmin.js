'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '14px' }
const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer' }
const NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesAtual() {
  const data = new Date()
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

function mesesDisponiveis() {
  const hoje = new Date()
  return Array.from({ length: 25 }, (_, indice) => {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - 6 + indice, 1)
    return {
      valor: `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`,
      rotulo: `${NOMES[data.getMonth()]} ${data.getFullYear()}`,
    }
  })
}

function dataIso(valor, mesAno) {
  const limpo = String(valor || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo
  const partes = limpo.split(/[\/.\-]/).filter(Boolean).map(Number)
  const [anoBase, mesBase] = mesAno.split('-').map(Number)
  let dia
  let mes = mesBase
  let ano = anoBase

  if (partes.length === 1) [dia] = partes
  if (partes.length === 2) [dia, mes] = partes
  if (partes.length === 3) [dia, mes, ano] = partes
  if (!dia || !mes || !ano) throw new Error(`Data inválida: ${limpo || 'vazia'}`)
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function separarLinha(linha) {
  if (linha.includes('\t')) return linha.split('\t')
  if (linha.includes('|')) return linha.split('|')
  return linha.split(';')
}

function interpretarLote(texto, mesAno) {
  const linhas = String(texto || '').split(/\r?\n/).map(linha => linha.trim()).filter(Boolean)
  if (!linhas.length) throw new Error('Cole ou envie pelo menos uma ação.')

  return linhas
    .filter((linha, indice) => !(indice === 0 && /^data\b/i.test(linha)))
    .map((linha, indice) => {
      const colunas = separarLinha(linha).map(valor => valor.trim())
      if (colunas.length < 2) throw new Error(`A linha ${indice + 1} precisa ter data e tema.`)
      return {
        action_date: dataIso(colunas[0], mesAno),
        title: colunas[1],
        description: colunas[2] || null,
        channel: colunas[3] || null,
        content_format: colunas[4] || null,
        product_cta: colunas[5] || null,
        content_text: colunas[6] || null,
        material_url: colunas[7] || null,
        sort_order: indice,
      }
    })
}

function formVazio(mesAno) {
  return {
    action_date: `${mesAno}-01`, title: '', description: '', channel: '', content_format: '',
    product_cta: '', content_text: '', material_url: '', is_published: true,
  }
}

function dataBr(valor) {
  const [ano, mes, dia] = String(valor).split('-')
  return `${dia}/${mes}/${ano}`
}

function rotuloMes(valor) {
  const [ano, mes] = String(valor || '').split('-')
  return `${NOMES[Number(mes) - 1] || ''} ${ano}`.trim()
}

export default function CalendarActionsAdmin({
  token,
  calendarios = [],
  onEditarCalendario,
  onSubstituirCalendario,
  onExcluirCalendario,
  onNovoCalendario,
  onCalendarioAtualizado,
}) {
  const [mesAno, setMesAno] = useState(mesAtual())
  const [acoes, setAcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [modo, setModo] = useState(null)
  const [lote, setLote] = useState('')
  const [arquivoFonte, setArquivoFonte] = useState(null)
  const [acoesPreparadas, setAcoesPreparadas] = useState([])
  const [acoesEmEdicao, setAcoesEmEdicao] = useState([])
  const [substituir, setSubstituir] = useState(true)
  const [edicaoId, setEdicaoId] = useState(null)
  const [form, setForm] = useState(() => formVazio(mesAtual()))
  const meses = useMemo(() => {
    const opcoes = new Map(mesesDisponiveis().map(item => [item.valor, item]))
    calendarios.forEach(item => opcoes.set(item.mes_ano, { valor: item.mes_ano, rotulo: rotuloMes(item.mes_ano) }))
    return [...opcoes.values()].sort((a, b) => b.valor.localeCompare(a.valor))
  }, [calendarios])
  const calendarioDoMes = calendarios.find(item => item.mes_ano === mesAno)

  const requisicao = useCallback(async (method = 'GET', body = null, mes = mesAno) => {
    const resposta = await fetch(`/api/admin/calendario/acoes${method === 'GET' ? `?mes_ano=${mes}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir.')
    return dados
  }, [mesAno, token])

  const carregar = useCallback(async (mes = mesAno) => {
    setCarregando(true)
    try {
      const dados = await requisicao('GET', null, mes)
      setAcoes(dados.acoes || [])
    } catch (error) {
      setMensagem(error.message)
    }
    setCarregando(false)
  }, [mesAno, requisicao])

  useEffect(() => {
    if (!token) return undefined
    const timer = window.setTimeout(() => { void carregar(mesAno) }, 0)
    return () => window.clearTimeout(timer)
  }, [token, mesAno, carregar])

  function abrirManual(acao = null) {
    setMensagem('')
    setEdicaoId(acao?.id || null)
    setForm(acao ? { ...acao } : formVazio(mesAno))
    setModo('manual')
  }

  function abrirEdicaoAcoes() {
    setMensagem('')
    if (!acoes.length) {
      setModo('lote')
      setMensagem('Este mês ainda não tem ações para editar. Envie o PDF ou Word para preparar as ações interativas.')
      return
    }
    setAcoesEmEdicao(acoes.map(acao => ({ ...acao })))
    setModo('editar-acoes')
  }

  function selecionarMes(valor) {
    setMesAno(valor)
    setModo(null)
    setArquivoFonte(null)
    setAcoesPreparadas([])
    setAcoesEmEdicao([])
    setLote('')
  }

  function atualizarAcaoEmEdicao(indice, campoNome, valor) {
    setAcoesEmEdicao(atual => atual.map((acao, posicao) => posicao === indice ? { ...acao, [campoNome]: valor } : acao))
  }

  async function salvarTodasAcoes(evento) {
    evento.preventDefault()
    if (acoesEmEdicao.some(acao => !String(acao.action_date || '').startsWith(`${mesAno}-`))) {
      setMensagem(`Todas as ações precisam permanecer em ${rotuloMes(mesAno)}.`)
      return
    }

    setSalvando(true)
    setMensagem('')
    try {
      for (const acao of acoesEmEdicao) {
        await requisicao('PUT', { id: acao.id, acao })
      }
      setModo(null)
      setAcoesEmEdicao([])
      await carregar()
      setMensagem(`✓ ${acoesEmEdicao.length} ${acoesEmEdicao.length === 1 ? 'ação atualizada' : 'ações atualizadas'} com sucesso.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  async function salvarManual(evento) {
    evento.preventDefault()
    const estavaEditando = Boolean(edicaoId)
    setSalvando(true)
    setMensagem('')
    try {
      await requisicao(edicaoId ? 'PUT' : 'POST', edicaoId ? { id: edicaoId, acao: form } : { modo: 'individual', acao: form })
      setModo(null)
      setEdicaoId(null)
      await carregar()
      setMensagem(estavaEditando ? '✓ Ação atualizada.' : '✓ Ação adicionada.')
    } catch (error) {
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  async function importar(evento) {
    evento.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      const lista = acoesPreparadas.length ? acoesPreparadas : interpretarLote(lote, mesAno)
      const publicarPdf = Boolean(arquivoFonte)
      if (publicarPdf) {
        const formData = new FormData()
        formData.append('arquivo', arquivoFonte)
        formData.append('mes_ano', mesAno)
        formData.append('titulo', calendarioDoMes?.titulo || '')
        formData.append('descricao', calendarioDoMes?.descricao || '')
        const respostaPdf = await fetch('/api/admin/calendario', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const dadosPdf = await respostaPdf.json()
        if (!respostaPdf.ok) throw new Error(dadosPdf.error || 'Não foi possível publicar o PDF do mês.')
      }
      const dados = await requisicao('POST', { modo: 'lote', mes_ano: mesAno, substituir, acoes: lista })
      setLote('')
      setArquivoFonte(null)
      setAcoesPreparadas([])
      setModo(null)
      await carregar()
      if (publicarPdf) await onCalendarioAtualizado?.()
      setMensagem(publicarPdf
        ? `✓ Planejamento de ${rotuloMes(mesAno)} publicado com o PDF e ${dados.total} ${dados.total === 1 ? 'ação interativa' : 'ações interativas'}.`
        : `✓ ${dados.total} ${dados.total === 1 ? 'ação importada' : 'ações importadas'} para ${NOMES[Number(mesAno.slice(5)) - 1]}.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  async function interpretarArquivo() {
    if (!arquivoFonte) { setMensagem('Escolha o PDF ou Word do mês.'); return }
    setLendoArquivo(true)
    setMensagem('')
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivoFonte)
      formData.append('mes_ano', mesAno)
      const resposta = await fetch('/api/admin/calendario/interpretar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível ler o arquivo.')
      setAcoesPreparadas(dados.acoes || [])
      setMensagem(`✓ ${dados.total} ${dados.total === 1 ? 'ação preparada' : 'ações preparadas'}. Revise antes de publicar.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setLendoArquivo(false)
  }

  function escolherArquivo(evento) {
    const arquivo = evento.target.files?.[0] || null
    setArquivoFonte(arquivo)
    setAcoesPreparadas([])
    setMensagem('')
  }

  function atualizarPreparada(indice, campoNome, valor) {
    setAcoesPreparadas(atual => atual.map((acao, posicao) => posicao === indice ? { ...acao, [campoNome]: valor } : acao))
  }

  function removerPreparada(indice) {
    setAcoesPreparadas(atual => atual.filter((_, posicao) => posicao !== indice))
  }

  async function excluir(acao) {
    if (!confirm(`Excluir a ação “${acao.title}” de ${dataBr(acao.action_date)}?`)) return
    try {
      await requisicao('DELETE', { id: acao.id })
      await carregar()
      setMensagem('✓ Ação excluída.')
    } catch (error) {
      setMensagem(error.message)
    }
  }

  return <section style={{ marginBottom: '28px' }}>
    <article style={{ background: '#111', border: `1px solid ${ouro}`, borderRadius: '18px', overflow: 'hidden', boxShadow: '0 14px 34px rgba(0,0,0,.18)' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #2A2A2A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <small style={{ color: ouro, fontWeight: 900, letterSpacing: '.1em' }}>PLANEJAMENTO MENSAL</small>
            <h2 style={{ margin: '5px 0', fontSize: '21px' }}>{rotuloMes(mesAno)}</h2>
            <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>Um único card com o arquivo completo e todas as estratégias interativas do mês.</p>
          </div>
          <label style={{ minWidth: '230px', color: '#AAA', fontSize: '12px' }}>Escolher mês<select value={mesAno} onChange={evento => selecionarMes(evento.target.value)} style={campo}>{meses.map(mes => <option key={mes.valor} value={mes.valor}>{mes.rotulo}</option>)}</select></label>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
          <span style={{ border: '1px solid #3B3B3B', background: '#0A0A0A', borderRadius: '999px', padding: '7px 10px', color: calendarioDoMes ? '#74d8aa' : '#888', fontSize: '11px', fontWeight: 800 }}>{calendarioDoMes ? '✓ PDF disponível' : '○ PDF ainda não enviado'}</span>
          <span style={{ border: '1px solid #3B3B3B', background: '#0A0A0A', borderRadius: '999px', padding: '7px 10px', color: acoes.length ? ouro : '#888', fontSize: '11px', fontWeight: 800 }}>{acoes.length} {acoes.length === 1 ? 'ação interativa' : 'ações interativas'}</span>
        </div>

        {calendarioDoMes && <div style={{ marginTop: '15px' }}><strong style={{ display: 'block', fontSize: '14px' }}>{calendarioDoMes.titulo}</strong><p style={{ color: '#777', fontSize: '12px', margin: '4px 0 0' }}>{calendarioDoMes.descricao || 'Arquivo completo disponível para as alunas.'}</p></div>}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '17px' }}>
          <button onClick={() => setModo(modo === 'lote' ? null : 'lote')} style={{ ...botao, background: ouroGrad, color: '#090909', border: 0, fontWeight: 900 }}>↑ Enviar PDF e preparar ações</button>
          <button onClick={() => abrirManual()} style={botao}>+ Ação pontual</button>
          <button onClick={abrirEdicaoAcoes} disabled={carregando} style={{ ...botao, background: ouroGrad, color: '#090909', border: 0, fontWeight: 900, opacity: carregando ? .55 : 1 }}>Editar ações</button>
          {calendarioDoMes?.arquivo_url && <a href={calendarioDoMes.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ ...botao, textDecoration: 'none' }}>Visualizar PDF</a>}
          {calendarioDoMes ? <><button onClick={() => onEditarCalendario?.(calendarioDoMes)} style={botao}>Editar card</button><button onClick={() => onSubstituirCalendario?.(calendarioDoMes)} style={botao}>Substituir PDF</button><button onClick={() => onExcluirCalendario?.(calendarioDoMes)} style={{ ...botao, color: '#f99' }}>Excluir PDF</button></> : <button onClick={() => onNovoCalendario?.(mesAno)} style={botao}>Enviar somente o PDF</button>}
        </div>
      </div>

      {mensagem && <div style={{ background: '#18150b', borderBottom: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 20px' }}>{mensagem}</div>}

      {modo === 'lote' && <form onSubmit={importar} style={{ background: '#0D0D0D', padding: '20px', borderBottom: '1px solid #2A2A2A' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>Preparar o card de {rotuloMes(mesAno)}</h3>
        <p style={{ color: '#888', fontSize: '12px', lineHeight: 1.5, margin: '0 0 14px' }}>Escolha uma única vez o PDF ou Word. O aplicativo lê, mostra a prévia e publica o arquivo junto com as ações.</p>
        <label style={{ display: 'block', border: '1px dashed #66561e', borderRadius: '11px', padding: '18px 14px', cursor: 'pointer', color: ouro, textAlign: 'center', marginBottom: '12px' }}>{arquivoFonte ? `📄 ${arquivoFonte.name}` : 'Escolher PDF ou Word do mês'}<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={escolherArquivo} style={{ display: 'none' }} /></label>
        {!acoesPreparadas.length && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={interpretarArquivo} disabled={!arquivoFonte || lendoArquivo} style={{ ...botao, background: ouroGrad, color: '#090909', border: 0, fontWeight: 900, opacity: !arquivoFonte || lendoArquivo ? .55 : 1 }}>{lendoArquivo ? 'Lendo e organizando...' : 'Ler arquivo e preparar ações'}</button></div>}

      {acoesPreparadas.length > 0 && <div style={{ display: 'grid', gap: '9px', marginTop: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}><strong style={{ fontSize: '14px' }}>Prévia para revisão</strong><span style={{ color: '#888', fontSize: '12px' }}>{acoesPreparadas.length} {acoesPreparadas.length === 1 ? 'ação encontrada' : 'ações encontradas'}</span></div>
        {acoesPreparadas.map((acao, indice) => <details key={`${acao.action_date}-${indice}`} style={{ background: '#0A0A0A', border: '1px solid #2F2F2F', borderRadius: '11px', padding: '11px 12px' }}>
          <summary style={{ cursor: 'pointer', color: '#EEE', fontSize: '13px', fontWeight: 800 }}>{dataBr(acao.action_date)} — {acao.title}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '9px', marginTop: '12px' }}><label>Data<input type="date" value={acao.action_date} onChange={evento => atualizarPreparada(indice, 'action_date', evento.target.value)} style={campo} /></label><label>Tema<input value={acao.title} onChange={evento => atualizarPreparada(indice, 'title', evento.target.value)} style={campo} /></label></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '9px', marginTop: '9px' }}><label>Canal<input value={acao.channel || ''} onChange={evento => atualizarPreparada(indice, 'channel', evento.target.value)} style={campo} /></label><label>Formato<input value={acao.content_format || ''} onChange={evento => atualizarPreparada(indice, 'content_format', evento.target.value)} style={campo} /></label><label>CTA<input value={acao.product_cta || ''} onChange={evento => atualizarPreparada(indice, 'product_cta', evento.target.value)} style={campo} /></label></div>
          <label style={{ display: 'block', marginTop: '9px' }}>Descrição<input value={acao.description || ''} onChange={evento => atualizarPreparada(indice, 'description', evento.target.value)} style={campo} /></label>
          <label style={{ display: 'block', marginTop: '9px' }}>Texto, legenda ou orientação<textarea value={acao.content_text || ''} onChange={evento => atualizarPreparada(indice, 'content_text', evento.target.value)} rows={4} style={{ ...campo, resize: 'vertical' }} /></label>
          <button type="button" onClick={() => removerPreparada(indice)} style={{ ...botao, color: '#f99', marginTop: '9px' }}>Remover esta ação</button>
        </details>)}
      </div>}

        <details style={{ marginTop: '14px', color: '#888', fontSize: '12px' }}><summary style={{ cursor: 'pointer', color: ouro }}>Alternativa: colar dados de uma planilha</summary><p>Ordem: Data | Tema | Descrição | Canal | Formato | Produto e CTA | Texto ou material | Link.</p><textarea value={lote} onChange={evento => { setLote(evento.target.value); setAcoesPreparadas([]); setArquivoFonte(null) }} rows={7} style={{ ...campo, resize: 'vertical', lineHeight: 1.55 }} placeholder={'01/10 | Lançamento da coleção | Apresente os produtos protagonistas | Instagram | Stories | Nova coleção — chame no WhatsApp | Grave três Stories mostrando detalhes'} /></details>
      <label style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#AAA', fontSize: '13px', marginTop: '12px' }}><input type="checkbox" checked={substituir} onChange={evento => setSubstituir(evento.target.checked)} /> Substituir as ações já cadastradas neste mês</label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}><button type="button" onClick={() => setModo(null)} style={botao}>Cancelar</button><button disabled={salvando || (!acoesPreparadas.length && !lote.trim())} style={{ ...botao, background: ouroGrad, color: '#090909', border: 0, fontWeight: 900, opacity: salvando || (!acoesPreparadas.length && !lote.trim()) ? .55 : 1 }}>{salvando ? 'Publicando...' : arquivoFonte ? 'Publicar PDF + ações' : 'Publicar ações'}</button></div>
      </form>}

      {modo === 'manual' && <form onSubmit={salvarManual} style={{ background: '#0D0D0D', padding: '20px', borderBottom: '1px solid #2A2A2A' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>{edicaoId ? 'Editar ação' : 'Adicionar ação pontual'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px' }}><label>Data *<input type="date" required value={form.action_date} onChange={evento => setForm({ ...form, action_date: evento.target.value })} style={campo} /></label><label>Tema ou oferta *<input required value={form.title} onChange={evento => setForm({ ...form, title: evento.target.value })} style={campo} /></label></div>
      <label style={{ display: 'block', marginTop: '12px' }}>Descrição<input value={form.description || ''} onChange={evento => setForm({ ...form, description: evento.target.value })} style={campo} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px', marginTop: '12px' }}><label>Canal<input value={form.channel || ''} onChange={evento => setForm({ ...form, channel: evento.target.value })} style={campo} placeholder="Instagram, WhatsApp..." /></label><label>Formato<input value={form.content_format || ''} onChange={evento => setForm({ ...form, content_format: evento.target.value })} style={campo} placeholder="Stories, Reels, Status..." /></label><label>Produto e CTA<input value={form.product_cta || ''} onChange={evento => setForm({ ...form, product_cta: evento.target.value })} style={campo} /></label></div>
      <label style={{ display: 'block', marginTop: '12px' }}>Texto, roteiro ou orientação<textarea value={form.content_text || ''} onChange={evento => setForm({ ...form, content_text: evento.target.value })} rows={4} style={{ ...campo, resize: 'vertical' }} /></label>
      <label style={{ display: 'block', marginTop: '12px' }}>Link do material<input type="url" value={form.material_url || ''} onChange={evento => setForm({ ...form, material_url: evento.target.value })} style={campo} placeholder="https://" /></label>
      <label style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#AAA', fontSize: '13px', marginTop: '12px' }}><input type="checkbox" checked={form.is_published !== false} onChange={evento => setForm({ ...form, is_published: evento.target.checked })} /> Publicar para as alunas</label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}><button type="button" onClick={() => setModo(null)} style={botao}>Cancelar</button><button disabled={salvando} style={{ ...botao, background: ouroGrad, color: '#090909', fontWeight: 900 }}>{salvando ? 'Salvando...' : 'Salvar ação'}</button></div>
      </form>}

      {modo === 'editar-acoes' && <form onSubmit={salvarTodasAcoes} style={{ background: '#0D0D0D', padding: '20px', borderBottom: '1px solid #2A2A2A' }}>
        <h3 style={{ margin: '0 0 5px', fontSize: '16px' }}>Editar ações de {rotuloMes(mesAno)}</h3>
        <p style={{ color: '#888', fontSize: '12px', margin: '0 0 14px' }}>Abra cada ação, faça as correções e salve tudo de uma vez. O PDF não será alterado.</p>
        <div style={{ display: 'grid', gap: '9px' }}>
          {acoesEmEdicao.map((acao, indice) => <details key={acao.id} defaultOpen={indice === 0} style={{ background: '#0A0A0A', border: '1px solid #2F2F2F', borderRadius: '11px', padding: '11px 12px' }}>
            <summary style={{ cursor: 'pointer', color: '#EEE', fontSize: '13px', fontWeight: 800 }}>{dataBr(acao.action_date)} — {acao.title}</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '9px', marginTop: '12px' }}><label>Data *<input required type="date" value={acao.action_date} onChange={evento => atualizarAcaoEmEdicao(indice, 'action_date', evento.target.value)} style={campo} /></label><label>Tema ou oferta *<input required value={acao.title} onChange={evento => atualizarAcaoEmEdicao(indice, 'title', evento.target.value)} style={campo} /></label></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '9px', marginTop: '9px' }}><label>Canal<input value={acao.channel || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'channel', evento.target.value)} style={campo} /></label><label>Formato<input value={acao.content_format || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'content_format', evento.target.value)} style={campo} /></label><label>CTA<input value={acao.product_cta || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'product_cta', evento.target.value)} style={campo} /></label></div>
            <label style={{ display: 'block', marginTop: '9px' }}>Descrição<input value={acao.description || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'description', evento.target.value)} style={campo} /></label>
            <label style={{ display: 'block', marginTop: '9px' }}>Texto, legenda ou orientação<textarea value={acao.content_text || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'content_text', evento.target.value)} rows={4} style={{ ...campo, resize: 'vertical' }} /></label>
            <label style={{ display: 'block', marginTop: '9px' }}>Link do material<input type="url" value={acao.material_url || ''} onChange={evento => atualizarAcaoEmEdicao(indice, 'material_url', evento.target.value)} style={campo} placeholder="https://" /></label>
            <label style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#AAA', fontSize: '13px', marginTop: '10px' }}><input type="checkbox" checked={acao.is_published !== false} onChange={evento => atualizarAcaoEmEdicao(indice, 'is_published', evento.target.checked)} /> Publicar para as alunas</label>
          </details>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}><button type="button" onClick={() => { setModo(null); setAcoesEmEdicao([]) }} style={botao}>Cancelar</button><button disabled={salvando} style={{ ...botao, background: ouroGrad, color: '#090909', border: 0, fontWeight: 900, opacity: salvando ? .55 : 1 }}>{salvando ? 'Salvando...' : 'Salvar todas as ações'}</button></div>
      </form>}

      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}><div><small style={{ color: ouro, fontWeight: 900, letterSpacing: '.1em' }}>ESTRATÉGIAS DO MÊS</small><h3 style={{ margin: '4px 0 0', fontSize: '16px' }}>Ações por data</h3></div><span style={{ color: '#777', fontSize: '12px' }}>{acoes.length} {acoes.length === 1 ? 'ação cadastrada' : 'ações cadastradas'}</span></div>
        <div style={{ display: 'grid', gap: '9px' }}>
          {carregando ? <div style={{ color: '#777', padding: '24px', textAlign: 'center' }}>Carregando ações...</div> : acoes.map(acao => <div key={acao.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '13px' }}><div style={{ width: '48px', height: '48px', borderRadius: '11px', background: 'rgba(212,175,55,.12)', color: ouro, display: 'grid', placeItems: 'center', fontWeight: 900 }}>{String(acao.action_date).slice(8, 10)}</div><div style={{ flex: 1, minWidth: '210px' }}><strong style={{ fontSize: '14px' }}>{acao.title}</strong><p style={{ color: '#777', fontSize: '12px', margin: '4px 0 0' }}>{[acao.channel, acao.content_format, acao.product_cta].filter(Boolean).join(' • ') || acao.description || 'Sem detalhes adicionais'}</p></div><div style={{ display: 'flex', gap: '7px' }}><button onClick={() => abrirManual(acao)} style={botao}>Editar</button><button onClick={() => excluir(acao)} style={{ ...botao, color: '#f99' }}>Excluir</button></div></div>)}
          {!carregando && !acoes.length && <div style={{ textAlign: 'center', padding: '34px 20px', background: '#0A0A0A', border: '1px dashed #343434', borderRadius: '12px', color: '#777' }}>Este mês ainda não possui ações interativas.</div>}
        </div>
      </div>
    </article>
  </section>
}
