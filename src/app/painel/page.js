'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import HomeDashboard from './HomeDashboard'
import ProtocolAccess from './ProtocolAccess'
import { registerContentAccess } from '@/lib/contentAccess'
import CampaignJourney from './CampaignJourney'
import InteractiveCalendar from './InteractiveCalendar'
import WeeklyRoutineCard from './WeeklyRoutineCard'
import AppIcon from '@/app/components/AppIcon'
import NotificationCenter from '@/app/components/NotificationCenter'
import NotificationPreference from './NotificationPreference'
import { toEmbedUrl } from '@/lib/tutorialVideos'
import './premium.css'

const CursosArea = dynamic(() => import('./CursosArea'), {
  loading: () => <SectionLoading label="Abrindo seus cursos..." />,
})
const SupportCenter = dynamic(() => import('./SupportCenter'), {
  loading: () => <SectionLoading label="Abrindo o suporte..." />,
})
const VirtualAssistant = dynamic(() => import('./VirtualAssistant'), {
  loading: () => <SectionLoading label="Abrindo o assistente..." />,
})
const SalesCenter = dynamic(() => import('./SalesCenter'), {
  loading: () => <SectionLoading label="Abrindo vendas e metas..." />,
})
const PricingCenter = dynamic(() => import('./PricingCenter'), {
  loading: () => <SectionLoading label="Abrindo precificação e lucro..." />,
})

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

function SectionLoading({ label = 'Carregando...' }) {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#D4AF37', fontSize: '13px', fontWeight: 800 }}>
        <span className="premium-loading-spinner" aria-hidden="true" />
        {label}
      </div>
    </div>
  )
}

// ════════ HELPERS DE MÊS (usados na seção Calendário) ════════
const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_OCULTOS = new Set(['2026-03', '2026-06', '2026-07', '2026-08'])
const mesOculto = mesAno => MESES_OCULTOS.has(mesAno)

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
  fim.setDate(inicio.getDate() + 6)
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `Semana de ${fmt(inicio)} a ${fmt(fim)}`
}

function formatarDataConta(value, includeTime = false) {
  if (!value) return 'Não informado'
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: includeTime ? 'short' : 'long',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(date)
}

