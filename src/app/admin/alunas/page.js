'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import './alunas.css'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

// ──────── Helpers de formatação ────────
function iniciais(nome, email) {
  const base = (nome || email || '?').trim()
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'AL'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

function formatarData(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza' }).format(new Date(iso))
  } catch {
    return '—'
  }
}

function formatarWhatsapp(num) {
  const d = String(num || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return num || ''
}

function normalizarCabecalho(valor) {
  return valor.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function lerCsv(conteudo) {
  const linhas = conteudo.replace(/^\uFEFF/, '').split(/\r?\n/).filter(linha => linha.trim())
  if (linhas.length < 2) return []
  const separador = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','
  const cabecalhos = linhas[0].split(separador).map(normalizarCabecalho)
  const indice = nomes => cabecalhos.findIndex(item => nomes.includes(item))
  const iNome = indice(['nome', 'name', 'nome completo']); const iEmail = indice(['email', 'e-mail'])
  const iTelefone = indice(['telefone', 'phone', 'whatsapp', 'celular'])
  const iExpira = indice(['data de expiracao', 'expiracao', 'validade', 'data de validade', 'acesso ate'])
  const iCompra = indice(['data da compra', 'data de compra', 'compra', 'comprado em'])
  if (iNome < 0 || iEmail < 0) return []
  return linhas.slice(1).map(linha => {
    const colunas = linha.split(separador).map(item => item.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
    return { nome: colunas[iNome] || '', email: colunas[iEmail] || '', telefone: iTelefone >= 0 ? colunas[iTelefone] || '' : '', dataExpiracao: iExpira >= 0 ? colunas[iExpira] || '' : '', dataCompra: iCompra >= 0 ? colunas[iCompra] || '' : '' }
  }).filter(item => item.nome || item.email)
}

// "Desativada" = acesso com data no passado (mesmo mecanismo que o botão de desativar usa).
function estaDesativada(aluna) {
  if (!aluna.acesso_expira_em) return false
  return new Date(aluna.acesso_expira_em) < new Date()
}

// Regra de status exibida: ativa a menos que o acesso tenha vencido
// ou a assinatura esteja cancelada/inativa.
function estaAtiva(aluna) {
  if (estaDesativada(aluna)) return false
  const s = String(aluna.status_assinatura || '').toLowerCase()
  if (s === 'cancelado' || s === 'cancelada' || s === 'inativo' || s === 'inativa') return false
  return true
}

// Monta o rótulo de vencimento: prazo fixo (acesso_expira_em) vira "acesso até"/"venceu em";
// assinatura (proxima_cobranca_em) vira "renova em".
function vencimentoInfo(aluna) {
  const agora = Date.now()
  if (aluna.acesso_expira_em) {
    const t = new Date(aluna.acesso_expira_em).getTime()
    if (t < agora) return { label: 'venceu em', data: formatarData(aluna.acesso_expira_em), tom: 'exp' }
    const trintaDias = 30 * 24 * 60 * 60 * 1000
    return { label: 'acesso até', data: formatarData(aluna.acesso_expira_em), tom: t - agora <= trintaDias ? 'warn' : '' }
  }
  if (aluna.proxima_cobranca_em) {
    const t = new Date(aluna.proxima_cobranca_em).getTime()
    return { label: t < agora ? 'renovar em' : 'renova em', data: formatarData(aluna.proxima_cobranca_em), tom: t < agora ? 'warn' : '' }
  }
  return { label: '—', data: '', tom: '' }
}

const CORES_TOM = { '': '#dddddd', warn: '#e0b84a', exp: '#e88' }

export default function AdminAlunas() {
  const router = useRouter()

  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [alunas, setAlunas] = useState([])
  const [acessos, setAcessos] = useState({}) // id -> last_sign_in_at
  const [cadastros, setCadastros] = useState({})
  const [cursos, setCursos] = useState([])
  const [planos, setPlanos] = useState([])
  const [matriculas, setMatriculas] = useState([])
  const [vinculosPlanos, setVinculosPlanos] = useState([])
  const [msg, setMsg] = useState('')

  // Filtros
  const [busca, setBusca] = useState('')
  const [emailFiltro, setEmailFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todas')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [abaFiltro, setAbaFiltro] = useState('aluna')
  const [codigoFiltro, setCodigoFiltro] = useState('')
  const [cadastroFiltro, setCadastroFiltro] = useState('')
  const [ultimoFiltro, setUltimoFiltro] = useState('')
  const [cursoFiltro, setCursoFiltro] = useState('')
  const [planoFiltro, setPlanoFiltro] = useState('')

  // Modal Gerenciar (editar/desativar/reenviar)
  const [gerenciando, setGerenciando] = useState(null) // objeto aluna
  const [edNome, setEdNome] = useState('')
  const [edWhatsapp, setEdWhatsapp] = useState('')
  const [edEmail, setEdEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [desativando, setDesativando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  // Modal Nova aluna
  const [novaAberto, setNovaAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [novoCurso, setNovoCurso] = useState('')
  const [novoEnviarEmail, setNovoEnviarEmail] = useState(true)
  const [cadastrando, setCadastrando] = useState(false)

  // Modal de importação em massa
  const [massaAberto, setMassaAberto] = useState(false)
  const [arquivoNome, setArquivoNome] = useState('')
  const [alunasCsv, setAlunasCsv] = useState([])
  const [cursosMassa, setCursosMassa] = useState([])
  const [planosMassa, setPlanosMassa] = useState([])
  const [emailMassa, setEmailMassa] = useState(false)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (user.email !== ADMIN_EMAIL) { setAutorizado(false); setCarregando(false); return }
      setAutorizado(true)
      await carregar()
      setCarregando(false)
    }
    init()
  }, [router])

  async function carregar() {
    const { data: { session } } = await supabase.auth.getSession()
    const [lista, opcoesResp] = await Promise.all([
      supabase.from('perfis').select('*').order('nome', { ascending: true }),
      fetch('/api/admin/alunas', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } }),
    ])
    if (lista.data) setAlunas(lista.data)
    if (opcoesResp.ok) { const opcoes = await opcoesResp.json(); setCursos(opcoes.cursos || []); setPlanos(opcoes.planos || []); setMatriculas(opcoes.matriculas || []); setVinculosPlanos(opcoes.vinculos || []) }
    carregarAcessos() // não bloqueia a lista; preenche o "último acesso" quando chegar
  }

  async function carregarAcessos() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const resp = await fetch('/api/admin/ultimo-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      })
      const json = await resp.json()
      if (resp.ok && json.acessos) setAcessos(json.acessos)
      if (resp.ok && json.cadastros) setCadastros(json.cadastros)
    } catch {
      // silencioso: sem último acesso, a tela continua funcionando
    }
  }

  function aviso(texto, tempo = 4000) {
    setMsg(texto)
    if (tempo) setTimeout(() => setMsg(''), tempo)
  }

  // ──────── Gerenciar aluna ────────
  function abrirGerenciar(aluna) {
    setGerenciando(aluna)
    setEdNome(aluna.nome || '')
    setEdWhatsapp(aluna.whatsapp || '')
    setEdEmail(aluna.email || '')
    setMsg('')
  }
  function fecharGerenciar() {
    setGerenciando(null)
    setEdNome(''); setEdWhatsapp(''); setEdEmail('')
  }

  async function salvarEdicao() {
    if (!edNome.trim() || !/^\S+@\S+\.\S+$/.test(edEmail.trim())) { aviso('⚠ Informe nome e e-mail válidos.'); return }
    setSalvando(true)
    try {
      const resposta = await chamarAdmin('PATCH', { id: gerenciando.id, nome: edNome, email: edEmail, whatsapp: edWhatsapp })
      if (!resposta.ok) throw new Error(resposta.json.error)
      await carregar()
      aviso('✓ Dados atualizados com sucesso!')
      fecharGerenciar()
    } catch (e) {
      aviso('⚠ Erro: ' + e.message, 5000)
    }
    setSalvando(false)
  }

  async function desativarAluna() {
    setDesativando(true)
    try {
      const resposta = await chamarAdmin('PATCH', { id: gerenciando.id, acao: 'desativar' })
      if (!resposta.ok) throw new Error(resposta.json.error)
      await carregar()
      aviso(`✓ Acesso de ${gerenciando.nome || gerenciando.email} desativado.`, 5000)
      fecharGerenciar()
    } catch (e) {
      aviso('⚠ Erro ao desativar: ' + e.message, 5000)
    }
    setDesativando(false)
  }

  async function reativarAluna() {
    setDesativando(true)
    try {
      const resposta = await chamarAdmin('PATCH', { id: gerenciando.id, acao: 'reativar' })
      if (!resposta.ok) throw new Error(resposta.json.error)
      await carregar()
      aviso(`✓ Acesso reativado por mais 30 dias.`, 5000)
      fecharGerenciar()
    } catch (e) {
      aviso('⚠ Erro ao reativar: ' + e.message, 5000)
    }
    setDesativando(false)
  }

  async function reenviarBoasVindas() {
    const ok = confirm(`Reenviar e-mail de boas-vindas para ${gerenciando.email}?\n\nUma nova senha será gerada e enviada. A senha antiga deixa de funcionar.`)
    if (!ok) return
    setReenviando(true)
    try {
      const resp = await fetch('/api/reenviar-boas-vindas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await supabase.auth.getSession()).data.session?.access_token },
        body: JSON.stringify({ alunaId: gerenciando.id }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.erro || json.error || 'Falha ao reenviar')
      aviso(`✓ E-mail reenviado para ${gerenciando.email}!`, 5000)
    } catch (e) {
      aviso('⚠ Erro ao reenviar: ' + e.message, 5000)
    }
    setReenviando(false)
  }

  // ──────── Nova aluna (reusa /api/criar-aluna) ────────
  function abrirNova() {
    setNovoNome(''); setNovoEmail(''); setNovoWhatsapp(''); setNovoCurso(''); setNovoEnviarEmail(true)
    setMsg(''); setNovaAberto(true)
  }
  function fecharNova() {
    setNovaAberto(false)
    setNovoNome(''); setNovoEmail(''); setNovoWhatsapp(''); setNovoCurso('')
  }

  async function cadastrarAluna() {
    if (!novoNome.trim() || !/^\S+@\S+\.\S+$/.test(novoEmail.trim())) { aviso('⚠ Nome e e-mail válidos são obrigatórios.'); return }
    setCadastrando(true)
    try {
      const resposta = await chamarAdmin('POST', { modo: 'individual', aluna: { nome: novoNome, email: novoEmail, telefone: novoWhatsapp }, cursoIds: novoCurso ? [novoCurso] : [], enviarBoasVindas: novoEnviarEmail })
      if (!resposta.ok) throw new Error(resposta.json.error || 'Falha ao cadastrar')
      await carregar()
      aviso(`✓ ${novoNome} cadastrada${novoEnviarEmail ? ' e e-mail enviado' : ' no modo silencioso'}!`, 6000)
      fecharNova()
    } catch (e) {
      aviso('⚠ Erro: ' + e.message, 6000)
    }
    setCadastrando(false)
  }

  async function chamarAdmin(method, body) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, json: { error: 'Sessão expirada.' } }
    const resp = await fetch('/api/admin/alunas', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
    return { ok: resp.ok, json: await resp.json() }
  }

  async function excluirAluna() {
    const confirmacao = window.prompt(`Para excluir definitivamente ${gerAluna.nome || gerAluna.email}, digite EXCLUIR.`)
    if (confirmacao !== 'EXCLUIR') return
    setExcluindo(true)
    const resposta = await chamarAdmin('DELETE', { id: gerAluna.id, confirmacao })
    setExcluindo(false)
    if (!resposta.ok) { aviso(`⚠ ${resposta.json.error}`, 6000); return }
    fecharGerenciar(); await carregar(); aviso('✓ Aluna excluída definitivamente.', 5000)
  }

  function baixarCsv() {
    const linhas = [['Nome','Email','Telefone','Tipo de acesso','Data de expiração'], ...alunasFiltradas.map(a => [a.nome || '', a.email || '', a.whatsapp || '', a.tipo_acesso || '', a.acesso_expira_em || ''])]
    const csv = '\uFEFF' + linhas.map(linha => linha.map(valor => `"${String(valor).replaceAll('"','""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `alunas-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  async function escolherCsv(event) {
    const arquivo = event.target.files?.[0]; event.target.value = ''
    if (!arquivo) return
    const lista = lerCsv(await arquivo.text())
    if (!lista.length) { aviso('⚠ O CSV precisa ter as colunas Nome e Email.', 6000); return }
    setArquivoNome(arquivo.name); setAlunasCsv(lista)
  }

  async function importarCsv() {
    setImportando(true)
    const resposta = await chamarAdmin('POST', { modo: 'massa', alunas: alunasCsv, cursoIds: cursosMassa, planoIds: planosMassa, enviarBoasVindas: emailMassa })
    setImportando(false)
    if (!resposta.ok) { aviso(`⚠ ${resposta.json.error}`, 8000); return }
    setMassaAberto(false); setAlunasCsv([]); setArquivoNome(''); setCursosMassa([]); setPlanosMassa([]); await carregar()
    aviso(`✓ ${resposta.json.criadas} aluna(s) criada(s)${resposta.json.falhas?.length ? `; ${resposta.json.falhas.length} linha(s) não foram importadas` : ''}.`, 8000)
  }

  // ──────── Lista filtrada ────────
  const tiposDisponiveis = useMemo(() => {
    const set = new Set()
    alunas.forEach(a => { if (a.tipo_acesso) set.add(a.tipo_acesso) })
    return Array.from(set).sort()
  }, [alunas])

  const alunasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return alunas.filter(a => {
      if (q && !String(a.nome || '').toLowerCase().includes(q)) return false
      if (emailFiltro.trim() && !String(a.email || '').toLowerCase().includes(emailFiltro.trim().toLowerCase())) return false
      if (codigoFiltro && !a.id.toLowerCase().includes(codigoFiltro.trim().toLowerCase())) return false
      if (cadastroFiltro && String(cadastros[a.id] || '').slice(0, 10) !== cadastroFiltro) return false
      if (ultimoFiltro && String(acessos[a.id] || '').slice(0, 10) !== ultimoFiltro) return false
      if (tipoFiltro !== 'todos' && a.tipo_acesso !== tipoFiltro) return false
      if (statusFiltro === 'ativas' && !estaAtiva(a)) return false
      if (statusFiltro === 'vencidas' && !estaDesativada(a)) return false
      if (statusFiltro === 'nunca' && acessos[a.id]) return false
      if (cursoFiltro && !matriculas.some(m => m.profile_id === a.id && m.course_id === cursoFiltro)) return false
      if (planoFiltro) {
        const idsCurso = vinculosPlanos.filter(v => v.plan_id === planoFiltro).map(v => v.course_id)
        if (!matriculas.some(m => m.profile_id === a.id && idsCurso.includes(m.course_id))) return false
      }
      return true
    })
  }, [alunas, busca, emailFiltro, tipoFiltro, statusFiltro, codigoFiltro, cadastroFiltro, ultimoFiltro, cursoFiltro, planoFiltro, acessos, cadastros, matriculas, vinculosPlanos])

  // ──────── Telas de bloqueio ────────
  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: '15px' }}>Carregando...</p>
      </div>
    )
  }

  if (!autorizado) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '44px', marginBottom: '14px' }}>🔒</div>
        <h1 style={{ color: '#FFF', fontSize: '20px', margin: '0 0 8px' }}>Acesso restrito</h1>
        <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>Esta área é exclusiva do administrador.</p>
        <button onClick={() => router.push('/painel')} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Voltar ao painel</button>
      </div>
    )
  }

  const inputEstilo = { width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }
  const labelEstilo = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }
  const gerAluna = gerenciando ? alunas.find(a => a.id === gerenciando.id) || gerenciando : null
  const gerDesativada = gerAluna ? estaDesativada(gerAluna) : false

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Escritório</button>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
          <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>👥 Gerenciar Alunas</p>
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {/* Resumo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(212,175,55,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ouro, fontSize: '22px' }}>👥</div>
          <div>
            <div style={{ fontSize: '11px', color: '#888' }}>Alunas {busca || tipoFiltro !== 'todos' || statusFiltro !== 'todas' ? 'encontradas' : 'cadastradas'}</div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{alunasFiltradas.length} {alunasFiltradas.length === 1 ? 'aluna' : 'alunas'}</div>
          </div>
        </div>

        <div className="alunas-titlebar">
          <div><h1>Lista de alunas</h1><p>Clique numa aluna para gerenciar o acesso aos cursos.</p></div>
          <div className="alunas-tools">
            <button className="ghost" onClick={baixarCsv}>⇩ Baixar</button>
            <div className="filtro-wrap"><button className="ghost" onClick={() => setFiltrosAbertos(v => !v)}>▽ Filtros</button>
              {filtrosAbertos && <div className="filtro-pop">
                <h3>▽ Filtros de pesquisa</h3>
                <div className="filtro-tabs"><button className={abaFiltro === 'aluna' ? 'on' : ''} onClick={() => setAbaFiltro('aluna')}>Dados da aluna</button><button className={abaFiltro === 'produtos' ? 'on' : ''} onClick={() => setAbaFiltro('produtos')}>Planos e ofertas</button></div>
                {abaFiltro === 'aluna' ? <div className="filtro-campos">
                  <label>Nome da aluna<input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome da aluna" /></label>
                  <label>E-mail da aluna<input type="email" value={emailFiltro} onChange={e => setEmailFiltro(e.target.value)} placeholder="E-mail da aluna" /></label>
                  <label>Código da aluna<input value={codigoFiltro} onChange={e => setCodigoFiltro(e.target.value)} placeholder="Código da aluna" /></label>
                  <label>Data de cadastro<input type="date" value={cadastroFiltro} onChange={e => setCadastroFiltro(e.target.value)} /></label>
                  <label>Data do último login<input type="date" value={ultimoFiltro} onChange={e => setUltimoFiltro(e.target.value)} /></label>
                  <label>Tipo de acesso<select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}><option value="todos">Todos</option>{tiposDisponiveis.map(t => <option key={t}>{t}</option>)}</select></label>
                  <label>Status da aluna<select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}><option value="todas">Todas</option><option value="ativas">Ativas</option><option value="vencidas">Acesso expirado</option><option value="nunca">Nunca acessou</option></select></label>
                </div> : <div className="filtro-campos">
                  <label>Curso<select value={cursoFiltro} onChange={e => setCursoFiltro(e.target.value)}><option value="">Todos os cursos</option>{cursos.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
                  <label>Plano<select value={planoFiltro} onChange={e => setPlanoFiltro(e.target.value)}><option value="">Todos os planos</option>{planos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                </div>}
                <button className="pesquisar" onClick={() => setFiltrosAbertos(false)}>Pesquisar</button>
                <button className="limpar" onClick={() => { setBusca(''); setEmailFiltro(''); setCodigoFiltro(''); setCadastroFiltro(''); setUltimoFiltro(''); setTipoFiltro('todos'); setStatusFiltro('todas'); setCursoFiltro(''); setPlanoFiltro('') }}>Limpar filtros</button>
              </div>}
            </div>
            <button className="primary" onClick={() => setMassaAberto(true)}>＋ Subir planilha</button>
            <button className="primary" onClick={abrirNova}>＋ Cadastrar aluna</button>
          </div>
        </div>

        {/* Tabela */}
        <div style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '720px' }}>
              <thead>
                <tr style={{ background: '#161616', color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Aluna</th>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Último acesso</th>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Vencimento</th>
                  <th style={{ padding: '11px 14px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {alunasFiltradas.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#666' }}>Nenhuma aluna encontrada.</td></tr>
                ) : alunasFiltradas.map(a => {
                  const venc = vencimentoInfo(a)
                  const ativa = estaAtiva(a)
                  const acesso = acessos[a.id]
                  const mentoria = a.tipo_acesso === 'mentoria'
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid #222' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(212,175,55,.14)', color: ouro, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>{iniciais(a.nome, a.email)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{a.nome || '(sem nome)'}</div>
                            <div style={{ color: '#777', fontSize: '11px' }}>{a.email}{a.whatsapp ? ` · ${formatarWhatsapp(a.whatsapp)}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={mentoria
                          ? { background: ouroGrad, color: '#0A0A0A', borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: 700 }
                          : { background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.25)', color: ouro, borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: 600 }}>
                          {a.tipo_acesso || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#aaa', whiteSpace: 'nowrap' }}>{acesso ? formatarData(acesso) : <span style={{ color: '#666' }}>nunca acessou</span>}</td>
                      <td style={{ padding: '11px 14px', color: CORES_TOM[venc.tom], whiteSpace: 'nowrap' }}>
                        {venc.data ? <>{venc.label}<br /><span style={{ color: venc.tom === '' ? '#ddd' : CORES_TOM[venc.tom] }}>{venc.data}</span></> : '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ display: 'inline-block', width: '30px', height: '17px', borderRadius: '20px', background: ativa ? ouro : '#3A3A3A', position: 'relative', verticalAlign: 'middle' }}>
                          <span style={{ position: 'absolute', top: '2px', [ativa ? 'right' : 'left']: '2px', width: '13px', height: '13px', borderRadius: '50%', background: ativa ? '#0A0A0A' : '#888' }} />
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <button onClick={() => abrirGerenciar(a)} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 13px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Gerenciar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>Mostrando {alunasFiltradas.length} de {alunas.length} · dados da tabela perfis</p>
      </main>

      {/* ──────── Modal: Gerenciar aluna ──────── */}
      {gerenciando && (
        <div onClick={fecharGerenciar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '16px', padding: '22px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <span style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(212,175,55,.14)', color: ouro, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>{iniciais(gerAluna.nome, gerAluna.email)}</span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Gerenciar aluna</h2>
                <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gerAluna.email}</p>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>Nome</label>
              <input value={edNome} onChange={e => setEdNome(e.target.value)} placeholder="Nome completo" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}><label style={labelEstilo}>E-mail</label><input value={edEmail} onChange={e => setEdEmail(e.target.value)} style={inputEstilo} /></div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelEstilo}>WhatsApp</label>
              <input value={edWhatsapp} onChange={e => setEdWhatsapp(e.target.value)} placeholder="(00) 00000-0000" style={inputEstilo} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button onClick={salvarEdicao} disabled={salvando} style={{ flex: 1, padding: '11px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar dados'}</button>
              <button onClick={fecharGerenciar} style={{ padding: '11px 18px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
            </div>

            <div style={{ borderTop: '1px solid #2A2A2A', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => router.push(`/admin/alunas/acesso?id=${gerAluna.id}`)} style={{ width: '100%', padding: '11px', background: 'rgba(212,175,55,.08)', color: ouro, border: '1px solid #5b4c17', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>🎓 Gerenciar cursos e planos</button>
              <button onClick={reenviarBoasVindas} disabled={reenviando} style={{ width: '100%', padding: '11px', background: 'transparent', color: '#5dca8a', border: '1px solid #2A5A3A', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{reenviando ? 'Enviando...' : '✉️ Reenviar e-mail de boas-vindas'}</button>
              {gerDesativada ? (
                <button onClick={reativarAluna} disabled={desativando} style={{ width: '100%', padding: '11px', background: 'transparent', color: '#5dca8a', border: '1px solid #2A5A3A', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{desativando ? 'Reativando...' : '✓ Reativar acesso (+30 dias)'}</button>
              ) : (
                <button onClick={desativarAluna} disabled={desativando} title="O acesso é bloqueado, mas nenhum dado é apagado" style={{ width: '100%', padding: '11px', background: 'transparent', color: '#e88', border: '1px solid #5A1A1A', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{desativando ? 'Desativando...' : '🚫 Desativar acesso'}</button>
              )}
              <button onClick={excluirAluna} disabled={excluindo} style={{ width: '100%', padding: '11px', background: '#2a1010', color: '#ff8d8d', border: '1px solid #672525', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{excluindo ? 'Excluindo...' : '🗑 Excluir aluna definitivamente'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──────── Modal: Nova aluna ──────── */}
      {novaAberto && (
        <div onClick={fecharNova} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#151517', border: '1px solid #333', borderRadius: '16px', padding: '22px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 3px' }}>Cadastrar nova aluna</h2><p style={{ color: '#777', fontSize: 12, margin: '0 0 18px' }}>Crie a conta e, se quiser, já libere um curso.</p>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>Nome *</label>
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>E-mail *</label>
              <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="email@exemplo.com" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>WhatsApp (opcional)</label>
              <input value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} placeholder="(00) 00000-0000" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: 14 }}><label style={labelEstilo}>Curso a liberar (opcional)</label><select value={novoCurso} onChange={e => setNovoCurso(e.target.value)} style={inputEstilo}><option value="">Criar sem liberar curso</option>{cursos.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select><small style={{ color: '#666' }}>Você pode liberar outros cursos depois.</small></div>
            <label className="email-switch"><span>✉️</span><div><b>Enviar e-mail de boas-vindas com senha</b><small>Envia login, senha provisória e link de acesso.</small></div><input type="checkbox" checked={novoEnviarEmail} onChange={e => setNovoEnviarEmail(e.target.checked)} /></label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={cadastrarAluna} disabled={cadastrando} style={{ flex: 1, padding: '12px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{cadastrando ? 'Cadastrando...' : 'Cadastrar aluna'}</button>
              <button onClick={fecharNova} style={{ padding: '12px 20px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {massaAberto && (
        <div className="modal-overlay" onClick={() => !importando && setMassaAberto(false)}>
          <div className="massa-modal" onClick={e => e.stopPropagation()}>
            <div className="massa-head"><div><h2>Subir alunas por planilha</h2><p>Cria as contas em massa a partir de um arquivo.</p></div><button onClick={() => setMassaAberto(false)}>×</button></div>
            <div className="massa-body">
              <div className="modo-nota">🔕 <span><b>Modo silencioso:</b> cria as contas sem enviar e-mail ou WhatsApp. Você pode ligar o envio abaixo.</span></div>
              <p className="csv-ajuda">A planilha precisa ter <code>Nome</code>, <code>Email</code> e <code>Telefone</code>. Opcional: <code>Data de expiração</code> e <code>Data da compra</code> (DD/MM/AAAA). No Excel, salve como CSV.</p>
              <label className="csv-drop">⇧<b>{arquivoNome || 'Arraste o CSV aqui'}</b><small>{alunasCsv.length ? `${alunasCsv.length} aluna(s) encontrada(s)` : 'ou clique para escolher — só CSV'}</small><input hidden type="file" accept=".csv,text/csv" onChange={escolherCsv} /></label>
              {planos.length > 0 && <div className="chips-bloco"><b>Liberar por plano <small>(opcional)</small></b><div>{planos.map(p => <button key={p.id} className={planosMassa.includes(p.id) ? 'on' : ''} onClick={() => setPlanosMassa(lista => lista.includes(p.id) ? lista.filter(id => id !== p.id) : [...lista, p.id])}>{p.name}</button>)}</div></div>}
              {cursos.length > 0 && <div className="chips-bloco"><b>Liberar acesso aos cursos <small>(opcional)</small></b><div>{cursos.map(c => <button key={c.id} className={cursosMassa.includes(c.id) ? 'on' : ''} onClick={() => setCursosMassa(lista => lista.includes(c.id) ? lista.filter(id => id !== c.id) : [...lista, c.id])}>{c.title}</button>)}</div></div>}
              <label className="email-switch"><span>✉️</span><div><b>Enviar e-mail de boas-vindas com a senha</b><small>Manda login, senha provisória e link de acesso para cada aluna.</small></div><input type="checkbox" checked={emailMassa} onChange={e => setEmailMassa(e.target.checked)} /></label>
            </div>
            <div className="massa-foot"><span>{alunasCsv.length ? `${arquivoNome} pronto para importar.` : 'Escolha um arquivo para ver a prévia.'}</span><div><button className="ghost" onClick={() => setMassaAberto(false)}>Cancelar</button><button className="primary" disabled={!alunasCsv.length || importando} onClick={importarCsv}>{importando ? 'Criando...' : 'Criar alunas'}</button></div></div>
          </div>
        </div>
      )}
    </div>
  )
}
