'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

export default function AdminCursos() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [cursos, setCursos] = useState([])
  const [erro, setErro] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAutorizado(false); setCarregando(false); return
      }
      setAutorizado(true)
      await carregarCursos()
      setCarregando(false)
    }
    init()
  }, [router])

  async function carregarCursos() {
    const { data, error } = await supabase
      .from('courses')
      .select('id, slug, title, subtitle, cover_image_url, sort_order, is_published')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) { setErro(error.message); return }
    setCursos(data || [])
  }

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
          <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Admin</button>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>🎬 Cursos</p>
          </div>
        </div>
        <button onClick={() => router.push('/admin/cursos/editar')} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Novo curso</button>
      </header>

      <main style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 18px 60px' }}>
        {erro && (
          <div style={{ background: '#2A1515', border: '1px solid #5A2A2A', color: '#F5A5A5', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>{erro}</div>
        )}

        {cursos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</div>
            <p style={{ fontSize: '15px', margin: '0 0 6px', color: '#FFF' }}>Nenhum curso ainda</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Clique em “＋ Novo curso” para criar o primeiro.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            <p style={{ fontSize: '14px', color: '#888', margin: '0 0 4px' }}>{cursos.length} curso(s) • toque para editar</p>
            {cursos.map(curso => (
              <div
                key={curso.id}
                onClick={() => router.push(`/admin/cursos/editar?id=${curso.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#111111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '12px 14px', cursor: 'pointer' }}
              >
                <div style={{ width: '64px', height: '48px', borderRadius: '8px', background: '#1C1C1C', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {curso.cover_image_url
                    ? <img src={curso.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '20px' }}>🎬</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{curso.title}</h3>
                  <p style={{ fontSize: '12px', margin: 0, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>/{curso.slug}{curso.subtitle ? ` • ${curso.subtitle}` : ''}</p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 9px', borderRadius: '999px', flexShrink: 0, background: curso.is_published ? 'rgba(212,175,55,0.15)' : '#1C1C1C', color: curso.is_published ? ouro : '#777', border: `1px solid ${curso.is_published ? 'rgba(212,175,55,0.35)' : '#2A2A2A'}` }}>
                  {curso.is_published ? 'Publicado' : 'Rascunho'}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
