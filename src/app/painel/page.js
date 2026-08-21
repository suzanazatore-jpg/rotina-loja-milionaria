'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import CursosArea from './CursosArea'

// ════════ NÚMERO DO WHATSAPP DO SUPORTE ════════
const WHATSAPP = '558499814124'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

// Banners exibidos enquanto não houver conteúdo cadastrado no ADM.
const BANNERS_PADRAO = [
  { tag: '📣 Aviso', titulo: 'Bem-vinda à sua área exclusiva!', texto: 'Use este espaço para avisos e novidades.' },
  { tag: '🎁 Bônus', titulo: 'Novos materiais liberados', texto: 'Confira os conteúdos do mês na área de conteúdos.' },
  { tag: '🔥 Oferta', titulo: 'Mentoria mensal ao vivo', texto: 'Não perca a próxima mentoria gravada.' },
]

// ════════ HELPERS DE MÊS (usados na seção Calendário) ════════
const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function mesAtualValor() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

function rotuloMesCurto(mesAno) {
  if (!mesAno) return ''
  const [ano, mes] = mesAno.split('-')
  return `${NOMES_MESES[parseInt(mes, 10) - 1].slice(0, 3)}/${ano.slice(2)}`
}

function rotuloMesCompleto(mesAno) {
  if (!mesAno) return ''
  const [ano, mes] = mesAno.split('-')
  return `${NOMES_MESES[parseInt(mes, 10) - 1]} de ${ano}`
}

