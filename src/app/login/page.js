'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getRememberLoginPreference,
  getStoredLoginEmail,
  setRememberLoginPreference,
  storeLoginEmail,
} from '@/lib/authStorage'
import { useRouter } from 'next/navigation'

// ════════ SUPORTE (WhatsApp) ════════
// Suporte de acesso/login (esqueci senha, e-mail errado, não consigo entrar)
const WHATSAPP_SUPORTE_LOGIN = 'https://api.whatsapp.com/send?phone=558499814124&text=Tenho%20uma%20d%C3%BAvida'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [manterConectada, setManterConectada] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setManterConectada(getRememberLoginPreference())
      setEmail(getStoredLoginEmail())
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setCarregando(true)
    setErro('')
    const emailNormalizado = email.trim().toLowerCase()
    setRememberLoginPreference(manterConectada)
    const { error } = await supabase.auth.signInWithPassword({ email: emailNormalizado, password: senha })
    if (error) { setErro('E-mail ou senha incorretos.'); setCarregando(false) }
    else {
      storeLoginEmail(emailNormalizado, manterConectada)
      router.push('/painel')
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0A', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'400px', background:'#111111', border:'1px solid #2A2A2A', borderRadius:'20px', padding:'40px 36px' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <p style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.15em', color:'#D4AF37', textTransform:'uppercase', margin:'0 0 8px' }}>Rotina da Loja Milionária</p>
          <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#FFFFFF', margin:'0 0 6px' }}>Bem-vinda de volta 👋</h1>
          <p style={{ fontSize:'14px', color:'#666666', margin:0 }}>Acesse sua área exclusiva</p>
        </div>
        {erro && <div style={{ background:'#1A0A0A', border:'1px solid #5A1A1A', borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', fontSize:'13px', color:'#FF6B6B' }}>{erro}</div>}
        <form onSubmit={handleLogin} autoComplete="on">
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'13px', color:'#999999', marginBottom:'8px' }}>E-mail</label>
            <input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck="false" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required style={{ width:'100%', padding:'13px 16px', background:'#1A1A1A', border:'1.5px solid #2A2A2A', borderRadius:'10px', fontSize:'15px', color:'#FFFFFF', outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'13px', color:'#999999', marginBottom:'8px' }}>Senha</label>
            <div style={{ position:'relative' }}>
              <input type={mostrarSenha ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} required style={{ width:'100%', padding:'13px 48px 13px 16px', background:'#1A1A1A', border:'1.5px solid #2A2A2A', borderRadius:'10px', fontSize:'15px', color:'#FFFFFF', outline:'none', boxSizing:'border-box' }} />
              <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'} style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:'8px', fontSize:'18px', lineHeight:1, color:'#999999' }}>{mostrarSenha ? '🙈' : '👁️'}</button>
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'22px', cursor:'pointer' }}>
            <input type="checkbox" checked={manterConectada} onChange={e => setManterConectada(e.target.checked)} style={{ width:'17px', height:'17px', margin:'1px 0 0', accentColor:'#D4AF37', flex:'0 0 auto' }} />
            <span>
              <span style={{ display:'block', color:'#D8D8D8', fontSize:'13px', fontWeight:600 }}>Manter-me conectada neste aparelho</span>
              <span style={{ display:'block', color:'#666666', fontSize:'11px', marginTop:'3px', lineHeight:1.35 }}>Use esta opção somente em um aparelho pessoal.</span>
            </span>
          </label>
          <button type="submit" disabled={carregando} style={{ width:'100%', padding:'14px', background: carregando ? '#2A2A2A' : 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: carregando ? '#666666' : '#0A0A0A', border:'none', borderRadius:'10px', fontSize:'15px', fontWeight:'700', cursor: carregando ? 'not-allowed' : 'pointer' }}>{carregando ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <p style={{ textAlign:'center', fontSize:'13px', marginTop:'20px', marginBottom:0 }}>
          <a href="/esqueci-senha" style={{ color:'#D4AF37', textDecoration:'none', fontWeight:'600' }}>Esqueci minha senha</a>
        </p>
        <p style={{ textAlign:'center', fontSize:'12px', color:'#444444', marginTop:'14px', marginBottom:0 }}>Problemas? <a href={WHATSAPP_SUPORTE_LOGIN} target="_blank" rel="noopener noreferrer" style={{ color:'#D4AF37', textDecoration:'none' }}>WhatsApp</a></p>
      </div>
    </div>
  )
}
