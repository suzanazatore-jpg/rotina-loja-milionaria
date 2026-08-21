'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AdminCursosShell from '../AdminCursosShell'

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
  const [courseForm, setCourseForm] = useState({ title: '', subtitle: '', description: '', sort_order: 0, is_published: false, cover_image_url: '' })
  const [coverFile, setCoverFile] = useState(null)
  const [lessonTab, setLessonTab] = useState('dados')
  const [lessonCoverFile, setLessonCoverFile] = useState(null)
  const [lessonCoverPreview, setLessonCoverPreview] = useState('')
  const [pendingMaterials, setPendingMaterials] = useState([])
  const [materialEditor, setMaterialEditor] = useState(false)
  const [pendingForm, setPendingForm] = useState({ title: '', mode: 'pdf', link: '', file: null })

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
    const c = await supabase.from('courses').select('*').eq('id', cid).single()
    if (c.error) { setErro(c.error.message); return }
    setCourse(c.data)
    setCourseForm({ title: c.data.title || '', subtitle: c.data.subtitle || '', description: c.data.description || '', sort_order: c.data.sort_order || 0, is_published: !!c.data.is_published, cover_image_url: c.data.cover_image_url || '' })
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
  function novaAula(moduleId) {
    setSlugEditado(false); setLessonTab('dados'); setLessonCoverFile(null); setLessonCoverPreview(''); setPendingMaterials([]); setMaterialEditor(false)
    setLForm({ id: null, module_id: moduleId || '', title: '', slug: '', video_url: '', duration_label: '', description: '', sort_order: lessons.filter(x => (x.module_id || '') === (moduleId || '')).length, is_published: false, thumbnail_url: '' }); setModal('lesson')
  }
  function editarAula(l) {
    setSlugEditado(true); setLessonTab('dados'); setLessonCoverFile(null); setLessonCoverPreview(l.thumbnail_url || ''); setPendingMaterials([]); setMaterialEditor(false)
    setLForm({ id: l.id, module_id: l.module_id || '', title: l.title || '', slug: l.slug || '', video_url: l.video_url || '', duration_label: l.duration_label || '', description: l.description || '', sort_order: l.sort_order || 0, is_published: !!l.is_published, thumbnail_url: l.thumbnail_url || '' }); setModal('lesson')
  }
  function onLTitle(v) { setLForm(f => ({ ...f, title: v, slug: slugEditado ? f.slug : slugify(v) })) }
  async function salvarAula() {
    if (!lForm.title.trim() || !lForm.slug.trim()) { setErro('Aula precisa de título.'); setLessonTab('dados'); return }
    setSalvando(true); setErro('')
    try {
      let thumbnailUrl = lForm.thumbnail_url.trim() || null
      if (lessonCoverFile) {
        if (!['image/jpeg', 'image/png'].includes(lessonCoverFile.type)) throw new Error('A capa precisa ser JPG ou PNG.')
        if (lessonCoverFile.size > 5 * 1024 * 1024) throw new Error('A capa deve ter no máximo 5 MB.')
        const ext = lessonCoverFile.type === 'image/png' ? 'png' : 'jpg'
        const path = `${courseId}/thumbnails/${Date.now()}.${ext}`
        const up = await supabase.storage.from('course-covers').upload(path, lessonCoverFile, { contentType: lessonCoverFile.type, upsert: false })
        if (up.error) throw up.error
        thumbnailUrl = supabase.storage.from('course-covers').getPublicUrl(path).data.publicUrl
      }
      const payload = { course_id: courseId, module_id: lForm.module_id || null, title: lForm.title.trim(), slug: lForm.slug.trim(), video_url: lForm.video_url.trim() || null, duration_label: lForm.duration_label.trim() || null, description: lForm.description.trim() || null, sort_order: Number(lForm.sort_order) || 0, is_published: !!lForm.is_published, thumbnail_url: thumbnailUrl }
      let lessonId = lForm.id
      if (lForm.id) {
        const res = await supabase.from('lessons').update(payload).eq('id', lForm.id)
        if (res.error) throw res.error
      } else {
        const res = await supabase.from('lessons').insert(payload).select('id').single()
        if (res.error) throw res.error
        lessonId = res.data.id
      }
      const falhas = []
      for (const material of pendingMaterials) {
        try { await gravarMaterialDaAula(material, lessonId) } catch { falhas.push(material.title) }
      }
      setModal(null); await carregar(courseId)
      if (falhas.length) setErro(`A aula foi salva, mas não foi possível adicionar: ${falhas.join(', ')}.`)
    } catch (e) { setErro(e?.message || 'Não foi possível salvar a aula.') }
    finally { setSalvando(false) }
  }

  async function gravarMaterialDaAula(material, lessonId) {
    let fileUrl = material.link?.trim() || ''
    if (material.mode === 'pdf') {
      if (!material.file || material.file.type !== 'application/pdf') throw new Error('PDF inválido')
      if (material.file.size > 20 * 1024 * 1024) throw new Error('PDF maior que 20 MB')
      const safe = material.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
      const path = `${courseId}/${lessonId}/${Date.now()}-${safe}`
      const up = await supabase.storage.from('course-materials').upload(path, material.file, { contentType: 'application/pdf', upsert: false })
      if (up.error) throw up.error
      fileUrl = `storage://course-materials/${path}`
    }
    const { error } = await supabase.from('materials').insert({ course_id: courseId, lesson_id: lessonId, title: material.title.trim(), file_url: fileUrl, sort_order: materiaisDaAula(lessonId).length, is_published: true })
    if (error) throw error
  }

  function abrirMaterialDaAula() {
    setPendingForm({ title: '', mode: 'pdf', link: '', file: null })
    setMaterialEditor(true)
  }
  function adicionarMaterialPendente() {
    if (!pendingForm.title.trim()) { setErro('Dê um nome ao material.'); return }
    if (pendingForm.mode === 'pdf' && !pendingForm.file) { setErro('Escolha um PDF.'); return }
    if (pendingForm.mode === 'link' && !/^https?:\/\//i.test(pendingForm.link.trim())) { setErro('Informe um link completo.'); return }
    setErro('')
    setPendingMaterials(p => [...p, { ...pendingForm, id: `${Date.now()}-${p.length}` }])
    setMaterialEditor(false)
  }
  async function excluirAula(l) {
    if (!window.confirm(`Excluir a aula "${l.title}"?`)) return
    const { error } = await supabase.from('lessons').delete().eq('id', l.id)
    if (error) { setErro(error.message); return }
    await carregar(courseId)
  }

  function aulasDo(moduleId) { return lessons.filter(l => (l.module_id || '') === (moduleId || '')) }
  function materiaisDaAula(lessonId) { return lessonId ? materials.filter(m => m.lesson_id === lessonId) : [] }

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

  function editarCurso() {
    setCoverFile(null)
    setCourseForm({ title: course.title || '', subtitle: course.subtitle || '', description: course.description || '', sort_order: course.sort_order || 0, is_published: !!course.is_published, cover_image_url: course.cover_image_url || '' })
    setModal('course')
  }

  async function salvarCurso() {
    if (!courseForm.title.trim()) { setErro('Dê um nome ao curso.'); return }
    setSalvando(true); setErro('')
    try {
      let coverUrl = courseForm.cover_image_url || null
      if (coverFile) {
        if (!['image/jpeg', 'image/png'].includes(coverFile.type)) throw new Error('Escolha uma imagem JPG ou PNG.')
        if (coverFile.size > 5 * 1024 * 1024) throw new Error('A capa deve ter no máximo 5 MB.')
        const safe = coverFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
        const path = `covers/${courseId}-${Date.now()}-${safe}`
        const up = await supabase.storage.from('course-covers').upload(path, coverFile, { contentType: coverFile.type, upsert: false })
        if (up.error) throw up.error
        coverUrl = supabase.storage.from('course-covers').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.from('courses').update({ title: courseForm.title.trim(), subtitle: courseForm.subtitle.trim() || null, description: courseForm.description.trim() || null, sort_order: Number(courseForm.sort_order) || 0, is_published: courseForm.is_published, cover_image_url: coverUrl }).eq('id', courseId)
      if (error) throw error
      setModal(null); await carregar(courseId)
    } catch (e) { setErro(e?.message || 'Não foi possível salvar o curso.') }
    finally { setSalvando(false) }
  }

  async function excluirCurso() {
    if (!window.confirm(`Apagar o curso "${course.title}" e todo o conteúdo ligado a ele?`)) return
    if (window.prompt('Digite APAGAR para confirmar:') !== 'APAGAR') return
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    if (error) { setErro(error.message); return }
    router.push('/admin/cursos')
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
    <AdminCursosShell>
      <style>{conteudoCss}</style>
      <div className="conteudo-crumb">⚙ Administrador › <button onClick={() => router.push('/admin/cursos')}>Cursos</button> › {course?.title}</div>
      <section className="conteudo-hero">
        <div className="conteudo-cover" style={course?.cover_image_url ? { backgroundImage: `url(${course.cover_image_url})` } : {}}>{!course?.cover_image_url && <span>{course?.title}</span>}</div>
        <div className="conteudo-info"><h1>{course?.title}</h1><p>{course?.description || course?.subtitle || 'Curso sem descrição.'}</p></div>
        <div className="conteudo-actions"><button onClick={() => router.push('/painel')}>◉ Visualizar como aluna</button><button onClick={editarCurso}>✎ Editar curso</button><button onClick={excluirCurso}>♲ Apagar</button></div>
      </section>
      <div className="conteudo-title"><h2>Módulos e Aulas</h2><button onClick={novoModulo}>＋ Adicionar módulo</button></div>

      <main>
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
        <div onClick={() => !salvando && setModal(null)} className="conteudo-overlay">
          <div onClick={e => e.stopPropagation()} className={`conteudo-modal ${modal === 'module' ? 'pequeno' : ''}`}>
            <button className="conteudo-fechar" onClick={() => !salvando && setModal(null)}>×</button>

            {modal === 'module' && (
              <>
                <h2>{mForm.id ? 'Editar módulo' : 'Novo módulo'}</h2>
                <p className="conteudo-sub">Módulos ajudam a organizar as aulas do curso.</p>
                <div style={grupo}><label style={label}>Nome do módulo *</label><input autoFocus style={campo} value={mForm.title} onChange={e => setMForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex.: Módulo 1 — Comece por aqui" /></div>
                <div className="conteudo-modal-footer"><button className="secundario" onClick={() => setModal(null)}>Cancelar</button><button onClick={salvarModulo} disabled={salvando}>{salvando ? 'Salvando...' : mForm.id ? 'Salvar' : 'Criar módulo'}</button></div>
              </>
            )}

            {modal === 'lesson' && (
              <>
                <h2>{lForm.id ? 'Editar aula' : 'Nova aula'}</h2>
                <p className="conteudo-sub">Preencha os dados e o vídeo da aula.</p>
                <div className="lesson-tabs">
                  {[['dados', '1', 'Dados'], ['video', '2', 'Vídeo'], ['materiais', '3', 'Materiais']].map(t => <button key={t[0]} className={lessonTab === t[0] ? 'on' : ''} onClick={() => setLessonTab(t[0])}><i>{t[1]}</i>{t[2]}</button>)}
                </div>

                {lessonTab === 'dados' && <div className="lesson-tab-body">
                  <div style={grupo}><label style={label}>Nome da aula *</label><input autoFocus style={campo} value={lForm.title} onChange={e => onLTitle(e.target.value)} placeholder="Ex.: Aula 01 — Preparando o estoque" /></div>
                  <div className="lesson-two">
                    <div style={grupo}><label style={label}>Duração <small>opcional</small></label><input style={campo} value={lForm.duration_label} onChange={e => setLForm(f => ({ ...f, duration_label: e.target.value }))} placeholder="Ex.: 15 min" /></div>
                    <div style={grupo}><label style={label}>Capa da aula <small>opcional</small></label><div className="lesson-cover">{lessonCoverPreview ? <img src={lessonCoverPreview} alt="" /> : <span>🖼️</span>}<label>Escolher<input hidden type="file" accept="image/jpeg,image/png" onChange={e => { const file = e.target.files?.[0] || null; setLessonCoverFile(file); if (file) setLessonCoverPreview(URL.createObjectURL(file)) }} /></label></div></div>
                  </div>
                  <div style={grupo}><label style={label}>Descrição <small>opcional</small></label><textarea style={{ ...campo, minHeight: 78, resize: 'vertical' }} value={lForm.description} onChange={e => setLForm(f => ({ ...f, description: e.target.value }))} placeholder="Escreva um resumo do que a aluna vai aprender..." /></div>
                  <button className="lesson-publish" onClick={() => setLForm(f => ({ ...f, is_published: !f.is_published }))}><span><b>Publicar aula</b><small>Se desligado, fica como rascunho e a aluna não vê.</small></span><i className={lForm.is_published ? 'on' : ''}><u /></i></button>
                </div>}

                {lessonTab === 'video' && <div className="lesson-tab-body">
                  <div style={grupo}><label style={label}>Link do vídeo <small>opcional — dá pra adicionar depois</small></label><input style={campo} value={lForm.video_url} onChange={e => setLForm(f => ({ ...f, video_url: e.target.value }))} placeholder="Cole aqui a URL do vídeo" /><p className="lesson-hint">Funciona com YouTube, Vimeo, PandaVideo, Bunny e players incorporados.</p></div>
                </div>}

                {lessonTab === 'materiais' && <div className="lesson-tab-body">
                  <label style={label}>Materiais de apoio <small>PDF ou link — sobem junto quando você cadastrar a aula</small></label>
                  {!pendingMaterials.length && !materiaisDaAula(lForm.id).length && <p className="lesson-empty">Nenhum material ainda. Adicione PDFs ou links — eles sobem junto quando você salvar a aula.</p>}
                  {materiaisDaAula(lForm.id).map(m => <div className="lesson-material" key={m.id}><span>📎 {m.title}</span><button onClick={() => excluirMaterial(m)}>Excluir</button></div>)}
                  {pendingMaterials.map(m => <div className="lesson-material" key={m.id}><span>📎 {m.title} <small>aguardando</small></span><button onClick={() => setPendingMaterials(p => p.filter(x => x.id !== m.id))}>Remover</button></div>)}
                  <button className="lesson-add-material" onClick={abrirMaterialDaAula}>↥ Adicionar material de apoio</button>
                </div>}

                <div className="lesson-footer"><button className="cancelar" onClick={() => setModal(null)}>Cancelar</button><button onClick={salvarAula} disabled={salvando}>{salvando ? 'Salvando...' : lForm.id ? 'Salvar aula' : 'Cadastrar aula'}</button></div>

                {materialEditor && <div className="lesson-material-overlay"><div className="lesson-material-modal">
                  <button className="lesson-material-close" onClick={() => setMaterialEditor(false)}>×</button>
                  <h2>Adicionar material</h2><p className="conteudo-sub">Material de apoio da aula, para download.</p>
                  <div style={grupo}><label style={label}>Nome do material *</label><input style={campo} value={pendingForm.title} onChange={e => setPendingForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex.: Checklist — Zerando o Estoque" /></div>
                  <label style={label}>Como você quer adicionar?</label>
                  <div className="lesson-material-modes"><button className={pendingForm.mode === 'pdf' ? 'on' : ''} onClick={() => setPendingForm(f => ({ ...f, mode: 'pdf' }))}>Subir PDF do computador</button><button className={pendingForm.mode === 'link' ? 'on' : ''} onClick={() => setPendingForm(f => ({ ...f, mode: 'link' }))}>Usar um link</button></div>
                  {pendingForm.mode === 'pdf' ? <label className="lesson-drop">⬆️<b>{pendingForm.file?.name || 'Arraste o PDF aqui'}</b><small>ou clique para escolher — só PDF, até 20 MB</small><input hidden type="file" accept="application/pdf,.pdf" onChange={e => setPendingForm(f => ({ ...f, file: e.target.files?.[0] || null }))} /></label> : <div style={grupo}><label style={label}>Link do material *</label><input style={campo} value={pendingForm.link} onChange={e => setPendingForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." /></div>}
                  <div className="lesson-footer"><button className="cancelar" onClick={() => setMaterialEditor(false)}>Cancelar</button><button onClick={adicionarMaterialPendente}>Adicionar material</button></div>
                </div></div>}
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

            {modal === 'course' && (
              <>
                <h2>Editar curso</h2><p className="conteudo-sub">Atualize as informações do curso. A capa tem botão próprio.</p>
                <div style={grupo}><label style={label}>Nome do curso *</label><input style={campo} value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div style={grupo}><label style={label}>Subtítulo <small>opcional</small></label><input style={campo} value={courseForm.subtitle} onChange={e => setCourseForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="Uma frase curta que aparece abaixo do nome" /></div>
                <div style={grupo}><label style={label}>Descrição <small>opcional</small></label><textarea style={{ ...campo, minHeight: 78 }} value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))} placeholder="Sobre o que é este curso..." /></div>
                <div style={grupo}><label style={label}>Capa do curso <small>JPG ou PNG, até 5 MB</small></label><div className="conteudo-capa-input">{courseForm.cover_image_url ? <img src={courseForm.cover_image_url} alt="" /> : <span>Sem capa</span>}<label className="escolher">Escolher imagem<input hidden type="file" accept="image/jpeg,image/png" onChange={e => setCoverFile(e.target.files?.[0] || null)} /></label></div></div>
                <div className="conteudo-duas"><div><label style={label}>Ordem de exibição</label><input type="number" style={campo} value={courseForm.sort_order} onChange={e => setCourseForm(f => ({ ...f, sort_order: e.target.value }))} /></div><button className="conteudo-publicacao" onClick={() => setCourseForm(f => ({ ...f, is_published: !f.is_published }))}><span><b>Publicação</b><small>{courseForm.is_published ? 'Publicado' : 'Oculto'}</small></span><i className={courseForm.is_published ? 'on' : ''}><u /></i></button></div>
                <div className="conteudo-modal-footer"><button className="secundario" onClick={() => setModal(null)}>Cancelar</button><button onClick={salvarCurso} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button></div>
              </>
            )}

            {modal !== 'module' && modal !== 'course' && modal !== 'lesson' && <button onClick={() => !salvando && setModal(null)} style={{ width: '100%', background: 'transparent', border: 'none', color: '#888', padding: '12px', fontSize: '13px', marginTop: '8px', cursor: 'pointer' }}>Cancelar</button>}
          </div>
        </div>
      )}
    </AdminCursosShell>
  )
}

const botaoTexto = { background: 'transparent', border: 'none', color: '#D4AF37', fontSize: '12px', cursor: 'pointer', padding: '3px' }
const botaoIcone = { width: 25, height: 25, background: '#191919', color: '#AAA', border: '1px solid #2A2A2A', borderRadius: 6, cursor: 'pointer' }
const botaoOpcao = { flex: 1, background: '#111', border: '1px solid #333', borderRadius: 9, padding: '10px', fontWeight: 700, cursor: 'pointer' }
const conteudoCss = `
.conteudo-crumb{color:#777;font-size:11px;margin-bottom:16px}.conteudo-crumb button{background:none;border:0;color:#a58e3d;text-decoration:underline;cursor:pointer}
.conteudo-hero{display:flex;gap:17px;background:#171414;border:1px solid #302c2a;border-radius:13px;padding:16px;margin-bottom:28px;min-height:140px}.conteudo-cover{width:138px;height:92px;border-radius:9px;background:linear-gradient(135deg,#31270c,#0d0b07);background-size:cover;background-position:center;display:grid;place-items:center;padding:10px;flex:none}.conteudo-cover span{color:#e5ca66;text-align:center;text-transform:uppercase;font-size:10px;font-weight:900}.conteudo-info{flex:1}.conteudo-info h1{font-size:18px;margin:0 0 6px}.conteudo-info p{font-size:12px;color:#777;margin:0;line-height:1.5}.conteudo-actions{width:164px;display:flex;flex-direction:column;gap:7px}.conteudo-actions button{background:#151313;border:1px solid #302c2a;color:#fff;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:800;text-align:left;cursor:pointer}
.conteudo-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.conteudo-title h2{font-size:16px;margin:0}.conteudo-title button,.conteudo-modal-footer>button:not(.secundario){background:linear-gradient(135deg,#D4AF37,#F5D76E);border:0;color:#090909;border-radius:9px;padding:10px 15px;font-weight:900;cursor:pointer}
.adm-cursos-content>main{max-width:none;margin:0;padding:0 0 20px}.adm-cursos-content>main>div{border-radius:10px!important}.adm-cursos-content>main>div>div:first-child{margin-bottom:8px!important}
.conteudo-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(5px);display:grid;place-items:center;padding:16px;z-index:100}.conteudo-modal{position:relative;width:min(540px,100%);max-height:90vh;overflow:auto;background:#161618;border:1px solid #343439;border-radius:18px;padding:21px 21px 18px;box-shadow:0 26px 85px #000}.conteudo-modal.pequeno{width:min(450px,100%)}.conteudo-modal h2{font-size:18px;margin:0 0 3px}.conteudo-sub{color:#777;font-size:12px;margin:0 0 22px}.conteudo-fechar{position:absolute;right:20px;top:20px;width:30px;height:30px;border:1px solid #3c3c42;background:#202024;color:#888;border-radius:8px;font-size:19px;cursor:pointer}.conteudo-modal label small{color:#777;text-transform:none;font-weight:400;margin-left:4px}.conteudo-modal-footer{display:flex;justify-content:flex-end;gap:9px;border-top:1px solid #2c2c30;margin:20px -21px -18px;padding:14px 21px 18px}.conteudo-modal-footer .secundario{background:#202024;border:1px solid #44444a;color:#fff;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer}
.conteudo-capa-input{display:flex;align-items:center;gap:12px;background:#252529;border-radius:10px;padding:8px 10px}.conteudo-capa-input img{width:84px;height:46px;object-fit:cover;border-radius:7px}.conteudo-capa-input span{color:#777;font-size:12px}.conteudo-capa-input .escolher{margin:0 0 0 auto;border:1px solid #49494f;border-radius:8px;padding:9px 12px;cursor:pointer;text-transform:none;color:#fff}.conteudo-duas{display:grid;grid-template-columns:1fr 1fr;gap:12px}.conteudo-publicacao{display:flex;align-items:center;justify-content:space-between;background:#252529;border:0;border-radius:10px;color:#fff;padding:10px 12px;text-align:left;cursor:pointer}.conteudo-publicacao span{display:flex;flex-direction:column}.conteudo-publicacao small{color:#777}.conteudo-publicacao i{width:42px;height:24px;border-radius:20px;background:#3b3b40;position:relative}.conteudo-publicacao i u{position:absolute;width:18px;height:18px;top:3px;left:3px;background:#fff;border-radius:50%;transition:.2s}.conteudo-publicacao i.on{background:#D4AF37}.conteudo-publicacao i.on u{left:21px}
.lesson-tabs{display:flex;gap:20px;border-bottom:1px solid #2d2d31;margin:13px -21px 0;padding:0 21px}.lesson-tabs button{position:relative;background:none;border:0;color:#777;padding:11px 3px 13px;font-size:12px;font-weight:800;cursor:pointer}.lesson-tabs button i{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#29292e;font-style:normal;font-size:10px;margin-right:6px}.lesson-tabs button.on{color:#D4AF37}.lesson-tabs button.on i{background:#D4AF37;color:#080808}.lesson-tabs button.on:after{content:'';position:absolute;height:2px;background:#D4AF37;left:0;right:0;bottom:-1px}.lesson-tab-body{padding:18px 0 2px}.lesson-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.lesson-cover{height:48px;background:#252529;border-radius:10px;padding:6px 9px;display:flex;align-items:center;gap:8px}.lesson-cover img{width:52px;height:36px;object-fit:cover;border-radius:6px}.lesson-cover span{font-size:18px}.lesson-cover label{margin:0 0 0 auto;color:#D4AF37;font-size:11px;cursor:pointer;text-transform:none}.lesson-publish{width:100%;display:flex;align-items:center;justify-content:space-between;background:#252529;border:0;border-radius:10px;color:#fff;padding:11px 13px;text-align:left;cursor:pointer}.lesson-publish span{display:flex;flex-direction:column}.lesson-publish small{font-size:10px;color:#777}.lesson-publish i{width:42px;height:24px;background:#3b3b40;border-radius:20px;position:relative}.lesson-publish i u{position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;left:3px;top:3px}.lesson-publish i.on{background:#D4AF37}.lesson-publish i.on u{left:21px}.lesson-hint,.lesson-empty{color:#777;font-size:10px;margin:7px 0}.lesson-material{display:flex;justify-content:space-between;gap:8px;border:1px solid #2e2e32;background:#222226;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:11px}.lesson-material small{color:#777}.lesson-material button,.lesson-add-material{background:none;border:0;color:#D4AF37;font-size:11px;font-weight:800;cursor:pointer}.lesson-add-material{padding:10px 0}.lesson-footer{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #2d2d31;margin:17px -21px -18px;padding:14px 21px 18px}.lesson-footer button{background:linear-gradient(135deg,#D4AF37,#F5D76E);border:0;color:#080808;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer}.lesson-footer .cancelar{background:transparent;color:#aaa}
.lesson-material-overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:15px;z-index:130}.lesson-material-modal{position:relative;width:min(450px,100%);background:#171719;border:1px solid #37373d;border-radius:17px;padding:20px}.lesson-material-close{position:absolute;right:18px;top:17px;background:none;border:0;color:#D4AF37;font-size:19px;cursor:pointer}.lesson-material-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 14px}.lesson-material-modes button{background:#252529;border:1px solid transparent;color:#888;border-radius:9px;padding:9px;font-size:11px;font-weight:800;cursor:pointer}.lesson-material-modes button.on{border-color:#D4AF37;color:#D4AF37}.lesson-drop{min-height:108px;border:1px dashed #555;background:#252529;border-radius:11px;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;text-transform:none!important}.lesson-drop b{font-size:12px}.lesson-drop small{font-size:10px;color:#777}
@media(max-width:700px){.conteudo-hero{flex-wrap:wrap}.conteudo-cover{width:100%;height:145px}.conteudo-actions{width:100%;flex-direction:row}.conteudo-actions button{flex:1;text-align:center}.conteudo-duas{grid-template-columns:1fr}}
`
