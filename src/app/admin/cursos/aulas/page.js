'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

const C = { bg: '#070607', panel: '#0a080a', card: '#161213', line: '#242021', muted: '#a49a96', muted2: '#6f6763', hot: '#ff2e63' }

export default function AdminCursosLista() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [cursos, setCursos] = useState([])
  const [erro, setErro] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setAutorizado(false); setCarregando(false); return }
      setAutorizado(true)
      const { data, error } = await supabase.from('courses')
        .select('id, slug, title, subtitle, cover_image_url, sort_order, is_published')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) setErro(error.message); else setCursos(data || [])
      setCarregando(false)
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

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: '#fff', fontFamily: 'Archivo, system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 20px', borderBottom: `1px solid ${C.line}`, background: C.panel, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/admin/cursos')} style={{ background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 8, color: C.hot, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Cursos</button>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.hot, textTransform: 'uppercase', margin: 0 }}>Cursos e Aulas</p>
            <p style={{ fontSize: 15, fontWeight: 800, margin: '1px 0 0' }}>Todos os cursos</p>
          </div>
        </div>
        <button onClick={() => router.push('/admin/cursos/editar')} style={{ background: C.hot, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Novo curso</button>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 18px 60px' }}>
        {erro && <div style={{ background: '#2a1515', border: '1px solid #5a2a2a', color: '#f5a5a5', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>{erro}</div>}
        {cursos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C.muted2 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <p style={{ fontSize: 15, margin: '0 0 6px', color: '#fff' }}>Nenhum curso ainda</p>
            <p style={{ fontSize: 13, margin: 0 }}>Clique em “＋ Novo curso” para criar o primeiro.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 14, color: C.muted2, margin: '0 0 4px' }}>{cursos.length} curso(s) • toque para editar</p>
            {cursos.map(curso => (
              <div key={curso.id} onClick={() => router.push(`/admin/cursos/editar?id=${curso.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.hot}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ width: 64, height: 48, borderRadius: 8, background: '#221a1c', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {curso.cover_image_url ? <img src={curso.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>🎬</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{curso.title}</h3>
                  <p style={{ fontSize: 12, margin: 0, color: C.muted2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>/{curso.slug}{curso.subtitle ? ` • ${curso.subtitle}` : ''}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, flexShrink: 0, background: curso.is_published ? 'rgba(255,46,99,0.15)' : '#1b1617', color: curso.is_published ? C.hot : C.muted2, border: `1px solid ${curso.is_published ? 'rgba(255,46,99,0.35)' : C.line}` }}>{curso.is_published ? 'Publicado' : 'Rascunho'}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
