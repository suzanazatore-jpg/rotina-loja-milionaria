'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
  const [msg, setMsg] = useState('')

  // Filtros
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todas')

  // Modal Gerenciar (editar/desativar/reenviar)
  const [gerenciando, setGerenciando] = useState(null) // objeto aluna
  const [edNome, setEdNome] = useState('')
  const [edWhatsapp, setEdWhatsapp] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [desativando, setDesativando] = useState(false)
  const [reenviando, setReenviando] = useState(false)

  // Modal Nova aluna
  const [novaAberto, setNovaAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [prazo, setPrazo] = useState('teste7')
  const [cadastrando, setCadastrando] = useState(false)

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
    const { data } = await supabase.from('perfis').select('*').order('nome', { ascending: true })
    if (data) setAlunas(data)
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
    setMsg('')
  }
  function fecharGerenciar() {
    setGerenciando(null)
    setEdNome(''); setEdWhatsapp('')
  }

  async function salvarEdicao() {
    if (!edNome.trim()) { aviso('⚠ O nome não pode ficar vazio.'); return }
    setSalvando(true)
    try {
      const { error } = await supabase.from('perfis')
        .update({ nome: edNome.trim(), whatsapp: edWhatsapp.trim() || null })
        .eq('id', gerenciando.id)
      if (error) throw error
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
      const ontem = new Date(); ontem.setDate(ontem.getDate() - 1)
      const { error } = await supabase.from('perfis')
        .update({ acesso_expira_em: ontem.toISOString() })
        .eq('id', gerenciando.id)
      if (error) throw error
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
      const nova = new Date(); nova.setDate(nova.getDate() + 30)
      const { error } = await supabase.from('perfis')
        .update({ acesso_expira_em: nova.toISOString() })
        .eq('id', gerenciando.id)
      if (error) throw error
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
        headers: { 'Content-Type': 'application/json' },
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
    setNovoNome(''); setNovoEmail(''); setNovaSenha(''); setNovoWhatsapp(''); setPrazo('teste7')
    setMsg(''); setNovaAberto(true)
  }
  function fecharNova() {
    setNovaAberto(false)
    setNovoNome(''); setNovoEmail(''); setNovaSenha(''); setNovoWhatsapp('')
  }

  async function cadastrarAluna() {
    if (!novoNome.trim() || !novoEmail.trim() || !novaSenha) { aviso('⚠ Nome, e-mail e senha são obrigatórios.'); return }
    if (novaSenha.length < 6) { aviso('⚠ A senha precisa ter no mínimo 6 caracteres.'); return }
    setCadastrando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')
      const resp = await fetch('/api/criar-aluna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim().toLowerCase(),
          senha: novaSenha,
          whatsapp: novoWhatsapp.trim(),
          prazo,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Falha ao cadastrar')
      await carregar()
      aviso(`✓ ${json.aluna?.nome || 'Aluna'} cadastrada! E-mail de boas-vindas enviado.`, 6000)
      fecharNova()
    } catch (e) {
      aviso('⚠ Erro: ' + e.message, 6000)
    }
    setCadastrando(false)
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
      if (q) {
        const alvo = `${a.nome || ''} ${a.email || ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      if (tipoFiltro !== 'todos' && a.tipo_acesso !== tipoFiltro) return false
      if (statusFiltro === 'ativas' && !estaAtiva(a)) return false
      if (statusFiltro === 'vencidas' && !estaDesativada(a)) return false
      return true
    })
  }, [alunas, busca, tipoFiltro, statusFiltro])

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
        <button onClick={abrirNova} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' }}>+ Nova Aluna</button>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {/* Resumo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(212,175,55,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ouro, fontSize: '22px' }}>👥</div>
          <div>
            <div style={{ fontSize: '11px', color: '#888' }}>Alunas {busca || tipoFiltro !== 'todos' || statusFiltro !== 'todas' ? 'encontradas' : 'cadastradas'}</div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{alunasFiltradas.length} {alunasFiltradas.length === 1 ? 'aluna' : 'alunas'}</div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="🔍  Buscar por nome ou e-mail…"
            style={{ flex: 1, minWidth: '200px', padding: '9px 12px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '13px', color: '#FFF', outline: 'none' }}
          />
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={{ padding: '9px 12px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '13px', color: '#ddd', outline: 'none', cursor: 'pointer' }}>
            <option value="todos">Tipo: todos</option>
            {tiposDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: '9px 12px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '13px', color: '#ddd', outline: 'none', cursor: 'pointer' }}>
            <option value="todas">Status: todas</option>
            <option value="ativas">Ativas</option>
            <option value="vencidas">Vencidas</option>
          </select>
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
            </div>
          </div>
        </div>
      )}

      {/* ──────── Modal: Nova aluna ──────── */}
      {novaAberto && (
        <div onClick={fecharNova} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid #D4AF37', borderRadius: '16px', padding: '22px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px' }}>Cadastrar nova aluna</h2>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>Nome *</label>
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>E-mail *</label>
              <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="email@exemplo.com" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>Senha * (mínimo 6 caracteres)</label>
              <input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Senha inicial" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelEstilo}>WhatsApp (opcional)</label>
              <input value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} placeholder="(00) 00000-0000" style={inputEstilo} />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelEstilo}>Prazo de acesso *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['teste7', '7 dias'], ['mensal', 'Mensal'], ['anual', 'Anual']].map(([val, txt]) => (
                  <button key={val} type="button" onClick={() => setPrazo(val)} style={{ flex: 1, padding: '10px', background: prazo === val ? ouroGrad : 'transparent', color: prazo === val ? '#0A0A0A' : '#888', border: '1px solid ' + (prazo === val ? 'transparent' : '#2A2A2A'), borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{txt}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={cadastrarAluna} disabled={cadastrando} style={{ flex: 1, padding: '12px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{cadastrando ? 'Cadastrando...' : 'Cadastrar aluna'}</button>
              <button onClick={fecharNova} style={{ padding: '12px 20px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
