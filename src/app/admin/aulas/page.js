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
  const [editando, setEditando] = useState(null) // id da aula em edição, ou 'nova'
  const [form, setForm] = useState({ ordem: '', titulo: '', descricao: '', video_url: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
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
    const { data } = await supabase.from('aulas').select('*').order('ordem', { ascending: true })
    if (data) setAulas(data)
  }

  function novaAula() {
    setForm({ ordem: aulas.length + 1, titulo: '', descricao: '', video_url: '' })
    setEditando('nova')
  }

  function editarAula(aula) {
    setForm({ ordem: aula.ordem, titulo: aula.titulo, descricao: aula.descricao || '', video_url: aula.video_url || '' })
    setEditando(aula.id)
  }

  function cancelar() {
    setEditando(null)
    setForm({ ordem: '', titulo: '', descricao: '', video_url: '' })
  }

  async function salvar() {
    if (!form.titulo.trim()) { setMsg('⚠ O título é obrigatório.'); return }
    setSalvando(true); setMsg('')
    const dados = {
      ordem: parseInt(form.ordem) || 0,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim(),
      video_url: form.video_url.trim(),
    }
    let error
    if (editando === 'nova') {
      ({ error } = await supabase.from('aulas').insert(dados))
    } else {
      ({ error } = await supabase.from('aulas').update(dados).eq('id', editando))
    }
    if (error) {
      setMsg('⚠ Erro ao salvar: ' + error.message)
    } else {
      setMsg('✓ Aula salva!')
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
        <button onClick={() => router.push('/painel')} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Voltar ao painel</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.push('/painel')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Painel</button>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>🎓 Gerenciar Aulas</p>
          </div>
        </div>
        {editando === null && (
          <button onClick={novaAula} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Nova aula</button>
        )}
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {/* FORMULÁRIO (nova ou editando) */}
        {editando !== null && (
          <div style={{ background: '#111111', border: `1px solid ${ouro}`, borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px' }}>{editando === 'nova' ? 'Nova aula' : 'Editar aula'}</h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '90px' }}>
                <Campo label="Ordem" valor={form.ordem} onChange={v => setForm({ ...form, ordem: v })} placeholder="1" ouro={ouro} />
              </div>
              <div style={{ flex: 1 }}>
                <Campo label="Título *" valor={form.titulo} onChange={v => setForm({ ...form, titulo: v })} placeholder="Ex: Aula 01 — Organizando a loja" ouro={ouro} />
              </div>
            </div>
            <Campo label="Descrição" valor={form.descricao} onChange={v => setForm({ ...form, descricao: v })} placeholder="Breve descrição da aula" ouro={ouro} />
            <Campo label="Link do vídeo (embed)" valor={form.video_url} onChange={v => setForm({ ...form, video_url: v })} placeholder="https://player.scaleup.com.br/embed/..." ouro={ouro} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button onClick={salvar} disabled={salvando} style={{ flex: 1, padding: '12px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
              <button onClick={cancelar} style={{ padding: '12px 20px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* LISTA DE AULAS */}
        {aulas.length === 0 && editando === null ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#555' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎬</div>
            <p style={{ fontSize: '14px', margin: '0 0 4px' }}>Nenhuma aula cadastrada ainda.</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Clique em "+ Nova aula" para começar.</p>
          </div>
        ) : (
          aulas.map(aula => (
            <div key={aula.id} style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>{aula.ordem}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{aula.titulo}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0' }}>{aula.descricao || 'Sem descrição'}</p>
                <p style={{ fontSize: '11px', color: aula.video_url ? '#5dca8a' : '#e88', margin: '4px 0 0' }}>{aula.video_url ? '🎥 Vídeo cadastrado' : '⚠ Sem vídeo'}</p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => editarAula(aula)} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Editar</button>
                <button onClick={() => apagar(aula.id)} style={{ background: 'transparent', border: '1px solid #5A1A1A', borderRadius: '8px', color: '#e88', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Apagar</button>
              </div>
            </div>
          ))
        )}
      </main>
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
