'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import './bonus.css'
import { supabase } from '@/lib/supabase'
const PdfReader = dynamic(() => import('../protocolo/[slug]/ProtocolPdf'), { ssr: false })

async function fetchBonusWithToken(id, token) {
  const response = await fetch(`/api/bonus${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const sessionExpired = response.status === 401
    const error = new Error(sessionExpired
      ? 'Sua sessão expirou. Entre novamente para acessar os bônus.'
      : result.error || 'Não foi possível carregar os bônus.')
    error.needsLogin = sessionExpired
    throw error
  }
  return result
}

async function requestBonus(id) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) {
    const error = new Error('Sua sessão expirou. Entre novamente para acessar os bônus.')
    error.needsLogin = true
    throw error
  }

  try {
    return await fetchBonusWithToken(id, session.access_token)
  } catch (error) {
    if (!error.needsLogin) throw error

    // Uma sessão local pode estar desatualizada. Renova uma vez,
    // sem contornar a autenticação exigida pelo servidor.
    const { data, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !data?.session?.access_token) throw error
    return fetchBonusWithToken(id, data.session.access_token)
  }
}

export default function BonusArea({ cores, ouro, onBack }) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [opened, setOpened] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    requestBonus().then(result => { if (active) setMaterials(result.materials) }).catch(e => { if (active) { setError(e.message); setNeedsLogin(Boolean(e.needsLogin)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function open(item) {
    setBusy(true); setError(''); setNeedsLogin(false); setOpened(null)
    try { const result = await requestBonus(item.id); setOpened({ ...item, url: result.url }) }
    catch (e) { setError(e.message); setNeedsLogin(Boolean(e.needsLogin)) }
    finally { setBusy(false) }
  }
  const button = { border: `1px solid ${cores.borda}`, borderRadius: 9, padding: '10px 14px', background: cores.card, color: ouro, cursor: 'pointer' }
  return <section className="bonus-area" style={{ maxWidth: 900, margin: '0 auto', color: cores.tx }}>
    <button onClick={onBack} style={button}>← Voltar para Hoje</button>
    <h2>Bônus</h2><p style={{ color: cores.tx2 }}>Seus materiais complementares em PDF.</p>
    {loading && <p role="status">Carregando bônus…</p>}
    {error && <p role="alert">{error}</p>}
    {needsLogin && <button style={button} onClick={() => { void supabase.auth.signOut().finally(() => { window.location.assign('/login') }) }}>Entrar novamente</button>}
    {!loading && !error && !materials.length && <p>Os bônus aparecerão aqui quando forem disponibilizados para o seu acesso.</p>}
    <div style={{ display: 'grid', gap: 12 }}>{materials.map(item => <article key={item.id} style={{ padding: 20, border: `1px solid ${cores.borda}`, background: cores.card, borderRadius: 14 }}>
      <h3 style={{ margin: '0 0 6px' }}>{item.title}</h3><p style={{ color: cores.tx2, fontSize: 13 }}>{item.course_title}</p>
      <button disabled={busy} onClick={() => open(item)} style={button}>Ler PDF no app</button>
    </article>)}</div>
    {busy && <p role="status">Abrindo PDF…</p>}
    {opened && <div style={{ marginTop: 20 }}><h3>{opened.title}</h3><button style={button} onClick={() => setOpened(null)}>Recolher PDF</button><PdfReader key={opened.url} url={opened.url} /></div>}
  </section>
}
