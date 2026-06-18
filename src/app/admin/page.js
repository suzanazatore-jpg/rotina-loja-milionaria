'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

  const cards = [
    { id: 'aulas', icone: '🎓', titulo: 'Aulas', sub: 'Mentoria gravada', rota: '/admin/aulas' },
    { id: 'calendario', icone: '📅', titulo: 'Calendário', sub: 'Conteúdo do mês', rota: '/admin/calendario' },
    { id: 'campanhas', icone: '🎯', titulo: 'Campanhas', sub: 'Vendas prontas', rota: '/admin/campanhas' },
    { id: 'rotina', icone: '🔄', titulo: 'Rotina', sub: 'Em breve', rota: '/admin/rotina' },
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

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 18px 60px' }}>
        <p style={{ fontSize: '14px', color: '#888', margin: '0 0 18px' }}>Escolha o que você quer gerenciar:</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
          {cards.map(card => (
            <div
              key={card.id}
              onClick={() => router.push(card.rota)}
              style={{
                background: '#111111', border: '1px solid #2A2A2A', borderRadius: '14px',
                padding: '18px', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '26px', marginBottom: '10px' }}>{card.icone}</div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px', color: '#FFFFFF' }}>{card.titulo}</h3>
              <p style={{ fontSize: '12px', margin: 0, color: '#888' }}>{card.sub}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
