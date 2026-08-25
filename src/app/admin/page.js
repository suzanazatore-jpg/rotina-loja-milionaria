'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppIcon from '@/app/components/AppIcon'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export default function Admin() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const router = useRouter()

  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAutorizado(false); setCarregando(false); return
      }
      setAutorizado(true)
      setCarregando(false)
    }
    init()
  }, [router])

  const grupos = [
    {
      titulo: 'Gerenciamento de Conteúdo e Usuários',
      descricao: 'Gerencie o conteúdo e as alunas da sua área de membros.',
      cards: [
        { icone: 'users', titulo: 'Alunas e Acessos', sub: 'Cadastre alunas, libere cursos e gerencie acessos.', rota: '/admin/alunas' },
        { icone: 'courses', titulo: 'Cursos e Aulas', sub: 'Crie cursos, módulos e aulas com vídeo e materiais.', rota: '/admin/cursos' },
        { icone: 'plans', titulo: 'Planos e Ofertas', sub: 'Defina planos, validade, cursos e conteúdos vinculados.', rota: '/admin/planos' },
        { icone: 'quickCourses', titulo: 'Aulas da Mentoria', sub: 'Organize as gravações das mentorias EVS e CVM.', rota: '/admin/aulas' },
        { icone: '📝', titulo: 'Termos de Uso', sub: 'Texto que a aluna aceita no primeiro acesso.', rota: '/admin/termos' },
        { icone: '🏅', titulo: 'Certificados', sub: 'Certificados de conclusão para as alunas.', status: 'Depois' },
      ],
    },
    {
      titulo: 'Conteúdo do Aplicativo',
      descricao: 'Configure o que a aluna encontra no painel principal.',
      cards: [
        { icone: 'calendar', titulo: 'Calendário', sub: 'Organize e publique o conteúdo mensal.', rota: '/admin/calendario' },
        { icone: 'campaigns', titulo: 'Campanhas', sub: 'Disponibilize campanhas e ações de vendas.', rota: '/admin/campanhas' },
        { icone: 'routine', titulo: 'Rotina', sub: 'Publique a rotina semanal das lojistas.', rota: '/admin/rotina' },
        { icone: 'goals', titulo: 'Meta da Equipe', sub: 'Configure metas de vendas da equipe e das vendedoras.', status: 'Em breve' },
      ],
    },
    {
      titulo: 'Marketing e Comunicação',
      descricao: 'Ações para comunicar e acompanhar suas alunas.',
      cards: [
        { icone: 'banners', titulo: 'Banners do Painel', sub: 'Insira banners e novidades no topo do aplicativo.', rota: '/admin/banners' },
        { icone: 'carousel', titulo: 'Carrosséis de Cursos', sub: 'Organize cursos em seções na área de membros.', rota: '/admin/carrosseis' },
        { icone: 'comments', titulo: 'Comentários', sub: 'Veja, responda e modere comentários feitos nas aulas.', rota: '/admin/comentarios' },
        { icone: 'support', titulo: 'Suporte', sub: 'Centralize e responda as solicitações das alunas.', rota: '/admin/suporte' },
        { icone: 'broadcast', titulo: 'Campanhas em Massa', sub: 'Envie mensagens por e-mail e WhatsApp.', rota: '/admin/comunicacao' },
      ],
    },
    {
      titulo: 'Configurações',
      descricao: 'Preferências, segurança e administração do aplicativo.',
      cards: [
        { icone: '🎨', titulo: 'Preferências e Cores', sub: 'Ajuste a identidade visual do aplicativo.', status: 'Em breve' },
        { icone: '🔐', titulo: 'Autenticação e Segurança', sub: 'Regras de login e proteção de acesso.', status: 'Depois' },
        { icone: '👤', titulo: 'Administradores', sub: 'Defina outras pessoas com acesso administrativo.', status: 'Depois' },
      ],
    },
  ]

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

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.push('/painel')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Painel</button>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>⚙️ Meu Escritório</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '30px 18px 70px' }}>
        {grupos.map(grupo => (
          <section key={grupo.titulo} style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px' }}>{grupo.titulo}</h2>
            <p style={{ fontSize: '13px', color: '#777', margin: '0 0 14px' }}>{grupo.descricao}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {grupo.cards.map(card => {
                const ativo = Boolean(card.rota)
                return (
                  <button
                    key={card.titulo}
                    type="button"
                    disabled={!ativo}
                    onClick={() => ativo && router.push(card.rota)}
                    style={{
                      minHeight: '104px', display: 'flex', alignItems: 'flex-start', gap: '14px', textAlign: 'left',
                      background: ativo ? '#131313' : '#0E0E0E', border: `1px solid ${ativo ? '#34302A' : '#202020'}`,
                      borderLeft: `3px solid ${ativo ? ouro : '#343434'}`, borderRadius: '12px', padding: '17px',
                      color: ativo ? '#FFF' : '#666', cursor: ativo ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ width: '42px', height: '42px', flex: '0 0 42px', display: 'grid', placeItems: 'center', borderRadius: '10px', background: ativo ? 'rgba(212,175,55,.10)' : '#151515', color: ativo ? ouro : '#555' }}><AppIcon name={card.icone} size={21} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '7px', fontSize: '14px', fontWeight: 800, marginBottom: '5px' }}>
                        {card.titulo}
                        {card.status && <small style={{ background: '#252525', color: '#777', borderRadius: '5px', padding: '3px 6px', fontSize: '9px', textTransform: 'uppercase' }}>{card.status}</small>}
                      </span>
                      <span style={{ display: 'block', color: ativo ? '#8C8C8C' : '#4C4C4C', fontSize: '12px', lineHeight: 1.45 }}>{card.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '14px 16px', color: '#888', fontSize: '12px' }}>
          <span><b style={{ color: ouro }}>● Ativo</b> — pronto para usar</span>
          <span><b style={{ color: '#555' }}>● Em breve</b> — entra nas próximas etapas</span>
        </div>
      </main>
    </div>
  )
}
