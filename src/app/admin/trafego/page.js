'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export default function AdminTrafego() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (!session) { router.replace('/login'); return }
      setAuthorized(session.user.email === ADMIN_EMAIL)
      setLoading(false)
    })
    return () => { active = false }
  }, [router])

  if (loading) return <main style={{background:'#0A0A0A',color:'#FFF',minHeight:'100vh',padding:32}}>Carregando...</main>
  if (!authorized) return <main style={{background:'#0A0A0A',color:'#FFF',minHeight:'100vh',padding:32}}>Acesso restrito ao escritório.</main>

  const box = { background:'#141414',border:'1px solid #34302A',borderRadius:14,padding:22 }
  return <main style={{minHeight:'100vh',background:'#0A0A0A',color:'#FFF',fontFamily:'-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',padding:'26px 18px 70px'}}>
    <div style={{maxWidth:1000,margin:'0 auto'}}>
      <button onClick={()=>router.push('/admin')} style={{background:'transparent',color:'#D4AF37',border:'1px solid #49402B',borderRadius:8,padding:'9px 14px',cursor:'pointer'}}>← Meu Escritório</button>
      <p style={{margin:'30px 0 7px',color:'#D4AF37',fontSize:12,fontWeight:700,letterSpacing:1}}>GESTÃO DE CLIENTES</p>
      <h1 style={{fontSize:30,margin:'0 0 8px'}}>Meu Tráfego Pago</h1>
      <p style={{color:'#AAA',lineHeight:1.6,margin:'0 0 24px'}}>Central administrativa de acompanhamento das contas de anúncios e dos relatórios enviados às lojistas.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:12,marginBottom:24}}>
        {[['17','Contas cadastradas'],['14','MCP habilitado'],['3','Integrações pendentes']].map(([number,label])=><div key={label} style={box}><strong style={{display:'block',fontSize:30,color:'#D4AF37'}}>{number}</strong><span style={{color:'#AAA',fontSize:13}}>{label}</span></div>)}
      </div>
      <section style={box}>
        <h2 style={{margin:'0 0 10px',fontSize:19}}>Relatórios semanais e mensais</h2>
        <p style={{color:'#BBB',fontSize:14,lineHeight:1.7,margin:'0 0 8px'}}>A estrutura privada dos relatórios já foi preparada no Supabase. A publicação e as notificações ainda não estão ativadas.</p>
        <p style={{color:'#D4AF37',fontSize:13,margin:0}}>Em configuração — nenhuma notificação será enviada automaticamente nesta etapa.</p>
      </section>
    </div>
  </main>
}
