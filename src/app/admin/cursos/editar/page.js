'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

function slugify(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const label = { display: 'block', fontSize: '12px', fontWeight: 700, color: ouro, letterSpacing: '0.04em', textTransform: 'uppercase', margin: '0 0 6px' }
const campo = { width: '100%', boxSizing: 'border-box', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '10px', color: '#FFF', fontSize: '14px', padding: '11px 13px', outline: 'none' }
const grupo = { marginBottom: '18px' }

export default function EditarCurso() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [id, setId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [slugEditado, setSlugEditado] = useState(false)
  const [coverFile, setCoverFile] = useState(null)
  const [form, setForm] = useState({
    slug: '', title: '', subtitle: '', description: '', cover_image_url: '',
    sort_order: 0, is_published: false, comments_enabled: true,
  })

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setAutorizado(false); setCarregando(false); return }
      setAutorizado(true)
      const qid = new URLSearchParams(window.location.search).get('id')
      if (qid) {
        setId(qid)
        const { data, error } = await supabase.from('courses').select('*').eq('id', qid).single()
        if (error) setErro(error.message)
        else if (data) {
          setForm({
            slug: data.slug || '', title: data.title || '', subtitle: data.subtitle || '',
            description: data.description || '', cover_image_url: data.cover_image_url || '',
            sort_order: data.sort_order || 0, is_published: !!data.is_published,
            comments_enabled: data.comments_enabled !== false,
          })
          setSlugEditado(true)
        }
      }
      setCarregando(false)
    }
    init()
  }, [router])

  function set(c, v) { setForm(f => ({ ...f, [c]: v })) }
  function onTitle(v) { set('title', v); if (!slugEditado) set('slug', slugify(v)) }

  async function salvar() {
    setErro('')
    if (!form.title.trim() || !form.slug.trim()) { setErro('Preencha ao menos Título e Endereço (slug).'); return }
    setSalvando(true)
    try {
      let coverUrl = form.cover_image_url || null
      if (coverFile) {
        const safe = coverFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
        const path = `covers/${Date.now()}-${safe}`
        const up = await supabase.storage.from('course-covers').upload(path, coverFile, { upsert: true })
        if (up.error) throw up.error
        const { data: pub } = supabase.storage.from('course-covers').getPublicUrl(path)
        coverUrl = pub.publicUrl
      }
      const payload = {
        slug: form.slug.trim(), title: form.title.trim(),
        subtitle: form.subtitle.trim() || null, description: form.description.trim() || null,
        cover_image_url: coverUrl, sort_order: Number(form.sort_order) || 0,
        is_published: !!form.is_published, comments_enabled: !!form.comments_enabled,
      }
      const res = id
        ? await supabase.from('courses').update(payload).eq('id', id)
        : await supabase.from('courses').insert(payload)
      if (res.error) throw res.error
      router.push('/admin/cursos')
    } catch (e) {
      setErro((e && e.message) ? e.message : 'Erro ao salvar. O endereço (slug) pode já existir.')
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!id) return
    if (!window.confirm('Excluir este curso? Isso remove módulos, aulas e materiais ligados a ele. Não dá pra desfazer.')) return
    setSalvando(true)
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (error) { setErro(error.message); setSalvando(false); return }
    router.push('/admin/cursos')
  }

  if (carregando) {
    return <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#888', fontSize: '15px' }}>Carregando...</p></div>
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
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/admin/cursos')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Cursos</button>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>{id ? 'Editar curso' : 'Novo curso'}</p>
          <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>🎬 {form.title || 'Sem título'}</p>
        </div>
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 18px 80px' }}>
        {erro && <div style={{ background: '#2A1515', border: '1px solid #5A2A2A', color: '#F5A5A5', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', marginBottom: '18px' }}>{erro}</div>}

        <div style={grupo}>
          <label style={label}>Título *</label>
          <input style={campo} value={form.title} onChange={e => onTitle(e.target.value)} placeholder="Ex.: Equipe que Vende Sozinha" />
        </div>

        <div style={grupo}>
          <label style={label}>Endereço / slug *</label>
          <input style={campo} value={form.slug} onChange={e => { setSlugEditado(true); set('slug', slugify(e.target.value)) }} placeholder="equipe-que-vende-sozinha" />
          <p style={{ fontSize: '11px', color: '#666', margin: '6px 0 0' }}>Aparece no endereço do curso. Só letras, números e hífens.</p>
        </div>

        <div style={grupo}>
          <label style={label}>Subtítulo</label>
          <input style={campo} value={form.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="Uma frase curta de apoio" />
        </div>

        <div style={grupo}>
          <label style={label}>Descrição</label>
          <textarea style={{ ...campo, minHeight: '96px', resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Sobre o que é o curso" />
        </div>

        <div style={grupo}>
          <label style={label}>Capa</label>
          {form.cover_image_url && <img src={form.cover_image_url} alt="" style={{ width: '100%', maxWidth: '260px', borderRadius: '10px', border: '1px solid #2A2A2A', marginBottom: '10px', display: 'block' }} />}
          <input type="file" accept="image/jpeg,image/png" onChange={e => setCoverFile(e.target.files?.[0] || null)} style={{ color: '#AAA', fontSize: '13px' }} />
          <p style={{ fontSize: '11px', color: '#666', margin: '6px 0 0' }}>JPG ou PNG, até 5 MB. Envia ao salvar.</p>
        </div>

        <div style={grupo}>
          <label style={label}>Ordem</label>
          <input type="number" style={{ ...campo, maxWidth: '120px' }} value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
          <p style={{ fontSize: '11px', color: '#666', margin: '6px 0 0' }}>Menor número aparece primeiro.</p>
        </div>

        <div onClick={() => set('is_published', !form.is_published)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', marginBottom: '12px' }}>
          <div style={{ width: '44px', height: '26px', borderRadius: '999px', background: form.is_published ? ouroGrad : '#333', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
            <div style={{ position: 'absolute', top: '3px', left: form.is_published ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
          </div>
          <div><p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Publicado</p><p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Visível para as alunas com acesso</p></div>
        </div>

        <div onClick={() => set('comments_enabled', !form.comments_enabled)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', marginBottom: '24px' }}>
          <div style={{ width: '44px', height: '26px', borderRadius: '999px', background: form.comments_enabled ? ouroGrad : '#333', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '3px', left: form.comments_enabled ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff' }} />
          </div>
          <div><p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Comentários</p><p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Permitir comentários nas aulas</p></div>
        </div>

        <button onClick={salvar} disabled={salvando} style={{ width: '100%', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 800, cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.6 : 1 }}>{salvando ? 'Salvando...' : (id ? 'Salvar alterações' : 'Criar curso')}</button>

        {id && (
          <>
            <button onClick={() => router.push(`/admin/cursos/conteudo?id=${id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '15px', margin: '22px 0 14px', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 700, color: '#FFF' }}>📚 Gerenciar módulos e aulas</span>
              <span style={{ color: ouro, fontSize: '18px' }}>→</span>
            </button>
            <button onClick={excluir} disabled={salvando} style={{ width: '100%', background: 'transparent', color: '#E06A6A', border: '1px solid #5A2A2A', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Excluir curso</button>
          </>
        )}
      </main>
    </div>
  )
}
