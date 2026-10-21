'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SalesCenter from '@/app/painel/SalesCenter'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const cores = {
  fundo: '#0A0A0A',
  card: '#131313',
  card2: '#191919',
  borda: '#302D27',
  tx: '#FFFFFF',
  tx2: '#8C8C8C',
}

export default function AdminMetas() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)

  useEffect(() => {
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setAutorizado(session.user.email === ADMIN_EMAIL)
      setCarregando(false)
    }
    verificar()
  }, [router])

  if (carregando) return <div style={{ minHeight: '100vh', background: cores.fundo, color: cores.tx2, display: 'grid', placeItems: 'center' }}>Carregando...</div>
  if (!autorizado) return <div style={{ minHeight: '100vh', background: cores.fundo, color: cores.tx, display: 'grid', placeItems: 'center' }}>Acesso restrito ao administrador.</div>

  return (
    <div style={{ minHeight: '100vh', background: cores.fundo, color: cores.tx, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ padding: '14px 20px', borderBottom: `1px solid ${cores.borda}`, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
          <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: `1px solid ${cores.borda}`, color: ouro, borderRadius: '8px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>← Administração</button>
          <div><small style={{ color: ouro, fontWeight: 900, letterSpacing: '.11em' }}>CONTEÚDO DO APLICATIVO</small><h1 style={{ fontSize: '17px', margin: '2px 0 0' }}>Calculadora de Metas</h1></div>
        </div>
        <button onClick={() => router.push('/admin/planos')} style={{ background: ouroGrad, border: 0, color: '#090909', borderRadius: '9px', padding: '10px 15px', fontWeight: 900, cursor: 'pointer' }}>Definir acesso nos planos</button>
      </header>
      <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '26px 18px 70px' }}>
        <div style={{ background: '#18150B', border: '1px solid #594A17', color: '#F5D76E', borderRadius: '12px', padding: '13px 15px', marginBottom: '20px', fontSize: '13px', lineHeight: 1.5 }}>
          A calculadora está ativa. Cada lojista verá somente os dados da própria loja, e o acesso é liberado conforme o plano contratado.
        </div>
        <SalesCenter cores={cores} ouro={ouro} ouroGrad={ouroGrad} />
      </main>
    </div>
  )
}
