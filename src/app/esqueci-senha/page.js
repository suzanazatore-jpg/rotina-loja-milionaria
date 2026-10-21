'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  async function handleEnviar(e) {
    e.preventDefault()
    setCarregando(true)
    setErro('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://rotina.suzanazatorre.com.br/redefinir-senha',
    })
    if (error) {
      setErro('Nao foi possivel enviar agora. Tente novamente em instantes.')
      setCarregando(false)
    } else {
      setEnviado(true)
      setCarregando(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0A', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'400px', background:'#111111', border:'1px solid #2A2A2A', borderRadius:'20px', padding:'40px 36px' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <p style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.15em', color:'#D4AF37', textTransform:'uppercase', margin:'0 0 8px' }}>Rotina da Loja Milionaria</p>
          <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#FFFFFF', margin:'0 0 6px' }}>Recuperar senha 🔑</h1>
          <p style={{ fontSize:'14px', color:'#666666', margin:0 }}>Enviaremos um link para o seu e-mail</p>
        </div>
        {enviado ? (
          <div>
            <div style={{ background:'#0A1A0F', border:'1px solid #1A5A2E', borderRadius:'10px', padding:'16px', marginBottom:'20px', fontSize:'13px', color:'#7BE0A3', lineHeight:1.5 }}>
              ✓ Se este e-mail estiver cadastrado, voce vai receber um link para criar uma nova senha. Confira sua caixa de entrada (e o spam).
            </div>
            <a href="/login" style={{ display:'block', textAlign:'center', width:'100%', padding:'14px', background:'linear-gradient(135deg, #D4AF37, #F5D76E)', color:'#0A0A0A', borderRadius:'10px', fontSize:'15px', fontWeight:'700', textDecoration:'none', boxSizing:'border-box' }}>Voltar para o login</a>
          </div>
        ) : (
          <>
            {erro && <div style={{ background:'#1A0A0A', border:'1px solid #5A1A1A', borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', fontSize:'13px', color:'#FF6B6B' }}>{erro}</div>}
            <form onSubmit={handleEnviar}>
              <div style={{ marginBottom:'24px' }}>
                <label style={{ display:'block', fontSize:'13px', color:'#999999', marginBottom:'8px' }}>E-mail</label>
                <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required style={{ width:'100%', padding:'13px 16px', background:'#1A1A1A', border:'1.5px solid #2A2A2A', borderRadius:'10px', fontSize:'15px', color:'#FFFFFF', outline:'none', boxSizing:'border-box' }} />
              </div>
              <button type="submit" disabled={carregando} style={{ width:'100%', padding:'14px', background: carregando ? '#2A2A2A' : 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: carregando ? '#666666' : '#0A0A0A', border:'none', borderRadius:'10px', fontSize:'15px', fontWeight:'700', cursor: carregando ? 'not-allowed' : 'pointer' }}>{carregando ? 'Enviando...' : 'Enviar link de recuperacao'}</button>
            </form>
            <p style={{ textAlign:'center', fontSize:'13px', color:'#888888', marginTop:'20px', marginBottom:0 }}>
              <a href="/login" style={{ color:'#D4AF37', textDecoration:'none' }}>← Voltar para o login</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