// ════════ HELPERS DE SEMANA (usados na seção Rotina) ════════
function segundaFeiraAtual() {
  const hoje = new Date()
  const diaSemana = hoje.getDay() // 0=dom, 1=seg, ..., 6=sab
  // No domingo, já mostra a rotina da semana que está começando (a próxima segunda)
  const diff = diaSemana === 0 ? 1 : 1 - diaSemana
  const segunda = new Date(hoje)
  segunda.setDate(hoje.getDate() + diff)
  const ano = segunda.getFullYear()
  const mes = String(segunda.getMonth() + 1).padStart(2, '0')
  const dia = String(segunda.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function rotuloSemana(semanaInicio) {
  if (!semanaInicio) return ''
  const [ano, mes, dia] = semanaInicio.split('-').map(Number)
  const inicio = new Date(ano, mes - 1, dia)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 4)
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `Semana de ${fmt(inicio)} a ${fmt(fim)}`
}

// ════════ HELPER: verifica se o acesso está liberado ════════
// Retorna { liberado: bool, motivo: 'expirado' | 'atrasado' | 'cancelado' | null }
function verificarAcesso(perfil) {
  if (!perfil) return { liberado: true, motivo: null } // sem dados ainda, não bloqueia

  const tipo = perfil.tipo_acesso

  if (tipo === 'assinatura') {
    if (perfil.status_assinatura === 'atrasado') return { liberado: false, motivo: 'atrasado' }
    if (perfil.status_assinatura === 'cancelado') return { liberado: false, motivo: 'cancelado' }
    return { liberado: true, motivo: null } // 'ativo' ou nulo (não bloqueia por padrão)
  }

  if (tipo === 'teste' || tipo === 'avista') {
    if (perfil.acesso_expira_em && new Date(perfil.acesso_expira_em) < new Date()) {
      return { liberado: false, motivo: 'expirado' }
    }
    return { liberado: true, motivo: null }
  }

  return { liberado: true, motivo: null }
}

export default function Painel() {
  const [usuario, setUsuario] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [secao, setSecao] = useState('inicio')
  const [tema, setTema] = useState('escuro')
  const [aulaAberta, setAulaAberta] = useState(0)
  const [menuMobile, setMenuMobile] = useState(false)
  const [bannerAtual, setBannerAtual] = useState(0)
  const [banners, setBanners] = useState(BANNERS_PADRAO)
  const [termosPendentes, setTermosPendentes] = useState(null)
  const [confirmouTermos, setConfirmouTermos] = useState(false)
  const [aceitandoTermos, setAceitandoTermos] = useState(false)
  const [erroTermos, setErroTermos] = useState('')

  // Meus Dados
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')

  // Controle de acesso (novo)
  const [tipoAcesso, setTipoAcesso] = useState('rotina')
  const [acesso, setAcesso] = useState({ liberado: true, motivo: null })

  // Aulas (vindas do banco)
  const [aulas, setAulas] = useState([])
  // Calendário (vindo do banco)
  const [calendario, setCalendario] = useState([])
  const [mesSelecionado, setMesSelecionado] = useState(mesAtualValor())
  // Campanhas (vindo do banco)
  const [campanhas, setCampanhas] = useState([])
  const [mesSelecionadoCamp, setMesSelecionadoCamp] = useState(mesAtualValor())
  // Rotina semanal (vinda do banco) — mostra só a rotina da semana atual
  const [rotinaSemanal, setRotinaSemanal] = useState(null)

  const router = useRouter()

  const cores = tema === 'escuro'
    ? { bg: '#0A0A0A', card: '#111111', card2: '#1A1A1A', borda: '#2A2A2A', tx: '#FFFFFF', tx2: '#888888', tx3: '#555555' }
    : { bg: '#F7F6F2', card: '#FFFFFF', card2: '#F0EFEA', borda: '#E2E0D8', tx: '#1A1A18', tx2: '#6A6A62', tx3: '#A0A098' }
  const temAcessoPremium = ['implementacao', 'mentoria'].includes(tipoAcesso)
  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  // Verifica sessão e carrega dados do perfil
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUsuario(session.user)
      // Confere se existe uma versão dos Termos de Uso aguardando aceite.
      if (session.user.email !== ADMIN_EMAIL) {
        try {
          const resposta = await fetch('/api/termos', { headers: { Authorization: `Bearer ${session.access_token}` } })
          const termosData = await resposta.json()
          if (resposta.ok && termosData.termos?.is_required && !termosData.aceito) setTermosPendentes(termosData.termos)
        } catch (e) { /* não bloqueia por falha de conexão */ }
      }
      // Tenta carregar perfil salvo na tabela 'perfis'
      try {
        const { data } = await supabase.from('perfis').select('nome, whatsapp, tipo_acesso, acesso_expira_em, status_assinatura').eq('id', session.user.id).single()
        if (data) {
          setNome(data.nome || '')
          setWhatsapp(data.whatsapp || '')
          setTipoAcesso(data.tipo_acesso || 'rotina')
          // Admin nunca é bloqueado, mesmo que o perfil tenha algum status estranho
          if (session.user.email !== ADMIN_EMAIL) {
            setAcesso(verificarAcesso(data))
          }
        }
      } catch (e) { /* tabela pode não existir ainda */ }
      // Carrega as aulas cadastradas no admin
      try {
        const { data: aulasData } = await supabase.from('aulas').select('*').order('ordem', { ascending: true })
        if (aulasData) setAulas(aulasData)
      } catch (e) { /* sem aulas ainda */ }
      // Carrega o calendário de conteúdo (PDFs, um por mês)
      try {
        const resposta = await fetch('/api/calendario', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const resultado = await resposta.json()
        const calData = resposta.ok ? resultado.calendarios : []
        if (calData) {
          setCalendario(calData)
          // Se não houver material no mês atual, seleciona o mês mais recente disponível
          const temMesAtual = calData.some(c => c.mes_ano === mesAtualValor())
          if (!temMesAtual && calData.length > 0) {
            setMesSelecionado(calData[0].mes_ano)
          }
        }
      } catch (e) { /* sem calendário ainda */ }
      // Carrega as campanhas (PDFs, um por mês)
      try {
        const { data: campData } = await supabase.from('campanhas').select('*').order('mes_ano', { ascending: false })
        if (campData) {
          setCampanhas(campData)
          const temMesAtual = campData.some(c => c.mes_ano === mesAtualValor())
          if (!temMesAtual && campData.length > 0) {
            setMesSelecionadoCamp(campData[0].mes_ano)
          }
        }
      } catch (e) { /* sem campanhas ainda */ }
      // Carrega a rotina da semana atual (mostra só a semana corrente, sem histórico)
      try {
        const { data: rotinaData } = await supabase.from('rotinas').select('*').eq('semana_inicio', segundaFeiraAtual()).limit(1)
        if (rotinaData && rotinaData.length > 0) setRotinaSemanal(rotinaData[0])
      } catch (e) { /* sem rotina ainda */ }
      // Carrega os banners ativos gerenciados pelo ADM. Mantém os padrões como fallback.
      try {
        const { data: bannersData } = await supabase
          .from('panel_banners')
          .select('id,tag,title,body,image_url,link_url,sort_order')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
        if (bannersData?.length) {
          setBanners(bannersData.map(item => ({
            id: item.id,
            tag: item.tag,
            titulo: item.title,
            texto: item.body,
            imagem: item.image_url,
            link: item.link_url,
          })))
        }
      } catch (e) { /* mantém os banners padrão */ }
      setCarregando(false)
    }
    init()
  }, [router])

  // Carrossel automático
  useEffect(() => {
    if (banners.length < 2) return undefined
    const t = setInterval(() => setBannerAtual(b => (b + 1) % banners.length), 4000)
    return () => clearInterval(t)
  }, [banners.length])

  async function sair() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function aceitarTermos() {
    if (!termosPendentes || !confirmouTermos) return
    setAceitandoTermos(true); setErroTermos('')
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const resposta = await fetch('/api/termos', {
        method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms_id: termosPendentes.id }),
      })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível registrar o aceite.')
      setTermosPendentes(null)
    } catch (error) { setErroTermos(error.message) }
    setAceitandoTermos(false)
  }

  async function salvarDados() {
    if (!usuario) return
    setSalvando(true); setMsgSalvo('')
    try {
      const { error } = await supabase.from('perfis').upsert({
        id: usuario.id, nome, whatsapp, email: usuario.email
      })
      if (error) throw error
      setMsgSalvo('✓ Dados salvos com sucesso!')
    } catch (e) {
      setMsgSalvo('⚠ Erro ao salvar. Confira se a tabela "perfis" existe no Supabase.')
    }
    setSalvando(false)
    setTimeout(() => setMsgSalvo(''), 4000)
  }

  // Baixa o PDF forçando o download (em vez de só abrir)
  async function baixarPdf(item) {
    try {
      const resposta = await fetch(item.arquivo_url)
      const blob = await resposta.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.arquivo_nome || `${item.titulo || 'calendario'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e) {
      // Se der erro (ex: CORS), abre em nova aba como alternativa
      window.open(item.arquivo_url, '_blank')
    }
  }

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const nomeExibe = nome
    ? nome.split(' ')[0]
    : (usuario?.email ? usuario.email.split('@')[0].charAt(0).toUpperCase() + usuario.email.split('@')[0].slice(1) : 'Aluna')

  // É admin? (mostra o botão de escritório só pra ela)
  const isAdmin = usuario?.email === ADMIN_EMAIL

  const menu = [
    { id: 'inicio', icone: '🏠', label: 'Início' },
    { id: 'campanhas', icone: '🎯', label: 'Campanhas' },
    { id: 'calendario', icone: '📅', label: 'Calendário' },
    { id: 'rotina', icone: '🔄', label: 'Rotina' },
    { id: 'precificacao', icone: '📊', label: 'Precificação' },
    { id: 'mentoria', icone: '🎓', label: 'Mentoria' },
    { id: 'cursos', icone: '📚', label: 'Meus Cursos' },
    { id: 'premium', icone: '🔒', label: 'Conteudo Premium' },
    { id: 'suporte', icone: '💬', label: 'Suporte' },
  ]

  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: '15px' }}>Carregando...</p>
      </div>
    )
  }

  if (termosPendentes) {
    return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', display: 'grid', placeItems: 'center', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <section style={{ width: '100%', maxWidth: '680px', background: '#111', border: '1px solid #34302A', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
        <header style={{ padding: '20px 22px 15px', borderBottom: '1px solid #2A2A2A' }}><p style={{ color: ouro, fontSize: '10px', fontWeight: 800, letterSpacing: '.12em', margin: '0 0 5px' }}>ROTINA DA LOJA MILIONÁRIA</p><h1 style={{ fontSize: '21px', margin: 0 }}>Termos de Uso</h1><p style={{ color: '#888', fontSize: '13px', margin: '5px 0 0' }}>Leia para continuar. Versão {termosPendentes.version}.</p></header>
        <div style={{ margin: '18px 22px', maxHeight: '48vh', overflowY: 'auto', whiteSpace: 'pre-wrap', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '10px', padding: '17px', color: '#CCC', fontSize: '13px', lineHeight: 1.65 }}>{termosPendentes.content}</div>
        <footer style={{ padding: '0 22px 20px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#DDD', fontSize: '13px', cursor: 'pointer', marginBottom: '15px' }}><input type="checkbox" checked={confirmouTermos} onChange={e => setConfirmouTermos(e.target.checked)} style={{ marginTop: '2px' }} /> Li e aceito os Termos de Uso da plataforma.</label>
          {erroTermos && <p style={{ color: '#FF7777', fontSize: '12px' }}>{erroTermos}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><button onClick={sair} style={{ background: 'transparent', color: '#888', border: '1px solid #333', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer' }}>Sair</button><button onClick={aceitarTermos} disabled={!confirmouTermos || aceitandoTermos} style={{ background: confirmouTermos ? ouroGrad : '#292929', color: confirmouTermos ? '#090909' : '#666', border: 0, borderRadius: '8px', padding: '11px 18px', fontWeight: 900, cursor: confirmouTermos ? 'pointer' : 'not-allowed' }}>{aceitandoTermos ? 'Registrando...' : 'Aceitar e continuar'}</button></div>
        </footer>
      </section>
    </div>
  }

  // ── Bloqueio de acesso (teste expirado / à vista expirado / assinatura atrasada ou cancelada) ──
  if (!acesso.liberado) {
    const ouroGradLocal = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
    const textos = {
      expirado: { titulo: 'Seu acesso expirou', texto: 'O período do seu plano chegou ao fim. Fale com o suporte para renovar e continuar aproveitando a Rotina da Loja Milionária.' },
      atrasado: { titulo: 'Pagamento pendente', texto: 'Identificamos um atraso no pagamento da sua assinatura. Regularize para voltar a ter acesso completo.' },
      cancelado: { titulo: 'Assinatura cancelada', texto: 'Sua assinatura foi cancelada. Para reativar o acesso, fale com o suporte ou assine novamente.' },
    }
    const info = textos[acesso.motivo] || textos.expirado
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔒</div>
        <h1 style={{ color: '#FFF', fontSize: '20px', margin: '0 0 8px' }}>{info.titulo}</h1>
        <p style={{ color: '#888', fontSize: '14px', margin: '0 0 22px', maxWidth: '320px', lineHeight: 1.5 }}>{info.texto}</p>
        <a
          href={`https://api.whatsapp.com/send?phone=${WHATSAPP}&text=Quero%20renovar%20meu%20acesso`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ background: ouroGradLocal, color: '#0A0A0A', borderRadius: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 800, textDecoration: 'none', marginBottom: '12px' }}
        >
          💬 Falar com o suporte no WhatsApp
        </a>
        <button onClick={sair} style={{ background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Sair</button>
      </div>
    )
  }

  function irPara(id) {
    if (id === 'calculadora') { router.push('/calculadora'); return }
    if (id === 'markup') { router.push('/markup'); return }
    if (id === 'markup') { router.push('/markup'); return }
    setSecao(id)
    setMenuMobile(false)
  }

  const tituloSecao = menu.find(m => m.id === secao)?.label || (secao === 'dados' ? 'Meus Dados' : '')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: cores.bg, color: cores.tx, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', transition: 'background .2s, color .2s' }}>

      {/* ═══════ SIDEBAR (desktop) ═══════ */}
      <aside className="sidebar-desktop" style={{ width: '230px', minWidth: '230px', background: cores.card, borderRight: `1px solid ${cores.borda}`, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px 18px', borderBottom: `1px solid ${cores.borda}` }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Rotina da Loja</p>
          <p style={{ fontSize: '16px', fontWeight: 800, color: cores.tx, margin: '2px 0 0' }}>Milionária 👑</p>
        </div>
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {menu.map(item => (
            <div key={item.id} onClick={() => irPara(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 18px', cursor: 'pointer', fontSize: '14px',
              color: secao === item.id ? ouro : cores.tx2,
              background: secao === item.id ? (tema === 'escuro' ? '#1A1A1A' : '#F0EFEA') : 'transparent',
              borderLeft: secao === item.id ? `3px solid ${ouro}` : '3px solid transparent',
              fontWeight: secao === item.id ? 700 : 500,
            }}>
              <span style={{ fontSize: '17px' }}>{item.icone}</span> {item.label}
            </div>
          ))}
        </nav>
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${cores.borda}` }}>
          {isAdmin && (
            <button onClick={() => router.push('/admin')} style={{ width: '100%', padding: '10px', marginBottom: '8px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>⚙️ Meu Escritório</button>
          )}
          <button onClick={sair} style={{ width: '100%', padding: '10px', background: 'transparent', color: ouro, border: `1px solid ${ouro}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Sair</button>
        </div>
      </aside>

      {/* ═══════ COLUNA PRINCIPAL ═══════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar (desktop sempre; mobile só fora do início) */}
        <header className={secao === 'inicio' ? 'topbar-hide-mobile' : ''} style={{ background: cores.card, borderBottom: `1px solid ${cores.borda}`, padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setMenuMobile(true)} className="menu-mobile-btn" style={{ display: 'none', background: 'transparent', border: 'none', color: cores.tx, fontSize: '22px', cursor: 'pointer' }}>☰</button>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 800, color: cores.tx, margin: 0 }}>Rotina da Loja Milionária 👑</p>
              <p style={{ fontSize: '11px', color: cores.tx3, margin: 0 }}>{tituloSecao}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setTema('claro')} style={{ background: tema === 'claro' ? ouro : 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '7px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}>☀️</button>
            <button onClick={() => setTema('escuro')} style={{ background: tema === 'escuro' ? ouro : 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '7px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}>🌙</button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>

          {/* ─── INÍCIO ─── */}
          {secao === 'inicio' && (
            <div>
              {/* HERO DOURADO (cobre topo até "Acesse") — destaque no mobile */}
              <div className="hero-dourado" style={{ background: ouroGrad, padding: '20px 22px 26px', color: '#0A0A0A', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
                {/* Linha do topo: menu + nome do app + tema (mobile) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <button onClick={() => setMenuMobile(true)} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.08)', color: '#0A0A0A', fontSize: '20px', cursor: 'pointer' }}>☰</button>
                  <p style={{ fontSize: '18px', fontWeight: 900, margin: 0, textAlign: 'center' }}>Rotina da Loja Milionária 👑</p>
                  <button onClick={() => setTema(tema === 'escuro' ? 'claro' : 'escuro')} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.08)', color: '#0A0A0A', fontSize: '17px', cursor: 'pointer' }}>{tema === 'escuro' ? '☀️' : '🌙'}</button>
                </div>
                {/* Saudação */}
                <p style={{ fontSize: '14px', margin: 0, opacity: 0.75 }}>{saudacao},</p>
                <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '2px 0 0' }}>{nomeExibe} 👑</h1>

                {/* CARROSSEL DESLIZANTE (abaixo da saudação) */}
                <div style={{ marginTop: '18px', overflow: 'hidden', borderRadius: '14px' }}>
                  <div style={{ display: 'flex', transform: `translateX(-${bannerAtual * 100}%)`, transition: 'transform 0.5s ease' }}>
                    {banners.map((banner, i) => {
                      const conteudo = banner.imagem
                        ? <img src={banner.imagem} alt={banner.titulo || 'Banner'} style={{ width: '100%', aspectRatio: '16 / 5', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ background: '#0A0A0A', padding: '15px 16px', color: '#FFFFFF' }}>
                            <p style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 5px', color: ouro }}>{banner.tag}</p>
                            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 3px' }}>{banner.titulo}</h3>
                            <p style={{ fontSize: '12px', margin: 0, color: '#AAAAAA' }}>{banner.texto}</p>
                          </div>
                      return <div key={banner.id || i} style={{ minWidth: '100%', boxSizing: 'border-box', background: '#0A0A0A', borderRadius: '14px', overflow: 'hidden' }}>
                        {banner.link ? <a href={banner.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>{conteudo}</a> : conteudo}
                      </div>
                    })}
                  </div>
                </div>
                {/* bolinhas */}
                <div style={{ display: 'flex', gap: '5px', marginTop: '10px', justifyContent: 'center' }}>
                  {banners.map((_, i) => (
                    <span key={i} onClick={() => setBannerAtual(i)} style={{ width: i === bannerAtual ? '18px' : '7px', height: '7px', borderRadius: '99px', background: i === bannerAtual ? '#0A0A0A' : 'rgba(0,0,0,0.3)', cursor: 'pointer', transition: 'width .2s' }} />
                  ))}
                </div>
              </div>

              {/* CONTEÚDO ABAIXO DO HERO */}
              <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 18px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: cores.tx, margin: '0 0 12px' }}>Acesse seu conteúdo</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '11px' }}>
                  <CardAcesso cores={cores} icone="🎯" titulo="Campanhas" sub="Vendas prontas" onClick={() => irPara('campanhas')} destaque ouroGrad={ouroGrad} />
                  <CardAcesso cores={cores} icone="📅" titulo="Calendário" sub="Conteúdo do mês" onClick={() => irPara('calendario')} />
                  <CardAcesso cores={cores} icone="🔄" titulo="Rotina" sub="15 min por dia" onClick={() => irPara('rotina')} />
                  <CardAcesso cores={cores} icone="📊" titulo="Precificação" sub="Markup e descontos" onClick={() => irPara('precificacao')} />
                  <CardAcesso cores={cores} icone="🎓" titulo="Mentoria" sub="Aulas gravadas" onClick={() => irPara('mentoria')} />
                  <CardAcesso cores={cores} icone="📚" titulo="Meus Cursos" sub="Cursos liberados" onClick={() => irPara('cursos')} />
                  <CardAcesso cores={cores} icone={temAcessoPremium ? '⭐' : '🔒'} titulo="Conteúdo Premium" sub={temAcessoPremium ? 'Aulas exclusivas' : 'Plano Implementação'} onClick={() => irPara('premium')} />
                  <CardAcesso cores={cores} icone="💬" titulo="Suporte" sub="24h com IA" onClick={() => irPara('suporte')} />
                </div>
              </div>
            </div>
          )}

          {/* ─── conteúdo interno (com padding) ─── */}
          {secao !== 'inicio' && (
            <div style={{ padding: '20px 18px' }}>

              {/* MEUS DADOS (somente leitura — só o admin pode editar) */}
              {secao === 'dados' && (
                <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '20px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: cores.tx }}>👤 Meus Dados</h2>
                    <Campo label="Nome" valor={nome || '—'} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <Campo label="E-mail" valor={usuario?.email || ''} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <Campo label="WhatsApp" valor={whatsapp || '—'} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <p style={{ fontSize: '12px', color: cores.tx3, margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
                      Esses dados são gerenciados pela administração. Para alterar, fale com o suporte. 💬
                    </p>
                  </div>
                </div>
              )}

              {/* MENTORIA / AULAS */}
              {secao === 'cursos' && <CursosArea cores={cores} ouro={ouro} ouroGrad={ouroGrad} />}

              {secao === 'mentoria' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>🎓 Mentoria Mensal</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Aulas gravadas ao vivo. A primeira já fica aberta — é só apertar o play.</p>
                  </div>
                  {aulas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: cores.tx3 }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎬</div>
                      <p style={{ fontSize: '14px', margin: 0 }}>Nenhuma aula disponível ainda. Em breve! 👑</p>
                    </div>
                  ) : (
                    aulas.map((aula, i) => (
                      <div key={aula.id} onClick={() => setAulaAberta(aulaAberta === i ? -1 : i)} style={{ background: cores.card, border: `1px solid ${aulaAberta === i ? ouro : cores.borda}`, borderRadius: '14px', padding: '14px', marginBottom: '12px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>{aula.ordem}</div>
                          <div>
                            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: cores.tx }}>{aula.titulo}</h3>
                            <p style={{ fontSize: '12px', color: cores.tx2, margin: '2px 0 0' }}>{aula.descricao || ''}</p>
                          </div>
                        </div>
                        {aulaAberta === i && (
                          <div style={{ marginTop: '12px' }}>
                            {aula.video_url ? (
                              <iframe src={aula.video_url} title={aula.titulo} allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: '10px' }} />
                            ) : (
                              <div style={{ width: '100%', aspectRatio: '16/9', background: cores.card2, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cores.tx3, fontSize: '13px' }}>🎬 Vídeo em breve</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {secao === 'precificacao' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>📊 Precificação</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Ferramentas para precificar com lucro real.</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                    <div onClick={() => router.push('/calculadora')} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '24px 20px', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '36px', marginBottom: '10px' }}>🧮</div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: cores.tx }}>Calculadora</h3>
                      <p style={{ fontSize: '12px', color: cores.tx2, margin: 0 }}>Calcule descontos</p>
                    </div>
                    <div onClick={() => router.push('/markup')} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '24px 20px', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '36px', marginBottom: '10px' }}>📊</div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: cores.tx }}>Markup</h3>
                      <p style={{ fontSize: '12px', color: cores.tx2, margin: 0 }}>Preço ideal de venda</p>
                    </div>
                  </div>
                </div>
              )}

              {secao === 'premium' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  {!temAcessoPremium ? (
                    <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800, color: cores.tx, margin: '0 0 10px' }}>Conteúdo Premium</h2>
                      <p style={{ fontSize: '14px', color: cores.tx2, margin: '0 0 20px', lineHeight: 1.6 }}>
                        Este conteúdo está disponível nos planos<br />
                        <strong style={{ color: ouro }}>Implementação</strong> e <strong style={{ color: ouro }}>Mentoria Impulso</strong>.
                      </p>
                      <a href={'https://api.whatsapp.com/send?phone=' + WHATSAPP + '&text=Quero%20saber%20mais%20sobre%20o%20plano%20de%20Implementacao'} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: ouroGrad, color: '#0A0A0A', borderRadius: '12px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, textDecoration: 'none' }}>
                        💬 Quero fazer upgrade
                      </a>
                    </div>
                  ) : (
                    <div>
                      <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>⭐ Conteúdo Premium</h2>
                        <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Aulas e materiais exclusivos do seu plano.</p>
                      </div>
                      <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '44px', marginBottom: '12px' }}>🎬</div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: cores.tx, margin: '0 0 6px' }}>Em breve!</h3>
                        <p style={{ fontSize: '13px', color: cores.tx2, margin: 0 }}>Os conteúdos exclusivos serão liberados em breve. 👑</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SUPORTE */}
              {secao === 'suporte' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>💬 Suporte 24h WhatsApp com IA</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Atendimento 24 horas por dia, 7 dias por semana. Confira o passo a passo ou fale direto com o suporte.</p>
                  </div>
                  {[
                    { t: '1. Assista à Mentoria', d: 'Comece pela aula de abertura para entender o método.' },
                    { t: '2. Use a Calculadora', d: 'Calcule seus descontos e margens com segurança.' },
                    { t: '3. Siga sua Rotina', d: 'Dedique 15 minutos por dia para a rotina da loja.' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px', color: cores.tx }}>{item.t}</h3>
                      <p style={{ fontSize: '12px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>{item.d}</p>
                    </div>
                  ))}
                  <a href={`https://api.whatsapp.com/send?phone=${WHATSAPP}&text=Suh%2C%20sou%20aluna%20e%20tenho%20uma%20d%C3%BAvida`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: ouroGrad, color: '#0A0A0A', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 800, textDecoration: 'none', marginTop: '14px' }}>💬 Falar com o suporte no WhatsApp</a>
                </div>
              )}

              {/* CAMPANHAS DE VENDA (PDFs por mês) */}
              {secao === 'campanhas' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>🎯 Campanhas de Venda</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Campanhas prontas em PDF para você usar nas suas vendas.</p>
                  </div>

                  {campanhas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: cores.tx3 }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎯</div>
                      <p style={{ fontSize: '14px', margin: 0 }}>Nenhuma campanha disponível ainda. Em breve! 👑</p>
                    </div>
                  ) : (
                    <>
                      {/* ABAS POR MÊS */}
                      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
                        {campanhas.map(item => (
                          <button
                            key={item.mes_ano}
                            onClick={() => setMesSelecionadoCamp(item.mes_ano)}
                            style={{
                              flexShrink: 0, padding: '9px 16px', borderRadius: '99px', whiteSpace: 'nowrap',
                              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                              border: mesSelecionadoCamp === item.mes_ano ? 'none' : `1px solid ${cores.borda}`,
                              background: mesSelecionadoCamp === item.mes_ano ? ouroGrad : cores.card,
                              color: mesSelecionadoCamp === item.mes_ano ? '#0A0A0A' : cores.tx2,
                            }}
                          >
                            {rotuloMesCurto(item.mes_ano)}
                          </button>
                        ))}
                      </div>

                      {/* MATERIAL DO MÊS SELECIONADO */}
                      {(() => {
                        const item = campanhas.find(c => c.mes_ano === mesSelecionadoCamp)
                        if (!item) {
                          return (
                            <div style={{ textAlign: 'center', padding: '50px 20px', color: cores.tx3 }}>
                              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎯</div>
                              <p style={{ fontSize: '14px', margin: 0 }}>Nenhuma campanha para este mês ainda.</p>
                            </div>
                          )
                        }
                        return (
                          <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>🎯</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '11px', fontWeight: 700, color: ouro, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotuloMesCompleto(item.mes_ano)}</p>
                                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: cores.tx }}>{item.titulo}</h3>
                                {item.descricao && <p style={{ fontSize: '13px', color: cores.tx2, margin: '4px 0 0', lineHeight: 1.5 }}>{item.descricao}</p>}
                              </div>
                            </div>

                            {item.arquivo_url && (
                              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                                <a
                                  href={item.arquivo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    flex: 1, textAlign: 'center', padding: '10px', borderRadius: '9px',
                                    background: cores.card2, border: `1px solid ${cores.borda}`, color: cores.tx,
                                    fontSize: '13px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
                                  }}
                                >
                                  👁️ Ver na tela
                                </a>
                                <button
                                  onClick={() => baixarPdf(item)}
                                  style={{
                                    flex: 1, textAlign: 'center', padding: '10px', borderRadius: '9px',
                                    background: ouroGrad, border: 'none', color: '#0A0A0A',
                                    fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                                  }}
                                >
                                  ⬇️ Baixar
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}

              {/* CALENDÁRIO DE CONTEÚDO (PDFs por mês) */}
              {secao === 'calendario' && (
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <div style={{ background: tema === 'escuro' ? 'linear-gradient(145deg,#17150f,#111)' : 'linear-gradient(145deg,#fffaf0,#fff)', border: `1px solid ${tema === 'escuro' ? '#4a4020' : '#ddc779'}`, borderRadius: '18px', padding: '22px', marginBottom: '18px' }}>
                    <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.13em', margin: '0 0 7px' }}>PLANEJAMENTO MENSAL</p>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', color: cores.tx }}>Calendário de Conteúdo</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.55 }}>Seu planejamento em PDF para consultar, salvar e acompanhar durante o mês.</p>
                  </div>

                  {!calendario.length ? <div style={{ textAlign: 'center', padding: '54px 20px', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', color: cores.tx3 }}><div style={{ fontSize: '42px', marginBottom: '10px' }}>📅</div><strong style={{ color: cores.tx2 }}>O próximo calendário aparecerá aqui</strong><p style={{ fontSize: '13px', margin: '6px 0 0' }}>Ainda não há PDF disponível.</p></div> : <>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '1px 1px 7px', marginBottom: '12px' }}>{calendario.map(item => <button key={item.mes_ano} onClick={() => setMesSelecionado(item.mes_ano)} style={{ flexShrink: 0, padding: '9px 15px', borderRadius: '9px', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: mesSelecionado === item.mes_ano ? `1px solid ${ouro}` : `1px solid ${cores.borda}`, background: mesSelecionado === item.mes_ano ? (tema === 'escuro' ? '#2d270f' : '#fff5cf') : cores.card, color: mesSelecionado === item.mes_ano ? ouro : cores.tx2 }}>{rotuloMesCurto(item.mes_ano)}</button>)}</div>
                    {(() => {
                      const item = calendario.find(c => c.mes_ano === mesSelecionado) || calendario[0]
                      if (!item) return null
                      const [, numeroMes] = item.mes_ano.split('-')
                      return <article style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '18px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '17px', padding: '22px', borderBottom: `1px solid ${cores.borda}` }}>
                          <div style={{ width: '72px', height: '78px', borderRadius: '14px', background: ouroGrad, color: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 10px 28px rgba(212,175,55,.18)' }}><small style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '.08em' }}>MÊS</small><strong style={{ fontSize: '28px', lineHeight: 1 }}>{numeroMes}</strong></div>
                          <div style={{ minWidth: 0 }}><p style={{ fontSize: '11px', fontWeight: 800, color: ouro, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{rotuloMesCompleto(item.mes_ano)}</p><h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: cores.tx }}>{item.titulo}</h3><p style={{ fontSize: '13px', color: cores.tx2, margin: '6px 0 0', lineHeight: 1.5 }}>{item.descricao || 'Seu calendário mensal está pronto para acessar.'}</p></div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', padding: '16px', flexWrap: 'wrap' }}>
                          <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 180px', textAlign: 'center', padding: '12px', borderRadius: '10px', background: cores.card2, border: `1px solid ${cores.borda}`, color: cores.tx, fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>👁 Visualizar PDF</a>
                          <button onClick={() => baixarPdf(item)} style={{ flex: '1 1 180px', textAlign: 'center', padding: '12px', borderRadius: '10px', background: ouroGrad, border: 'none', color: '#0A0A0A', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>⬇ Baixar calendário</button>
                        </div>
                      </article>
                    })()}
                  </>}
                </div>
              )}

              {/* ROTINA SEMANAL (PDF da semana atual, sem abas) */}
              {secao === 'rotina' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 5px', color: cores.tx }}>🔄 Rotina da Semana</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.5 }}>Sua rotina de segunda a sexta, em PDF. Atualizada toda segunda-feira.</p>
                  </div>

                  {!rotinaSemanal ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: cores.tx3 }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔄</div>
                      <p style={{ fontSize: '14px', margin: 0 }}>A rotina desta semana ainda não foi publicada. Em breve! 👑</p>
                    </div>
                  ) : (
                    <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>🔄</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '11px', fontWeight: 700, color: ouro, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotuloSemana(rotinaSemanal.semana_inicio)}</p>
                          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: cores.tx }}>{rotinaSemanal.titulo}</h3>
                          {rotinaSemanal.descricao && <p style={{ fontSize: '13px', color: cores.tx2, margin: '4px 0 0', lineHeight: 1.5 }}>{rotinaSemanal.descricao}</p>}
                        </div>
                      </div>

                      {rotinaSemanal.arquivo_url && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                          <a
                            href={rotinaSemanal.arquivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex: 1, textAlign: 'center', padding: '10px', borderRadius: '9px',
                              background: cores.card2, border: `1px solid ${cores.borda}`, color: cores.tx,
                              fontSize: '13px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
                            }}
                          >
                            👁️ Ver na tela
                          </a>
                          <button
                            onClick={() => baixarPdf(rotinaSemanal)}
                            style={{
                              flex: 1, textAlign: 'center', padding: '10px', borderRadius: '9px',
                              background: ouroGrad, border: 'none', color: '#0A0A0A',
                              fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                            }}
                          >
                            ⬇️ Baixar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </main>
      </div>

      {/* ═══════ MENU MOBILE (drawer) com MEUS DADOS ═══════ */}
      {menuMobile && (
        <div onClick={() => setMenuMobile(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '280px', height: '100%', background: cores.card, padding: '0', overflowY: 'auto' }}>
            {/* Cabeçalho do menu com dados */}
            <div style={{ background: ouroGrad, padding: '20px 18px', color: '#0A0A0A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>👤</div>
                <button onClick={() => setMenuMobile(false)} style={{ background: 'transparent', border: 'none', color: '#0A0A0A', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>
              <p style={{ fontSize: '16px', fontWeight: 800, margin: '10px 0 1px' }}>{nome || nomeExibe}</p>
              <p style={{ fontSize: '12px', margin: 0, opacity: 0.75 }}>{usuario?.email}</p>
              {whatsapp && <p style={{ fontSize: '12px', margin: '1px 0 0', opacity: 0.75 }}>{whatsapp}</p>}
              <button onClick={() => { setSecao('dados'); setMenuMobile(false) }} style={{ marginTop: '12px', padding: '7px 12px', background: '#0A0A0A', color: ouro, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Ver meus dados</button>
            </div>
            {/* Itens do menu */}
            <div style={{ padding: '8px 14px 14px' }}>
              {menu.map(item => (
                <div key={item.id} onClick={() => irPara(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '13px 6px', cursor: 'pointer', fontSize: '15px', color: cores.tx, borderBottom: `1px solid ${cores.borda}`, fontWeight: 600 }}>
                  <span style={{ fontSize: '18px' }}>{item.icone}</span> {item.label}
                </div>
              ))}
              <button onClick={sair} style={{ width: '100%', marginTop: '16px', padding: '11px', background: 'transparent', color: ouro, border: `1px solid ${ouro}`, borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Sair</button>
              {isAdmin && (
                <button onClick={() => router.push('/admin')} style={{ width: '100%', marginTop: '10px', padding: '11px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>⚙️ Meu Escritório</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ BOTTOM NAV (mobile) — só aparece FORA do início ═══════ */}
      {secao !== 'inicio' && (
        <nav className="bottom-nav" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, height: '62px', background: cores.card, borderTop: `1px solid ${cores.borda}`, zIndex: 90 }}>
          <div style={{ display: 'flex', height: '100%' }}>
            <button onClick={() => setSecao('inicio')} style={bniStyle(cores, ouro, false)}><span style={{ fontSize: '19px' }}>🏠</span>Início</button>
            {menu.slice(1, 5).map(item => (
              <button key={item.id} onClick={() => irPara(item.id)} style={bniStyle(cores, ouro, secao === item.id)}><span style={{ fontSize: '19px' }}>{item.icone}</span>{item.label}</button>
            ))}
          </div>
        </nav>
      )}

      <style>{`
        @media (max-width: 720px) {
          .sidebar-desktop { display: none !important; }
          .menu-mobile-btn { display: block !important; }
          .bottom-nav { display: block !important; }
          .topbar-hide-mobile { display: none !important; }
        }
        @media (min-width: 721px) {
          .hero-dourado { border-radius: 0 !important; }
        }
      `}</style>
    </div>
  )
}

function bniStyle(cores, ouro, ativo) {
  return { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: ativo ? ouro : cores.tx3, fontSize: '9px', fontWeight: 700 }
}

function CardAcesso({ cores, icone, titulo, sub, onClick, destaque, ouroGrad }) {
  return (
    <div onClick={onClick} style={{
      background: destaque ? ouroGrad : cores.card,
      border: `1px solid ${destaque ? 'transparent' : cores.borda}`,
      borderRadius: '14px', padding: '16px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icone}</div>
      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: destaque ? '#0A0A0A' : cores.tx }}>{titulo}</h3>
      <p style={{ fontSize: '11px', margin: 0, color: destaque ? '#0A0A0A' : cores.tx2, opacity: destaque ? 0.8 : 1 }}>{sub}</p>
    </div>
  )
}

function Campo({ label, valor, onChange, placeholder, cores, ouro, disabled }) {
  return (
    <div style={{ marginBottom: '13px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: cores.tx2, marginBottom: '5px' }}>{label}</label>
      <input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{
        width: '100%', padding: '11px 13px', background: disabled ? cores.card2 : cores.bg, border: `1px solid ${cores.borda}`, borderRadius: '9px',
        fontSize: '14px', color: disabled ? cores.tx3 : cores.tx, outline: 'none', boxSizing: 'border-box',
      }} />
    </div>
  )
}
