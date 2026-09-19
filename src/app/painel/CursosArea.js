'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CursosArea({ cores, ouro, ouroGrad, authenticatedUser = null, onBack = null }) {
  const router = useRouter()
  const [cursos, setCursos] = useState([])
  const [carrosseis, setCarrosseis] = useState([])
  const [progresso, setProgresso] = useState({})
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const [{ data: { session } }, userResult] = await Promise.all([
        supabase.auth.getSession(),
        authenticatedUser ? Promise.resolve(null) : supabase.auth.getUser(),
      ])
      const user = authenticatedUser || userResult?.data?.user
      if (!user) {
        if (ativo) setCarregando(false)
        return
      }

      const agora = new Date().toISOString()
      const ehAdmin = user.email === 'suporte@suzanazatorre.com.br'
      const cursosQuery = ehAdmin
        ? supabase.from('courses').select('id,slug,title,subtitle,description,cover_image_url,sort_order,is_published,is_mentorship').eq('is_published', true)
        : supabase.from('enrollments').select('course_id,expires_at,courses(id,slug,title,subtitle,description,cover_image_url,sort_order,is_published,is_mentorship)').eq('profile_id', user.id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${agora}`)

      const carrosseisPromise = fetch('/api/carrosseis', { headers: { Authorization: `Bearer ${session?.access_token}` } })
        .then(async resposta => ({ ok: resposta.ok, dados: await resposta.json() }))

      const [cursosResult, carrosseisResult] = await Promise.allSettled([cursosQuery, carrosseisPromise])
      const matriculas = cursosResult.status === 'fulfilled' ? cursosResult.value.data : []

      const liberados = (matriculas || [])
        .map(item => ehAdmin ? item : item.courses)
        .filter(curso => curso?.is_published && !curso?.is_mentorship)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      if (ativo && carrosseisResult.status === 'fulfilled' && carrosseisResult.value.ok) {
        setCarrosseis(carrosseisResult.value.dados.carrosseis || [])
      }

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
  }, [authenticatedUser])

  const temCursos = useMemo(() => cursos.length > 0, [cursos])
  const secoes = useMemo(() => {
    if (!carrosseis.length) return [{ id: 'meus-cursos', title: 'Meus Cursos', subtitle: 'Conteúdos liberados para o seu acesso.', courses: cursos }]
    const porId = Object.fromEntries(cursos.map(curso => [curso.id, curso]))
    const configuradas = carrosseis.map(item => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      courses: (item.course_ids || []).map(id => porId[id]).filter(Boolean),
    })).filter(item => item.courses.length)
    return configuradas.length ? configuradas : [{ id: 'meus-cursos', title: 'Meus Cursos', subtitle: 'Conteúdos liberados para o seu acesso.', courses: cursos }]
  }, [carrosseis, cursos])

  if (carregando) return <p style={{ color: cores.tx2, textAlign: 'center', padding: '50px 0' }}>Carregando seus cursos...</p>

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {onBack && <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${cores.borda}`, borderRadius: '9px', color: cores.tx, padding: '9px 12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', marginBottom: '16px' }}>← Voltar aos conteúdos</button>}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 5px', color: cores.tx }}>🎓 Meus Cursos</h2>
        <p style={{ fontSize: '13px', color: cores.tx2, margin: 0 }}>Escolha uma seção e continue avançando.</p>
      </div>

      {!temCursos ? (
        <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', padding: '50px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔒</div>
          <h3 style={{ fontSize: '16px', color: cores.tx, margin: '0 0 6px' }}>Nenhum curso liberado ainda</h3>
          <p style={{ fontSize: '13px', color: cores.tx2, margin: 0 }}>Quando um curso for liberado para você, ele aparecerá aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '27px' }}>
          {secoes.map(secao => <section key={secao.id}>
            <div style={{ marginBottom: '11px' }}><h3 style={{ fontSize: '18px', fontWeight: 900, color: cores.tx, margin: 0 }}>{secao.title}</h3>{secao.subtitle && <p style={{ fontSize: '12px', color: cores.tx2, margin: '4px 0 0' }}>{secao.subtitle}</p>}</div>
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', padding: '2px 2px 10px', scrollSnapType: 'x proximity' }}>
          {secao.courses.map(curso => {
            const p = progresso[curso.id] || { total: 0, feitas: 0, percentual: 0 }
            return (
              <article key={curso.id} onClick={() => router.push(`/curso/${curso.slug}`)} style={{ width: '220px', flex: '0 0 220px', scrollSnapAlign: 'start', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: '16px', overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{ position: 'relative', aspectRatio: '2/3', background: cores.card2, overflow: 'hidden' }}>
                  {curso.cover_image_url ? <img src={curso.cover_image_url} alt={`Capa do curso ${curso.title}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: '38px' }}>🎓</div>}
                  <span aria-hidden="true" style={{ position: 'absolute', top: 16, right: 16, width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#fff', background: 'rgba(20,20,20,.78)', border: '1px solid rgba(255,255,255,.24)', backdropFilter: 'blur(6px)', fontSize: 15 }}>▷</span>
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
          </section>)}
        </div>
      )}
    </div>
  )
}
