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
  const [programas, setProgramas] = useState([])
  const [programa, setPrograma] = useState(null)
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
      const liberados = dados.programas || []
      const aulaNaUrl = new URLSearchParams(window.location.search).get('aula')
      const programaNaUrl = new URLSearchParams(window.location.search).get('programa')
      setAulas(lista)
      setProgramas(liberados)
      setPrograma(programaNaUrl && liberados.includes(programaNaUrl) ? programaNaUrl : aulaNaUrl ? (lista.find(a => String(a.id) === String(aulaNaUrl))?.mentorship_type || null) : null)
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

  const aulasPrograma = useMemo(() => aulas.filter(aula => (aula.mentorship_type || 'evs') === programa), [aulas, programa])
  const aulaAtual = useMemo(() => aulasPrograma.find(aula => String(aula.id) === String(aulaId)) || aulasPrograma[0], [aulasPrograma, aulaId])
  const indiceAtual = aulasPrograma.findIndex(aula => aula.id === aulaAtual?.id)
  const concluidasPrograma = aulasPrograma.filter(a => concluidas.has(String(a.id))).length
  const percentual = aulasPrograma.length ? Math.round((concluidasPrograma / aulasPrograma.length) * 100) : 0

  function abrirPrograma(tipo) {
    const primeira = aulas.find(aula => (aula.mentorship_type || 'evs') === tipo)
    setPrograma(tipo)
    setAulaId(primeira?.id || null)
    router.replace(`/mentoria?programa=${tipo}`, { scroll: false })
  }

  function escolherAula(id) {
    setAulaId(id)
    router.replace(`/mentoria?programa=${programa}&aula=${id}`, { scroll: false })
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
        <button onClick={() => programa ? (setPrograma(null), setAulaId(null), router.replace('/mentoria')) : router.push('/painel')} style={botaoSecundario}>← {programa ? 'Mentorias' : 'Voltar ao painel'}</button>
        <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: '10px', color: OURO, fontWeight: 800, letterSpacing: '.1em' }}>ROTINA DA LOJA MILIONÁRIA</p><h1 style={{ margin: '2px 0 0', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{programa ? `Mentoria ${programa.toUpperCase()}` : 'Aulas da Mentoria'}</h1></div>
        {programa && <strong style={{ fontSize: '12px', color: OURO, whiteSpace: 'nowrap' }}>{percentual}% concluído</strong>}
      </header>

      {!programa ? <main className="mentoria-hub">
        <div className="mentoria-intro"><p>MENTORIAS LIBERADAS</p><h2>Escolha sua mentoria</h2><span>Acesse as gravações disponíveis no seu plano.</span></div>
        <div className="mentoria-capas">{programas.map(tipo => <button key={tipo} onClick={() => abrirPrograma(tipo)} className={`mentoria-capa mentoria-capa-${tipo}`}><div className="mentoria-capa-arte"><small>SUZANA ZATORRE</small><strong>MENTORIA<br />{tipo.toUpperCase()}</strong><span>Estratégia • Equipe • Resultados</span><b>▶</b></div><div className="mentoria-capa-info"><strong>Mentoria {tipo.toUpperCase()}</strong><span>{aulas.filter(a => (a.mentorship_type || 'evs') === tipo).length} aula(s) disponível(is)</span></div></button>)}</div>
      </main> : <div className="mentoria-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', maxWidth: '1500px', margin: '0 auto' }}>
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
              <button disabled={indiceAtual <= 0} onClick={() => escolherAula(aulasPrograma[indiceAtual - 1].id)} style={{ ...botaoSecundario, opacity: indiceAtual <= 0 ? .35 : 1 }}>← Aula anterior</button>
              <button disabled={indiceAtual >= aulasPrograma.length - 1} onClick={() => escolherAula(aulasPrograma[indiceAtual + 1].id)} style={{ ...botaoPrincipal, opacity: indiceAtual >= aulasPrograma.length - 1 ? .35 : 1 }}>Próxima aula →</button>
            </div>
          </> : <Estado texto="Nenhuma aula disponível na Mentoria." />}
        </main>

        <aside style={{ borderLeft: '1px solid #292929', padding: '22px 16px', background: '#101010' }}>
          <div style={{ height: '6px', background: '#262626', borderRadius: 99, overflow: 'hidden', marginBottom: '22px' }}><div style={{ width: `${percentual}%`, height: '100%', background: GRADIENTE }} /></div>
          <div style={{ border: '1px solid #292929', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ width: '100%', padding: '13px', background: '#171717', color: '#FFF', fontWeight: 800 }}>▾ Mentoria {programa.toUpperCase()} <span style={{ color: '#777', fontWeight: 500 }}>· {aulasPrograma.length}</span></div>
            {aulasPrograma.map((aula, i) => <button key={aula.id} onClick={() => escolherAula(aula.id)} style={{ width: '100%', padding: '12px 13px', border: 0, borderTop: '1px solid #252525', background: aulaAtual?.id === aula.id ? '#211E13' : '#111', color: aulaAtual?.id === aula.id ? OURO : '#BBB', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: '9px' }}><span>{concluidas.has(String(aula.id)) ? '✓' : aula.ordem || i + 1}</span><span>{aula.titulo}</span></button>)}
          </div>
        </aside>
      </div>}
      <style jsx global>{`.mentoria-hub{max-width:1100px;margin:0 auto;padding:46px 24px}.mentoria-intro p{margin:0;color:${OURO};font-size:11px;font-weight:900;letter-spacing:.12em}.mentoria-intro h2{font-family:Georgia,serif;font-size:32px;margin:8px 0}.mentoria-intro span{color:#999}.mentoria-capas{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,280px));gap:20px;margin-top:28px}.mentoria-capa{padding:0;background:#121212;border:1px solid #303030;border-radius:15px;overflow:hidden;color:#fff;text-align:left;cursor:pointer;transition:.2s}.mentoria-capa:hover{transform:translateY(-4px);border-color:${OURO}}.mentoria-capa-arte{aspect-ratio:2/3;padding:24px;position:relative;display:flex;flex-direction:column;justify-content:flex-end;background:radial-gradient(circle at 75% 20%,#735c17 0,transparent 28%),linear-gradient(145deg,#050505 38%,#2c240b 70%,#050505);overflow:hidden}.mentoria-capa-cvm .mentoria-capa-arte{background:radial-gradient(circle at 75% 20%,#6a2444 0,transparent 28%),linear-gradient(145deg,#050505 38%,#321222 70%,#050505)}.mentoria-capa-arte:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(125deg,transparent 0 26px,rgba(212,175,55,.11) 27px 28px)}.mentoria-capa-arte small,.mentoria-capa-arte strong,.mentoria-capa-arte span{position:relative;z-index:1}.mentoria-capa-arte small{color:${OURO};font-weight:900;letter-spacing:.13em}.mentoria-capa-arte strong{font-family:Georgia,serif;font-size:38px;line-height:.95;margin:13px 0}.mentoria-capa-arte span{font-size:10px;color:#bbb}.mentoria-capa-arte b{position:absolute;right:18px;top:18px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.7);border:1px solid #777}.mentoria-capa-info{padding:15px;display:flex;flex-direction:column;gap:5px}.mentoria-capa-info span{font-size:12px;color:#888}@media (max-width:800px){.mentoria-layout{grid-template-columns:1fr!important}.mentoria-layout aside{border-left:0!important;border-top:1px solid #292929}.mentoria-layout main{padding:18px!important}.mentoria-hub{padding:28px 18px}.mentoria-capas{grid-template-columns:repeat(2,minmax(0,1fr))}.mentoria-capa-arte{padding:15px}.mentoria-capa-arte strong{font-size:27px}}@media (max-width:520px){header strong{font-size:10px!important}.mentoria-capas{grid-template-columns:1fr}.mentoria-capa{max-width:280px}}`}</style>
    </div>
  )
}

const botaoSecundario = { background: '#171717', color: '#DDD', border: '1px solid #333', borderRadius: '9px', padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }
const botaoPrincipal = { background: GRADIENTE, color: '#0A0A0A', border: 0, borderRadius: '9px', padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const abaAtiva = { background: 'transparent', color: OURO, border: 0, borderBottom: `2px solid ${OURO}`, padding: '0 0 10px', fontWeight: 800 }

function Estado({ texto, botao }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}><div><p>{texto}</p>{botao && <button onClick={botao} style={botaoPrincipal}>Voltar ao painel</button>}</div></div>
}
