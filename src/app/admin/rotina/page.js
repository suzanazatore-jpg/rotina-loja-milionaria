'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'materiais'

// Retorna a data (YYYY-MM-DD) da segunda-feira da semana de "hoje"
function segundaFeiraAtual() {
  const hoje = new Date()
  const diaSemana = hoje.getDay() // 0 = domingo, 1 = segunda, ...
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana // volta até a segunda
  const segunda = new Date(hoje)
  segunda.setDate(hoje.getDate() + diff)
  return formatarData(segunda)
}

function formatarData(d) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Rótulo amigável: "Semana de 22/06 a 26/06"
function rotuloSemana(semanaInicio) {
  if (!semanaInicio) return ''
  const [ano, mes, dia] = semanaInicio.split('-').map(Number)
  const inicio = new Date(ano, mes - 1, dia)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 4) // segunda + 4 = sexta
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `Semana de ${fmt(inicio)} a ${fmt(fim)}`
}

export default function AdminRotina() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [itens, setItens] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [semanaInicio, setSemanaInicio] = useState(segundaFeiraAtual())
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const router = useRouter()

  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const session = user ? { user } : null
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAutorizado(false); setCarregando(false); return
      }
      setAutorizado(true)
      await carregar()
      setCarregando(false)
    }
    init()
  }, [router])

  async function carregar() {
    const { data } = await supabase.from('rotinas').select('*').order('semana_inicio', { ascending: false })
    if (data) setItens(data)
  }

  function abrirForm() {
    setTitulo(''); setDescricao(''); setArquivo(null); setSemanaInicio(segundaFeiraAtual()); setMsg('')
    setMostrarForm(true)
  }

  function cancelar() {
    setMostrarForm(false)
    setTitulo(''); setDescricao(''); setArquivo(null)
  }

  async function enviar() {
    if (!titulo.trim()) { setMsg('⚠ Dê um nome à rotina (ex: Rotina da semana).'); return }
    if (!semanaInicio) { setMsg('⚠ Selecione a segunda-feira desta rotina.'); return }
    if (!arquivo) { setMsg('⚠ Selecione um arquivo PDF.'); return }
    setEnviando(true); setMsg('')

    try {
      // Verifica se já existe uma rotina pra essa semana — se sim, substitui (apaga a antiga)
      const existente = itens.find(i => i.semana_inicio === semanaInicio)
      if (existente) {
        if (existente.arquivo_nome) {
          await supabase.storage.from(BUCKET).remove([existente.arquivo_nome])
        }
        await supabase.from('rotinas').delete().eq('id', existente.id)
      }

      // Nome único pro arquivo (evita sobrescrever no Storage)
      const nomeArquivo = `${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      // 1. Sobe o PDF pro Storage
      const { error: upError } = await supabase.storage.from(BUCKET).upload(nomeArquivo, arquivo)
      if (upError) throw upError

      // 2. Pega o link público
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nomeArquivo)

      // 3. Salva o registro na tabela
      const { error: dbError } = await supabase.from('rotinas').insert({
        ordem: 1,
        semana_inicio: semanaInicio,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        arquivo_url: urlData.publicUrl,
        arquivo_nome: nomeArquivo,
      })
      if (dbError) throw dbError

      setMsg(existente ? '✓ Rotina da semana substituída com sucesso!' : '✓ Rotina enviada com sucesso!')
      await carregar()
      cancelar()
    } catch (e) {
      setMsg('⚠ Erro: ' + e.message)
    }
    setEnviando(false)
    setTimeout(() => setMsg(''), 5000)
  }

  async function apagar(item) {
    if (!confirm('Apagar esta rotina? O PDF também será removido.')) return
    if (item.arquivo_nome) {
      await supabase.storage.from(BUCKET).remove([item.arquivo_nome])
    }
    await supabase.from('rotinas').delete().eq('id', item.id)
    await carregar()
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

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Escritório</button>
          <div>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>🔄 Rotina Semanal (PDFs)</p>
          </div>
        </div>
        {!mostrarForm && (
          <button onClick={abrirForm} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Nova Rotina</button>
        )}
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {/* FORMULÁRIO DE UPLOAD */}
        {mostrarForm && (
          <div style={{ background: '#111111', border: `1px solid ${ouro}`, borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px' }}>Nova rotina em PDF</h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Segunda-feira desta rotina *</label>
              <input
                type="date"
                value={semanaInicio}
                onChange={e => setSemanaInicio(e.target.value)}
                style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
              />
              <p style={{ fontSize: '12px', color: '#666', margin: '6px 0 0' }}>{rotuloSemana(semanaInicio)}</p>
              {itens.some(i => i.semana_inicio === semanaInicio) && (
                <p style={{ fontSize: '12px', color: '#e0b84d', margin: '6px 0 0' }}>⚠ Já existe uma rotina para esta semana. Enviar agora vai substituí-la.</p>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Nome da rotina *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Rotina da semana"
                style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Descrição (opcional)</label>
              <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição da rotina"
                style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Arquivo PDF *</label>
              <input type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files[0])}
                style={{ width: '100%', fontSize: '13px', color: '#AAA' }} />
              {arquivo && <p style={{ fontSize: '12px', color: '#5dca8a', margin: '6px 0 0' }}>📄 {arquivo.name}</p>}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={enviar} disabled={enviando} style={{ flex: 1, padding: '12px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{enviando ? 'Enviando...' : 'Enviar PDF'}</button>
              <button onClick={cancelar} style={{ padding: '12px 20px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* LISTA DE PDFs */}
        {itens.length === 0 && !mostrarForm ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#555' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
            <p style={{ fontSize: '14px', margin: '0 0 4px' }}>Nenhuma rotina enviada ainda.</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Clique em "+ Nova Rotina" para enviar.</p>
          </div>
        ) : (
          itens.map(item => (
            <div key={item.id} style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '26px', flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: ouro, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotuloSemana(item.semana_inicio)}</p>
                <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{item.titulo}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0' }}>{item.descricao || 'Sem descrição'}</p>
                {item.arquivo_url && <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#5dca8a', margin: '4px 0 0', display: 'inline-block', textDecoration: 'none' }}>🔗 Ver arquivo</a>}
              </div>
              <button onClick={() => apagar(item)} style={{ background: 'transparent', border: '1px solid #5A1A1A', borderRadius: '8px', color: '#e88', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Apagar</button>
            </div>
          ))
        )}
      </main>
    </div>
  )
}


