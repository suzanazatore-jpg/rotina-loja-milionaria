'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminCursosShell from './AdminCursosShell'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg,#D4AF37,#F5D76E)'

function slugify(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }

export default function AdminCursos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [cursos, setCursos] = useState([])
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEditado, setSlugEditado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true)
      const { data, error } = await supabase.from('courses').select('id,slug,title,subtitle,cover_image_url,sort_order,is_published,modules(id),lessons(id)').order('sort_order').order('created_at')
      if (error) setErro(error.message); else setCursos(data || [])
      setCarregando(false)
    }
    init()
  }, [router])
  const filtrados = useMemo(() => cursos.filter(c => `${c.title} ${c.subtitle || ''} ${c.slug}`.toLowerCase().includes(busca.toLowerCase())), [cursos, busca])

  function abrirNovo() { setTitulo(''); setSlug(''); setSlugEditado(false); setErro(''); setModal(true) }
  async function criarCurso() {
    if (!titulo.trim() || !slug.trim()) { setErro('Informe o nome e o código interno do curso.'); return }
    setSalvando(true); setErro('')
    const { data, error } = await supabase.from('courses').insert({ title: titulo.trim(), slug: slug.trim(), is_published: false, sort_order: cursos.length }).select('id').single()
    setSalvando(false)
    if (error) { setErro(error.code === '23505' ? 'Já existe um curso com esse código.' : error.message); return }
    setModal(false); router.push(`/admin/cursos/conteudo?id=${data.id}`)
  }

  if (carregando) return <Estado>Carregando cursos...</Estado>
  if (!autorizado) return <Estado>🔒 Esta área é exclusiva do administrador.</Estado>

  return <AdminCursosShell busca={busca} setBusca={setBusca}>
    <style>{css}</style>
    <div className="curso-crumb">⚙ Administrador › Cursos</div>
    <div className="curso-head"><div><h1>Cursos e Aulas</h1><p>Crie e organize seus cursos, módulos e aulas.</p></div><button onClick={abrirNovo}>＋ Novo curso</button></div>
    {erro && !modal && <div className="curso-erro">{erro}</div>}
    {!filtrados.length ? <div className="curso-vazio"><span>🎓</span><b>{busca ? 'Nenhum curso encontrado' : 'Nenhum curso cadastrado'}</b><p>{busca ? 'Tente pesquisar com outro nome.' : 'Clique em “Novo curso” para começar.'}</p></div> :
      <div className="curso-grid">{filtrados.map(c => <button className="curso-card" key={c.id} onClick={() => router.push(`/admin/cursos/conteudo?id=${c.id}`)}>
        <div className="curso-capa" style={c.cover_image_url ? { backgroundImage: `url(${c.cover_image_url})` } : {}}>{!c.cover_image_url && <span>{c.title}</span>}</div>
        <div className="curso-body"><h2>{c.title}</h2><p>{c.modules?.length || 0} módulos · {c.lessons?.length || 0} aulas</p><div><em className={c.is_published ? 'publicado' : 'rascunho'}>{c.is_published ? 'Publicado' : 'Rascunho'}</em><strong>Editar →</strong></div></div>
      </button>)}</div>}
    {modal && <div className="curso-overlay" onMouseDown={e => e.target === e.currentTarget && !salvando && setModal(false)}><div className="curso-modal">
      <header><div><h2>Novo curso</h2><p>Crie o curso agora e organize o conteúdo em seguida.</p></div><button onClick={() => setModal(false)}>×</button></header>
      <main>
        {erro && <div className="curso-erro">{erro}</div>}
        <label>Nome do curso <i>*</i><input autoFocus value={titulo} onChange={e => { setTitulo(e.target.value); if (!slugEditado) setSlug(slugify(e.target.value)) }} placeholder="Ex.: Equipe que Vende Sozinha" /></label>
        <label>Código interno <small>usado no endereço</small><input value={slug} onChange={e => { setSlugEditado(true); setSlug(slugify(e.target.value)) }} placeholder="equipe-que-vende-sozinha" /></label>
      </main>
      <footer><button className="cancelar" onClick={() => setModal(false)}>Cancelar</button><button className="salvar" disabled={salvando} onClick={criarCurso}>{salvando ? 'Criando...' : 'Criar curso'}</button></footer>
    </div></div>}
  </AdminCursosShell>
}

