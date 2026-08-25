'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OURO = '#D4AF37'
const GRADIENTE = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

function urlVideo(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      if (parsed.pathname.includes('/embed/')) return url
    }
    if (parsed.hostname === 'youtu.be') return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    if (parsed.hostname.includes('vimeo.com') && !parsed.hostname.includes('player.')) return `https://player.vimeo.com/video/${parsed.pathname.split('/').filter(Boolean).pop()}`
  } catch (_) {}
  return url
}

export default function Mentoria() {
  const router = useRouter()
  const [aulas, setAulas] = useState([])
  const [aulaId, setAulaId] = useState(null)
  const [concluidas, setConcluidas] = useState(new Set())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const resposta = await fetch('/api/mentoria', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      const dados = await resposta.json()
      if (resposta.status === 403) { setErro('As Aulas da Mentoria não estão incluídas no seu plano.'); setCarregando(false); return }
      if (!resposta.ok) { setErro(dados.error || 'Não foi possível carregar as aulas da Mentoria.'); setCarregando(false); return }
      const lista = dados.aulas || []
      const aulaNaUrl = new URLSearchParams(window.location.search).get('aula')
      setAulas(lista)
      setAulaId(atual => {
        const selecionada = atual || aulaNaUrl
        return selecionada && lista.some(aula => String(aula.id) === String(selecionada)) ? selecionada : lista[0]?.id || null
      })
      try {
        const salvas = JSON.parse(window.localStorage.getItem(`mentoria-concluidas-${user.id}`) || '[]')
        setConcluidas(new Set(salvas.map(String)))
      } catch (_) {}
      setCarregando(false)
    }
    carregar()
  }, [router])

  const aulaAtual = useMemo(() => aulas.find(aula => String(aula.id) === String(aulaId)) || aulas[0], [aulas, aulaId])
  const indiceAtual = aulas.findIndex(aula => aula.id === aulaAtual?.id)
  const percentual = aulas.length ? Math.round((concluidas.size / aulas.length) * 100) : 0

  function escolherAula(id) {
    setAulaId(id)
    router.replace(`/mentoria?aula=${id}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function alternarConclusao() {
    if (!aulaAtual) return
    const { data: { user } } = await supabase.auth.getUser()
    const id = String(aulaAtual.id)
    setConcluidas(atual => {
      const novo = new Set(atual)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      if (user) window.localStorage.setItem(`mentoria-concluidas-${user.id}`, JSON.stringify([...novo]))
      return novo
    })
  }

  if (carregando) return <Estado texto="Carregando Mentoria..." />
  if (erro) return <Estado texto={erro} botao={() => router.push('/painel')} />

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ minHeight: '64px', padding: '12px 20px', borderBottom: '1px solid #292929', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', position: 'sticky', top: 0, zIndex: 20, background: '#0A0A0A' }}>
        <button onClick={() => router.push('/painel')} style={botaoSecundario}>← Voltar ao painel</button>
        <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: '10px', color: OURO, fontWeight: 800, letterSpacing: '.1em' }}>ROTINA DA LOJA MILIONÁRIA</p><h1 style={{ margin: '2px 0 0', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Mentoria Mensal</h1></div>
        <strong style={{ fontSize: '12px', color: OURO, whiteSpace: 'nowrap' }}>{percentual}% concluído</strong>
      </header>

      <div className="mentoria-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', maxWidth: '1500px', margin: '0 auto' }}>
        <main style={{ padding: '26px', minWidth: 0 }}>
          {aulaAtual ? <>
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', border: '1px solid #292929', borderRadius: '16px', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
              {aulaAtual.video_url ? <iframe src={urlVideo(aulaAtual.video_url)} title={aulaAtual.titulo} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} /> : <span style={{ color: '#777' }}>🎬 Vídeo em breve</span>}
            </div>

            <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid #292929', marginTop: 20 }}>
              <button style={abaAtiva}>Informações</button>
            </div>

            <div style={{ padding: '22px 2px' }}>
              <p style={{ color: OURO, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 7px' }}>Aula da Mentoria</p>
              <h2 style={{ margin: '0 0 8px', fontSize: '24px' }}>{aulaAtual.titulo}</h2>
              {aulaAtual.descricao && <p style={{ color: '#AAA', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{aulaAtual.descricao}</p>}
              <button onClick={alternarConclusao} style={{ ...botaoPrincipal, background: concluidas.has(String(aulaAtual.id)) ? '#17351F' : GRADIENTE, color: concluidas.has(String(aulaAtual.id)) ? '#4ADE80' : '#0A0A0A' }}>{concluidas.has(String(aulaAtual.id)) ? '✓ Aula concluída' : 'Marcar como concluída'}</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '18px', borderTop: '1px solid #292929', paddingTop: '20px' }}>
              <button disabled={indiceAtual <= 0} onClick={() => escolherAula(aulas[indiceAtual - 1].id)} style={{ ...botaoSecundario, opacity: indiceAtual <= 0 ? .35 : 1 }}>← Aula anterior</button>
              <button disabled={indiceAtual >= aulas.length - 1} onClick={() => escolherAula(aulas[indiceAtual + 1].id)} style={{ ...botaoPrincipal, opacity: indiceAtual >= aulas.length - 1 ? .35 : 1 }}>Próxima aula →</button>
            </div>
          </> : <Estado texto="Nenhuma aula disponível na Mentoria." />}
        </main>

        <aside style={{ borderLeft: '1px solid #292929', padding: '22px 16px', background: '#101010' }}>
          <div style={{ height: '6px', background: '#262626', borderRadius: 99, overflow: 'hidden', marginBottom: '22px' }}><div style={{ width: `${percentual}%`, height: '100%', background: GRADIENTE }} /></div>
          <div style={{ border: '1px solid #292929', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ width: '100%', padding: '13px', background: '#171717', color: '#FFF', fontWeight: 800 }}>▾ Aulas da Mentoria <span style={{ color: '#777', fontWeight: 500 }}>· {aulas.length}</span></div>
            {aulas.map((aula, i) => <button key={aula.id} onClick={() => escolherAula(aula.id)} style={{ width: '100%', padding: '12px 13px', border: 0, borderTop: '1px solid #252525', background: aulaAtual?.id === aula.id ? '#211E13' : '#111', color: aulaAtual?.id === aula.id ? OURO : '#BBB', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: '9px' }}><span>{concluidas.has(String(aula.id)) ? '✓' : aula.ordem || i + 1}</span><span>{aula.titulo}</span></button>)}
          </div>
        </aside>
      </div>
      <style jsx global>{`@media (max-width:800px){.mentoria-layout{grid-template-columns:1fr!important}.mentoria-layout aside{border-left:0!important;border-top:1px solid #292929}.mentoria-layout main{padding:18px!important}} @media (max-width:520px){header strong{font-size:10px!important}}`}</style>
    </div>
  )
}

const botaoSecundario = { background: '#171717', color: '#DDD', border: '1px solid #333', borderRadius: '9px', padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }
const botaoPrincipal = { background: GRADIENTE, color: '#0A0A0A', border: 0, borderRadius: '9px', padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const abaAtiva = { background: 'transparent', color: OURO, border: 0, borderBottom: `2px solid ${OURO}`, padding: '0 0 10px', fontWeight: 800 }

function Estado({ texto, botao }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}><div><p>{texto}</p>{botao && <button onClick={botao} style={botaoPrincipal}>Voltar ao painel</button>}</div></div>
}
