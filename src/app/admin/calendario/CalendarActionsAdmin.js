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

export default function CalendarActionsAdmin({ token }) {
  const [mesAno, setMesAno] = useState(mesAtual())
  const [acoes, setAcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modo, setModo] = useState(null)
  const [lote, setLote] = useState('')
  const [substituir, setSubstituir] = useState(true)
  const [edicaoId, setEdicaoId] = useState(null)
  const [form, setForm] = useState(() => formVazio(mesAtual()))
  const meses = useMemo(() => mesesDisponiveis(), [])

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
      const lista = interpretarLote(lote, mesAno)
      const dados = await requisicao('POST', { modo: 'lote', mes_ano: mesAno, substituir, acoes: lista })
      setLote('')
      setModo(null)
      await carregar()
      setMensagem(`✓ ${dados.total} ${dados.total === 1 ? 'ação importada' : 'ações importadas'} para ${NOMES[Number(mesAno.slice(5)) - 1]}.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  async function lerArquivo(evento) {
    const arquivo = evento.target.files?.[0]
    if (!arquivo) return
    if (arquivo.size > 2 * 1024 * 1024) { setMensagem('O arquivo deve ter no máximo 2 MB.'); return }
    setLote(await arquivo.text())
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
    <div style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
        <div><small style={{ color: ouro, fontWeight: 900, letterSpacing: '.1em' }}>CALENDÁRIO INTERATIVO</small><h2 style={{ margin: '5px 0', fontSize: '19px' }}>Ações por data</h2><p style={{ margin: 0, color: '#888', fontSize: '13px' }}>Importe o mês inteiro de uma vez. O cadastro manual fica para ajustes pontuais.</p></div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button onClick={() => setModo(modo === 'lote' ? null : 'lote')} style={{ ...botao, background: modo === 'lote' ? '#2d270f' : botao.background }}>↑ Importar em lote</button><button onClick={() => abrirManual()} style={{ ...botao, background: ouroGrad, color: '#090909', fontWeight: 900 }}>+ Ação pontual</button></div>
      </div>
    </div>

    {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '14px' }}>{mensagem}</div>}

    {modo === 'lote' && <form onSubmit={importar} style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '14px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>Importar o mês inteiro</h3>
      <p style={{ color: '#888', fontSize: '12px', lineHeight: 1.5, margin: '0 0 14px' }}>Cole linhas do Excel ou Google Sheets. Ordem: Data | Tema | Descrição | Canal | Formato | Produto e CTA | Texto ou material | Link.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px', marginBottom: '12px' }}><label>Mês<select value={mesAno} onChange={evento => setMesAno(evento.target.value)} style={campo}>{meses.map(mes => <option key={mes.valor} value={mes.valor}>{mes.rotulo}</option>)}</select></label><label style={{ border: '1px dashed #66561e', borderRadius: '9px', padding: '10px 13px', cursor: 'pointer', color: ouro, alignSelf: 'end' }}>Escolher arquivo CSV ou TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={lerArquivo} style={{ display: 'none' }} /></label></div>
      <textarea value={lote} onChange={evento => setLote(evento.target.value)} rows={9} style={{ ...campo, resize: 'vertical', lineHeight: 1.55 }} placeholder={'01/10 | Lançamento da coleção | Apresente os produtos protagonistas | Instagram | Stories | Nova coleção — chame no WhatsApp | Grave três Stories mostrando detalhes | https://...'} />
      <label style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#AAA', fontSize: '13px', marginTop: '12px' }}><input type="checkbox" checked={substituir} onChange={evento => setSubstituir(evento.target.checked)} /> Substituir as ações já cadastradas neste mês</label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}><button type="button" onClick={() => setModo(null)} style={botao}>Cancelar</button><button disabled={salvando} style={{ ...botao, background: ouroGrad, color: '#090909', fontWeight: 900 }}>{salvando ? 'Importando...' : 'Importar ações'}</button></div>
    </form>}

    {modo === 'manual' && <form onSubmit={salvarManual} style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '14px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>{edicaoId ? 'Editar ação' : 'Adicionar ação pontual'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px' }}><label>Data *<input type="date" required value={form.action_date} onChange={evento => setForm({ ...form, action_date: evento.target.value })} style={campo} /></label><label>Tema ou oferta *<input required value={form.title} onChange={evento => setForm({ ...form, title: evento.target.value })} style={campo} /></label></div>
      <label style={{ display: 'block', marginTop: '12px' }}>Descrição<input value={form.description || ''} onChange={evento => setForm({ ...form, description: evento.target.value })} style={campo} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px', marginTop: '12px' }}><label>Canal<input value={form.channel || ''} onChange={evento => setForm({ ...form, channel: evento.target.value })} style={campo} placeholder="Instagram, WhatsApp..." /></label><label>Formato<input value={form.content_format || ''} onChange={evento => setForm({ ...form, content_format: evento.target.value })} style={campo} placeholder="Stories, Reels, Status..." /></label><label>Produto e CTA<input value={form.product_cta || ''} onChange={evento => setForm({ ...form, product_cta: evento.target.value })} style={campo} /></label></div>
      <label style={{ display: 'block', marginTop: '12px' }}>Texto, roteiro ou orientação<textarea value={form.content_text || ''} onChange={evento => setForm({ ...form, content_text: evento.target.value })} rows={4} style={{ ...campo, resize: 'vertical' }} /></label>
      <label style={{ display: 'block', marginTop: '12px' }}>Link do material<input type="url" value={form.material_url || ''} onChange={evento => setForm({ ...form, material_url: evento.target.value })} style={campo} placeholder="https://" /></label>
      <label style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#AAA', fontSize: '13px', marginTop: '12px' }}><input type="checkbox" checked={form.is_published !== false} onChange={evento => setForm({ ...form, is_published: evento.target.checked })} /> Publicar para as alunas</label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}><button type="button" onClick={() => setModo(null)} style={botao}>Cancelar</button><button disabled={salvando} style={{ ...botao, background: ouroGrad, color: '#090909', fontWeight: 900 }}>{salvando ? 'Salvando...' : 'Salvar ação'}</button></div>
    </form>}

    <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}><label style={{ minWidth: '230px' }}>Mês das ações<select value={mesAno} onChange={evento => setMesAno(evento.target.value)} style={campo}>{meses.map(mes => <option key={mes.valor} value={mes.valor}>{mes.rotulo}</option>)}</select></label><span style={{ color: '#777', fontSize: '12px' }}>{acoes.length} {acoes.length === 1 ? 'ação cadastrada' : 'ações cadastradas'}</span></div>
    <div style={{ display: 'grid', gap: '9px' }}>
      {carregando ? <div style={{ color: '#777', padding: '24px', textAlign: 'center' }}>Carregando ações...</div> : acoes.map(acao => <article key={acao.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '13px' }}><div style={{ width: '48px', height: '48px', borderRadius: '11px', background: 'rgba(212,175,55,.12)', color: ouro, display: 'grid', placeItems: 'center', fontWeight: 900 }}>{String(acao.action_date).slice(8, 10)}</div><div style={{ flex: 1, minWidth: '210px' }}><strong style={{ fontSize: '14px' }}>{acao.title}</strong><p style={{ color: '#777', fontSize: '12px', margin: '4px 0 0' }}>{[acao.channel, acao.content_format, acao.product_cta].filter(Boolean).join(' • ') || acao.description || 'Sem detalhes adicionais'}</p></div><div style={{ display: 'flex', gap: '7px' }}><button onClick={() => abrirManual(acao)} style={botao}>Editar</button><button onClick={() => excluir(acao)} style={{ ...botao, color: '#f99' }}>Excluir</button></div></article>)}
      {!carregando && !acoes.length && <div style={{ textAlign: 'center', padding: '34px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', color: '#777' }}>Nenhuma ação interativa cadastrada neste mês.</div>}
    </div>
  </section>
}
