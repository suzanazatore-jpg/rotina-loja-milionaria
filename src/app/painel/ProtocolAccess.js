'use client'

import Link from 'next/link'

export default function ProtocolAccess({ protocols = [], cores }) {
  if (!protocols.length) return null

  return <section aria-label="Seus protocolos" style={{ display: 'grid', gap: 14, margin: '20px 0' }}>
    {protocols.map(protocol => <article key={protocol.id} style={{ background: cores.card, color: cores.tx, border: '1px solid #D4AF37', borderRadius: 18, padding: 22 }}>
      <p style={{ margin: '0 0 8px', color: cores.tx2, fontSize: 12, fontWeight: 800 }}>SUA CAMPANHA EM 7 DIAS</p>
      <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(21px, 4vw, 28px)', lineHeight: 1.2 }}>{protocol.title}</h2>
      <p style={{ margin: '0 0 18px', color: cores.tx2, lineHeight: 1.6 }}>Acompanhe as missões, marque suas ações e registre as vendas do seu estoque.</p>
      <Link href={`/protocolo/${encodeURIComponent(protocol.slug)}`} style={{ display: 'inline-block', padding: '12px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: '#211A0E', fontWeight: 800, textDecoration: 'none' }}>Acessar Protocolo →</Link>
    </article>)}
  </section>
}
