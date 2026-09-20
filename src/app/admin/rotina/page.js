'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { criarPlanoDiarioPadrao, DIAS_PLANO, ICONES_TAREFA, modeloDaRotina, normalizarPlanoDias } from '@/lib/dailyPlan'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '14px' }
const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer' }

function formatarData(data) { const d = new Date(data); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function segundaFeiraAtual() { const hoje = new Date(); const dia = hoje.getDay(); hoje.setDate(hoje.getDate() + (dia === 0 ? 1 : 1 - dia)); return formatarData(hoje) }
function rotuloSemana(valor) { if (!valor) return ''; const [a,m,d] = valor.split('-').map(Number); const inicio = new Date(a,m-1,d); const fim = new Date(a,m-1,d+6); const fmt = x => `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}`; return `De ${fmt(inicio)} a ${fmt(fim)}` }
function mesAtual() { return formatarData(new Date()).slice(0, 7) }
function mesDaSemana(valor) { return String(valor || '').slice(0, 7) }
function rotuloMes(valor) { if (!valor) return ''; const [ano, mes] = valor.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(ano, mes - 1, 1)) }

export default function AdminRotina() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [itens, setItens] = useState([])
  const [formAberto, setFormAberto] = useState(false)
  const [modoForm, setModoForm] = useState('publicar')
  const [itemEmEdicao, setItemEmEdicao] = useState(null)
  const [pdfMensalAberto, setPdfMensalAberto] = useState(false)
  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [arquivoImportacao, setArquivoImportacao] = useState(null)
  const [mesImportacao, setMesImportacao] = useState(mesAtual)
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState(null)
  const [mesPdf, setMesPdf] = useState(mesAtual)
  const [arquivoPdf, setArquivoPdf] = useState(null)
  const [semanaInicio, setSemanaInicio] = useState(segundaFeiraAtual())
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [diaAtivo, setDiaAtivo] = useState('1')
  const [planoDias, setPlanoDias] = useState(criarPlanoDiarioPadrao)
  const [enviando, setEnviando] = useState(false)
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token); await carregar(session.access_token); setCarregando(false)
    }
    iniciar()
  }, [router])

  async function requisicao(method, body, accessToken = token) {
    const form = body instanceof FormData
    const resposta = await fetch('/api/admin/rotina', { method, headers: { Authorization: `Bearer ${accessToken}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir.')
    return dados
  }
  async function carregar(accessToken = token) { try { const dados = await requisicao('GET', null, accessToken); setItens(dados.rotinas || []) } catch (error) { setMensagem(error.message) } }
  function fechar() { setFormAberto(false); setModoForm('publicar'); setItemEmEdicao(null); setSemanaInicio(segundaFeiraAtual()); setTitulo(''); setDescricao(''); setDiaAtivo('1'); setPlanoDias(criarPlanoDiarioPadrao()); setResumoImportacao(null) }
  function abrir(item = null, modo = 'publicar') { setPdfMensalAberto(false); setImportacaoAberta(false); setModoForm(modo); setItemEmEdicao(item); setSemanaInicio(item?.semana_inicio || segundaFeiraAtual()); setTitulo(item?.titulo || ''); setDescricao(item?.descricao || ''); const normalizado = normalizarPlanoDias(item?.plano_dias); setPlanoDias(normalizado); setDiaAtivo(modeloDaRotina(normalizado)?.dias_ativos?.[0] || '1'); setMensagem(''); setFormAberto(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function abrirPdfMensal(item = null) { fechar(); setImportacaoAberta(false); setMesPdf(item?.plano_dias?._modelo?.mes_ano || mesDaSemana(item?.semana_inicio) || mesAtual()); setArquivoPdf(null); setMensagem(''); setPdfMensalAberto(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function fecharPdfMensal() { setPdfMensalAberto(false); setArquivoPdf(null) }
  function abrirImportacao() { fechar(); setPdfMensalAberto(false); setArquivoImportacao(null); setMensagem(''); setImportacaoAberta(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function fecharImportacao() { setImportacaoAberta(false); setArquivoImportacao(null) }

  async function interpretarArquivo(evento) {
    evento.preventDefault()
    if (!arquivoImportacao) { setMensagem('Escolha um arquivo PDF ou Word.'); return }
    setLendoArquivo(true); setMensagem('')
    try {
      const form = new FormData(); form.append('mes_ano', mesImportacao); form.append('arquivo', arquivoImportacao)
      const resposta = await fetch('/api/admin/rotina/interpretar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível ler o arquivo.')
      const normalizado = normalizarPlanoDias(dados.plano_dias, { preencherPadrao: false })
      setPlanoDias(normalizado); setTitulo(dados.titulo || ''); setDescricao(dados.descricao || ''); setModoForm('publicar_mes'); setResumoImportacao(dados.resumo); setDiaAtivo(normalizado._modelo?.dias_ativos?.[0] || '1'); setImportacaoAberta(false); setFormAberto(true)
      setMensagem(`✓ ${dados.resumo.total} ações preparadas. Revise antes de publicar.`)
    } catch (error) { setMensagem(error.message) }
    setLendoArquivo(false)
  }

  function atualizarDia(campoNome, valor) {
    setPlanoDias(atual => ({ ...atual, [diaAtivo]: { ...atual[diaAtivo], [campoNome]: valor } }))
  }

  function atualizarTarefa(indice, campoNome, valor) {
    setPlanoDias(atual => ({
      ...atual,
      [diaAtivo]: {
        ...atual[diaAtivo],
        tarefas: atual[diaAtivo].tarefas.map((tarefa, posicao) => posicao === indice ? { ...tarefa, [campoNome]: valor } : tarefa),
      },
    }))
  }

  function atualizarModeloLista(nome, indice, campoNome, valor) {
    setPlanoDias(atual => ({ ...atual, _modelo: { ...atual._modelo, [nome]: atual._modelo[nome].map((item, posicao) => posicao === indice ? { ...item, [campoNome]: valor } : item) } }))
  }
  function adicionarModeloLista(nome) {
    setPlanoDias(atual => ({ ...atual, _modelo: { ...atual._modelo, [nome]: [...atual._modelo[nome], { id: `${nome}-${Date.now()}`, icone: 'routine', titulo: '', descricao: '', ...(nome === 'tarefas_semanais' ? { dia: '1' } : {}) }] } }))
  }
  function removerModeloLista(nome, indice) {
    setPlanoDias(atual => ({ ...atual, _modelo: { ...atual._modelo, [nome]: atual._modelo[nome].filter((_, posicao) => posicao !== indice) } }))
  }
  function adicionarTarefaDia() {
    setPlanoDias(atual => ({ ...atual, [diaAtivo]: { ...atual[diaAtivo], tarefas: [...(atual[diaAtivo]?.tarefas || []), { id: `dia-${diaAtivo}-${Date.now()}`, icone: 'routine', titulo: '', descricao: '' }] } }))
  }
  function removerTarefaDia(indice) {
    setPlanoDias(atual => ({ ...atual, [diaAtivo]: { ...atual[diaAtivo], tarefas: atual[diaAtivo].tarefas.filter((_, posicao) => posicao !== indice) } }))
  }
  function atualizarDestaque(campoNome, valor) {
    setPlanoDias(atual => ({ ...atual, [diaAtivo]: { ...atual[diaAtivo], destaque: { id: `especial-${diaAtivo}`, icone: 'campaigns', titulo: '', descricao: '', ...(atual[diaAtivo]?.destaque || {}), [campoNome]: valor } } }))
  }

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true); setMensagem('')
    try {
      if (modoForm === 'editar') {
        await requisicao('PUT', { id: itemEmEdicao.id, semana_inicio: semanaInicio, titulo, descricao, plano_dias: planoDias })
        await carregar(); fechar(); setMensagem('✓ Rotina atualizada com sucesso.')
      } else if (modoForm === 'publicar_mes') {
        const dados = await requisicao('POST', { operacao: 'publicar_mes', mes_ano: mesImportacao, titulo, descricao, plano_dias: planoDias })
        await carregar(); fechar(); setMensagem(`✓ Rotina mensal publicada em ${dados.total} semanas de ${rotuloMes(mesImportacao)}.`)
      } else {
        const form = new FormData(); form.append('semana_inicio', semanaInicio); form.append('titulo', titulo); form.append('descricao', descricao); form.append('plano_dias', JSON.stringify(planoDias))
        const dados = await requisicao('POST', form); await carregar(); fechar(); setMensagem(dados.substituido ? '✓ Rotina da semana substituída.' : '✓ Rotina semanal publicada. O PDF mensal foi vinculado automaticamente, se já estava disponível.')
      }
    } catch (error) { setMensagem(error.message) }
    setEnviando(false)
  }
  async function enviarPdfMensal(evento) {
    evento.preventDefault()
    if (!arquivoPdf) { setMensagem('Selecione o PDF mensal da rotina.'); return }
    if (arquivoPdf.type !== 'application/pdf') { setMensagem('Envie somente um arquivo PDF.'); return }
    if (arquivoPdf.size > 20 * 1024 * 1024) { setMensagem('O PDF deve ter no máximo 20 MB.'); return }
    setEnviandoPdf(true); setMensagem('')
    try {
      const form = new FormData(); form.append('mes_ano', mesPdf); form.append('arquivo', arquivoPdf)
      const dados = await requisicao('PATCH', form)
      await carregar(); fecharPdfMensal(); setMensagem(`✓ PDF mensal vinculado a ${dados.rotinas_atualizadas} ${dados.rotinas_atualizadas === 1 ? 'rotina semanal' : 'rotinas semanais'} de ${rotuloMes(mesPdf)}.`)
    } catch (error) { setMensagem(error.message) }
    setEnviandoPdf(false)
  }
  async function excluir(item) { if (!confirm(`Excluir a rotina ${rotuloSemana(item.semana_inicio)}?`)) return; try { await requisicao('DELETE', { id: item.id }); await carregar(); setMensagem('✓ Rotina excluída.') } catch (error) { setMensagem(error.message) } }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />
  const modeloEstruturado = modeloDaRotina(planoDias)
  const diasDoFormulario = modeloEstruturado ? DIAS_PLANO.filter(dia => modeloEstruturado.dias_ativos.includes(dia.key)) : DIAS_PLANO

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}><button onClick={() => router.push('/admin')} style={{ ...botao, background: 'transparent' }}>← Admin</button></header>
    <main style={{ maxWidth: '920px', margin: '0 auto', padding: '26px 18px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '22px' }}><div><p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p><h1 style={{ fontSize: '24px', margin: '5px 0' }}>Rotina mensal</h1><p style={{ color: '#888', margin: 0 }}>Importe a rotina uma vez, revise e publique todas as semanas do mês.</p></div>{!formAberto && !pdfMensalAberto && !importacaoAberta && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button onClick={() => abrirPdfMensal()} style={botao}>↑ PDF mensal</button><button onClick={abrirImportacao} style={{ ...botao, borderColor: '#66561e' }}>↑ Importar PDF ou Word</button><button onClick={() => abrir()} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '11px 17px', fontWeight: 900, cursor: 'pointer' }}>+ Criar semana</button></div>}</div>
      {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

      {importacaoAberta && <form onSubmit={interpretarArquivo} style={{ background: '#111', border: '1px solid #66561e', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <p style={{ color: ouro, fontSize: '11px', fontWeight: 900, letterSpacing: '.09em', margin: '0 0 5px' }}>LEITURA INTELIGENTE</p><h2 style={{ fontSize: '18px', margin: '0 0 5px' }}>Preparar rotina do mês</h2><p style={{ color: '#888', fontSize: '13px', margin: '0 0 17px' }}>O aplicativo separa tarefas diárias, padrão de atendimento, ações da semana, tarefas por dia e missões especiais da Suzana.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}><label>Mês da rotina *<input type="month" value={mesImportacao} onChange={e => setMesImportacao(e.target.value)} style={{ ...campo, colorScheme: 'dark' }} /></label><label style={{ display: 'block', border: '1px dashed #66561e', background: '#0A0A0A', borderRadius: '12px', padding: '14px 16px', textAlign: 'center', cursor: 'pointer' }}><strong style={{ color: ouro, display: 'block', marginBottom: '4px' }}>{arquivoImportacao ? `📄 ${arquivoImportacao.name}` : '↑ Selecionar PDF ou Word'}</strong><small style={{ color: '#777' }}>{arquivoImportacao ? `${(arquivoImportacao.size / 1024 / 1024).toFixed(1)} MB` : 'PDF ou .docx · até 10 MB'}</small><input type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setArquivoImportacao(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label></div>
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px', flexWrap: 'wrap' }}><button type="button" onClick={fecharImportacao} style={botao}>Cancelar</button><button disabled={lendoArquivo || !arquivoImportacao} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer', opacity: lendoArquivo || !arquivoImportacao ? .6 : 1 }}>{lendoArquivo ? 'Lendo e organizando...' : 'Ler arquivo e preparar rotina'}</button></div>
      </form>}

      {pdfMensalAberto && <form onSubmit={enviarPdfMensal} style={{ background: '#111', border: '1px solid #66561e', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <p style={{ color: ouro, fontSize: '11px', fontWeight: 900, letterSpacing: '.09em', margin: '0 0 5px' }}>MATERIAL COMPLETO DO MÊS</p><h2 style={{ fontSize: '18px', margin: '0 0 5px' }}>PDF mensal da rotina</h2><p style={{ color: '#888', fontSize: '13px', margin: '0 0 17px' }}>Envie uma vez. O mesmo PDF será vinculado automaticamente a todas as rotinas semanais do mês escolhido.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}><label>Mês *<input type="month" value={mesPdf} onChange={e => { setMesPdf(e.target.value); setArquivoPdf(null) }} style={{ ...campo, colorScheme: 'dark' }} /></label><label style={{ display: 'block', border: '1px dashed #66561e', background: '#0A0A0A', borderRadius: '12px', padding: '14px 16px', textAlign: 'center', cursor: 'pointer' }}><strong style={{ color: ouro, display: 'block', marginBottom: '4px' }}>{arquivoPdf ? `📄 ${arquivoPdf.name}` : '↑ Selecionar o PDF completo'}</strong><small style={{ color: '#777' }}>{arquivoPdf ? `${(arquivoPdf.size / 1024 / 1024).toFixed(1)} MB` : `PDF de ${rotuloMes(mesPdf)} · até 20 MB`}</small><input type="file" accept="application/pdf" onChange={e => setArquivoPdf(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label></div>
        {itens.some(item => mesDaSemana(item.semana_inicio) === mesPdf && item.arquivo_url) && <p style={{ color: '#81d39d', fontSize: '12px', margin: '12px 0 0' }}>✓ Este mês já possui um PDF. O novo arquivo substituirá o atual em todas as semanas.</p>}
        {!itens.some(item => mesDaSemana(item.semana_inicio) === mesPdf) && <p style={{ color: '#f0c96b', fontSize: '12px', margin: '12px 0 0' }}>Crie pelo menos uma rotina semanal deste mês antes de enviar o PDF.</p>}
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px' }}><button type="button" onClick={fecharPdfMensal} style={botao}>Cancelar</button><button disabled={enviandoPdf || !arquivoPdf} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer', opacity: enviandoPdf || !arquivoPdf ? .6 : 1 }}>{enviandoPdf ? 'Enviando...' : 'Salvar PDF mensal'}</button></div>
      </form>}

      {formAberto && <form onSubmit={enviar} style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <h2 style={{ fontSize: '17px', margin: '0 0 5px' }}>{modoForm === 'editar' ? 'Editar rotina semanal' : modoForm === 'publicar_mes' ? `Revisar rotina de ${rotuloMes(mesImportacao)}` : 'Publicar rotina da semana'}</h2><p style={{ color: '#777', fontSize: '12px', margin: '0 0 17px' }}>{modoForm === 'editar' ? 'Atualize o plano interativo. O PDF mensal será mantido.' : modoForm === 'publicar_mes' ? 'Confira as ações identificadas. Ao publicar, o sistema cria ou atualiza todas as semanas deste mês.' : 'Cadastre o plano interativo desta semana. Se o mês já tiver um PDF, ele será vinculado automaticamente.'}</p>
        {resumoImportacao && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>{[['Todos os dias', resumoImportacao.diarias], ['Atendimento', resumoImportacao.atendimento], ['Semanais', resumoImportacao.semanais], ['Dias ativos', resumoImportacao.dias]].map(([rotulo, valor]) => <div key={rotulo} style={{ background: '#0b0b0b', border: '1px solid #2e2b24', borderRadius: '10px', padding: '10px' }}><strong style={{ color: ouro, fontSize: '19px' }}>{valor}</strong><small style={{ color: '#888', display: 'block' }}>{rotulo}</small></div>)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>{modoForm === 'publicar_mes' ? <label>Mês *<input type="month" value={mesImportacao} onChange={e => setMesImportacao(e.target.value)} style={{ ...campo, colorScheme: 'dark' }} /></label> : <label>Segunda-feira da semana *<input type="date" value={semanaInicio} onChange={e => setSemanaInicio(e.target.value)} style={{ ...campo, colorScheme: 'dark' }} /><small style={{ display: 'block', color: '#777', marginTop: '4px' }}>{rotuloSemana(semanaInicio)}</small></label>}<label>Nome <small style={{ color: '#777' }}>(opcional)</small><input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo} placeholder="Rotina da semana" /></label></div>
        <label style={{ display: 'block', marginTop: '12px' }}>Descrição <small style={{ color: '#777' }}>(opcional)</small><input value={descricao} onChange={e => setDescricao(e.target.value)} style={campo} placeholder="Explique rapidamente o foco da semana" /></label>

        <section style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #292929' }}>
          <div style={{ marginBottom: '13px' }}><strong style={{ display: 'block', fontSize: '15px' }}>Plano interativo</strong><small style={{ color: '#777' }}>{modeloEstruturado ? 'Revise as tarefas comuns e depois confira cada dia da semana.' : 'Escolha um dia e edite o foco, a orientação e as sete frentes de vendas.'}</small></div>
          {modeloEstruturado && <div style={{ display: 'grid', gap: '12px', marginBottom: '18px' }}>
            <EditorLista titulo="Todos os dias" ajuda="Estas ações reaparecem em cada dia ativo." itens={modeloEstruturado.tarefas_diarias} onChange={(i, c, v) => atualizarModeloLista('tarefas_diarias', i, c, v)} onAdd={() => adicionarModeloLista('tarefas_diarias')} onRemove={i => removerModeloLista('tarefas_diarias', i)} />
            <EditorLista titulo="A cada atendimento" ajuda="Padrão de atendimento para consulta; não entra na contagem diária." itens={modeloEstruturado.padrao_atendimento} onChange={(i, c, v) => atualizarModeloLista('padrao_atendimento', i, c, v)} onAdd={() => adicionarModeloLista('padrao_atendimento')} onRemove={i => removerModeloLista('padrao_atendimento', i)} />
            <EditorLista titulo="Uma vez por semana" ajuda="Escolha em qual dia cada ação deve aparecer." itens={modeloEstruturado.tarefas_semanais} mostraDia onChange={(i, c, v) => atualizarModeloLista('tarefas_semanais', i, c, v)} onAdd={() => adicionarModeloLista('tarefas_semanais')} onRemove={i => removerModeloLista('tarefas_semanais', i)} />
          </div>}
          <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '12px' }}>{diasDoFormulario.map(dia => <button key={dia.key} type="button" onClick={() => setDiaAtivo(dia.key)} style={{ ...botao, flex: '0 0 auto', color: diaAtivo === dia.key ? '#090909' : ouro, background: diaAtivo === dia.key ? ouroGrad : '#161616', borderColor: diaAtivo === dia.key ? 'transparent' : '#333', fontWeight: 900 }}>{dia.curto}</button>)}</div>
          <div style={{ display: 'grid', gap: '11px', padding: '15px', border: '1px solid #2e2b24', borderRadius: '13px', background: '#0d0d0d' }}>
            <label>Foco comercial do dia<input value={planoDias[diaAtivo]?.foco_titulo || ''} onChange={e => atualizarDia('foco_titulo', e.target.value)} style={campo} placeholder="Ex.: Recuperar oportunidades abertas" maxLength={120} /></label>
            <label>Explicação do foco<textarea value={planoDias[diaAtivo]?.foco_descricao || ''} onChange={e => atualizarDia('foco_descricao', e.target.value)} style={{ ...campo, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }} placeholder="Explique o que a lojista deve priorizar" maxLength={280} /></label>
            <div style={{ display: 'grid', gap: '9px' }}>{(planoDias[diaAtivo]?.tarefas || []).map((tarefa, indice) => <div key={tarefa.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <label style={{ fontSize: '11px', color: '#AAA' }}>Ícone<select value={tarefa.icone} onChange={e => atualizarTarefa(indice, 'icone', e.target.value)} style={campo}>{ICONES_TAREFA.map(icone => <option key={icone.value} value={icone.value}>{icone.label}</option>)}</select></label>
              <label style={{ fontSize: '11px', color: '#AAA' }}>Ação {indice + 1}<input value={tarefa.titulo} onChange={e => atualizarTarefa(indice, 'titulo', e.target.value)} style={campo} maxLength={100} /></label>
              <label style={{ fontSize: '11px', color: '#AAA' }}>Complemento<input value={tarefa.descricao} onChange={e => atualizarTarefa(indice, 'descricao', e.target.value)} style={campo} maxLength={160} /></label>
              {modeloEstruturado && <button type="button" onClick={() => removerTarefaDia(indice)} style={{ ...botao, color: '#f99' }}>Remover</button>}
            </div>)}</div>
            {modeloEstruturado && <button type="button" onClick={adicionarTarefaDia} style={{ ...botao, justifySelf: 'start' }}>+ Adicionar tarefa deste dia</button>}
            {modeloEstruturado && <div style={{ border: '1px solid #66561e', borderRadius: '11px', padding: '12px', background: '#171309' }}><strong style={{ color: ouro, fontSize: '13px' }}>Missão especial da Suzana <small style={{ color: '#888', fontWeight: 400 }}>(opcional)</small></strong><div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 2fr)', gap: '8px', marginTop: '8px' }}><input value={planoDias[diaAtivo]?.destaque?.titulo || ''} onChange={e => atualizarDestaque('titulo', e.target.value)} style={campo} placeholder="Título da missão especial" /><input value={planoDias[diaAtivo]?.destaque?.descricao || ''} onChange={e => atualizarDestaque('descricao', e.target.value)} style={campo} placeholder="Como executar esta missão" /></div></div>}
            <label>Próxima orientação da Suzana<textarea value={planoDias[diaAtivo]?.orientacao || ''} onChange={e => atualizarDia('orientacao', e.target.value)} style={{ ...campo, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }} placeholder="Mensagem exibida depois do checklist" maxLength={280} /></label>
          </div>
        </section>
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px' }}><button type="button" onClick={fechar} style={botao}>Cancelar</button><button disabled={enviando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{enviando ? 'Salvando...' : modoForm === 'editar' ? 'Salvar alterações' : modoForm === 'publicar_mes' ? 'Publicar todas as semanas' : 'Publicar rotina'}</button></div>
      </form>}

      <section style={{ display: 'grid', gap: '12px' }}>{itens.map(item => <article key={item.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderLeft: `3px solid ${ouro}`, borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}><div style={{ width: '52px', height: '52px', borderRadius: '13px', background: 'rgba(212,175,55,.10)', display: 'grid', placeItems: 'center', fontSize: '24px' }}>✓</div><div style={{ flex: 1, minWidth: '190px' }}><small style={{ color: ouro, fontWeight: 800, textTransform: 'uppercase' }}>{rotuloSemana(item.semana_inicio)}</small><h3 style={{ fontSize: '15px', margin: '4px 0 3px' }}>{item.titulo}</h3><p style={{ color: '#777', fontSize: '12px', margin: 0 }}>{item.descricao || 'Rotina prática para executar durante a semana'}</p><span style={{ display: 'inline-block', marginTop: '7px', padding: '4px 7px', borderRadius: '99px', background: '#1d291f', color: '#81d39d', fontSize: '10px', fontWeight: 800 }}>Plano diário interativo</span><span style={{ display: 'inline-block', margin: '7px 0 0 6px', padding: '4px 7px', borderRadius: '99px', background: item.arquivo_url ? '#1d291f' : '#29251a', color: item.arquivo_url ? '#81d39d' : '#c7a94b', fontSize: '10px', fontWeight: 800 }}>{item.arquivo_url ? 'PDF mensal disponível' : 'Sem PDF mensal'}</span></div><div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>{item.arquivo_url && <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ ...botao, textDecoration: 'none' }}>Visualizar PDF mensal</a>}<button onClick={() => abrir(item, 'editar')} style={botao}>Editar plano</button><button onClick={() => abrirPdfMensal(item)} style={botao}>{item.arquivo_url ? 'Substituir PDF mensal' : 'Adicionar PDF mensal'}</button><button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button></div></article>)}
      {!itens.length && <div style={{ textAlign: 'center', padding: '48px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', color: '#777' }}><div style={{ fontSize: '38px' }}>🔄</div><p style={{ marginBottom: 0 }}>Nenhuma rotina publicada.</p></div>}</section>
    </main>
  </div>
}

function EditorLista({ titulo, ajuda, itens, mostraDia = false, onChange, onAdd, onRemove }) {
  return <section style={{ border: '1px solid #2e2b24', borderRadius: '13px', padding: '14px', background: '#0d0d0d' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '10px' }}><div><strong style={{ fontSize: '14px' }}>{titulo}</strong><small style={{ color: '#777', display: 'block', marginTop: '2px' }}>{ajuda}</small></div><button type="button" onClick={onAdd} style={botao}>+ Adicionar</button></div>
    <div style={{ display: 'grid', gap: '8px' }}>{itens.map((item, indice) => <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '7px', alignItems: 'center' }}>
      {mostraDia && <select aria-label={`Dia da ação ${indice + 1}`} value={item.dia || '1'} onChange={e => onChange(indice, 'dia', e.target.value)} style={campo}>{DIAS_PLANO.map(dia => <option key={dia.key} value={dia.key}>{dia.curto}</option>)}</select>}
      <input aria-label={`Título da ação ${indice + 1}`} value={item.titulo} onChange={e => onChange(indice, 'titulo', e.target.value)} style={campo} placeholder="Ação" />
      <input aria-label={`Explicação da ação ${indice + 1}`} value={item.descricao} onChange={e => onChange(indice, 'descricao', e.target.value)} style={campo} placeholder="Como executar" />
      <button type="button" onClick={() => onRemove(indice)} style={{ ...botao, color: '#f99' }}>×</button>
    </div>)}</div>
  </section>
}

function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
