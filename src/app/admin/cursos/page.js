'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

export default function AdminCursos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [cursos, setCursos] = useState([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true)
      const { data, error } = await supabase.from('courses')
        .select('id,slug,title,subtitle,cover_image_url,sort_order,is_published,modules(id),lessons(id)')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) setErro(error.message); else setCursos(data || [])
      setCarregando(false)
    }
    carregar()
  }, [router])

  if (carregando) return <Estado texto="Carregando cursos..." />
  if (!autorizado) return <Estado texto="Esta área é exclusiva do administrador." bloqueado voltar={() => router.push('/painel')} />

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button onClick={() => router.push('/admin')} style={botaoVoltar}>← Escritório</button>
          <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administrador</p><p style={{ fontSize: 15, fontWeight: 800, margin: '1px 0 0' }}>Cursos e Aulas</p></div>
        </div>
        <button onClick={() => router.push('/admin/cursos/editar')} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Novo curso</button>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '26px 18px 70px' }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 24 }}>Seus cursos</h1>
        <p style={{ margin: '0 0 22px', color: '#888', fontSize: 13 }}>Crie cursos e organize módulos, aulas, vídeos e materiais.</p>
        {erro && <div style={avisoErro}>{erro}</div>}
        {!erro && cursos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: 14 }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🎓</div><p style={{ margin: '0 0 5px', fontWeight: 800 }}>Nenhum curso cadastrado</p><p style={{ margin: 0, color: '#777', fontSize: 13 }}>Clique em “Novo curso” para começar. Nenhum dado da Academia será copiado.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
            {cursos.map(curso => <button key={curso.id} onClick={() => router.push(`/admin/cursos/editar?id=${curso.id}`)} style={{ textAlign: 'left', padding: 0, background: '#141414', border: '1px solid #2A2A2A', borderRadius: 14, overflow: 'hidden', color: '#FFF', cursor: 'pointer' }}>
              <div style={{ height: 128, background: curso.cover_image_url ? `url(${curso.cover_image_url}) center/cover` : 'linear-gradient(135deg, #28210c, #0f0d08)', display: 'grid', placeItems: 'center', padding: 18 }}>{!curso.cover_image_url && <span style={{ color: '#E9CD6A', fontWeight: 900, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.04em' }}>{curso.title}</span>}</div>
              <div style={{ padding: '15px 16px 16px' }}><h2 style={{ margin: '0 0 5px', fontSize: 16 }}>{curso.title}</h2><p style={{ margin: 0, color: '#777', fontSize: 12 }}>{curso.modules?.length || 0} módulo(s) · {curso.lessons?.length || 0} aula(s)</p><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}><span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '5px 9px', color: curso.is_published ? '#66D391' : '#999', background: curso.is_published ? 'rgba(60,180,100,.12)' : '#202020' }}>{curso.is_published ? 'Publicado' : 'Rascunho'}</span><span style={{ color: ouro, fontSize: 12, fontWeight: 800 }}>Editar →</span></div></div>
            </button>)}
          </div>
        )}
      </main>
    </div>
  )
}

function Estado({ texto, bloqueado, voltar }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#888', display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}><div>{bloqueado && <div style={{ fontSize: 42, marginBottom: 12 }}>🔒</div>}<p>{texto}</p>{voltar && <button onClick={voltar} style={{ ...botaoVoltar, marginTop: 8 }}>Voltar ao painel</button>}</div></div> }
const botaoVoltar = { background: 'transparent', border: '1px solid #333', borderRadius: 8, color: ouro, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const avisoErro = { background: '#2A1515', border: '1px solid #5A2A2A', color: '#F5A5A5', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 18 }
