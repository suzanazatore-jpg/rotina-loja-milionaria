'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CursosArea({ cores, ouro, ouroGrad }) {
  const router = useRouter()
  const [cursos, setCursos] = useState([])
  const [progresso, setProgresso] = useState({})
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const agora = new Date().toISOString()
      const ehAdmin = user.email === 'suporte@suzanazatorre.com.br'
      const { data: matriculas } = ehAdmin
        ? await supabase.from('courses').select('id,slug,title,subtitle,description,cover_image_url,sort_order,is_published').eq('is_published', true)
        : await supabase.from('enrollments').select('course_id,expires_at,courses(id,slug,title,subtitle,description,cover_image_url,sort_order,is_published)').eq('profile_id', user.id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${agora}`)

      const liberados = (matriculas || [])
        .map(item => ehAdmin ? item : item.courses)
        .filter(curso => curso?.is_published)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      if (liberados.length) {
        const ids = liberados.map(curso => curso.id)
        const [{ data: aulas }, { data: concluidas }] = await Promise.all([
          supabase.from('lessons').select('id,course_id').in('course_id', ids).eq('is_published', true),
          supabase.from('lesson_progress').select('lesson_id,completed').eq('profile_id', user.id).eq('completed', true),
        ])
        const concluidasIds = new Set((concluidas || []).map(item => item.lesson_id))
        const mapa = {}
        ids.forEach(id => {
          const lista = (aulas || []).filter(aula => aula.course_id === id)
          const feitas = lista.filter(aula => concluidasIds.has(aula.id)).length
          mapa[id] = { total: lista.length, feitas, percentual: lista.length ? Math.round((feitas / lista.length) * 100) : 0 }
        })
        if (ativo) setProgresso(mapa)
      }
      if (ativo) { setCursos(liberados); setCarregando(false) }
    }
    carregar()
    return () => { ativo = false }
  }, [])

  const temCursos = useMemo(() => cursos.length > 0, [cursos])

  if (carregando) return <p style={{ color: cores.tx2, textAlign: 'center', padding: '50px 0' }}>Carregando seus cursos...</p>

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 5px', color: cores.tx }}>🎓 Meus Cursos</h2>
        <p style={{ fontSize: '13px', color: cores.tx2, margin: 0 }}>Conteúdos liberados para o seu acesso.</p>
      </div>

      {!temCursos ? (
        <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', padding: '50px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔒</div>
          <h3 style={{ fontSize: '16px', color: cores.tx, margin: '0 0 6px' }}>Nenhum curso liberado ainda</h3>
          <p style={{ fontSize: '13px', color: cores.tx2, margin: 0 }}>Quando um curso for liberado para você, ele aparecerá aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
          {cursos.map(curso => {
            const p = progresso[curso.id] || { total: 0, feitas: 0, percentual: 0 }
            return (
              <article key={curso.id} onClick={() => router.push(`/curso/${curso.slug}`)} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{ aspectRatio: '16/9', background: cores.card2, overflow: 'hidden' }}>
                  {curso.cover_image_url ? <img src={curso.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: '38px' }}>🎓</div>}
                </div>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: cores.tx, margin: '0 0 4px' }}>{curso.title}</h3>
                  <p style={{ fontSize: '12px', color: cores.tx2, margin: '0 0 14px', minHeight: '18px' }}>{curso.subtitle || curso.description || 'Acesse as aulas do curso.'}</p>
                  <div style={{ height: '6px', background: cores.card2, borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${p.percentual}%`, height: '100%', background: ouroGrad }} /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', fontSize: '11px', color: cores.tx2 }}><span>{p.feitas} de {p.total} aulas</span><strong style={{ color: ouro }}>{p.percentual}%</strong></div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
