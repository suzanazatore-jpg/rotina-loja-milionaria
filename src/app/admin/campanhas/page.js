'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { criarPlanoCampanhaPadrao, ICONES_CAMPANHA, normalizarPlanoCampanha } from '@/lib/campaignPlan'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '14px' }
const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer' }
const NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function rotuloMes(valor) {
  const [ano, mes] = String(valor || '').split('-')
  return `${NOMES[Number(mes) - 1] || ''} ${ano || ''}`.trim()
}

function mesesDisponiveis() {
  const hoje = new Date()
  return Array.from({ length: 25 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 6 + i, 1)
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { valor, rotulo: `${NOMES[d.getMonth()]} ${d.getFullYear()}` }
  })
}

function novaFase(indice = 0) {
  const base = Date.now()
  return {
    id: `fase-${base}-${indice}`,
    titulo: '',
    periodo: '',
    descricao: '',
    orientacao: '',
    etapas: [{ id: `acao-${base}-1`, icone: 'campaigns', titulo: '', descricao: '' }],
  }
}

function resumoPlano(valor) {
  const plano = normalizarPlanoCampanha(valor, { preencherPadrao: false })
  return {
    fases: plano.fases.length,
    acoes: plano.fases.reduce((soma, fase) => soma + fase.etapas.length, 0),
  }
}

