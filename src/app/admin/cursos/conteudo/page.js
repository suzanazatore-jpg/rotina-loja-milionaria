'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

function slugify(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const label = { display: 'block', fontSize: '12px', fontWeight: 700, color: ouro, letterSpacing: '0.04em', textTransform: 'uppercase', margin: '0 0 6px' }
const campo = { width: '100%', boxSizing: 'border-box', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '10px', color: '#FFF', fontSize: '14px', padding: '11px 13px', outline: 'none' }
const grupo = { marginBottom: '14px' }

export default function ConteudoCurso() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [erro, setErro] = useState('')
  const [courseId, setCourseId] = useState(null)
  const [course, setCourse] = useState(null)
  const [modules, setModules] = useState([])
  const [lessons, setLessons] = useState([])
  const [materials, setMaterials] = useState([])

  const [modal, setModal] = useState(null) // 'module' | 'lesson' | 'material'
  const [salvando, setSalvando] = useState(false)
  const [slugEditado, setSlugEditado] = useState(false)
  const [mForm, setMForm] = useState({ id: null, title: '', description: '', sort_order: 0, is_published: true })
  const [lForm, setLForm] = useState({ id: null, module_id: '', title: '', slug: '', video_url: '', duration_label: '', description: '', sort_order: 0, is_published: false, thumbnail_url: '' })
  const [matForm, setMatForm] = useState({ lesson_id: '', title: '', mode: 'pdf', link: '', file: null })

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setAutorizado(false); setCarregando(false); return }
      setAutorizado(true)
      const qid = new URLSearchParams(window.location.search).get('id')
      if (!qid) { setErro('Curso não informado.'); setCarregando(false); return }
      setCourseId(qid)
      await carregar(qid)
      setCarregando(false)
    }
    init()
  }, [router])

  async function carregar(cid) {
    const c = await supabase.from('courses').select('id, title, slug').eq('id', cid).single()
    if (c.error) { setErro(c.error.message); return }
    setCourse(c.data)
    const m = await supabase.from('modules').select('*').eq('course_id', cid).order('sort_order').order('created_at')
    setModules(m.data || [])
    const l = await supabase.from('lessons').select('*').eq('course_id', cid).order('sort_order').order('created_at')
    setLessons(l.data || [])
    const mt = await supabase.from('materials').select('*').eq('course_id', cid).order('sort_order').order('created_at')
    setMaterials(mt.data || [])
  }

  // ---------- Módulos ----------
  function novoModulo() { setMForm({ id: null, title: '', description: '', sort_order: modules.length, is_published: true }); setModal('module') }
  function editarModulo(m) { setMForm({ id: m.id, title: m.title || '', description: m.description || '', sort_order: m.sort_order || 0, is_published: !!m.is_published }); setModal('module') }
  async function salvarModulo() {
    if (!mForm.title.trim()) { setErro('Dê um título ao módulo.'); return }
    setSalvando(true); setErro('')
    const payload = { course_id: courseId, title: mForm.title.trim(), description: mForm.description.trim() || null, sort_order: Number(mForm.sort_order) || 0, is_published: !!mForm.is_published }
    const res = mForm.id ? await supabase.from('modules').update(payload).eq('id', mForm.id) : await supabase.from('modules').insert(payload)
    setSalvando(false)
    if (res.error) { setErro(res.error.message); return }
    setModal(null); await carregar(courseId)
  }
  async function excluirModulo(m) {
    if (!window.confirm(`Excluir o módulo "${m.title}"? As aulas dele não são apagadas — ficam como "sem módulo".`)) return
    const { error } = await supabase.from('modules').delete().eq('id', m.id)
    if (error) { setErro(error.message); return }
    await carregar(courseId)
  }

  // ---------- Aulas ----------
  function novaAula(moduleId) { setSlugEditado(false); setLForm({ id: null, module_id: moduleId || '', title: '', slug: '', video_url: '', duration_label: '', description: '', sort_order: lessons.filter(x => (x.module_id || '') === (moduleId || '')).length, is_published: false, thumbnail_url: '' }); setModal('lesson') }
  function editarAula(l) { setSlugEditado(true); setLForm({ id: l.id, module_id: l.module_id || '', title: l.title || '', slug: l.slug || '', video_url: l.video_url || '', duration_label: l.duration_label || '', description: l.description || '', sort_order: l.sort_order || 0, is_published: !!l.is_published, thumbnail_url: l.thumbnail_url || '' }); setModal('lesson') }
  function onLTitle(v) { setLForm(f => ({ ...f, title: v, slug: slugEditado ? f.slug : slugify(v) })) }
  async function salvarAula() {
    if (!lForm.title.trim() || !lForm.slug.trim()) { setErro('Aula precisa de título e slug.'); return }
    setSalvando(true); setErro('')
    const payload = { course_id: courseId, module_id: lForm.module_id || null, title: lForm.title.trim(), slug: lForm.slug.trim(), video_url: lForm.video_url.trim() || null, duration_label: lForm.duration_label.trim() || null, description: lForm.description.trim() || null, sort_order: Number(lForm.sort_order) || 0, is_published: !!lForm.is_published, thumbnail_url: lForm.thumbnail_url.trim() || null }
    const res = lForm.id ? await supabase.from('lessons').update(payload).eq('id', lForm.id) : await supabase.from('lessons').insert(payload)
    setSalvando(false)
    if (res.error) { setErro(res.error.message); return }
    setModal(null); await carregar(courseId)
  }
  async function excluirAula(l) {
    if (!window.confirm(`Excluir a aula "${l.title}"?`)) return
    const { error } = await supabase.from('lessons').delete().eq('id', l.id)
    if (error) { setErro(error.message); return }
    await carregar(courseId)
  }

  function aulasDo(moduleId) { return lessons.filter(l => (l.module_id || '') === (moduleId || '')) }
  function materiaisDaAula(lessonId) { return materials.filter(m => m.lesson_id === lessonId) }

  async function moverAula(aula, direcao) {
    const lista = aulasDo(aula.module_id || '')
    const indice = lista.findIndex(item => item.id === aula.id)
    const destino = indice + direcao
    if (destino < 0 || destino >= lista.length) return
    setErro('')
    const outra = lista[destino]
    const ordemAtual = Number(aula.sort_order) || indice
    const ordemOutra = Number(outra.sort_order) || destino
    const [r1, r2] = await Promise.all([
      supabase.from('lessons').update({ sort_order: ordemOutra }).eq('id', aula.id),
      supabase.from('lessons').update({ sort_order: ordemAtual }).eq('id', outra.id),
    ])
    if (r1.error || r2.error) { setErro(r1.error?.message || r2.error?.message); return }
    await carregar(courseId)
  }

  function novoMaterial(lessonId = '') {
    setMatForm({ lesson_id: lessonId, title: '', mode: 'pdf', link: '', file: null })
    setModal('material')
  }

  async function salvarMaterial() {
    if (!matForm.title.trim()) { setErro('Dê um nome ao material.'); return }
    if (matForm.mode === 'pdf' && !matForm.file) { setErro('Escolha um arquivo PDF.'); return }
    if (matForm.mode === 'link' && !/^https?:\/\//i.test(matForm.link.trim())) { setErro('Informe um link completo, começando com http.'); return }
    setSalvando(true); setErro('')
    try {
      let fileUrl = matForm.link.trim()
      if (matForm.mode === 'pdf') {
        if (matForm.file.type !== 'application/pdf') throw new Error('O arquivo precisa ser PDF.')
        if (matForm.file.size > 20 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 20 MB.')
        const seguro = matForm.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
        const path = `${courseId}/${matForm.lesson_id || 'extras'}/${Date.now()}-${seguro}`
        const up = await supabase.storage.from('course-materials').upload(path, matForm.file, { contentType: 'application/pdf', upsert: false })
        if (up.error) throw up.error
        fileUrl = `storage://course-materials/${path}`
      }
      const { error } = await supabase.from('materials').insert({
        course_id: courseId, lesson_id: matForm.lesson_id || null, title: matForm.title.trim(),
        file_url: fileUrl, sort_order: materials.filter(m => (m.lesson_id || '') === (matForm.lesson_id || '')).length,
        is_published: true,
      })
      if (error) throw error
      setModal(null)
      await carregar(courseId)
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar o material.')
    } finally { setSalvando(false) }
  }

  async function excluirMaterial(material) {
    if (!window.confirm(`Excluir o material "${material.title}"?`)) return
    if (material.file_url?.startsWith('storage://course-materials/')) {
      const path = material.file_url.replace('storage://course-materials/', '')
      const removido = await supabase.storage.from('course-materials').remove([path])
      if (removido.error) { setErro(removido.error.message); return }
    }
    const { error } = await supabase.from('materials').delete().eq('id', material.id)
    if (error) { setErro(error.message); return }
    await carregar(courseId)
  }

  if (carregando) return <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#888' }}>Carregando...</p></div>

  if (!autorizado) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: '44px', marginBottom: '14px' }}>🔒</div>
      <h1 style={{ color: '#FFF', fontSize: '20px', margin: '0 0 8px' }}>Acesso restrito</h1>
      <button onClick={() => router.push('/painel')} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>Voltar ao painel</button>
    </div>
  )

  const semModulo = aulasDo('')
  const extras = materials.filter(m => !m.lesson_id)

  function renderAula(l, lista) {
    const indice = lista.findIndex(item => item.id === l.id)
    const totalMateriais = materiaisDaAula(l.id).length
    return (
      <div key={l.id} style={{ background: '#0F0F0F', border: '1px solid #222', borderRadius: '10px', padding: '9px 10px', marginBottom: '7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🎬 {l.title} {!l.is_published && <span style={{ color: '#777' }}>• rascunho</span>}</span>
          <button onClick={() => moverAula(l, -1)} disabled={indice === 0} title="Subir" style={botaoIcone}>↑</button>
          <button onClick={() => moverAula(l, 1)} disabled={indice === lista.length - 1} title="Descer" style={botaoIcone}>↓</button>
          <button onClick={() => editarAula(l)} style={botaoTexto}>editar</button>
          <button onClick={() => excluirAula(l)} style={{ ...botaoTexto, color: '#E06A6A' }}>excluir</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #202020' }}>
          <span style={{ flex: 1, color: '#777', fontSize: 11 }}>{totalMateriais} material(is)</span>
          <button onClick={() => novoMaterial(l.id)} style={{ ...botaoTexto, color: ouro }}>＋ Material</button>
          {materiaisDaAula(l.id).map(m => <button key={m.id} onClick={() => excluirMaterial(m)} title={m.title} style={{ ...botaoTexto, color: '#999' }}>📎 {m.title.length > 18 ? `${m.title.slice(0, 18)}…` : m.title} ×</button>)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <button onClick={() => router.push(`/admin/cursos/editar?id=${courseId}`)} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>← Curso</button>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Conteúdo</p>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{course?.title}</p>
          </div>
        </div>
        <button onClick={novoModulo} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Módulo</button>
      </header>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '22px 16px 70px' }}>
        {erro && <div style={{ background: '#2A1515', border: '1px solid #5A2A2A', color: '#F5A5A5', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>{erro}</div>}

        {modules.length === 0 && semModulo.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#888' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>📚</div>
            <p style={{ color: '#FFF', margin: '0 0 4px' }}>Sem conteúdo ainda</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Comece criando um módulo (botão acima).</p>
          </div>
        )}

        {modules.map(m => (
          <div key={m.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{m.title} {!m.is_published && <span style={{ fontSize: '11px', color: '#777' }}>• rascunho</span>}</p>
                {m.description && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888' }}>{m.description}</p>}
              </div>
              <button onClick={() => editarModulo(m)} style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#DDD', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>Editar</button>
              <button onClick={() => excluirModulo(m)} style={{ background: 'transparent', border: '1px solid #5A2A2A', color: '#E06A6A', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>Excluir</button>
            </div>
            {aulasDo(m.id).map(l => renderAula(l, aulasDo(m.id)))}
            <button onClick={() => novaAula(m.id)} style={{ background: 'transparent', border: '1px dashed #333', color: ouro, borderRadius: '9px', padding: '8px', fontSize: '13px', width: '100%', cursor: 'pointer', marginTop: '4px' }}>＋ Nova aula neste módulo</button>
          </div>
        ))}

        {semModulo.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '14px', marginBottom: '14px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#888' }}>Aulas sem módulo</p>
            {semModulo.map(l => renderAula(l, semModulo))}
          </div>
        )}

        <button onClick={() => novaAula('')} style={{ background: 'transparent', border: '1px dashed #333', color: '#AAA', borderRadius: '10px', padding: '11px', fontSize: '13px', width: '100%', cursor: 'pointer' }}>＋ Aula avulsa (sem módulo)</button>

        <section style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div><h2 style={{ margin: 0, fontSize: 17 }}>Material extra do curso</h2><p style={{ margin: '3px 0 0', color: '#777', fontSize: 12 }}>PDFs e links que não pertencem a uma aula específica.</p></div>
            <button onClick={() => novoMaterial('')} style={{ background: 'transparent', border: `1px solid ${ouro}`, color: ouro, borderRadius: 8, padding: '8px 11px', fontWeight: 700, cursor: 'pointer' }}>＋ Material</button>
          </div>
          <div style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: 12, padding: 12 }}>
            {!extras.length && <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Nenhum material extra cadastrado.</p>}
            {extras.map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid #222' }}><span style={{ flex: 1, fontSize: 13 }}>📎 {m.title}</span><span style={{ color: '#666', fontSize: 11 }}>{m.file_url?.startsWith('storage://') ? 'PDF' : 'Link'}</span><button onClick={() => excluirMaterial(m)} style={{ ...botaoTexto, color: '#E06A6A' }}>excluir</button></div>)}
          </div>
        </section>
      </main>

      {/* ---------- Modal ---------- */}
      {modal && (
        <div onClick={() => !salvando && setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#141414', border: '1px solid #2A2A2A', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '20px 18px 26px' }}>
            <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#333', margin: '0 auto 16px' }} />

            {modal === 'module' && (
              <>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 16px' }}>{mForm.id ? 'Editar módulo' : 'Novo módulo'}</h2>
                <div style={grupo}><label style={label}>Título *</label><input style={campo} value={mForm.title} onChange={e => setMForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div style={grupo}><label style={label}>Descrição</label><textarea style={{ ...campo, minHeight: '70px', resize: 'vertical' }} value={mForm.description} onChange={e => setMForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div style={grupo}><label style={label}>Ordem</label><input type="number" style={{ ...campo, maxWidth: '120px' }} value={mForm.sort_order} onChange={e => setMForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
                <div onClick={() => setMForm(f => ({ ...f, is_published: !f.is_published }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: '4px 0 20px' }}>
                  <div style={{ width: '44px', height: '26px', borderRadius: '999px', background: mForm.is_published ? ouroGrad : '#333', position: 'relative', flexShrink: 0 }}><div style={{ position: 'absolute', top: '3px', left: mForm.is_published ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff' }} /></div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Publicado</span>
                </div>
                <button onClick={salvarModulo} disabled={salvando} style={{ width: '100%', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando...' : 'Salvar módulo'}</button>
              </>
            )}

            {modal === 'lesson' && (
              <>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 16px' }}>{lForm.id ? 'Editar aula' : 'Nova aula'}</h2>
                <div style={grupo}><label style={label}>Título *</label><input style={campo} value={lForm.title} onChange={e => onLTitle(e.target.value)} /></div>
                <div style={grupo}><label style={label}>Slug *</label><input style={campo} value={lForm.slug} onChange={e => { setSlugEditado(true); setLForm(f => ({ ...f, slug: slugify(e.target.value) })) }} /></div>
                <div style={grupo}><label style={label}>Módulo</label>
                  <select style={campo} value={lForm.module_id} onChange={e => setLForm(f => ({ ...f, module_id: e.target.value }))}>
                    <option value="">— Sem módulo —</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
                <div style={grupo}><label style={label}>Link do vídeo</label><input style={campo} value={lForm.video_url} onChange={e => setLForm(f => ({ ...f, video_url: e.target.value }))} placeholder="URL do vídeo (YouTube, Vimeo, etc.)" /></div>
                <div style={grupo}><label style={label}>Duração</label><input style={{ ...campo, maxWidth: '160px' }} value={lForm.duration_label} onChange={e => setLForm(f => ({ ...f, duration_label: e.target.value }))} placeholder="ex.: 12 min" /></div>
                <div style={grupo}><label style={label}>Descrição</label><textarea style={{ ...campo, minHeight: '70px', resize: 'vertical' }} value={lForm.description} onChange={e => setLForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div style={grupo}><label style={label}>Thumbnail (link)</label><input style={campo} value={lForm.thumbnail_url} onChange={e => setLForm(f => ({ ...f, thumbnail_url: e.target.value }))} placeholder="URL de uma imagem (opcional)" /></div>
                <div style={grupo}><label style={label}>Ordem</label><input type="number" style={{ ...campo, maxWidth: '120px' }} value={lForm.sort_order} onChange={e => setLForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
                <div onClick={() => setLForm(f => ({ ...f, is_published: !f.is_published }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: '4px 0 20px' }}>
                  <div style={{ width: '44px', height: '26px', borderRadius: '999px', background: lForm.is_published ? ouroGrad : '#333', position: 'relative', flexShrink: 0 }}><div style={{ position: 'absolute', top: '3px', left: lForm.is_published ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff' }} /></div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Publicada</span>
                </div>
                <button onClick={salvarAula} disabled={salvando} style={{ width: '100%', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando...' : 'Salvar aula'}</button>
              </>
            )}

            {modal === 'material' && (
              <>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 5px' }}>Novo material</h2>
                <p style={{ color: '#777', fontSize: 12, margin: '0 0 16px' }}>{matForm.lesson_id ? 'Vinculado à aula selecionada.' : 'Material extra do curso.'}</p>
                <div style={grupo}><label style={label}>Nome *</label><input style={campo} value={matForm.title} onChange={e => setMatForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex.: Checklist da aula" /></div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setMatForm(f => ({ ...f, mode: 'pdf' }))} style={{ ...botaoOpcao, borderColor: matForm.mode === 'pdf' ? ouro : '#333', color: matForm.mode === 'pdf' ? ouro : '#888' }}>PDF</button>
                  <button onClick={() => setMatForm(f => ({ ...f, mode: 'link' }))} style={{ ...botaoOpcao, borderColor: matForm.mode === 'link' ? ouro : '#333', color: matForm.mode === 'link' ? ouro : '#888' }}>Link externo</button>
                </div>
                {matForm.mode === 'pdf' ? <div style={grupo}><label style={label}>Arquivo PDF *</label><input type="file" accept="application/pdf,.pdf" onChange={e => setMatForm(f => ({ ...f, file: e.target.files?.[0] || null }))} style={{ color: '#AAA', fontSize: 13 }} /><p style={{ color: '#666', fontSize: 11 }}>Máximo de 20 MB.</p></div> : <div style={grupo}><label style={label}>Endereço do link *</label><input style={campo} value={matForm.link} onChange={e => setMatForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." /></div>}
                <button onClick={salvarMaterial} disabled={salvando} style={{ width: '100%', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando...' : 'Salvar material'}</button>
              </>
            )}

            <button onClick={() => !salvando && setModal(null)} style={{ width: '100%', background: 'transparent', border: 'none', color: '#888', padding: '12px', fontSize: '13px', marginTop: '8px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const botaoTexto = { background: 'transparent', border: 'none', color: '#D4AF37', fontSize: '12px', cursor: 'pointer', padding: '3px' }
const botaoIcone = { width: 25, height: 25, background: '#191919', color: '#AAA', border: '1px solid #2A2A2A', borderRadius: 6, cursor: 'pointer' }
const botaoOpcao = { flex: 1, background: '#111', border: '1px solid #333', borderRadius: 9, padding: '10px', fontWeight: 700, cursor: 'pointer' }
