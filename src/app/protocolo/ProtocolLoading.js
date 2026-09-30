export default function ProtocolLoading({ theme = 'claro' }) {
  const dark = theme === 'escuro'
  const card = { background: dark ? '#111' : '#fff', border: `1px solid ${dark ? '#2a2a2a' : '#e2e0d8'}`, borderRadius: 16, padding: 20, margin: '14px 0' }
  return <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: '100vh', width: '100%', background: dark ? '#0a0a0a' : '#f7f6f2', color: dark ? '#fff' : '#1a1a18', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
    <header style={{ background: '#141414', color: '#fff', padding: '18px max(18px, calc((100vw - 900px)/2))' }}>
      <span style={{ color: '#d4af37', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>SUZANA ZATORRE</span>
      <h1 style={{ fontSize: 17, margin: '6px 0 0' }}>Protocolo Zerando o Estoque em 7 Dias</h1>
    </header>
    <main style={{ maxWidth: 900, margin: 'auto', padding: 18 }}>
      <section style={card}><strong>Abrindo seu protocolo...</strong><p style={{ color: dark ? '#aaa' : '#686860', fontSize: 13, marginBottom: 0 }}>Preparando suas missões e seus registros.</p></section>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5, margin: '20px 0' }}>
        {Array.from({ length: 7 }, (_, index) => <div key={index} style={{ ...card, margin: 0, padding: '16px 0', textAlign: 'center', color: '#a7842e', fontWeight: 800 }}>{index+1}</div>)}
      </div>
      <div aria-hidden="true" style={{ ...card, height: 210, background: dark ? '#171717' : '#edeae2' }} />
    </main>
  </div>
}