// ════════ HELPER: verifica se o acesso está liberado ════════
// Retorna { liberado: bool, motivo: 'expirado' | 'atrasado' | 'cancelado' | null }
function verificarAcesso(perfil) {
  if (!perfil) return { liberado: true, motivo: null } // sem dados ainda, não bloqueia

  const tipo = perfil.tipo_acesso

  if (tipo === 'assinatura') {
    if (perfil.status_assinatura === 'atrasado') return { liberado: false, motivo: 'atrasado' }
    if (['cancelado', 'reembolsado', 'reembolsada', 'refunded'].includes(perfil.status_assinatura)) return { liberado: false, motivo: 'cancelado' }
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
  const [vendasAbaInicial, setVendasAbaInicial] = useState('painel')
  const [tema, setTema] = useState(() => {
    if (typeof window === 'undefined') return 'claro'
    const salvo = window.localStorage.getItem('rotina-tema')
    return salvo === 'escuro' ? 'escuro' : 'claro'
  })
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
  const [dadosConta, setDadosConta] = useState({ planos: [], inicio_em: null, ultimo_acesso_em: null, expira_em: null })

  // Controle de acesso (novo)
  const [tipoAcesso, setTipoAcesso] = useState('rotina')
  const [acesso, setAcesso] = useState({ liberado: true, motivo: null })

  // Aulas (vindas do banco)
  const [aulas, setAulas] = useState([])
  const [mentoriaLiberada, setMentoriaLiberada] = useState(false)
  const [assistenteLiberado, setAssistenteLiberado] = useState(false)
  const [metasLiberadas, setMetasLiberadas] = useState(false)
  const [precificacaoLiberada, setPrecificacaoLiberada] = useState(false)
  const [protocolos, setProtocolos] = useState([])
  const [conteudosLiberados, setConteudosLiberados] = useState([])
  // Calendário (vindo do banco)
  const [calendario, setCalendario] = useState([])
  const [acoesCalendario, setAcoesCalendario] = useState([])
  const [mesSelecionado, setMesSelecionado] = useState(mesAtualValor())
  // Campanhas (vindo do banco)
  const [campanhas, setCampanhas] = useState([])
  const [mesSelecionadoCamp, setMesSelecionadoCamp] = useState(mesAtualValor())
  // Rotina semanal (vinda do banco) — mostra só a rotina da semana atual
  const [rotinaSemanal, setRotinaSemanal] = useState(null)
  const [videosExplicativos, setVideosExplicativos] = useState({})
  const [conteudosCarregando, setConteudosCarregando] = useState(true)

  const router = useRouter()

  useEffect(() => {
    const destino = new URLSearchParams(window.location.search).get('secao')
    const timer = window.setTimeout(() => {
      if (['inicio', 'rotina', 'vendas', 'conteudos', 'calendario', 'campanhas', 'precificacao'].includes(destino)) setSecao(destino)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  function alterarTema(novoTema) {
    setTema(novoTema)
    window.localStorage.setItem('rotina-tema', novoTema)
  }

  const cores = tema === 'escuro'
    ? { bg: '#0A0A0A', card: '#111111', card2: '#1A1A1A', borda: '#2A2A2A', tx: '#FFFFFF', tx2: '#888888', tx3: '#555555' }
    : { bg: '#F7F6F2', card: '#FFFFFF', card2: '#F0EFEA', borda: '#E2E0D8', tx: '#1A1A18', tx2: '#6A6A62', tx3: '#A0A098' }
  const temAcessoPremium = ['implementacao', 'mentoria'].includes(tipoAcesso)
  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  // Faz duas cargas consolidadas: primeiro o indispensável, depois os conteúdos.
  // Assim a sessão é validada uma vez por etapa e o painel evita várias chamadas repetidas.
  useEffect(() => {
    let cancelado = false
    let timerSecundario

    async function fetchJson(url, headers) {
      const resposta = await fetch(url, { headers })
      const dados = await resposta.json()
      return { ok: resposta.ok, dados }
    }

    async function carregarSecundarios(session) {
      const headers = { Authorization: `Bearer ${session.access_token}` }

      try {
        const { ok, dados } = await fetchJson(
          `/api/painel-bootstrap?scope=content&semana_inicio=${segundaFeiraAtual()}`,
          headers,
        )
        if (cancelado || !ok) return

        const calData = (dados.calendarios || []).filter(item => !mesOculto(item.mes_ano))
        const actionData = (dados.acoes_calendario || []).filter(item => !mesOculto(item.planning_month || String(item.action_date).slice(0, 7)))
        setCalendario(calData)
        setAcoesCalendario(actionData)
        const mesesCalendario = [...new Set([
          ...calData.map(item => item.mes_ano),
          ...actionData.map(item => item.planning_month || String(item.action_date).slice(0, 7)),
        ])].filter(Boolean).sort().reverse()
        setMesSelecionado(atual => mesesCalendario.includes(atual) ? atual : (mesesCalendario.includes(mesAtualValor()) ? mesAtualValor() : mesesCalendario[0] || mesAtualValor()))

        const campData = (dados.campanhas || []).filter(item => !mesOculto(item.mes_ano))
        setCampanhas(campData)
        const campanhasTemMesAtual = campData.some(c => c.mes_ano === mesAtualValor())
        if (!campanhasTemMesAtual && campData.length > 0) setMesSelecionadoCamp(campData[0].mes_ano)

        setRotinaSemanal(dados.rotina || null)
        setVideosExplicativos(Object.fromEntries((dados.tutorial_videos || []).map(item => [item.module_key, item])))
        if (dados.banners?.length) setBanners(dados.banners.map(item => ({
          id: item.id,
          tag: item.tag,
          titulo: item.title,
          texto: item.body,
          imagem: item.image_url,
          link: item.link_url,
        })))
      } finally {
        if (!cancelado) setConteudosCarregando(false)
      }
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/login'); return }
        if (cancelado) return

        setUsuario(session.user)
        const headers = { Authorization: `Bearer ${session.access_token}` }

        const { ok, dados } = await fetchJson('/api/painel-bootstrap?scope=critical', headers)
        if (!ok) throw new Error(dados.error || 'Não foi possível carregar o painel.')
        if (cancelado) return

        if (dados.termos?.termos?.is_required && !dados.termos.aceito) {
          setTermosPendentes(dados.termos.termos)
        }

        if (dados.perfil) {
          const perfil = dados.perfil
          setNome(perfil.nome || '')
          setWhatsapp(perfil.whatsapp || '')
          setTipoAcesso(perfil.tipo_acesso || 'rotina')
          if (session.user.email !== ADMIN_EMAIL) setAcesso(verificarAcesso(perfil))
        }

        if (dados.acessos?.protocol_only_slug) {
          router.replace(`/protocolo/${dados.acessos.protocol_only_slug}`)
          return
        }

        setMentoriaLiberada(dados.mentoria?.liberado === true)
        setAulas(dados.mentoria?.aulas || [])
        setAssistenteLiberado(dados.acessos?.assistant === true)
        setMetasLiberadas(dados.acessos?.team_goals === true)
        setPrecificacaoLiberada(dados.acessos?.pricing === true)
        setProtocolos(dados.acessos?.protocols || [])
        setConteudosLiberados(dados.acessos?.contents || [])
        setDadosConta(dados.conta || { planos: [], inicio_em: null, ultimo_acesso_em: null, expira_em: null })

        setCarregando(false)
        timerSecundario = window.setTimeout(() => {
          void carregarSecundarios(session)
        }, 0)
      } catch {
        if (!cancelado) router.push('/login')
      }
    }

    void init()
    return () => {
      cancelado = true
      if (timerSecundario) window.clearTimeout(timerSecundario)
    }
  }, [router])

  // Depois que a tela principal aparece, baixa os módulos mais usados em tempo ocioso.
  // O primeiro toque em Cursos ou Vendas deixa de esperar o download do componente.
  useEffect(() => {
    if (carregando) return undefined

    const preload = () => {
      void Promise.allSettled([
        import('./CursosArea'),
        import('./SalesCenter'),
        import('./SupportCenter'),
        import('./PricingCenter'),
        import('./VirtualAssistant'),
      ])
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 1800 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timer = window.setTimeout(preload, 600)
    return () => window.clearTimeout(timer)
  }, [carregando])

  useEffect(() => {
    if (carregando || !usuario?.id) return
    const titles = {
      inicio: 'Hoje', rotina: 'Rotina', vendas: 'Vendas e Metas', conteudos: 'Conteúdos',
      calendario: 'Calendário de Postagens', campanhas: 'Campanhas', precificacao: 'Precificação e Lucro',
      cursos: 'Meus Cursos', mentoria: 'Mentorias', dados: 'Meus Dados', ajuda: 'Suporte', assistente: 'Assistente',
    }
    void registerContentAccess({
      event_type: secao === 'inicio' ? 'app_open' : 'section_open',
      content_type: secao === 'inicio' ? 'app' : 'section',
      content_id: secao,
      content_title: titles[secao] || secao,
    })
  }, [carregando, secao, usuario?.id])

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

  const rotinaLiberada = conteudosLiberados.includes('routine')
  const campanhasLiberadas = conteudosLiberados.includes('campaigns')
  const calendarioLiberado = conteudosLiberados.includes('calendar')

  const menu = [
    { id: 'inicio', icone: 'home', label: 'Hoje' },
    ...(metasLiberadas ? [{ id: 'vendas', icone: 'goals', label: 'Vendas e Metas' }] : []),
    ...(rotinaLiberada ? [{ id: 'rotina', icone: 'routine', label: 'Rotina' }] : []),
    { id: 'conteudos', icone: 'content', label: 'Conteúdos' },
    { id: 'dados', icone: 'profile', label: 'Meus Dados' },
    { id: 'ajuda', icone: 'support', label: 'Suporte' },
  ]

  const menuMobileItens = [
    { id: 'inicio', icone: 'home', label: 'Hoje' },
    { id: 'conteudos', icone: 'content', label: 'Conteúdos' },
    { id: 'ajuda', icone: 'support', label: 'Suporte' },
    { id: 'dados', icone: 'profile', label: 'Meus Dados' },
    ...(assistenteLiberado ? [{ id: 'assistente', icone: 'quickAssistant', label: 'Assistente' }] : []),
  ]

  const menuMobileDrawer = [
    { id: 'inicio', icone: 'home', label: 'Hoje' },
    ...(metasLiberadas ? [{ id: 'vendas', icone: 'goals', label: 'Vendas e Metas' }] : []),
    ...(rotinaLiberada ? [{ id: 'rotina', icone: 'routine', label: 'Rotina' }] : []),
    { id: 'conteudos', icone: 'content', label: 'Conteúdos' },
    { id: 'dados', icone: 'profile', label: 'Meus Dados' },
    { id: 'mais', icone: 'more', label: 'Mais' },
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
    if ((id === 'rotina' && !rotinaLiberada) || (id === 'campanhas' && !campanhasLiberadas) || (id === 'calendario' && !calendarioLiberado)) { setSecao('conteudos'); setMenuMobile(false); return }
    if (id === 'calculadora') { router.push('/calculadora'); return }
    if (id === 'markup') { router.push('/markup'); return }
    if (id === 'mentoria') { router.push('/mentoria'); return }
    if (id === 'assistente' && !assistenteLiberado) { setSecao('suporte'); setMenuMobile(false); return }
    if ((id === 'vendas' || id === 'lancar-venda') && !metasLiberadas) { setSecao('metas-bloqueadas'); setMenuMobile(false); return }
    if (id === 'precificacao' && !precificacaoLiberada) { setSecao('precificacao-bloqueada'); setMenuMobile(false); return }
    if (id === 'lancar-venda') { setVendasAbaInicial('lancar'); setSecao('vendas'); setMenuMobile(false); return }
    if (id === 'vendas') setVendasAbaInicial('painel')
    setSecao(id)
    setMenuMobile(false)
  }

  const tituloSecao = [...menu, ...menuMobileDrawer].find(m => m.id === secao)?.label || (secao === 'dados' ? 'Meus Dados' : secao === 'precificacao' ? 'Precificação e Lucro' : '')

  return (
    <div className={`premium-painel tema-${tema}`} style={{ display: 'flex', minHeight: '100vh', background: cores.bg, color: cores.tx, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', transition: 'background .2s, color .2s' }}>

      <NotificationCenter cores={cores} ouro={ouro} onNavigate={irPara} />

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
              <AppIcon name={item.icone} size={18} /> {item.label}
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
            <button onClick={() => alterarTema('claro')} style={{ background: tema === 'claro' ? ouro : 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '7px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}>☀</button>
            <button onClick={() => alterarTema('escuro')} style={{ background: tema === 'escuro' ? ouro : 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '7px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}>☾</button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>

          {/* ─── INÍCIO ─── */}
          {secao === 'inicio' && (
            <HomeDashboard
              rotinaLiberada={rotinaLiberada}
              campanhasLiberadas={campanhasLiberadas}
              calendarioLiberado={calendarioLiberado}
              protocols={protocolos}
              userId={usuario?.id}
              nome={nomeExibe}
              saudacao={saudacao}
              banners={banners}
              bannerAtual={bannerAtual}
              setBannerAtual={setBannerAtual}
              cores={cores}
              ouro={ouro}
              ouroGrad={ouroGrad}
              irPara={irPara}
              tema={tema}
              setTema={alterarTema}
              mentoriaLiberada={mentoriaLiberada}
              temAcessoPremium={temAcessoPremium}
              assistenteLiberado={assistenteLiberado}
              metasLiberadas={metasLiberadas}
              precificacaoLiberada={precificacaoLiberada}
              rotinaSemanal={rotinaSemanal}
              calendarActions={acoesCalendario}
              campaign={campanhas.find(item => item.mes_ano === mesAtualValor()) || campanhas[0] || null}
            />
          )}

          {/* ─── conteúdo interno (com padding) ─── */}
          {secao !== 'inicio' && (
            <div style={{ padding: '20px 18px' }}>

              {/* TODOS OS ACESSOS — conteúdo completo em cascata no desktop */}
              {secao === 'acessos' && (
                <div className="premium-hub premium-mobile-all-access premium-access-cascade">
                  <div className="premium-hub-heading"><p>SEUS ACESSOS</p><h2>Tudo o que está liberado</h2><span>Role a página para acessar todos os conteúdos disponíveis no seu plano.</span></div>

                  <BlocoCascata titulo="Calendário" subtitulo="Planejamento mensal de conteúdo" cores={cores} ouro={ouro}>
                    {calendario.length ? calendario.map(item => <ItemCascata key={item.id} titulo={item.titulo} descricao={item.descricao || rotuloMesCompleto(item.mes_ano)} url={item.arquivo_url} textoLink="Visualizar calendário" onDownload={() => baixarPdf(item)} cores={cores} ouroGrad={ouroGrad} />) : <VazioCascata texto="Nenhum calendário disponível." cores={cores} />}
                  </BlocoCascata>

                  <BlocoCascata titulo="Campanhas" subtitulo="Campanhas e ações de vendas" cores={cores} ouro={ouro}>
                    {campanhas.length ? campanhas.map(item => <ItemCascata key={item.id} titulo={item.titulo} descricao={item.descricao || rotuloMesCompleto(item.mes_ano)} url={item.arquivo_url} textoLink="Visualizar campanha" onDownload={() => baixarPdf(item)} cores={cores} ouroGrad={ouroGrad} />) : <VazioCascata texto="Nenhuma campanha disponível." cores={cores} />}
                  </BlocoCascata>

                  <BlocoCascata titulo="Rotina" subtitulo="Execução da semana" cores={cores} ouro={ouro}>
                    {rotinaSemanal ? <ItemCascata titulo={rotinaSemanal.titulo} descricao={rotinaSemanal.descricao || rotuloSemana(rotinaSemanal.semana_inicio)} url={rotinaSemanal.arquivo_url} textoLink="Visualizar rotina" onDownload={() => baixarPdf(rotinaSemanal)} cores={cores} ouroGrad={ouroGrad} /> : <VazioCascata texto="A rotina desta semana ainda não foi publicada." cores={cores} />}
                  </BlocoCascata>

                  {metasLiberadas && <BlocoCascata titulo="Calculadora de Metas" subtitulo="Metas, ranking e histórico da equipe" cores={cores} ouro={ouro}>
                    <SalesCenter cores={cores} ouro={ouro} ouroGrad={ouroGrad} />
                  </BlocoCascata>}

                  <BlocoCascata titulo="Meus Cursos" subtitulo="Cursos liberados no seu plano" cores={cores} ouro={ouro}>
                    <CursosArea cores={cores} ouro={ouro} ouroGrad={ouroGrad} authenticatedUser={usuario} />
                  </BlocoCascata>

                  {mentoriaLiberada && <BlocoCascata titulo="Aulas da Mentoria" subtitulo="Gravações liberadas no seu plano" cores={cores} ouro={ouro}>
                    <div className="premium-cascade-lessons">{aulas.map(aula => <button key={aula.id} onClick={() => router.push(`/mentoria?aula=${aula.id}`)}><span>{aula.ordem}</span><div><strong>{aula.titulo}</strong><small>{aula.descricao || 'Assistir aula'}</small></div><b>Assistir →</b></button>)}</div>
                  </BlocoCascata>}

                  {precificacaoLiberada && <BlocoCascata titulo="Precificação e Lucro" subtitulo="Preço ideal, margem, descontos e histórico" cores={cores} ouro={ouro}>
                    <div className="premium-cascade-tools"><button onClick={() => irPara('precificacao')}><strong>Abrir calculadora de lucro</strong><span>Precifique e simule descontos com segurança →</span></button></div>
                  </BlocoCascata>}
                </div>
              )}

              {/* CONTEÚDOS */}
              {secao === 'conteudos' && (
                <div className="premium-hub">
                  <ProtocolAccess protocols={protocolos} cores={cores} />
                  <div className="premium-hub-heading"><p>CONTEÚDOS LIBERADOS</p><h2>Acesse seus materiais</h2><span>Cursos, campanhas, calendários e mentorias em um só lugar.</span></div>
                  <div className="premium-hub-grid">
                    {campanhasLiberadas && <CardAcesso cores={cores} icone="quickCampaigns" titulo="Campanhas" sub="Vendas prontas" onClick={() => irPara('campanhas')} destaque ouroGrad={ouroGrad} />}
                    {calendarioLiberado && <CardAcesso cores={cores} icone="quickCalendar" titulo="Calendário" sub="Conteúdo do mês" onClick={() => irPara('calendario')} />}
                    {precificacaoLiberada && <CardAcesso cores={cores} icone="content" titulo="Precificação e Lucro" sub="Preço, margem e descontos" onClick={() => irPara('precificacao')} />}
                    <CardAcesso cores={cores} icone="quickCourses" titulo="Meus Cursos" sub="Cursos liberados" onClick={() => irPara('cursos')} />
                    {mentoriaLiberada && <CardAcesso cores={cores} icone="quickCourses" titulo="Mentorias" sub="Aulas gravadas" onClick={() => irPara('mentoria')} />}
                  </div>
                </div>
              )}

              {/* SUPORTE — navegação mobile */}
              {secao === 'ajuda' && (
                <div className="premium-hub premium-mobile-support">
                  <div className="premium-hub-heading"><p>AJUDA E ATENDIMENTO</p><h2>{assistenteLiberado ? 'Suporte e Assistente Virtual' : 'Suporte'}</h2><span>{assistenteLiberado ? 'Escolha como você quer receber ajuda.' : 'Envie sua dúvida e acompanhe a resposta por aqui.'}</span></div>
                  <div className="premium-hub-grid">
                    <CardAcesso cores={cores} icone="support" titulo="Suporte" sub="Chamados e atendimento" onClick={() => irPara('suporte')} destaque ouroGrad={ouroGrad} />
                    {assistenteLiberado && <CardAcesso cores={cores} icone="quickAssistant" titulo="Assistente Virtual" sub="Orientação rápida com IA" onClick={() => irPara('assistente')} />}
                  </div>
                </div>
              )}

              {/* MAIS — mantido no desktop */}
              {secao === 'mais' && (
                <div className="premium-hub">
                  <div className="premium-hub-heading"><p>CONTA E FERRAMENTAS</p><h2>Mais opções</h2><span>Atendimento, configurações e ferramentas da sua loja.</span></div>
                  <div className="premium-hub-grid">
                    {precificacaoLiberada && <CardAcesso cores={cores} icone="content" titulo="Precificação e Lucro" sub="Preço, margem e descontos" onClick={() => irPara('precificacao')} destaque ouroGrad={ouroGrad} />}
                    {assistenteLiberado && <CardAcesso cores={cores} icone="quickAssistant" titulo="Assistente Virtual" sub="Orientação com IA" onClick={() => irPara('assistente')} />}
                    <CardAcesso cores={cores} icone="support" titulo="Suporte" sub="Chamados e atendimento" onClick={() => irPara('suporte')} />
                    <CardAcesso cores={cores} icone="profile" titulo="Meus Dados" sub="Informações da conta" onClick={() => irPara('dados')} />
                  </div>
                </div>
              )}

              {/* MEUS DADOS (somente leitura — só o admin pode editar) */}
              {secao === 'dados' && (
                <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                  <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '14px', padding: '20px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: cores.tx }}>👤 Meus Dados</h2>
                    <Campo label="Nome" valor={nome || '—'} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <Campo label="E-mail" valor={usuario?.email || ''} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <Campo label="WhatsApp" valor={whatsapp || '—'} onChange={() => {}} placeholder="" cores={cores} ouro={ouro} disabled />
                    <div style={{ borderTop: `1px solid ${cores.borda}`, marginTop: '18px', paddingTop: '18px' }}>
                      <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.12em', margin: '0 0 12px' }}>INFORMAÇÕES DO ACESSO</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        <DadoAcesso label="Plano do aluno" value={dadosConta.planos?.length ? dadosConta.planos.join(' + ') : 'Não informado'} cores={cores} />
                        <DadoAcesso label="Data de início" value={formatarDataConta(dadosConta.inicio_em)} cores={cores} />
                        <DadoAcesso label="Último acesso" value={formatarDataConta(dadosConta.ultimo_acesso_em, true)} cores={cores} />
                        <DadoAcesso label="Data que expira" value={dadosConta.expira_em ? formatarDataConta(dadosConta.expira_em) : 'Sem vencimento definido'} cores={cores} />
                      </div>
                    </div>
                    <NotificationPreference cores={cores} ouro={ouro} ouroGrad={ouroGrad} />
                    <p style={{ fontSize: '12px', color: cores.tx3, margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
                      Seus dados cadastrais são gerenciados pela administração. Para alterá-los, fale com o suporte. 💬
                    </p>
                  </div>
                </div>
              )}

              {/* MENTORIA / AULAS */}
              {secao === 'cursos' && <CursosArea cores={cores} ouro={ouro} ouroGrad={ouroGrad} authenticatedUser={usuario} onBack={() => setSecao('conteudos')} />}

              {secao === 'mentoria' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} />
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
                precificacaoLiberada ? <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
                  <VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} />
                  <VideoEmBreve cores={cores} ouro={ouro} titulo={videosExplicativos.pricing?.title || 'Como usar a calculadora de precificação'} videoUrl={videosExplicativos.pricing?.video_url} />
                  <PricingCenter userId={usuario?.id} cores={cores} ouro={ouro} ouroGrad={ouroGrad} />
                </div> : <AcessoBloqueado titulo="Precificação e Lucro" texto="Esta ferramenta não está incluída no seu plano atual." ouroGrad={ouroGrad} cores={cores} />
              )}

              {secao === 'precificacao-bloqueada' && <AcessoBloqueado titulo="Precificação e Lucro" texto="Esta ferramenta não está incluída no seu plano atual." ouroGrad={ouroGrad} cores={cores} />}

              {/* SUPORTE */}
              {secao === 'suporte' && (
                <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <SupportCenter cores={cores} ouro={ouro} ouroGrad={ouroGrad} whatsapp={WHATSAPP} />
                </div>
              )}

              {/* ASSISTENTE VIRTUAL */}
              {secao === 'assistente' && assistenteLiberado && (
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <VirtualAssistant cores={cores} ouro={ouro} ouroGrad={ouroGrad} onOpenSupport={() => irPara('suporte')} onNavigate={irPara} />
                </div>
              )}

              {/* VENDAS E METAS */}
              {secao === 'vendas' && (
                metasLiberadas ? <div style={{ maxWidth: '980px', margin: '0 auto' }}><VideoEmBreve cores={cores} ouro={ouro} titulo={videosExplicativos.team_goals?.title || 'Como usar a calculadora de metas'} videoUrl={videosExplicativos.team_goals?.video_url} /><SalesCenter cores={cores} ouro={ouro} ouroGrad={ouroGrad} initialTab={vendasAbaInicial} rotinaSemanal={rotinaSemanal} onOpenRoutine={() => irPara('rotina')} /></div> : <AcessoBloqueado titulo="Calculadora de Metas" texto="Esta ferramenta não está incluída no seu plano atual." ouroGrad={ouroGrad} cores={cores} />
              )}

              {secao === 'metas-bloqueadas' && <AcessoBloqueado titulo="Calculadora de Metas" texto="Esta ferramenta não está incluída no seu plano atual." ouroGrad={ouroGrad} cores={cores} />}

              {((secao === 'rotina' && !rotinaLiberada) || (secao === 'campanhas' && !campanhasLiberadas) || (secao === 'calendario' && !calendarioLiberado)) && <div style={{ padding: 24 }}><p>Este conteúdo não está incluído no seu acesso.</p><VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} /></div>}

              {/* CAMPANHAS DE VENDA (PDFs por mês) */}
              {secao === 'campanhas' && campanhasLiberadas && (
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} />
                  <VideoEmBreve cores={cores} ouro={ouro} titulo={videosExplicativos.campaigns?.title || 'Como usar a campanha do mês'} videoUrl={videosExplicativos.campaigns?.video_url} />
                  <div style={{ position: 'relative', overflow: 'hidden', background: tema === 'escuro' ? 'linear-gradient(135deg,#1b1608,#111 65%)' : 'linear-gradient(135deg,#fff4c7,#fff 70%)', border: `1px solid ${tema === 'escuro' ? '#554717' : '#ddc779'}`, borderRadius: '18px', padding: '23px', marginBottom: '18px' }}>
                    <div style={{ position: 'absolute', right: '-18px', top: '-22px', fontSize: '100px', opacity: .055 }}>🎯</div>
                    <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.13em', margin: '0 0 7px' }}>AÇÃO DO MÊS</p>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', color: cores.tx }}>Campanhas de Venda</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.55, maxWidth: '520px' }}>Estratégias prontas para movimentar sua loja, ativar clientes e vender mais.</p>
                  </div>

                  {conteudosCarregando ? <SectionLoading label="Carregando campanhas..." /> : !campanhas.length ? <div style={{ textAlign: 'center', padding: '54px 20px', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', color: cores.tx3 }}><div style={{ fontSize: '42px', marginBottom: '10px' }}>🎯</div><strong style={{ color: cores.tx2 }}>A próxima campanha aparecerá aqui</strong><p style={{ fontSize: '13px', margin: '6px 0 0' }}>Ainda não há material disponível.</p></div> : <>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '1px 1px 7px', marginBottom: '12px' }}>{campanhas.map(item => <button key={item.mes_ano} onClick={() => setMesSelecionadoCamp(item.mes_ano)} style={{ flexShrink: 0, padding: '9px 15px', borderRadius: '9px', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: mesSelecionadoCamp === item.mes_ano ? `1px solid ${ouro}` : `1px solid ${cores.borda}`, background: mesSelecionadoCamp === item.mes_ano ? (tema === 'escuro' ? '#2d270f' : '#fff5cf') : cores.card, color: mesSelecionadoCamp === item.mes_ano ? ouro : cores.tx2 }}>{rotuloMesCurto(item.mes_ano)}</button>)}</div>
                    {(() => {
                      const item = campanhas.find(c => c.mes_ano === mesSelecionadoCamp) || campanhas[0]
                      if (!item) return null
                      return <CampaignJourney item={item} userId={usuario?.id} cores={cores} ouro={ouro} ouroGrad={ouroGrad} onDownload={() => baixarPdf(item)} />
                    })()}
                  </>}
                </div>
              )}

              {/* CALENDÁRIO DE CONTEÚDO INTERATIVO */}
              {secao === 'calendario' && calendarioLiberado && (
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} />
                  <VideoEmBreve cores={cores} ouro={ouro} titulo={videosExplicativos.calendar?.title || 'Como usar o calendário de postagens'} videoUrl={videosExplicativos.calendar?.video_url} />
                  <div style={{ background: tema === 'escuro' ? 'linear-gradient(145deg,#17150f,#111)' : 'linear-gradient(145deg,#fffaf0,#fff)', border: `1px solid ${tema === 'escuro' ? '#4a4020' : '#ddc779'}`, borderRadius: '18px', padding: '22px', marginBottom: '18px' }}>
                    <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.13em', margin: '0 0 7px' }}>PLANEJAMENTO MENSAL</p>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', color: cores.tx }}>Calendário de Conteúdo</h2>
                    <p style={{ fontSize: '13px', color: cores.tx2, margin: 0, lineHeight: 1.55 }}>Abra cada data, execute a ação e acompanhe seu progresso durante o mês.</p>
                  </div>

                  {conteudosCarregando ? <SectionLoading label="Carregando calendário..." /> : (() => {
                    const meses = [...new Set([
                      ...calendario.map(item => item.mes_ano),
                      ...acoesCalendario.map(item => item.planning_month || String(item.action_date).slice(0, 7)),
                    ])].filter(Boolean).sort().reverse()
                    if (!meses.length) return <div style={{ textAlign: 'center', padding: '54px 20px', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', color: cores.tx3 }}><div style={{ fontSize: '42px', marginBottom: '10px' }}>📅</div><strong style={{ color: cores.tx2 }}>O próximo calendário aparecerá aqui</strong><p style={{ fontSize: '13px', margin: '6px 0 0' }}>Ainda não há ações disponíveis.</p></div>
                    const mesAtivo = meses.includes(mesSelecionado) ? mesSelecionado : meses[0]
                    const itemPdf = calendario.find(item => item.mes_ano === mesAtivo)
                    const acoesDoMes = acoesCalendario.filter(item => (item.planning_month || String(item.action_date).slice(0, 7)) === mesAtivo)
                    return <>
                      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '1px 1px 7px', marginBottom: '12px' }}>{meses.map(mes => <button key={mes} onClick={() => setMesSelecionado(mes)} style={{ flexShrink: 0, padding: '9px 15px', borderRadius: '9px', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: mesAtivo === mes ? `1px solid ${ouro}` : `1px solid ${cores.borda}`, background: mesAtivo === mes ? (tema === 'escuro' ? '#2d270f' : '#fff5cf') : cores.card, color: mesAtivo === mes ? ouro : cores.tx2 }}>{rotuloMesCurto(mes)}</button>)}</div>
                      <InteractiveCalendar mesAno={mesAtivo} actions={acoesDoMes} pdfItem={itemPdf} userId={usuario?.id} cores={cores} ouro={ouro} ouroGrad={ouroGrad} onDownload={() => itemPdf && baixarPdf(itemPdf)} />
                    </>
                  })()}
                </div>
              )}

              {/* ROTINA SEMANAL INTERATIVA */}
              {secao === 'rotina' && rotinaLiberada && (
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <VoltarConteudos onClick={() => setSecao('conteudos')} cores={cores} />
                  <VideoEmBreve cores={cores} ouro={ouro} titulo={videosExplicativos.routine?.title || 'Como executar a rotina da loja'} videoUrl={videosExplicativos.routine?.video_url} />

                  {conteudosCarregando ? <SectionLoading label="Carregando rotina da semana..." /> : !rotinaSemanal ? (
                    <div style={{ textAlign: 'center', padding: '54px 20px', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', color: cores.tx3 }}>
                      <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔄</div>
                      <strong style={{ color: cores.tx2 }}>A rotina desta semana aparecerá aqui</strong><p style={{ fontSize: '13px', margin: '6px 0 0' }}>O material ainda não foi publicado.</p>
                    </div>
                  ) : <WeeklyRoutineCard item={rotinaSemanal} userId={usuario?.id} cores={cores} ouro={ouro} ouroGrad={ouroGrad} onDownload={() => baixarPdf(rotinaSemanal)} />}
                </div>
              )}

            </div>
          )}

        </main>
      </div>

      {/* ═══════ MENU MOBILE (drawer) com MEUS DADOS ═══════ */}
      {menuMobile && (
        <div onClick={() => setMenuMobile(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}>
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
                  <AppIcon name={item.icone} size={19} /> {item.label}
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

      {/* ═══════ BOTTOM NAV (mobile) — visível desde a primeira tela ═══════ */}
        <nav className="bottom-nav" aria-label="Menu principal" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, height: '68px', background: cores.card, borderTop: `1px solid ${cores.borda}`, zIndex: 90, boxShadow: '0 -8px 24px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', height: '100%' }}>
            {menuMobileItens.map(item => (
              <button key={item.id} onClick={() => irPara(item.id)} aria-current={secao === item.id ? 'page' : undefined} style={bniStyle(cores, ouro, secao === item.id)}><AppIcon name={item.icone} size={20} />{item.label}</button>
            ))}
          </div>
        </nav>

      <style>{`
        .premium-loading-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(212,175,55,.25);
          border-top-color: #D4AF37;
          border-radius: 50%;
          animation: premium-spin .7s linear infinite;
        }
        @keyframes premium-spin { to { transform: rotate(360deg); } }
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

function VoltarConteudos({ onClick, cores }) {
  return <button onClick={onClick} style={{ background: 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '9px', color: cores.tx, padding: '9px 12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', marginBottom: '14px' }}>← Voltar aos conteúdos</button>
}

function VideoEmBreve({ cores, ouro, titulo, videoUrl }) {
  const embedUrl = toEmbedUrl(videoUrl)
  return <section style={{ marginBottom: '18px' }}>
    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: '16px', border: `1px solid ${cores.borda}`, background: `linear-gradient(145deg, ${cores.card2}, ${cores.card})`, display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' }}>
      {embedUrl ? (
        <iframe src={embedUrl} title={titulo} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} />
      ) : (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ width: '54px', height: '54px', margin: '0 auto 12px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(212,175,55,.14)', border: `1px solid ${ouro}`, color: ouro, fontSize: '20px' }}>▶</div>
          <strong style={{ display: 'block', color: cores.tx, fontSize: '18px', marginBottom: '5px' }}>Em breve</strong>
          <span style={{ color: cores.tx2, fontSize: '13px' }}>{titulo}</span>
        </div>
      )}
    </div>
  </section>
}

function bniStyle(cores, ouro, ativo) {
  return { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: ativo ? ouro : cores.tx3, fontSize: '9px', fontWeight: 700 }
}

function BlocoCascata({ titulo, subtitulo, cores, ouro, children }) {
  return <section className="premium-cascade-section" style={{ background: cores.card, border: `1px solid ${cores.borda}` }}>
    <header><p style={{ color: ouro }}>{titulo}</p><span style={{ color: cores.tx2 }}>{subtitulo}</span></header>
    <div>{children}</div>
  </section>
}

function ItemCascata({ titulo, descricao, url, textoLink, onDownload, cores, ouroGrad }) {
  return <article className="premium-cascade-item" style={{ background: cores.card2, border: `1px solid ${cores.borda}` }}>
    <div><strong style={{ color: cores.tx }}>{titulo}</strong><p style={{ color: cores.tx2 }}>{descricao}</p></div>
    <aside>{url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: cores.tx, border: `1px solid ${cores.borda}` }}>{textoLink}</a>}{url && <button onClick={onDownload} style={{ background: ouroGrad }}>Baixar</button>}</aside>
  </article>
}

function VazioCascata({ texto, cores }) {
  return <div className="premium-cascade-empty" style={{ color: cores.tx2, border: `1px dashed ${cores.borda}` }}>{texto}</div>
}

function AcessoBloqueado({ titulo, texto, ouroGrad, cores }) {
  return <div style={{ maxWidth: 620, margin: '38px auto', padding: '42px 22px', textAlign: 'center', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 20 }}>
    <div style={{ width: 64, height: 64, margin: '0 auto 16px', display: 'grid', placeItems: 'center', borderRadius: 20, background: ouroGrad, color: '#211A0E', fontSize: 28 }}>🔒</div>
    <h2 style={{ color: cores.tx, margin: '0 0 8px' }}>{titulo}</h2>
    <p style={{ color: cores.tx2, lineHeight: 1.55, margin: '0 0 18px' }}>{texto}<br />Fale com o suporte para conhecer os planos que liberam o acesso.</p>
    <a href={`https://api.whatsapp.com/send?phone=${WHATSAPP}&text=Quero%20liberar%20a%20Calculadora%20de%20Metas`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: ouroGrad, color: '#211A0E', borderRadius: 11, padding: '12px 18px', fontWeight: 900, textDecoration: 'none' }}>Conhecer planos</a>
  </div>
}

function CardAcesso({ cores, icone, titulo, sub, onClick, destaque, ouroGrad }) {
  return (
    <div onClick={onClick} style={{
      background: destaque ? ouroGrad : cores.card,
      border: `1px solid ${destaque ? 'transparent' : cores.borda}`,
      borderRadius: '14px', padding: '16px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: '50%', marginBottom: 11, color: destaque ? '#211A0E' : '#D4AF37', background: destaque ? 'rgba(255,255,255,.22)' : 'rgba(212,175,55,.10)', border: `1px solid ${destaque ? 'rgba(33,26,14,.25)' : 'rgba(212,175,55,.28)'}` }}><AppIcon name={icone} size={30} strokeWidth={1.45} /></div>
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

function DadoAcesso({ label, value, cores }) {
  return (
    <div style={{ background: cores.card2, border: `1px solid ${cores.borda}`, borderRadius: '10px', padding: '12px 13px', minHeight: '68px' }}>
      <span style={{ display: 'block', color: cores.tx2, fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>{label}</span>
      <strong style={{ display: 'block', color: cores.tx, fontSize: '14px', lineHeight: 1.35 }}>{value}</strong>
    </div>
  )
}
