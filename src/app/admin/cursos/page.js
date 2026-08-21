'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const C = { bg: '#070607', panel: '#0a080a', card: '#161213', card2: '#1b1617', line: '#242021', muted: '#a49a96', muted2: '#6f6763', hot: '#ff2e63' }

function Icon({ name }) {
  const p = {
    users: <><circle cx="9" cy="7" r="3" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><circle cx="17.5" cy="8" r="2.2" /><path d="M16 14.4c2.4.5 4 2.4 4 4.6" /></>,
    book: <><path d="M12 6c-1.6-1-4-1.4-6-1.4S3 5 3 5v13s1.7-.8 5-.8 4 .6 4 .6 .7-.6 4-.6 4 .8 4 .8V5s-1-.4-3-.4S13.6 5 12 6z" /><path d="M12 6v11.4" /></>,
    file: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
    award: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L8 21l4-2 4 2-1-7.5" /></>,
    image: <><rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M4 17l5-4 4 3 3-2 4 3" /></>,
    gallery: <><rect x="3" y="5" width="5" height="14" rx="1.5" /><rect x="10" y="5" width="5" height="14" rx="1.5" /><rect x="17" y="7" width="4" height="10" rx="1.5" /></>,
    message: <><path d="M4 5h16v11H9l-4 3v-3H4z" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
    send: <><path d="M21 3L3 10l7 3 3 7 8-17z" /><path d="M10 14l4-4" /></>,
    palette: <><path d="M12 3a9 9 0 100 18c1.4 0 2-1 2-2 0-1.4 1-2 2.4-2H18a3 3 0 003-3c0-5-4.5-9-9-9z" /><circle cx="7.5" cy="11" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="11" r="1" /></>,
    shield: <><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" /></>,
    phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>
}

const GRUPOS = [
  {
    h2: 'Gerenciamento de Conteúdo e Usuários', sub: 'Gerencie o conteúdo e os alunos da sua área de membros.',
    cards: [
      { ic: 'users', t: 'Usuários', d: 'Cadastre alunas, libere acesso aos cursos e gerencie status.', tag: 'em breve' },
      { ic: 'book', t: 'Cursos e Aulas', d: 'Crie cursos, módulos e aulas com vídeo e materiais.', route: '/admin/cursos/aulas' },
      { ic: 'file', t: 'Termos de Uso', d: 'O texto que a aluna aceita no primeiro acesso.', tag: 'em breve' },
      { ic: 'layers', t: 'Planos e Ofertas', d: 'Gerencie planos e ofertas de acesso aos cursos.', tag: 'em breve' },
      { ic: 'user', t: 'Mentores', d: 'Associe mentores às aulas do seu clube.', dim: true, tag: 'depois' },
      { ic: 'award', t: 'Certificados', d: 'Certificados de conclusão para as alunas.', dim: true, tag: 'depois' },
    ],
  },
  {
    h2: 'Dashboard da Área de Membros', sub: 'Configure a página inicial que a aluna vê.',
    cards: [
      { ic: 'image', t: 'Banners da Dashboard', d: 'Insira banners de novidades no topo da área de membros.', tag: 'em breve' },
      { ic: 'gallery', t: 'Carrosséis de Cursos', d: 'Organize os cursos em seções e carrosséis na dashboard.', tag: 'em breve' },
    ],
  },
  {
    h2: 'Marketing e Comunicação', sub: 'Ações que comunicam e engajam suas alunas.',
    cards: [
      { ic: 'message', t: 'Comentários', d: 'Veja e modere o feedback das alunas nas aulas.', tag: 'em breve' },
      { ic: 'mail', t: 'Suporte', d: 'Mensagens de suporte recebidas pela plataforma.', tag: 'em breve' },
      { ic: 'send', t: 'Campanhas e Mensagens', d: 'Envie comunicados e e-mails para suas alunas.', tag: 'em breve' },
    ],
  },
  {
    h2: 'Configurações', sub: 'Cores, preferências e segurança da área de membros.',
    cards: [
      { ic: 'palette', t: 'Preferências e Cores', d: 'Ajuste o visual da área de membros com o seu estilo.', tag: 'em breve' },
      { ic: 'file', t: 'Termos de Uso', d: 'Solicite às alunas que aceitem os termos do seu conteúdo.', tag: 'em breve' },
      { ic: 'shield', t: 'Proteção DRM', d: 'Marca d’água e proteção do conteúdo.', dim: true, tag: 'depois' },
      { ic: 'phone', t: 'Notificações SMS', d: 'Envio de notificações por SMS.', dim: true, tag: 'depois' },
      { ic: 'lock', t: 'Autenticação e Segurança', d: 'Regras de login e acesso à área de membros.', dim: true, tag: 'depois' },
      { ic: 'user', t: 'Administradores', d: 'Atribua permissões administrativas a outras pessoas.', dim: true, tag: 'depois' },
    ],
  },
]

export default function AdminCursosHub() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setAutorizado(false); setCarregando(false); return }
      setAutorizado(true); setCarregando(false)
    }
    init()
  }, [router])

  if (carregando) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: C.muted2 }}>Carregando...</p></div>
  if (!autorizado) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
      <h1 style={{ color: '#fff', fontSize: 20, margin: '0 0 8px' }}>Acesso restrito</h1>
      <button onClick={() => router.push('/painel')} style={{ background: C.hot, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>Voltar ao painel</button>
    </div>
  )

  function abrir(card) { if (card.route) router.push(card.route) }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: '#fff', fontFamily: 'Archivo, system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: `1px solid ${C.line}`, background: C.panel, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 8, color: C.hot, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Painel</button>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.hot, textTransform: 'uppercase', margin: 0 }}>⚙ Administrador</p>
          <p style={{ fontSize: 15, fontWeight: 800, margin: '1px 0 0' }}>Área de Cursos</p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 24px 50px' }}>
        {GRUPOS.map((g, gi) => (
          <div key={gi} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 3px', fontWeight: 800 }}>{g.h2}</h2>
            <p style={{ color: C.muted2, fontSize: 12.5, margin: '0 0 16px' }}>{g.sub}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {g.cards.map((card, ci) => (
                <div key={ci} onClick={() => abrir(card)}
                  style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.hot}`, borderRadius: 12, padding: 18, display: 'flex', gap: 14, minHeight: 104, cursor: card.route ? 'pointer' : 'default', opacity: card.dim ? 0.5 : 1 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 10, background: '#221a1c', display: 'grid', placeItems: 'center', color: C.hot, flex: 'none' }}><Icon name={card.ic} /></span>
                  <div>
                    <h3 style={{ margin: '0 0 5px', fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                      {card.t}
                      {card.tag && <span style={{ background: card.tag === 'em breve' ? '#2a2022' : '#2a2022', color: C.muted2, fontSize: 9.5, fontWeight: 800, borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase' }}>{card.tag}</span>}
                    </h3>
                    <p style={{ margin: 0, color: C.muted2, fontSize: 12, lineHeight: 1.4 }}>{card.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '26px 0 0', padding: 16, background: '#0d0a0b', border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: C.hot }} /> <b style={{ color: C.hot }}>Ativo</b> — pronto pra usar</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3335' }} /> Em breve / Fase 2 — entram depois</div>
        </div>
      </main>
    </div>
  )
}
