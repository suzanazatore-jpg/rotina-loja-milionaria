'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export default function AdminAulas() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [aulas, setAulas] = useState([])
  const [materiais, setMateriais] = useState([])
  const [materialForm, setMaterialForm] = useState({ title: '', link: '', file: null })
  const [materiaisPendentes, setMateriaisPendentes] = useState([])
  const [editando, setEditando] = useState(null) // id da aula em edição, ou 'nova'
  const [form, setForm] = useState({ mentorship_type: 'evs', ordem: '', titulo: '', descricao: '', video_url: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState('evs')
  const router = useRouter()

  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAutorizado(false)
        setCarregando(false)
        return
      }
      setAutorizado(true)
      await carregarAulas()
      setCarregando(false)
    }
    init()
  }, [router])

  async function carregarAulas() {
    const [{ data }, { data: mats }] = await Promise.all([supabase.from('aulas').select('*').order('ordem', { ascending: true }), supabase.from('mentorship_materials').select('*').order('sort_order')])
    if (data) setAulas(data)
    if (mats) setMateriais(mats)
  }

  function novaAula(tipo = aba) {
    setMateriaisPendentes([]); setMaterialForm({ title: '', link: '', file: null })
    setForm({ mentorship_type: tipo, ordem: aulas.filter(a => (a.mentorship_type || 'evs') === tipo).length + 1, titulo: '', descricao: '', video_url: '' })
    setEditando('nova')
  }

  function editarAula(aula) {
    setMateriaisPendentes([]); setMaterialForm({ title: '', link: '', file: null })
    setAba(aula.mentorship_type || 'evs')
    setForm({ mentorship_type: aula.mentorship_type || 'evs', ordem: aula.ordem, titulo: aula.titulo, descricao: aula.descricao || '', video_url: aula.video_url || '' })
    setEditando(aula.id)
  }

  function cancelar() {
    setEditando(null)
    setForm({ mentorship_type: 'evs', ordem: '', titulo: '', descricao: '', video_url: '' })
  }

  function adicionarMaterial() {
    if (!materialForm.title.trim() || (!materialForm.file && !/^https?:\/\//i.test(materialForm.link.trim()))) { setMsg('⚠ Informe o nome e escolha um PDF ou link válido.'); return }
    if (materialForm.file && (materialForm.file.type !== 'application/pdf' || materialForm.file.size > 20 * 1024 * 1024)) { setMsg('⚠ O material deve ser um PDF de até 20 MB.'); return }
    setMateriaisPendentes(p => [...p, { ...materialForm, tempId: Date.now() }]); setMaterialForm({ title: '', link: '', file: null }); setMsg('')
  }

  async function gravarMaterial(material, aulaId, ordem) {
    let fileUrl = material.link.trim()
    if (material.file) {
      const safe = material.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
      const path = `mentorias/${aulaId}/${Date.now()}-${safe}`
      const up = await supabase.storage.from('course-materials').upload(path, material.file, { contentType: 'application/pdf', upsert: false })
      if (up.error) throw up.error
      fileUrl = `storage://course-materials/${path}`
    }
    const { error } = await supabase.from('mentorship_materials').insert({ aula_id: aulaId, title: material.title.trim(), file_url: fileUrl, sort_order: ordem })
    if (error) throw error
  }

  async function apagarMaterial(material) {
    if (!confirm(`Apagar o material "${material.title}"?`)) return
    if (material.file_url?.startsWith('storage://course-materials/')) await supabase.storage.from('course-materials').remove([material.file_url.replace('storage://course-materials/', '')])
    await supabase.from('mentorship_materials').delete().eq('id', material.id); await carregarAulas()
  }

  async function salvar() {
    if (!form.titulo.trim()) { setMsg('⚠ O título é obrigatório.'); return }
    setSalvando(true); setMsg('')
    const dados = {
      mentorship_type: form.mentorship_type,
      ordem: parseInt(form.ordem) || 0,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim(),
      video_url: form.video_url.trim(),
    }
    let error
    let aulaId = editando
    if (editando === 'nova') {
      const resultado = await supabase.from('aulas').insert(dados).select('id').single(); error = resultado.error; aulaId = resultado.data?.id
    } else {
      ({ error } = await supabase.from('aulas').update(dados).eq('id', editando))
    }
    if (error) {
      setMsg('⚠ Erro ao salvar: ' + error.message)
    } else {
      try { for (let i = 0; i < materiaisPendentes.length; i++) await gravarMaterial(materiaisPendentes[i], aulaId, materiais.filter(m => m.aula_id === aulaId).length + i) } catch (e) { setMsg('⚠ Aula salva, mas um material falhou: ' + e.message); setSalvando(false); await carregarAulas(); return }
      setMsg('✓ Aula e materiais salvos!')
      await carregarAulas()
      cancelar()
    }
    setSalvando(false)
    setTimeout(() => setMsg(''), 4000)
  }

  async function apagar(id) {
    if (!confirm('Tem certeza que quer apagar esta aula?')) return
    const { error } = await supabase.from('aulas').delete().eq('id', id)
    if (!error) await carregarAulas()
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
        <button onClick={() => router.push('/admin')} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Voltar ao Escritório</button>
      </div>
    )
  }

  const aulasFiltradas = aulas.filter(aula => (aula.mentorship_type || 'evs') === aba)
  const totalEvs = aulas.filter(aula => (aula.mentorship_type || 'evs') === 'evs').length
  const totalCvm = aulas.filter(aula => aula.mentorship_type === 'cvm').length

  return (
    <div className="mentoria-admin">
      <header className="mentoria-admin-header">
        <button onClick={() => router.push('/admin')} className="botao-voltar">← Meu Escritório</button>
        <div className="titulo-header"><p>CONTEÚDO DO APLICATIVO</p><strong>Aulas da Mentoria</strong></div>
        <button onClick={() => novaAula()} className="botao-dourado">＋ Nova aula</button>
      </header>

      <main className="mentoria-admin-main">
        <section className="cabecalho-pagina"><div><p>MENTORIAS</p><h1>Gerencie as gravações</h1><span>Cadastre e organize separadamente as aulas de cada mentoria.</span></div><div className="resumo"><div><b>{totalEvs}</b><span>Aulas EVS</span></div><div><b>{totalCvm}</b><span>Aulas CVM</span></div></div></section>

        {msg && <div className={msg.startsWith('✓') ? 'mensagem sucesso' : 'mensagem erro'}>{msg}</div>}

        <div className="abas-mentoria">{[['evs', 'Mentoria EVS', totalEvs], ['cvm', 'Mentoria CVM', totalCvm]].map(([tipo, label, total]) => <button key={tipo} onClick={() => setAba(tipo)} className={aba === tipo ? 'ativa' : ''}><span>{label}</span><b>{total}</b></button>)}</div>

        <div className="barra-lista"><div><strong>Aulas da Mentoria {aba.toUpperCase()}</strong><span>Arrumadas pela ordem de exibição para a aluna.</span></div><button onClick={() => novaAula(aba)}>＋ Adicionar em {aba.toUpperCase()}</button></div>

        {aulasFiltradas.length === 0 ? <div className="estado-vazio"><div>▶</div><h2>Nenhuma aula na Mentoria {aba.toUpperCase()}</h2><p>Cadastre a primeira gravação desta mentoria.</p><button onClick={() => novaAula(aba)} className="botao-dourado">＋ Cadastrar primeira aula</button></div> : <div className="lista-aulas">{aulasFiltradas.map(aula => <article key={aula.id} className="aula-card"><div className="numero-aula">{aula.ordem}</div><div className="dados-aula"><small>MENTORIA {aba.toUpperCase()}</small><strong>{aula.titulo}</strong><span>{aula.descricao || 'Sem descrição'}</span><em className={aula.video_url ? 'video-ok' : 'video-pendente'}>{aula.video_url ? '● Vídeo cadastrado' : '● Vídeo pendente'}</em></div><div className="acoes-aula"><button onClick={() => editarAula(aula)}>Editar</button><button onClick={() => apagar(aula.id)} className="apagar">Apagar</button></div></article>)}</div>}
      </main>

      {editando !== null && <div className="modal-fundo" onMouseDown={e => e.target === e.currentTarget && !salvando && cancelar()}><div className="modal-aula"><header><div><p>MENTORIA {form.mentorship_type.toUpperCase()}</p><h2>{editando === 'nova' ? 'Cadastrar nova aula' : 'Editar aula'}</h2></div><button onClick={cancelar}>×</button></header><div className="modal-conteudo"><label className="rotulo-select">Mentoria<select value={form.mentorship_type} onChange={e => setForm({ ...form, mentorship_type: e.target.value })}><option value="evs">Mentoria EVS</option><option value="cvm">Mentoria CVM</option></select></label><div className="linha-form"><div className="campo-ordem"><Campo label="Ordem" valor={form.ordem} onChange={v => setForm({ ...form, ordem: v })} placeholder="1" ouro={ouro} /></div><div><Campo label="Título *" valor={form.titulo} onChange={v => setForm({ ...form, titulo: v })} placeholder="Ex.: Protocolo de vendas no WhatsApp" ouro={ouro} /></div></div><Campo label="Descrição" valor={form.descricao} onChange={v => setForm({ ...form, descricao: v })} placeholder="Explique brevemente o conteúdo desta aula" ouro={ouro} /><Campo label="Link do vídeo" valor={form.video_url} onChange={v => setForm({ ...form, video_url: v })} placeholder="https://player.scaleup.com.br/embed/..." ouro={ouro} /><p className="ajuda-link">Use o endereço de incorporação (embed) do YouTube, Vimeo ou ScaleUp.</p><section className="materiais-editor"><div><strong>Materiais de apoio</strong><span>PDF ou link complementar desta aula.</span></div>{editando !== 'nova' && materiais.filter(m => m.aula_id === editando).map(m => <div className="material-item" key={m.id}><span>📎 {m.title}</span><button type="button" onClick={() => apagarMaterial(m)}>Excluir</button></div>)}{materiaisPendentes.map((m,i) => <div className="material-item" key={m.tempId}><span>📎 {m.title} <small>novo</small></span><button type="button" onClick={() => setMateriaisPendentes(p => p.filter((_,x) => x !== i))}>Remover</button></div>)}<input value={materialForm.title} onChange={e => setMaterialForm(f => ({...f,title:e.target.value}))} placeholder="Nome do material" /><input value={materialForm.link} onChange={e => setMaterialForm(f => ({...f,link:e.target.value}))} placeholder="Link (opcional se enviar PDF)" /><label className="arquivo-material">Escolher PDF<input type="file" accept="application/pdf" onChange={e => setMaterialForm(f => ({...f,file:e.target.files?.[0]||null}))} /></label>{materialForm.file && <small>{materialForm.file.name}</small>}<button type="button" onClick={adicionarMaterial} className="adicionar-material">＋ Adicionar material</button></section></div><footer><button onClick={cancelar} className="cancelar">Cancelar</button><button onClick={salvar} disabled={salvando} className="botao-dourado">{salvando ? 'Salvando...' : 'Salvar aula'}</button></footer></div></div>}

      <style jsx global>{`.mentoria-admin{min-height:100vh;background:#090909;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mentoria-admin-header{height:66px;padding:0 24px;border-bottom:1px solid #292929;background:#101010;display:grid;grid-template-columns:180px 1fr 180px;align-items:center;position:sticky;top:0;z-index:20}.botao-voltar{justify-self:start;background:#171717;border:1px solid #333;color:#ddd;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer}.titulo-header{text-align:center}.titulo-header p,.cabecalho-pagina>div>p,.modal-aula header p{color:${ouro};font-size:10px;font-weight:900;letter-spacing:.12em;margin:0}.titulo-header strong{font-size:15px}.botao-dourado{justify-self:end;background:${ouroGrad};color:#090909;border:0;border-radius:9px;padding:11px 16px;font-weight:900;cursor:pointer}.mentoria-admin-main{max-width:1120px;margin:0 auto;padding:38px 22px 70px}.cabecalho-pagina{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:26px}.cabecalho-pagina h1{font-family:Georgia,serif;font-size:30px;margin:7px 0}.cabecalho-pagina span{color:#888;font-size:13px}.resumo{display:flex;gap:10px}.resumo>div{min-width:105px;background:#121212;border:1px solid #2c2c2c;border-radius:12px;padding:12px}.resumo b{display:block;color:${ouro};font-size:20px}.resumo span{font-size:11px}.abas-mentoria{display:grid;grid-template-columns:1fr 1fr;padding:5px;background:#161616;border:1px solid #292929;border-radius:13px;margin-bottom:22px}.abas-mentoria button{border:0;border-radius:9px;background:transparent;color:#888;padding:13px 16px;font-weight:800;cursor:pointer;display:flex;justify-content:center;gap:10px}.abas-mentoria button.ativa{background:#25200f;color:#fff;box-shadow:inset 0 0 0 1px #695a21}.abas-mentoria b{color:${ouro}}.barra-lista{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:13px}.barra-lista strong,.barra-lista span{display:block}.barra-lista span{color:#777;font-size:12px;margin-top:3px}.barra-lista button{background:transparent;border:1px solid #52471b;color:${ouro};padding:9px 12px;border-radius:9px;font-weight:800;cursor:pointer}.lista-aulas{display:grid;gap:10px}.aula-card{display:flex;align-items:center;gap:16px;background:#121212;border:1px solid #2c2c2c;border-radius:13px;padding:15px 16px}.numero-aula{width:39px;height:39px;border-radius:11px;display:grid;place-items:center;background:#29230e;color:${ouro};font-weight:900;flex:0 0 39px}.dados-aula{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}.dados-aula small{color:${ouro};font-size:9px;font-weight:900;letter-spacing:.1em}.dados-aula strong{font-size:14px}.dados-aula span{color:#777;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dados-aula em{font-size:10px;font-style:normal;margin-top:3px}.video-ok{color:#55cb80}.video-pendente{color:#d97878}.acoes-aula{display:flex;gap:7px}.acoes-aula button{background:#191919;border:1px solid #333;color:${ouro};border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}.acoes-aula .apagar{color:#ef8585;border-color:#542323}.estado-vazio{text-align:center;border:1px dashed #393939;border-radius:15px;padding:55px 20px;color:#777}.estado-vazio>div{width:48px;height:48px;border-radius:50%;background:#29230e;color:${ouro};display:grid;place-items:center;margin:0 auto}.estado-vazio h2{color:#eee;font-size:17px;margin:14px 0 5px}.estado-vazio p{font-size:13px;margin:0 0 18px}.estado-vazio .botao-dourado{justify-self:center}.mensagem{padding:11px 13px;border-radius:9px;margin-bottom:15px;font-size:13px}.mensagem.sucesso{background:#102317;color:#65d28b;border:1px solid #245c37}.mensagem.erro{background:#291313;color:#ef9999;border:1px solid #632b2b}.modal-fundo{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.82);backdrop-filter:blur(5px);display:grid;place-items:center;padding:18px}.modal-aula{width:min(680px,100%);max-height:92vh;overflow:auto;background:#141414;border:1px solid #393939;border-radius:17px;box-shadow:0 30px 100px #000}.modal-aula header{padding:18px 20px;border-bottom:1px solid #303030;display:flex;justify-content:space-between;align-items:center}.modal-aula h2{font-size:18px;margin:3px 0 0}.modal-aula header button{width:34px;height:34px;border-radius:9px;border:1px solid #3a3a3a;background:#222;color:#aaa;font-size:20px;cursor:pointer}.modal-conteudo{padding:20px}.rotulo-select{display:block;color:#888;font-size:12px;font-weight:700;margin-bottom:14px}.rotulo-select select{display:block;width:100%;margin-top:6px;background:#090909;color:#fff;border:1px solid #333;border-radius:9px;padding:11px 13px}.linha-form{display:grid;grid-template-columns:95px 1fr;gap:12px}.ajuda-link{color:#666;font-size:11px;margin:-8px 0 0}.modal-aula footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 20px;border-top:1px solid #303030}.modal-aula footer .cancelar{background:#222;color:#ddd;border:1px solid #3a3a3a;border-radius:9px;padding:10px 15px;font-weight:800;cursor:pointer}.materiais-editor{border-top:1px solid #303030;margin-top:20px;padding-top:17px;display:grid;gap:8px}.materiais-editor>div:first-child strong,.materiais-editor>div:first-child span{display:block}.materiais-editor>div:first-child span{color:#777;font-size:11px;margin-top:3px}.materiais-editor input{background:#090909;color:#fff;border:1px solid #333;border-radius:8px;padding:10px}.material-item{display:flex;justify-content:space-between;background:#222;border-radius:8px;padding:9px;font-size:11px}.material-item button,.adicionar-material{background:none;border:0;color:#D4AF37;font-weight:800;cursor:pointer}.arquivo-material{border:1px dashed #555;border-radius:9px;padding:12px;text-align:center;color:#D4AF37;cursor:pointer;font-size:12px;font-weight:800}.arquivo-material input{display:none}.adicionar-material{text-align:left;padding:7px 0}@media(max-width:700px){.mentoria-admin-header{grid-template-columns:auto 1fr auto;padding:0 12px}.titulo-header p{display:none}.botao-voltar{font-size:0}.botao-voltar:first-letter{font-size:16px}.mentoria-admin-header>.botao-dourado{font-size:0;padding:11px}.mentoria-admin-header>.botao-dourado:after{content:'＋';font-size:18px}.mentoria-admin-main{padding:26px 14px 60px}.cabecalho-pagina{align-items:flex-start;flex-direction:column}.resumo{width:100%}.resumo>div{flex:1}.barra-lista{align-items:flex-start}.barra-lista button{font-size:0}.barra-lista button:after{content:'＋ Aula';font-size:12px}.aula-card{align-items:flex-start;flex-wrap:wrap}.dados-aula{width:calc(100% - 60px)}.acoes-aula{width:100%;padding-left:55px}.linha-form{grid-template-columns:1fr}.campo-ordem{max-width:100px}}`}</style>
    </div>
  )
}

function Campo({ label, valor, onChange, placeholder, ouro }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>{label}</label>
      <input
        value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = ouro}
        onBlur={e => e.target.style.borderColor = '#2A2A2A'}
      />
    </div>
  )
}
