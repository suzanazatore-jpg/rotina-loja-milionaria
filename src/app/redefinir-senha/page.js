'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function RedefinirSenha() {
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let ativo = true
    async function preparar() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          try { await supabase.auth.exchangeCodeForSession(code) } catch (e) {}
        }
      } catch (e) {}
      const { data } = await supabase.auth.getSession()
      if (ativo && data.session) setPronto(true)
    }
    preparar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setPronto(true)
    })
    return () => { ativo = false; subscription.unsubscribe() }
  }, [])

  async function handleSalvar(e) {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas nao coincidem.'); return }
    setCarregando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro('Nao foi possivel alterar a senha. O link pode ter expirado — peca um novo.')
      setCarregando(false)
      return
    }
    await supabase.auth.signOut()
    setSucesso(true)
    setCarregando(false)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0A', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'400px', background:'#111111', border:'1px solid #2A2A2A', borderRadius:'20px', padding:'40px 36px' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <p style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.15em', color:'#D4AF37', textTransform:'uppercase', margin:'0 0 8px' }}>Rotina da Loja Milionaria</p>
          <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#FFFFFF', margin:'0 0 6px' }}>Criar nova senha 🔐</h1>
          <p style={{ fontSize:'14px', color:'#666666', margin:0 }}>Escolha uma senha nova para sua conta</p>
        </div>
        {sucesso ? (
          <div style={{ background:'#0A1A0F', border:'1px solid #1A5A2E', borderRadius:'10px', padding:'20px', textAlign:'center', fontSize:'14px', color:'#7BE0A3', lineHeight:1.5 }}>
            ✓ Senha alterada com sucesso!<br />Redirecionando para o login...
          </div>
        ) : !pronto ? (
          <div>
            {erro
              ? <div style={{ background:'#1A0A0A', border:'1px solid #5A1A1A', borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', fontSize:'13px', color:'#FF6B6B' }}>{erro}</div>
              : <p style={{ textAlign:'center', color:'#888888', fontSize:'14px', margin:'10px 0 20px' }}>Validando seu link...</p>}
            <a href="/esqueci-senha" style={{ display:'block', textAlign:'center', width:'100%', padding:'14px', background:'linear-gradient(135deg, #D4AF37, #F5D76E)', color:'#0A0A0A', borderRadius:'10px', fontSize:'15px', fontWeight:'700', textDecoration:'none', boxSizing:'border-box' }}>Pedir um novo link</a>
          </div>
        ) : (
          <>
            {erro && <div style={{ background:'#1A0A0A', border:'1px solid #5A1A1A', borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', fontSize:'13px', color:'#FF6B6B' }}>{erro}</div>}
            <form onSubmit={handleSalvar}>
              <div style={{ marginBottom:'16px' }}>
                <label style={{ display:'block', fontSize:'13px', color:'#999999', marginBottom:'8px' }}>Nova senha</label>
                <div style={{ position:'relative' }}>
                  <input type={mostrar ? 'text' : 'password'} placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} required style={{ width:'100%', padding:'13px 48px 13px 16px', background:'#1A1A1A', border:'1.5px solid #2A2A2A', borderRadius:'10px', fontSize:'15px', color:'#FFFFFF', outline:'none', boxSizing:'border-box' }} />
                  <button type="button" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Esconder senha' : 'Mostrar senha'} style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:'8px', fontSize:'18px', lineHeight:1, color:'#999999' }}>{mostrar ? '🙈' : '👁️'}</button>
                </div>
              </div>
              <div style={{ marginBottom:'24px' }}>
                <label style={{ display:'block', fontSize:'13px', color:'#999999', marginBottom:'8px' }}>Confirmar nova senha</label>
                <input type={mostrar ? 'text' : 'password'} placeholder="••••••••" value={senha2} onChange={e => setSenha2(e.target.value)} required style={{ width:'100%', padding:'13px 16px', background:'#1A1A1A', border:'1.5px solid #2A2A2A', borderRadius:'10px', fontSize:'15px', color:'#FFFFFF', outline:'none', boxSizing:'border-box' }} />
              </div>
              <button type="submit" disabled={carregando} style={{ width:'100%', padding:'14px', background: carregando ? '#2A2A2A' : 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: carregando ? '#666666' : '#0A0A0A', border:'none', borderRadius:'10px', fontSize:'15px', fontWeight:'700', cursor: carregando ? 'not-allowed' : 'pointer' }}>{carregando ? 'Salvando...' : 'Salvar nova senha'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
