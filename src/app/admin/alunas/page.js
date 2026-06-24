'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export default function AdminAlunas() {
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [alunas, setAlunas] = useState([])
  const [editando, setEditando] = useState(null) // id da aluna sendo editada
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [reenviando, setReenviando] = useState(null) // id da aluna recebendo reenvio
  const [mostrarForm, setMostrarForm] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
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
    const { data } = await supabase.from('perfis').select('*').order('nome', { ascending: true })
    if (data) setAlunas(data)
  }

  function abrirEdicao(aluna) {
    setEditando(aluna.id)
    setNome(aluna.nome || '')
    setWhatsapp(aluna.whatsapp || '')
    setMsg('')
  }

  function cancelarEdicao() {
    setEditando(null)
    setNome('')
    setWhatsapp('')
  }

  async function salvar() {
    if (!nome.trim()) { setMsg('⚠ O nome não pode ficar vazio.'); return }
    setSalvando(true); setMsg('')
    try {
      const { error } = await supabase.from('perfis').update({
        nome: nome.trim(),
        whatsapp: whatsapp.trim(),
      }).eq('id', editando)
      if (error) throw error
      setMsg('✓ Dados atualizados com sucesso!')
      await carregar()
      cancelarEdicao()
    } catch (e) {
      setMsg('⚠ Erro: ' + e.message)
    }
    setSalvando(false)
    setTimeout(() => setMsg(''), 4000)
  }

  async function reenviarBoasVindas(aluna) {
    const confirmar = confirm(
      `Reenviar e-mail de boas-vindas para ${aluna.nome || aluna.email}?\n\nUma nova senha será gerada e enviada para ${aluna.email}. A senha antiga deixará de funcionar.`
    )
    if (!confirmar) return

    setReenviando(aluna.id); setMsg('')
    try {
      const response = await fetch('/api/reenviar-boas-vindas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunaId: aluna.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.erro || 'Falha ao reenviar e-mail')
      setMsg(`✓ E-mail reenviado para ${aluna.email}!`)
    } catch (e) {
      setMsg('⚠ Erro ao reenviar: ' + e.message)
    }
    setReenviando(null)
    setTimeout(() => setMsg(''), 5000)
  }

  function abrirNovaAluna() {
    setNovoNome(""); setNovoEmail(""); setNovaSenha(""); setNovoWhatsapp("")
    setMsg("")
    setMostrarForm(true)
  }

  function cancelarNovaAluna() {
    setMostrarForm(false)
    setNovoNome(""); setNovoEmail(""); setNovaSenha(""); setNovoWhatsapp("")
  }

  async function cadastrarAluna() {
    if (!novoNome.trim() || !novoEmail.trim() || !novaSenha) {
      setMsg("Nome, e-mail e senha sao obrigatorios.")
      return
    }
    if (novaSenha.length < 6) {
      setMsg("A senha precisa ter no minimo 6 caracteres.")
      return
    }
    setCadastrando(true); setMsg("")
    try {
      const sessionResult = await supabase.auth.getSession()
      const token = sessionResult.data.session ? sessionResult.data.session.access_token : null
      if (!token) throw new Error("Sessao expirada. Faca login novamente.")
      const response = await fetch("/api/criar-aluna", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim().toLowerCase(),
          senha: novaSenha,
          whatsapp: novoWhatsapp.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Falha ao cadastrar aluna")
      setMsg("Aluna " + data.aluna.nome + " cadastrada com sucesso! E-mail de boas-vindas enviado.")
      await carregar()
      cancelarNovaAluna()
    } catch (e) {
      setMsg("Erro: " + e.message)
    }
    setCadastrando(false)
    setTimeout(function() { setMsg("") }, 6000)
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

      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Escritório</button>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Administração</p>
          <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>👥 Gerenciar Alunas</p>
        </div>
        {!mostrarForm && (
          <button onClick={abrirNovaAluna} style={{ background: ouroGrad, color: "#0A0A0A", border: "none", borderRadius: "9px", padding: "10px 16px", fontSize: "13px", fontWeight: 800, cursor: "pointer", marginLeft: "auto" }}>+ Nova Aluna</button>
        )}
      </header>

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "24px 18px 0" }}>
        {msg && <p style={{ fontSize: "13px", color: msg.indexOf("Erro") === 0 || msg.indexOf("rro") > 0 ? "#e88" : "#5dca8a", margin: "0 0 16px", textAlign: "center" }}>{msg}</p>}

        {mostrarForm && (
          <div style={{ background: "#111111", border: "1px solid #D4AF37", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 16px" }}>Cadastrar nova aluna</h2>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#888", marginBottom: "6px" }}>Nome *</label>
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" style={{ width: "100%", padding: "11px 13px", background: "#0A0A0A", border: "1px solid #2A2A2A", borderRadius: "9px", fontSize: "14px", color: "#FFF", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#888", marginBottom: "6px" }}>E-mail *</label>
              <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="email@exemplo.com" style={{ width: "100%", padding: "11px 13px", background: "#0A0A0A", border: "1px solid #2A2A2A", borderRadius: "9px", fontSize: "14px", color: "#FFF", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#888", marginBottom: "6px" }}>Senha * (minimo 6 caracteres)</label>
              <input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Senha inicial" style={{ width: "100%", padding: "11px 13px", background: "#0A0A0A", border: "1px solid #2A2A2A", borderRadius: "9px", fontSize: "14px", color: "#FFF", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#888", marginBottom: "6px" }}>WhatsApp (opcional)</label>
              <input value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} placeholder="(00) 00000-0000" style={{ width: "100%", padding: "11px 13px", background: "#0A0A0A", border: "1px solid #2A2A2A", borderRadius: "9px", fontSize: "14px", color: "#FFF", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={cadastrarAluna} disabled={cadastrando} style={{ flex: 1, padding: "12px", background: ouroGrad, color: "#0A0A0A", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 800, cursor: "pointer" }}>{cadastrando ? "Cadastrando..." : "Cadastrar aluna"}</button>
              <button onClick={cancelarNovaAluna} style={{ padding: "12px 20px", background: "transparent", color: "#888", border: "1px solid #2A2A2A", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && <p style={{ fontSize: '13px', color: msg.startsWith('✓') ? '#5dca8a' : '#e88', margin: '0 0 16px', textAlign: 'center' }}>{msg}</p>}

        {alunas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#555' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>👥</div>
            <p style={{ fontSize: '14px', margin: 0 }}>Nenhuma aluna cadastrada ainda.</p>
          </div>
        ) : (
          alunas.map(aluna => (
            <div key={aluna.id} style={{ background: '#111111', border: `1px solid ${editando === aluna.id ? ouro : '#2A2A2A'}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>

              {editando === aluna.id ? (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>Nome</label>
                    <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo"
                      style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '6px' }}>WhatsApp</label>
                    <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000"
                      style={{ width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '14px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <p style={{ fontSize: '12px', color: '#666', margin: '0 0 14px' }}>{aluna.email}</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={salvar} disabled={salvando} style={{ flex: 1, padding: '11px', background: ouroGrad, color: '#0A0A0A', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                    <button onClick={cancelarEdicao} style={{ padding: '11px 18px', background: 'transparent', color: '#888', border: '1px solid #2A2A2A', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, flexShrink: 0 }}>
                    {(aluna.nome || aluna.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{aluna.nome || '(sem nome cadastrado)'}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0' }}>{aluna.email}</p>
                    {aluna.whatsapp && <p style={{ fontSize: '12px', color: '#888', margin: '1px 0 0' }}>📱 {aluna.whatsapp}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => reenviarBoasVindas(aluna)}
                      disabled={reenviando === aluna.id}
                      title="Gera uma nova senha e reenvia o e-mail de boas-vindas"
                      style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#5dca8a', padding: '8px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {reenviando === aluna.id ? 'Enviando...' : '✉️ Reenviar e-mail'}
                    </button>
                    <button onClick={() => abrirEdicao(aluna)} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Editar</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  )
}