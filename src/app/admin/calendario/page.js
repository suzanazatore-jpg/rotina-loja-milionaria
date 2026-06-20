'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'materiais'

// Lista de meses pro seletor (rótulo + valor 'AAAA-MM')
function gerarMeses() {
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const hoje = new Date()
  const lista = []
  // Gera de 3 meses atrás até 12 meses pra frente (cobre o uso normal)
  for (let i = -3; i <= 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const rotulo = `${nomes[d.getMonth()]} ${d.getFullYear()}`
    lista.push({ valor, rotulo })
  }
  return lista
}

function rotuloDoMes(mesAno) {
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  if (!mesAno) return ''
  const [ano, mes] = mesAno.split('-')
  return `${nomes[parseInt(mes, 10) - 1]} ${ano}`
}

function mesAtual() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

export default function AdminCalendario() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [itens, setItens] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [mesAno, setMesAno] = useState(mesAtual())
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const router = useRouter()

  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
  const meses = gerarMeses()

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
    const { data } = await supabase.from('calendario').select('*').order('mes_ano', { ascending: false })
    if (data) setItens(data)
  }

  function abrirForm() {
    setTitulo(''); setDescricao(''); setArquivo(null); setMesAno(mesAtual()); setMsg('')
    setMostrarForm(true)
  }

  function cancelar() {
    setMostrarForm(false)
    setTitulo(''); setDescricao(''); setArquivo(null)
  }

  async function enviar() {
    if (!titulo.trim()) { setMsg('⚠ Dê um nome ao material (ex: Calendário de Julho).'); return }
    if (!mesAno) { setMsg('⚠ Selecione o mês deste calendário.'); return }
    if (!arquivo) { setMsg('⚠ Selecione um arquivo PDF.'); return }
    setEnviando(true); setMsg('')

    try {
      // Verifica se já existe um material pra esse mês — se sim, substitui (apaga o antigo)
      const existente = itens.find(i => i.mes_ano === mesAno)
      if (existente) {
        if (existente.arquivo_nome) {
          await supabase.storage.from(BUCKET).remove([existente.arquivo_nome])
        }
        await supabase.from('calendario').delete().eq('id', existente.id)
      }

      // Nome único pro arquivo (evita sobrescrever no Storage)
      const nomeArquivo = `${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      // 1. Sobe o PDF pro Storage
      const { error: upError } = await supabase.storage.from(BUCKET).upload(nomeArquivo, arquivo)
      if (upError) throw upError

      // 2. Pega o link público
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nomeArquivo)

      // 3. Salva o registro na tabela
      const { error: dbError } = await supabase.from('calendario').insert({
        ordem: 1,
        mes_ano: mesAno,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        arquivo_url: urlData.publicUrl,
        arquivo_nome: nomeArquivo,
      })
      if (dbError) throw dbError

      setMsg(existente ? '✓ Material do mês substituído com sucesso!' : '✓ Material enviado com sucesso!')
      await carregar()
      cancelar()
    } catch (e) {
      setMsg('⚠ Erro: ' + e.message)
    }
    setEnviando(false)
    setTimeout(() => setMsg(''), 5000)
  }

  async function apagar(item) {
    if (!confirm('Apagar este material? O PDF também será removido.')) return
    // Apaga o arquivo do Storage
    if (item.arquivo_nome) {
      await supabase.storage.from(BUCKET).remove([item.arquivo_nome])
    }
    // Apaga o registro
    await supabase.from('calendario').delete().eq('id', item.id)
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
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>📅 Calendário (PDFs)</p>
          </div>
        </div>
        {!mostrarForm && (
          <button onClick={abrirForm} style={{ background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>+ Novo PDF</button>
        )}
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {/* FORMULÁRIO DE UPLOAD */}
        {mostrarForm && (
          <div style={{ background: '#111111', border: `1px solid ${ouro}`, borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px' }}>Novo material em PDF</h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Mês deste calendário *</label>
              <select value={mesAno} onChange={e => setMesAno(e.target.value)}
                style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }}>
                {meses.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
              </select>
              {itens.some(i => i.mes_ano === mesAno) && (
                <p style={{ fontSize: '12px', color: '#e0b84d', margin: '6px 0 0' }}>⚠ Já existe um PDF para este mês. Enviar agora vai substituí-lo.</p>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Nome do material *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Calendário de Julho"
                style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Descrição (opcional)</label>
              <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição do material"
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
            <p style={{ fontSize: '14px', margin: '0 0 4px' }}>Nenhum PDF enviado ainda.</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Clique em "+ Novo PDF" para enviar.</p>
          </div>
        ) : (
          itens.map(item => (
            <div key={item.id} style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '26px', flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: ouro, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotuloDoMes(item.mes_ano)}</p>
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

