'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ASSISTANT_KNOWLEDGE_CATEGORIES, assistantCategoryLabel } from '@/lib/assistantKnowledge'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

export default function AdminAssistantKnowledge() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [documents, setDocuments] = useState([])
  const [unanswered, setUnanswered] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('general')
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState(false)

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true)
      setToken(session.access_token)
      try {
        const response = await fetch('/api/admin/assistente', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a base.')
        setDocuments(data.documents || [])
        setUnanswered(data.unanswered || [])
      } catch (error) {
        setErro(true)
        setMensagem(error.message)
      }
      setCarregando(false)
    }
    iniciar()
  }, [router])

  async function enviar(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!file && !content.trim()) {
      setErro(true)
      setMensagem('Escolha um arquivo ou cole um texto para ensinar a Assistente.')
      return
    }
    setSalvando(true)
    setMensagem('Preparando o material. Arquivos maiores podem levar alguns instantes...')
    setErro(false)
    try {
      const form = new FormData()
      form.set('title', title)
      form.set('category', category)
      form.set('content', content)
      if (file) form.set('file', file)
      const response = await fetch('/api/admin/assistente', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível preparar o material.')
      setDocuments(current => [data.document, ...current])
      setTitle('')
      setContent('')
      setFile(null)
      formElement.reset()
      setMensagem('✓ Material preparado. A Assistente já pode usar esse conteúdo.')
    } catch (error) {
      setErro(true)
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  async function alterar(document, changes) {
    setMensagem('')
    try {
      const response = await fetch('/api/admin/assistente', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: document.id, ...changes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar o material.')
      setDocuments(current => current.map(item => item.id === document.id ? data.document : item))
    } catch (error) {
      setErro(true)
      setMensagem(error.message)
    }
  }

  async function excluir(document) {
    if (!window.confirm(`Excluir “${document.title}” da memória da Assistente?`)) return
    try {
      const response = await fetch('/api/admin/assistente', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: document.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível excluir o material.')
      setDocuments(current => current.filter(item => item.id !== document.id))
      setErro(false)
      setMensagem('✓ Material removido da memória da Assistente.')
    } catch (error) {
      setErro(true)
      setMensagem(error.message)
    }
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return <div style={{ minHeight: '100vh', background: '#080808', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 20 }}>
      <button onClick={() => router.push('/admin')} style={botaoSecundario}>← Administração</button>
    </header>

    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '28px 18px 90px' }}>
      <p style={sobretitulo}>ASSISTENTE E ATENDIMENTO</p>
      <h1 style={{ fontSize: 25, margin: '5px 0 7px' }}>Base da Assistente</h1>
      <p style={textoApoio}>Envie o método, as aulas e as orientações da Suzana. A Assistente consulta essa base para responder as alunas dentro do aplicativo.</p>

      {mensagem && <div role="status" style={{ background: erro ? '#2A1113' : '#122015', border: `1px solid ${erro ? '#74323A' : '#285D35'}`, color: erro ? '#FFB5BD' : '#9DE2AA', borderRadius: 10, padding: '11px 13px', margin: '18px 0', fontSize: 13 }}>{mensagem}</div>}

      <form onSubmit={enviar} className="assistant-admin-form" style={cardStyle}>
        <div>
          <p style={sobretitulo}>NOVO CONHECIMENTO</p>
          <h2 style={{ fontSize: 18, margin: '4px 0 5px' }}>Ensinar a Assistente</h2>
          <p style={{ ...textoApoio, marginBottom: 0 }}>Use um PDF, Word (.docx), TXT ou cole a orientação diretamente.</p>
        </div>
        <div className="assistant-admin-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 13 }}>
          <label style={labelStyle}>Nome do material
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="Ex.: Método de atendimento da Suzana" style={campoStyle} />
          </label>
          <label style={labelStyle}>Assunto
            <select value={category} onChange={event => setCategory(event.target.value)} style={campoStyle}>
              {ASSISTANT_KNOWLEDGE_CATEGORIES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label style={labelStyle}>Arquivo
          <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => setFile(event.target.files?.[0] || null)} style={{ ...campoStyle, color: '#AAA' }} />
          <small style={ajudaStyle}>{file ? `Selecionado: ${file.name}` : 'Até 10 MB. Para Word antigo (.doc), salve antes como .docx ou PDF.'}</small>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6F6F6F', fontSize: 11 }}><span style={{ flex: 1, height: 1, background: '#292929' }} />OU<span style={{ flex: 1, height: 1, background: '#292929' }} /></div>
        <label style={labelStyle}>Colar texto
          <textarea value={content} onChange={event => setContent(event.target.value)} rows={6} placeholder="Cole aqui regras, orientações, perguntas frequentes ou o jeito da Suzana explicar..." style={{ ...campoStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </label>
        <button disabled={salvando} style={botaoPrimario}>{salvando ? 'Preparando material...' : 'Preparar para a Assistente'}</button>
      </form>

      <section style={{ marginTop: 24 }}>
        <p style={sobretitulo}>MEMÓRIA ATIVA</p>
        <h2 style={{ fontSize: 19, margin: '5px 0 5px' }}>Materiais cadastrados</h2>
        <p style={textoApoio}>{documents.length} {documents.length === 1 ? 'material disponível' : 'materiais disponíveis'} para consulta.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {!documents.length && <div style={{ ...cardStyle, color: '#777', textAlign: 'center' }}>Nenhum material enviado ainda.</div>}
          {documents.map(document => {
            const chunks = document.assistant_knowledge_chunks?.[0]?.count || 0
            return <article key={document.id} className="assistant-document" style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderLeft: `3px solid ${document.is_active ? ouro : '#444'}` }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: ouro, fontSize: 9, fontWeight: 900, letterSpacing: '.1em' }}>{assistantCategoryLabel(document.category).toUpperCase()}</span>
                <h3 style={{ fontSize: 15, margin: '4px 0', overflowWrap: 'anywhere' }}>{document.title}</h3>
                <p style={{ color: '#777', fontSize: 11, margin: 0 }}>{document.file_name || 'Texto digitado'} · {chunks} {chunks === 1 ? 'trecho preparado' : 'trechos preparados'}</p>
              </div>
              <div className="assistant-document-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => alterar(document, { is_active: !document.is_active })} style={botaoSecundario}>{document.is_active ? 'Pausar' : 'Ativar'}</button>
                <button type="button" onClick={() => excluir(document)} style={{ ...botaoSecundario, color: '#FF929B' }}>Excluir</button>
              </div>
            </article>
          })}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <p style={sobretitulo}>MELHORIA CONTÍNUA</p>
        <h2 style={{ fontSize: 19, margin: '5px 0 5px' }}>Perguntas sem conteúdo encontrado</h2>
        <p style={textoApoio}>Use estas dúvidas para decidir quais materiais ou explicações vale adicionar à base.</p>
        <div style={{ ...cardStyle, marginTop: 14, padding: unanswered.length ? '8px 16px' : 18 }}>
          {!unanswered.length ? <p style={{ color: '#777', fontSize: 13, margin: 0 }}>Nenhuma pergunta pendente por enquanto.</p> : unanswered.map(item => <div key={item.id} style={{ padding: '11px 0', borderBottom: '1px solid #292929' }}><p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{item.question}</p><small style={{ color: '#686868' }}>{new Date(item.created_at).toLocaleString('pt-BR')}</small></div>)}
        </div>
      </section>
    </main>

    <style>{`
      @media (max-width: 680px) {
        .assistant-admin-grid { grid-template-columns: 1fr !important; }
        .assistant-document { align-items: flex-start !important; flex-direction: column !important; }
        .assistant-document-actions { width: 100%; }
        .assistant-document-actions button { flex: 1; justify-content: center; }
      }
    `}</style>
  </div>
}

const cardStyle = { background: '#111', border: '1px solid #302E29', borderRadius: 14, padding: 18, display: 'grid', gap: 15 }
const sobretitulo = { color: ouro, fontSize: 10, fontWeight: 900, letterSpacing: '.13em', margin: 0 }
const textoApoio = { color: '#8D8D8D', fontSize: 13, lineHeight: 1.55, margin: '0 0 5px' }
const labelStyle = { display: 'grid', gap: 7, color: '#EAEAEA', fontSize: 12, fontWeight: 800 }
const ajudaStyle = { color: '#777', fontWeight: 400, lineHeight: 1.4 }
const campoStyle = { width: '100%', boxSizing: 'border-box', background: '#090909', color: '#FFF', border: '1px solid #393939', borderRadius: 9, padding: '11px 12px', fontSize: 14, outline: 'none' }
const botaoPrimario = { justifySelf: 'end', background: ouroGrad, color: '#090909', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 900, fontSize: 14, cursor: 'pointer' }
const botaoSecundario = { display: 'inline-flex', alignItems: 'center', background: '#151515', border: '1px solid #363636', borderRadius: 8, color: ouro, padding: '8px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100vh', background: '#080808', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