export default function AdminCampanhas() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [itens, setItens] = useState([])

  const [formAberto, setFormAberto] = useState(false)
  const [modoForm, setModoForm] = useState('manual')
  const [itemEmEdicao, setItemEmEdicao] = useState(null)
  const [mesAno, setMesAno] = useState(mesAtual)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [plano, setPlano] = useState(criarPlanoCampanhaPadrao)

  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [arquivoImportacao, setArquivoImportacao] = useState(null)
  const [mesImportacao, setMesImportacao] = useState(mesAtual)
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState(null)

  const [pdfMensalAberto, setPdfMensalAberto] = useState(false)
  const [mesPdf, setMesPdf] = useState(mesAtual)
  const [arquivoPdf, setArquivoPdf] = useState(null)
  const [enviandoPdf, setEnviandoPdf] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const meses = useMemo(mesesDisponiveis, [])

  useEffect(() => {
    async function iniciar() {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (String(session.user.email || '').toLowerCase() !== ADMIN_EMAIL) { setCarregando(false); return }

      const { data: refreshData } = await supabase.auth.refreshSession()
      session = refreshData?.session || session

      setAutorizado(true)
      setToken(session.access_token)
      await carregar(session.access_token)
      setCarregando(false)
    }
    void iniciar()
  }, [router])

  async function fetchAutorizado(path, options = {}, accessToken = token, tentouRenovar = false) {
    const resposta = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      cache: 'no-store',
    })

    if ((resposta.status === 401 || resposta.status === 403) && !tentouRenovar) {
      const { data: refreshData } = await supabase.auth.refreshSession()
      const novoToken = refreshData?.session?.access_token
      if (novoToken) {
        setToken(novoToken)
        return fetchAutorizado(path, options, novoToken, true)
      }
    }

    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir.')
    return dados
  }

  async function requisicao(method, body, accessToken = token) {
    return fetchAutorizado('/api/admin/campanhas', {
      method,
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    }, accessToken)
  }

  async function carregar(accessToken = token) {
    try {
      const dados = await requisicao('GET', null, accessToken)
      setItens(dados.campanhas || [])
    } catch (error) {
      setMensagem(error.message)
    }
  }

  function fecharEditor() {
    setFormAberto(false)
    setModoForm('manual')
    setItemEmEdicao(null)
    setMesAno(mesAtual())
    setTitulo('')
    setDescricao('')
    setPlano(criarPlanoCampanhaPadrao())
    setResumoImportacao(null)
  }

  function fecharImportacao() {
    setImportacaoAberta(false)
    setArquivoImportacao(null)
  }

  function fecharPdfMensal() {
    setPdfMensalAberto(false)
    setArquivoPdf(null)
  }

  function abrirManual(item = null) {
    fecharImportacao()
    fecharPdfMensal()
    setModoForm(item ? 'editar' : 'manual')
    setItemEmEdicao(item)
    setMesAno(item?.mes_ano || mesAtual())
    setTitulo(item?.titulo || '')
    setDescricao(item?.descricao || '')
    setPlano(item ? normalizarPlanoCampanha(item.plano_interativo) : criarPlanoCampanhaPadrao())
    setResumoImportacao(null)
    setMensagem('')
    setFormAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function abrirImportacao() {
    fecharEditor()
    fecharPdfMensal()
    setArquivoImportacao(null)
    setMesImportacao(mesAtual())
    setMensagem('')
    setImportacaoAberta(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function abrirPdfMensal(item = null) {
    fecharEditor()
    fecharImportacao()
    setMesPdf(item?.mes_ano || mesAtual())
    setArquivoPdf(null)
    setMensagem('')
    setPdfMensalAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function interpretarArquivo(evento) {
    evento.preventDefault()
    if (!arquivoImportacao) { setMensagem('Escolha um arquivo PDF ou Word.'); return }

    setLendoArquivo(true)
    setMensagem('')
    try {
      const form = new FormData()
      form.append('mes_ano', mesImportacao)
      form.append('arquivo', arquivoImportacao)

      const dados = await fetchAutorizado('/api/admin/campanhas/interpretar', { method: 'POST', body: form })
      const preparado = normalizarPlanoCampanha(dados.plano_interativo, { preencherPadrao: false })

      setMesAno(mesImportacao)
      setTitulo(dados.titulo || '')
      setDescricao(dados.descricao || '')
      setPlano(preparado)
      setResumoImportacao(dados.resumo || resumoPlano(preparado))
      setModoForm('importada')
      setItemEmEdicao(itens.find(item => item.mes_ano === mesImportacao) || null)
      setImportacaoAberta(false)
      setFormAberto(true)
      setMensagem(`✓ ${dados.resumo?.fases || preparado.fases.length} fases e ${dados.resumo?.acoes || preparado.etapas.length} ações preparadas. Revise antes de publicar.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setLendoArquivo(false)
  }

  function atualizarPlano(campoNome, valor) {
    setPlano(atual => ({ ...atual, [campoNome]: valor }))
  }

  function atualizarFase(indice, campoNome, valor) {
    setPlano(atual => ({
      ...atual,
      fases: atual.fases.map((fase, posicao) => posicao === indice ? { ...fase, [campoNome]: valor } : fase),
    }))
  }

  function adicionarFase() {
    setPlano(atual => ({ ...atual, fases: [...atual.fases, novaFase(atual.fases.length)] }))
  }

  function removerFase(indice) {
    setPlano(atual => ({ ...atual, fases: atual.fases.filter((_, posicao) => posicao !== indice) }))
  }

  function atualizarEtapa(faseIndice, etapaIndice, campoNome, valor) {
    setPlano(atual => ({
      ...atual,
      fases: atual.fases.map((fase, posicao) => posicao === faseIndice
        ? { ...fase, etapas: fase.etapas.map((etapa, etapaPosicao) => etapaPosicao === etapaIndice ? { ...etapa, [campoNome]: valor } : etapa) }
        : fase),
    }))
  }

  function adicionarEtapa(faseIndice) {
    setPlano(atual => ({
      ...atual,
      fases: atual.fases.map((fase, posicao) => {
        if (posicao !== faseIndice) return fase
        const numero = fase.etapas.length + 1
        return {
          ...fase,
          etapas: [...fase.etapas, { id: `${fase.id}-acao-${Date.now()}-${numero}`, icone: 'campaigns', titulo: '', descricao: '' }],
        }
      }),
    }))
  }

  function removerEtapa(faseIndice, etapaIndice) {
    setPlano(atual => ({
      ...atual,
      fases: atual.fases.map((fase, posicao) => posicao === faseIndice
        ? { ...fase, etapas: fase.etapas.filter((_, etapaPosicao) => etapaPosicao !== etapaIndice) }
        : fase),
    }))
  }

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setMensagem('')

    try {
      const normalizado = normalizarPlanoCampanha(plano, { preencherPadrao: false })
      if (!normalizado.etapas.length) throw new Error('Inclua pelo menos uma ação antes de publicar.')

      const existente = itemEmEdicao || itens.find(item => item.mes_ano === mesAno)
      if (existente) {
        await requisicao('PUT', {
          id: existente.id,
          mes_ano: mesAno,
          titulo,
          descricao,
          plano_interativo: normalizado,
        })
      } else {
        const form = new FormData()
        form.append('mes_ano', mesAno)
        form.append('titulo', titulo)
        form.append('descricao', descricao)
        form.append('plano_interativo', JSON.stringify(normalizado))
        await requisicao('POST', form)
      }

      await carregar()
      fecharEditor()
      setMensagem(existente ? '✓ Campanha atualizada com sucesso.' : '✓ Campanha publicada com sucesso.')
    } catch (error) {
      setMensagem(error.message)
    }
    setEnviando(false)
  }

  async function enviarPdfMensal(evento) {
    evento.preventDefault()
    if (!arquivoPdf) { setMensagem('Selecione o PDF mensal da campanha.'); return }
    if (arquivoPdf.type !== 'application/pdf') { setMensagem('Envie somente um arquivo PDF.'); return }
    if (arquivoPdf.size > 20 * 1024 * 1024) { setMensagem('O PDF deve ter no máximo 20 MB.'); return }

    setEnviandoPdf(true)
    setMensagem('')
    try {
      const form = new FormData()
      form.append('mes_ano', mesPdf)
      form.append('arquivo', arquivoPdf)
      await requisicao('PATCH', form)
      await carregar()
      fecharPdfMensal()
      setMensagem(`✓ PDF mensal de ${rotuloMes(mesPdf)} atualizado com sucesso.`)
    } catch (error) {
      setMensagem(error.message)
    }
    setEnviandoPdf(false)
  }

  async function excluir(item) {
    if (!confirm(`Excluir a campanha de ${rotuloMes(item.mes_ano)}?`)) return
    try {
      await requisicao('DELETE', { id: item.id })
      await carregar()
      setMensagem('✓ Campanha excluída.')
    } catch (error) {
      setMensagem(error.message)
    }
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  const resumoAtual = resumoPlano(plano)

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}>
      <button onClick={() => router.push('/admin')} style={{ ...botao, background: 'transparent' }}>← Admin</button>
    </header>

    <main style={{ maxWidth: '980px', margin: '0 auto', padding: '26px 18px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '22px' }}>
        <div>
          <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p>
          <h1 style={{ fontSize: '24px', margin: '5px 0' }}>Campanha mensal</h1>
          <p style={{ color: '#888', margin: 0 }}>Importe a campanha uma vez, revise e publique a jornada interativa do mês.</p>
        </div>

        {!formAberto && !importacaoAberta && !pdfMensalAberto && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => abrirPdfMensal()} style={botao}>↑ PDF mensal</button>
          <button onClick={abrirImportacao} style={{ ...botao, borderColor: '#66561e' }}>↑ Importar PDF ou Word</button>
          <button onClick={() => abrirManual()} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '11px 17px', fontWeight: 900, cursor: 'pointer' }}>+ Criar manualmente</button>
        </div>}
      </div>

      {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

      {importacaoAberta && <form onSubmit={interpretarArquivo} style={{ background: '#111', border: '1px solid #66561e', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <p style={{ color: ouro, fontSize: '11px', fontWeight: 900, letterSpacing: '.09em', margin: '0 0 5px' }}>LEITURA INTELIGENTE</p>
        <h2 style={{ fontSize: '18px', margin: '0 0 5px' }}>Preparar campanha do mês</h2>
        <p style={{ color: '#888', fontSize: '13px', margin: '0 0 17px' }}>O aplicativo identifica as fases reais da campanha, períodos, orientações e ações executáveis. Nada é publicado antes da sua revisão.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
          <label>Mês da campanha *
            <input type="month" value={mesImportacao} onChange={e => setMesImportacao(e.target.value)} style={{ ...campo, colorScheme: 'dark' }} />
          </label>
          <label style={{ display: 'block', border: '1px dashed #66561e', background: '#0A0A0A', borderRadius: '12px', padding: '14px 16px', textAlign: 'center', cursor: 'pointer' }}>
            <strong style={{ color: ouro, display: 'block', marginBottom: '4px' }}>{arquivoImportacao ? `📄 ${arquivoImportacao.name}` : '↑ Selecionar PDF ou Word'}</strong>
            <small style={{ color: '#777' }}>{arquivoImportacao ? `${(arquivoImportacao.size / 1024 / 1024).toFixed(1)} MB` : 'PDF ou .docx · até 10 MB'}</small>
            <input type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setArquivoImportacao(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px', flexWrap: 'wrap' }}>
          <button type="button" onClick={fecharImportacao} style={botao}>Cancelar</button>
          <button disabled={lendoArquivo || !arquivoImportacao} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer', opacity: lendoArquivo || !arquivoImportacao ? .6 : 1 }}>{lendoArquivo ? 'Lendo e organizando...' : 'Ler arquivo e preparar campanha'}</button>
        </div>
      </form>}

      {pdfMensalAberto && <form onSubmit={enviarPdfMensal} style={{ background: '#111', border: '1px solid #66561e', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <p style={{ color: ouro, fontSize: '11px', fontWeight: 900, letterSpacing: '.09em', margin: '0 0 5px' }}>MATERIAL COMPLETO DO MÊS</p>
        <h2 style={{ fontSize: '18px', margin: '0 0 5px' }}>PDF mensal da campanha</h2>
        <p style={{ color: '#888', fontSize: '13px', margin: '0 0 17px' }}>O PDF fica como material complementar. A jornada interativa continua sendo a experiência principal da aluna.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
          <label>Mês *
            <input type="month" value={mesPdf} onChange={e => { setMesPdf(e.target.value); setArquivoPdf(null) }} style={{ ...campo, colorScheme: 'dark' }} />
          </label>
          <label style={{ display: 'block', border: '1px dashed #66561e', background: '#0A0A0A', borderRadius: '12px', padding: '14px 16px', textAlign: 'center', cursor: 'pointer' }}>
            <strong style={{ color: ouro, display: 'block', marginBottom: '4px' }}>{arquivoPdf ? `📄 ${arquivoPdf.name}` : '↑ Selecionar o PDF completo'}</strong>
            <small style={{ color: '#777' }}>{arquivoPdf ? `${(arquivoPdf.size / 1024 / 1024).toFixed(1)} MB` : `PDF de ${rotuloMes(mesPdf)} · até 20 MB`}</small>
            <input type="file" accept="application/pdf" onChange={e => setArquivoPdf(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
        </div>

        {itens.some(item => item.mes_ano === mesPdf && item.arquivo_url) && <p style={{ color: '#81d39d', fontSize: '12px', margin: '12px 0 0' }}>✓ Este mês já possui um PDF. O novo arquivo substituirá o atual.</p>}
        {!itens.some(item => item.mes_ano === mesPdf) && <p style={{ color: '#f0c96b', fontSize: '12px', margin: '12px 0 0' }}>Crie ou importe a campanha deste mês antes de enviar o PDF.</p>}

        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px' }}>
          <button type="button" onClick={fecharPdfMensal} style={botao}>Cancelar</button>
          <button disabled={enviandoPdf || !arquivoPdf} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer', opacity: enviandoPdf || !arquivoPdf ? .6 : 1 }}>{enviandoPdf ? 'Enviando...' : 'Salvar PDF mensal'}</button>
        </div>
      </form>}

      {formAberto && <form onSubmit={enviar} style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 5px' }}>{modoForm === 'editar' ? 'Editar campanha mensal' : modoForm === 'importada' ? `Revisar campanha de ${rotuloMes(mesAno)}` : 'Criar campanha manualmente'}</h2>
        <p style={{ color: '#777', fontSize: '12px', margin: '0 0 17px' }}>
          {modoForm === 'importada'
            ? `A leitura preparou ${resumoImportacao?.fases || resumoAtual.fases} fases e ${resumoImportacao?.acoes || resumoAtual.acoes} ações. Revise tudo antes de publicar.`
            : 'Organize a campanha em fases reais. Cada fase pode ter seu período, orientação e ações próprias.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
          <label>Mês *
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...campo, colorScheme: 'dark' }} />
          </label>
          <label>Nome da campanha
            <input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo} placeholder={`Campanha de ${rotuloMes(mesAno)}`} maxLength={160} />
          </label>
        </div>

        <label style={{ display: 'block', marginTop: '12px' }}>Descrição
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} style={{ ...campo, minHeight: '62px', resize: 'vertical', fontFamily: 'inherit' }} placeholder="Explique rapidamente a proposta do mês" maxLength={500} />
        </label>

        <section style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #292929' }}>
          <div style={{ marginBottom: '13px' }}>
            <strong style={{ display: 'block', fontSize: '15px' }}>Jornada interativa</strong>
            <small style={{ color: '#777' }}>{resumoAtual.fases} {resumoAtual.fases === 1 ? 'fase' : 'fases'} · {resumoAtual.acoes} {resumoAtual.acoes === 1 ? 'ação' : 'ações'} executáveis</small>
          </div>

          <div style={{ display: 'grid', gap: '11px', padding: '15px', border: '1px solid #2e2b24', borderRadius: '13px', background: '#0d0d0d', marginBottom: '14px' }}>
            <label>Objetivo da campanha
              <textarea value={plano.objetivo || ''} onChange={e => atualizarPlano('objetivo', e.target.value)} style={{ ...campo, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }} maxLength={420} placeholder="Qual resultado comercial essa campanha busca?" />
            </label>
            <label>Orientação geral da Suzana
              <textarea value={plano.orientacao || ''} onChange={e => atualizarPlano('orientacao', e.target.value)} style={{ ...campo, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }} maxLength={420} placeholder="Orientação que vale para a campanha como um todo" />
            </label>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {(plano.fases || []).map((fase, faseIndice) => <details key={fase.id || faseIndice} open={faseIndice === 0} style={{ border: '1px solid #2e2b24', borderRadius: '13px', background: '#0d0d0d', padding: '14px' }}>
              <summary style={{ cursor: 'pointer', color: '#FFF', fontWeight: 900, fontSize: '13px' }}>
                <span style={{ color: ouro, marginRight: '8px' }}>{faseIndice + 1}</span>
                {fase.titulo || `Fase ${faseIndice + 1}`}
                {fase.periodo ? <small style={{ color: '#777', marginLeft: '8px', fontWeight: 700 }}>· {fase.periodo}</small> : null}
              </summary>

              <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(150px,.55fr)', gap: '9px' }}>
                  <label style={{ fontSize: '11px', color: '#AAA' }}>Nome da fase
                    <input value={fase.titulo || ''} onChange={e => atualizarFase(faseIndice, 'titulo', e.target.value)} style={campo} maxLength={120} />
                  </label>
                  <label style={{ fontSize: '11px', color: '#AAA' }}>Período
                    <input value={fase.periodo || ''} onChange={e => atualizarFase(faseIndice, 'periodo', e.target.value)} style={campo} placeholder="Ex.: 07 a 12/09" maxLength={80} />
                  </label>
                </div>

                <label style={{ fontSize: '11px', color: '#AAA' }}>Objetivo desta fase
                  <textarea value={fase.descricao || ''} onChange={e => atualizarFase(faseIndice, 'descricao', e.target.value)} style={{ ...campo, minHeight: '58px', resize: 'vertical', fontFamily: 'inherit' }} maxLength={360} />
                </label>

                <label style={{ fontSize: '11px', color: '#AAA' }}>Orientação da Suzana para esta fase
                  <textarea value={fase.orientacao || ''} onChange={e => atualizarFase(faseIndice, 'orientacao', e.target.value)} style={{ ...campo, minHeight: '58px', resize: 'vertical', fontFamily: 'inherit' }} maxLength={360} />
                </label>

                <div style={{ display: 'grid', gap: '8px', paddingTop: '4px' }}>
                  {(fase.etapas || []).map((etapa, etapaIndice) => <div key={etapa.id || etapaIndice} style={{ display: 'grid', gridTemplateColumns: '34px 120px minmax(180px,.8fr) minmax(220px,1.2fr) auto', gap: '8px', alignItems: 'end' }}>
                    <span style={{ width: '30px', height: '30px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#29220e', color: ouro, fontSize: '11px', fontWeight: 900 }}>{etapaIndice + 1}</span>
                    <label style={{ fontSize: '10px', color: '#888' }}>Tipo
                      <select value={etapa.icone || 'campaigns'} onChange={e => atualizarEtapa(faseIndice, etapaIndice, 'icone', e.target.value)} style={campo}>
                        {ICONES_CAMPANHA.map(icone => <option key={icone} value={icone}>{icone}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: '10px', color: '#888' }}>Ação
                      <input value={etapa.titulo || ''} onChange={e => atualizarEtapa(faseIndice, etapaIndice, 'titulo', e.target.value)} style={campo} maxLength={120} />
                    </label>
                    <label style={{ fontSize: '10px', color: '#888' }}>Como fazer
                      <input value={etapa.descricao || ''} onChange={e => atualizarEtapa(faseIndice, etapaIndice, 'descricao', e.target.value)} style={campo} maxLength={320} />
                    </label>
                    <button type="button" onClick={() => removerEtapa(faseIndice, etapaIndice)} style={{ ...botao, color: '#f99' }}>Excluir</button>
                  </div>)}

                  <button type="button" onClick={() => adicionarEtapa(faseIndice)} style={{ ...botao, justifySelf: 'start' }}>+ Adicionar ação</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '6px', borderTop: '1px solid #222' }}>
                  <button type="button" onClick={() => removerFase(faseIndice)} style={{ ...botao, color: '#f99' }}>Excluir fase</button>
                </div>
              </div>
            </details>)}

            <button type="button" onClick={adicionarFase} style={{ ...botao, justifySelf: 'start', borderColor: '#66561e' }}>+ Adicionar fase</button>
          </div>
        </section>

        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px', flexWrap: 'wrap' }}>
          <button type="button" onClick={fecharEditor} style={botao}>Cancelar</button>
          <button disabled={enviando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer', opacity: enviando ? .6 : 1 }}>{enviando ? 'Salvando...' : modoForm === 'editar' || itemEmEdicao ? 'Salvar alterações' : 'Publicar campanha'}</button>
        </div>
      </form>}

      <section style={{ display: 'grid', gap: '12px' }}>
        {itens.map(item => {
          const resumo = resumoPlano(item.plano_interativo)
          return <article key={item.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderLeft: `3px solid ${ouro}`, borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: 'rgba(212,175,55,.10)', display: 'grid', placeItems: 'center', fontSize: '24px' }}>🎯</div>
            <div style={{ flex: 1, minWidth: '210px' }}>
              <small style={{ color: ouro, fontWeight: 800, textTransform: 'uppercase' }}>{rotuloMes(item.mes_ano)}</small>
              <h3 style={{ fontSize: '15px', margin: '4px 0 3px' }}>{item.titulo}</h3>
              <p style={{ color: '#777', fontSize: '12px', margin: 0 }}>{item.descricao || 'Campanha pronta para as alunas'}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' }}>
                <span style={{ padding: '4px 7px', borderRadius: '99px', background: '#1d291f', color: '#81d39d', fontSize: '10px', fontWeight: 800 }}>{resumo.fases} {resumo.fases === 1 ? 'fase' : 'fases'}</span>
                <span style={{ padding: '4px 7px', borderRadius: '99px', background: '#1d291f', color: '#81d39d', fontSize: '10px', fontWeight: 800 }}>{resumo.acoes} {resumo.acoes === 1 ? 'ação' : 'ações'}</span>
                <span style={{ padding: '4px 7px', borderRadius: '99px', background: item.arquivo_url ? '#1d291f' : '#251f13', color: item.arquivo_url ? '#81d39d' : '#d8b45a', fontSize: '10px', fontWeight: 800 }}>{item.arquivo_url ? 'PDF disponível' : 'Sem PDF'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
              {item.arquivo_url && <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ ...botao, textDecoration: 'none' }}>Visualizar PDF</a>}
              <button onClick={() => abrirManual(item)} style={botao}>Editar jornada</button>
              <button onClick={() => abrirPdfMensal(item)} style={botao}>PDF</button>
              <button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button>
            </div>
          </article>
        })}
        {!itens.length && <div style={{ textAlign: 'center', padding: '48px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', color: '#777' }}><div style={{ fontSize: '38px' }}>🎯</div><p style={{ marginBottom: 0 }}>Nenhuma campanha publicada.</p></div>}
      </section>
    </main>
  </div>
}

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