function Estado({ children }) { return <div style={{ minHeight: '100vh', background: '#080808', color: '#888', display: 'grid', placeItems: 'center' }}>{children}</div> }
const css = `
.curso-crumb{color:#777;font-size:11px;margin-bottom:16px}.curso-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:26px}.curso-head h1{font-size:22px;margin:0 0 3px}.curso-head p{color:#777;font-size:12px;margin:0}.curso-head>button,.curso-modal .salvar{background:${ouroGrad};border:0;color:#090909;border-radius:9px;padding:11px 17px;font-weight:900;cursor:pointer}
.curso-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:15px}.curso-card{text-align:left;background:#171414;border:1px solid #302c2a;border-radius:13px;overflow:hidden;color:#fff;padding:0;cursor:pointer;transition:.15s}.curso-card:hover{transform:translateY(-2px);border-color:#66571f}.curso-capa{height:112px;background:linear-gradient(135deg,#31270c,#0d0b07);background-size:cover;background-position:center;display:grid;place-items:center;padding:14px}.curso-capa span{color:#ead16f;font-size:12px;font-weight:900;text-align:center;text-transform:uppercase}.curso-body{padding:13px 14px 15px}.curso-body h2{font-size:14px;margin:0 0 5px}.curso-body p{color:#777;font-size:11px;margin:0 0 12px}.curso-body>div{display:flex;align-items:center;justify-content:space-between}.curso-body em{font-size:10px;font-style:normal;font-weight:800;padding:4px 8px;border-radius:20px}.curso-body .publicado{background:rgba(40,190,95,.13);color:#42ce77}.curso-body .rascunho{background:#252323;color:#888}.curso-body strong{font-size:11px;color:${ouro}}
.curso-vazio{border:1px solid #292625;background:#111;border-radius:14px;text-align:center;padding:65px 20px;color:#777}.curso-vazio span{display:block;font-size:38px;margin-bottom:9px}.curso-vazio b{color:#fff}.curso-vazio p{font-size:12px}.curso-erro{background:#2a1515;border:1px solid #5a2a2a;color:#f5a5a5;border-radius:9px;padding:10px 12px;font-size:12px;margin-bottom:13px}
.curso-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(5px);display:grid;place-items:center;padding:16px;z-index:100}.curso-modal{width:min(520px,100%);background:#151517;border:1px solid #333238;border-radius:18px;overflow:hidden;box-shadow:0 25px 80px #000}.curso-modal header{display:flex;justify-content:space-between;padding:20px 22px 14px}.curso-modal h2{margin:0;font-size:18px}.curso-modal header p{color:#777;font-size:12px;margin:4px 0 0}.curso-modal header button{width:30px;height:30px;border:1px solid #39393d;border-radius:8px;background:#202024;color:#888;font-size:20px;cursor:pointer}.curso-modal main{padding:12px 22px}.curso-modal label{display:block;font-size:12px;font-weight:800;margin-bottom:15px}.curso-modal label i{color:${ouro};font-style:normal}.curso-modal label small{color:#777;font-weight:400;margin-left:5px}.curso-modal input{width:100%;display:block;margin-top:7px;background:#252529;border:1px solid transparent;border-radius:10px;padding:12px 13px;color:#fff;outline:none}.curso-modal input:focus{border-color:${ouro};box-shadow:0 0 0 3px rgba(212,175,55,.12)}.curso-modal footer{border-top:1px solid #2b2b2e;padding:14px 22px 18px;display:flex;justify-content:flex-end;gap:9px}.curso-modal .cancelar{background:#202024;border:1px solid #404047;color:#fff;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer}
@media(min-width:1500px){.curso-grid{grid-template-columns:repeat(5,1fr)}}@media(max-width:600px){.curso-head{align-items:flex-start}.curso-head>button{white-space:nowrap}.curso-grid{grid-template-columns:1fr 1fr}.curso-capa{height:92px}}@media(max-width:420px){.curso-grid{grid-template-columns:1fr}}
`
