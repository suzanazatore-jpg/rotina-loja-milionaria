'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OURO = '#D4AF37'
const GRADIENTE = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

function urlVideo(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      if (parsed.pathname.includes('/embed/')) return url
    }
    if (parsed.hostname === 'youtu.be') return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    if (parsed.hostname.includes('vimeo.com') && !parsed.hostname.includes('player.')) return `https://player.vimeo.com/video/${parsed.pathname.split('/').filter(Boolean).pop()}`
  } catch (_) {}
  return url
}

export default function Curso({ params }) {
  const { slug } = use(params)
  const router = useRouter()
  const busca = useSearchParams()
  const [usuario, setUsuario] = useState(null)
  const [curso, setCurso] = useState(null)
  const [modulos, setModulos] = useState([])
  const [aulas, setAulas] = useState([])
  const [materiais, setMateriais] = useState([])
  const [concluidas, setConcluidas] = useState(new Set())
  const [aulaId, setAulaId] = useState(busca.get('aula'))
  const [abertos, setAbertos] = useState(new Set())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUsuario(user)
      const { data: cursoData } = await supabase.from('courses').select('*').eq('slug', slug).eq('is_published', true).maybeSingle()
      if (!cursoData) { setErro('Curso não encontrado ou não publicado.'); setCarregando(false); return }

      const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (perfil?.role !== 'admin' && user.email !== 'suporte@suzanazatorre.com.br') {
        const { data: matricula } = await supabase.from('enrollments').select('id').eq('profile_id', user.id).eq('course_id', cursoData.id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle()
        if (!matricula) { setErro('Este curso não está liberado para o seu acesso.'); setCarregando(false); return }
      }

      const [mods, lessons, mats, progress] = await Promise.all([
        supabase.from('modules').select('*').eq('course_id', cursoData.id).eq('is_published', true).order('sort_order'),
        supabase.from('lessons').select('*').eq('course_id', cursoData.id).eq('is_published', true).order('sort_order'),
        supabase.from('materials').select('*').eq('course_id', cursoData.id).eq('is_published', true).order('sort_order'),
        supabase.from('lesson_progress').select('lesson_id,completed').eq('profile_id', user.id).eq('completed', true),
      ])
      const lista = lessons.data || []
      setCurso(cursoData); setModulos(mods.data || []); setAulas(lista); setMateriais(mats.data || [])
      setConcluidas(new Set((progress.data || []).map(item => item.lesson_id)))
      setAulaId(atual => atual && lista.some(aula => aula.id === atual) ? atual : lista[0]?.id || null)
      setAbertos(new Set((mods.data || []).slice(0, 1).map(modulo => modulo.id)))
      setCarregando(false)
    }
    carregar()
  }, [router, slug])

  const aulaAtual = useMemo(() => aulas.find(aula => aula.id === aulaId) || aulas[0], [aulas, aulaId])
  const indiceAtual = aulas.findIndex(aula => aula.id === aulaAtual?.id)
  const materiaisAula = materiais.filter(item => item.lesson_id === aulaAtual?.id)
  const percentual = aulas.length ? Math.round((concluidas.size / aulas.length) * 100) : 0

  function escolherAula(id) {
    setAulaId(id)
    router.replace(`/curso/${slug}?aula=${id}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function alternarConclusao() {
    if (!usuario || !aulaAtual) return
    const concluida = concluidas.has(aulaAtual.id)
    const { data: existente } = await supabase.from('lesson_progress').select('id').eq('profile_id', usuario.id).eq('lesson_id', aulaAtual.id).maybeSingle()
    const valores = { completed: !concluida, completed_at: !concluida ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
    const resposta = existente
      ? await supabase.from('lesson_progress').update(valores).eq('id', existente.id)
      : await supabase.from('lesson_progress').insert({ profile_id: usuario.id, lesson_id: aulaAtual.id, ...valores })
    if (!resposta.error) setConcluidas(atual => { const novo = new Set(atual); concluida ? novo.delete(aulaAtual.id) : novo.add(aulaAtual.id); return novo })
  }

  async function abrirMaterial(material) {
    const { data: { session } } = await supabase.auth.getSession()
    const resposta = await fetch(`/api/material-curso?id=${material.id}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const data = await resposta.json()
    if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  if (carregando) return <Estado texto="Carregando curso..." />
  if (erro) return <Estado texto={erro} botao={() => router.push('/painel')} />

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ minHeight: '64px', padding: '12px 20px', borderBottom: '1px solid #292929', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', position: 'sticky', top: 0, zIndex: 20, background: '#0A0A0A' }}>
        <button onClick={() => router.push('/painel')} style={botaoSecundario}>← Meus cursos</button>
        <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: '10px', color: OURO, fontWeight: 800, letterSpacing: '.1em' }}>ROTINA DA LOJA MILIONÁRIA</p><h1 style={{ margin: '2px 0 0', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{curso.title}</h1></div>
        <strong style={{ fontSize: '12px', color: OURO }}>{percentual}% concluído</strong>
      </header>

      <div className="curso-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', maxWidth: '1500px', margin: '0 auto' }}>
        <main style={{ padding: '26px', minWidth: 0 }}>
          {aulaAtual ? <>
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', border: '1px solid #292929', borderRadius: '16px', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
              {aulaAtual.video_url ? <iframe src={urlVideo(aulaAtual.video_url)} title={aulaAtual.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} /> : <span style={{ color: '#777' }}>🎬 Vídeo em breve</span>}
            </div>
            <div style={{ padding: '22px 2px' }}>
              <p style={{ color: OURO, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 7px' }}>{aulaAtual.duration_label || 'Aula do curso'}</p>
              <h2 style={{ margin: '0 0 8px', fontSize: '24px' }}>{aulaAtual.title}</h2>
              {aulaAtual.description && <p style={{ color: '#AAA', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{aulaAtual.description}</p>}
              <button onClick={alternarConclusao} style={{ ...botaoPrincipal, background: concluidas.has(aulaAtual.id) ? '#17351F' : GRADIENTE, color: concluidas.has(aulaAtual.id) ? '#4ADE80' : '#0A0A0A' }}>{concluidas.has(aulaAtual.id) ? '✓ Aula concluída' : 'Marcar como concluída'}</button>
            </div>
            {materiaisAula.length > 0 && <section style={{ borderTop: '1px solid #292929', padding: '20px 2px' }}><h3 style={{ fontSize: '16px', margin: '0 0 12px' }}>Materiais desta aula</h3>{materiaisAula.map(material => <button key={material.id} onClick={() => abrirMaterial(material)} style={{ ...botaoSecundario, display: 'block', width: '100%', textAlign: 'left', marginBottom: '8px', padding: '13px' }}>↗ {material.title}</button>)}</section>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '18px' }}>
              <button disabled={indiceAtual <= 0} onClick={() => escolherAula(aulas[indiceAtual - 1].id)} style={{ ...botaoSecundario, opacity: indiceAtual <= 0 ? .35 : 1 }}>← Aula anterior</button>
              <button disabled={indiceAtual >= aulas.length - 1} onClick={() => escolherAula(aulas[indiceAtual + 1].id)} style={{ ...botaoPrincipal, opacity: indiceAtual >= aulas.length - 1 ? .35 : 1 }}>Próxima aula →</button>
            </div>
          </> : <Estado texto="Nenhuma aula publicada neste curso." />}
        </main>

        <aside style={{ borderLeft: '1px solid #292929', padding: '22px 16px', background: '#101010' }}>
          <div style={{ height: '6px', background: '#262626', borderRadius: 99, overflow: 'hidden', marginBottom: '22px' }}><div style={{ width: `${percentual}%`, height: '100%', background: GRADIENTE }} /></div>
          {modulos.map(modulo => {
            const lista = aulas.filter(aula => aula.module_id === modulo.id)
            const aberto = abertos.has(modulo.id)
            return <div key={modulo.id} style={{ border: '1px solid #292929', borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
              <button onClick={() => setAbertos(atual => { const novo = new Set(atual); novo.has(modulo.id) ? novo.delete(modulo.id) : novo.add(modulo.id); return novo })} style={{ width: '100%', padding: '13px', background: '#171717', color: '#FFF', border: 0, textAlign: 'left', fontWeight: 800, cursor: 'pointer' }}>{aberto ? '▾' : '▸'} {modulo.title} <span style={{ color: '#777', fontWeight: 500 }}>· {lista.length}</span></button>
              {aberto && lista.map((aula, i) => <button key={aula.id} onClick={() => escolherAula(aula.id)} style={{ width: '100%', padding: '12px 13px', border: 0, borderTop: '1px solid #252525', background: aulaAtual?.id === aula.id ? '#211E13' : '#111', color: aulaAtual?.id === aula.id ? OURO : '#BBB', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: '9px' }}><span>{concluidas.has(aula.id) ? '✓' : i + 1}</span><span>{aula.title}</span></button>)}
            </div>
          })}
        </aside>
      </div>
      <style jsx global>{`@media (max-width: 800px){.curso-layout{grid-template-columns:1fr!important}.curso-layout aside{border-left:0!important;border-top:1px solid #292929}.curso-layout main{padding:18px!important}}`}</style>
    </div>
  )
}

const botaoSecundario = { background: '#171717', color: '#DDD', border: '1px solid #333', borderRadius: '9px', padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }
const botaoPrincipal = { background: GRADIENTE, color: '#0A0A0A', border: 0, borderRadius: '9px', padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }

function Estado({ texto, botao }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}><div><p>{texto}</p>{botao && <button onClick={botao} style={botaoPrincipal}>Voltar ao painel</button>}</div></div>
}
