'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { protocolDay, protocolGuidance } from '@/lib/protocolGuidance'
import { PROTOCOL_DAYS } from '@/lib/protocolContent'
import { PROTOCOL_EDITING_OPEN } from '@/lib/protocolEditing'
import NotificationPreference from '@/app/painel/NotificationPreference'
import './protocolo.css'

const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100)
const DEMO_SLUG = 'protocolo-desencalhando-estoque-7-dias'
const DEMO_COURSE_ID = '9276bff2-8bbe-4ff9-83f1-c3ba8323bc7d'
const digits = raw => {
  const value = String(raw || '').trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (/^\d+\.\d{1,2}$/.test(value)) return Math.round(Number(value) * 100)
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(value) && !/^\d+(?:,\d{1,2})?$/.test(value)) return NaN
  return Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100)
}
function embed(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return ''
    if (['video.smartplayer.ai', 'video.smartplayer.io'].includes(u.hostname)) return u.href
    if (u.hostname === 'player.scaleup.com.br' && /^\/embed\/[a-zA-Z0-9-]+$/.test(u.pathname)) return u.href
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (u.hostname.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.match(/^\/embed\/([^/]+)/)?.[1]
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
    if (u.hostname === 'vimeo.com') return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).pop()}`
    if (u.hostname === 'player.vimeo.com') return url
  } catch {}
  return ''
}

export default function Protocolo({ params }) {
  const { slug } = use(params)
  const router = useRouter()
  const [pdfUrl, setPdfUrl] = useState('')
  const [theme] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('rotina-tema') === 'escuro' ? 'escuro' : 'claro')
  const [course, setCourse] = useState(null)
  const [lessons, setLessons] = useState([])
  const [materials, setMaterials] = useState([])
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [lot, setLot] = useState('')
  const [stock, setStock] = useState('')
  const [goal, setGoal] = useState('')
  const [saleValue, setSaleValue] = useState('')
  const [salePieces, setSalePieces] = useState('1')
  const [sound, setSound] = useState(true)
  const [checks, setChecks] = useState([])
  const [piecesPosted, setPiecesPosted] = useState('')
  const [invites, setInvites] = useState('')
  const [conversations, setConversations] = useState('')
  const [note, setNote] = useState('')
  const [help, setHelp] = useState('')
  const [showSales, setShowSales] = useState(false)
  const [revenueBand, setRevenueBand] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [preview, setPreview] = useState(false)
  const [demo, setDemo] = useState(false)
  function loadDraft(item, entries) {
    const saved = entries.find(row => row.lesson_id === item?.id)
    const items = Array.isArray(item?.protocol_checklist) ? item.protocol_checklist.filter(value => typeof value === 'string' && value.trim()) : []
    setChecks(items.map((_, index) => saved?.checklist?.[index] === true))
    setPiecesPosted(saved?.pieces_posted == null ? '' : String(saved.pieces_posted))
    setInvites(saved?.invited_count == null ? '' : String(saved.invited_count))
    setConversations(saved?.conversations_count == null ? '' : String(saved.conversations_count))
    setNote(saved?.note || '')
    setFeedback(null);setHelp('')
  }

  const call = useCallback(async (action) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace(`/login?next=${encodeURIComponent(`/protocolo/${slug}${window.location.search}`)}`); throw new Error('Entre na sua conta para continuar.') }
    const response = await fetch(action ? '/api/protocolo' : `/api/protocolo?slug=${encodeURIComponent(slug)}`, { method: action ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}`, ...(action ? { 'Content-Type': 'application/json' } : {}) }, body: action ? JSON.stringify({ slug, ...action }) : undefined })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível continuar.')
    return result
  }, [slug, router])
  useEffect(() => {
    let active = true
    async function load() {
      try {
        if (slug === DEMO_SLUG && new URLSearchParams(window.location.search).get('demo') === '1') {
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
          const sampleLessons = PROTOCOL_DAYS.map((item, index) => ({ id: `demo-dia-${index + 1}`, title: item.title, description: item.description, protocol_checklist: item.checks, video_url: null }))
          if (!active) return
          setDemo(true);setPreview(true)
          setCourse({ id: DEMO_COURSE_ID, title: 'Protocolo Desencalhando Estoque em 7 Dias', slug: DEMO_SLUG })
          setLessons(sampleLessons);setMaterials([])
          setData({ run: { lot_name: 'Exemplo: coleção anterior', starting_pieces: 30, goal_cents: 300000, started_on: today }, entries: [], sales: [], today })
          setSelected(0);loadDraft(sampleLessons[0], [])
          return
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace(`/login?next=${encodeURIComponent(`/protocolo/${slug}${window.location.search}`)}`); return }
        const previewRequested = new URLSearchParams(window.location.search).get('preview') === '1'
        if (previewRequested) {
          const { data: { session } } = await supabase.auth.getSession()
          const response = await fetch(`/api/admin/protocolo?preview=1&slug=${encodeURIComponent(slug)}`, {
            headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Não foi possível abrir a prévia.')
          if (!active) return
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
          setPreview(true);setCourse(result.course);setLessons(result.lessons.slice(0, 7));setMaterials(result.materials)
          setData({ run: { lot_name: 'Exemplo: coleção anterior', starting_pieces: 30, goal_cents: 300000, started_on: today }, entries: [], sales: [], today })
          setSelected(0);loadDraft(result.lessons[0],[])
          return
        }
        const { data: c, error: ce } = await supabase.from('courses').select('id,slug,title,subtitle,protocol_enabled,protocol_offer_url,is_published').eq('slug', slug).eq('is_published', true).maybeSingle()
        if (ce || !c?.protocol_enabled) throw new Error('Este protocolo não está disponível.')
        const state = await call()
        const [ls, ms] = await Promise.all([
          supabase.from('lessons').select('id,title,description,video_url,duration_label,protocol_checklist,sort_order,created_at').eq('course_id', c.id).eq('is_published', true).order('sort_order').order('created_at'),
          supabase.from('materials').select('id,title,lesson_id,file_url').eq('course_id', c.id).eq('is_published', true).order('sort_order'),
        ])
        if (ls.error || ms.error) throw new Error('Não foi possível carregar as aulas.')
        if (!active) return
        setCourse(c);setLessons((ls.data || []).slice(0, 7));setMaterials(ms.data || []);setData(state)
        setRevenueBand(state.run?.monthly_revenue_band || '')
        setTeamSize(state.run?.team_size == null ? '' : String(state.run.team_size))
        const today = PROTOCOL_EDITING_OPEN ? 7 : state.run ? protocolDay(state.run.started_on, state.today) : 1
        const requested = new URLSearchParams(window.location.search).get('aula')
        const fromLink = (ls.data || []).findIndex(item => item.id === requested)
        const initial = fromLink >= 0 && fromLink < today ? fromLink : (PROTOCOL_EDITING_OPEN ? 0 : Math.max(0, today - 1))
        setSelected(initial);loadDraft((ls.data || [])[initial],state.entries)
      } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [slug, router, call])

  const day = preview || PROTOCOL_EDITING_OPEN ? 7 : data?.run ? protocolDay(data.run.started_on, data.today) : 0
  const lesson = lessons[selected]
  const entry = data?.entries.find(item => item.lesson_id === lesson?.id)
  const checklist = Array.isArray(lesson?.protocol_checklist) ? lesson.protocol_checklist.filter(item => typeof item === 'string' && item.trim()) : []
  const totalCents = useMemo(() => (data?.sales || []).reduce((sum, sale) => sum + Number(sale.amount_cents), 0), [data])
  const soldPieces = useMemo(() => (data?.sales || []).reduce((sum, sale) => sum + Number(sale.pieces), 0), [data])
  const completedCount = lessons.filter(item => data?.entries.some(row => row.lesson_id === item.id && row.completed_at)).length
  const percent = data?.run ? Math.min(100, Math.round(totalCents / Number(data.run.goal_cents) * 100)) : 0

  async function submit(action, after) {
    setBusy(true);setError('')
    try {
      if (preview) {
        const next = { ...data }
        if (action.action === 'sale') next.sales = [{ id: `preview-${Date.now()}`, amount_cents: action.amount_cents, pieces: action.pieces, created_at: new Date().toISOString() }, ...data.sales]
        if (action.action === 'undo_sale') next.sales = data.sales.filter(item => item.id !== action.sale_id)
        if (action.action === 'entry') {
          const entry = { lesson_id: action.lesson_id, checklist: action.checklist, pieces_posted: action.pieces_posted, invited_count: action.invited_count, conversations_count: action.conversations_count, note: action.note, completed_at: action.complete ? new Date().toISOString() : null }
          next.entries = [...data.entries.filter(item => item.lesson_id !== action.lesson_id), entry]
          next.guidance = protocolGuidance({ checks: action.checklist, pieces: Number(action.pieces_posted || 0), invites: Number(action.invited_count || 0), conversations: Number(action.conversations_count || 0) })
        }
        if (action.action === 'qualify') next.run = { ...data.run, monthly_revenue_band: action.monthly_revenue_band, team_size: action.team_size }
        setData(next);after?.(next)
      } else { const next = await call(action);setData(next);after?.(next) }
    }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  function playSound() {
    if (!sound) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx(), start = ctx.currentTime
      ;[784,1046,1318].forEach((hz,i) => { const o=ctx.createOscillator(),g=ctx.createGain(),at=start+i*.09;o.frequency.value=hz;g.gain.setValueAtTime(.05,at);g.gain.exponentialRampToValueAtTime(.001,at+.28);o.connect(g);g.connect(ctx.destination);o.start(at);o.stop(at+.3) })
      setTimeout(() => ctx.close(), 1000)
    } catch {}
  }
  async function downloadMaterial(item) {
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/material-curso?id=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      const result = await response.json()
      if (!response.ok || !result.url) throw new Error(result.error || 'Material indisponível.')
      setPdfUrl(result.url)
    } catch (e) { setError(e.message) }
  }
  function selectDay(index) {
    if (index >= day) return
    setPdfUrl('');setSelected(index);loadDraft(lessons[index],data.entries);router.replace(`/protocolo/${slug}?${demo?'demo=1&':preview?'preview=1&':''}aula=${lessons[index].id}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  if (loading) return <div className="pro-page pro-center">Abrindo seu Protocolo...</div>
  if (!course || !data) return <div className="pro-page pro-center"><p>{error || 'Protocolo não disponível.'}</p><button onClick={() => router.push('/painel?secao=conteudos')}>Voltar</button></div>

  return <div className={`pro-page pro-theme-${theme}`}>
    <header className="pro-header"><div><span className="pro-overline">Suzana Zatorre · meu curso</span><h1>{course.title}</h1></div><button className="pro-quiet" onClick={async()=>{if(preview){router.push(`/admin/cursos/conteudo?id=${course.id}`);return}await supabase.auth.signOut();router.replace('/login')}}>{preview?'← Voltar ao ADM':'Sair'}</button></header>
    <main className="pro-main">
      {!preview && <button className="pro-quiet" onClick={() => router.push('/painel?secao=conteudos')}>← Voltar ao painel</button>}
      {preview&&<div className="pro-preview" role="status"><strong>{demo?'Demonstração do aplicativo':'Prévia do ADM'}</strong> · dados fictícios. Você pode navegar e testar os registros; nada aqui é salvo na conta da aluna.</div>}
      {error && <div role="alert" className="pro-error">{error}</div>}
      {lesson && <section className="pro-card pro-lesson-first"><div className="pro-video">{embed(lesson.video_url) ? <iframe key={lesson.id} src={embed(lesson.video_url)} title={lesson.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> : <p>Vídeo ainda não disponível.</p>}</div><span className="pro-overline">Dia {selected+1} de 7 · aula + missão</span><h2>{lesson.title}</h2><p>{lesson.description}</p></section>}
      <nav className="pro-days" aria-label="Dias do Protocolo">{lessons.map((item,index)=><button key={item.id} disabled={index>=day} aria-current={index===selected?'step':undefined} onClick={()=>selectDay(index)}><span>Dia {index+1}</span><strong>{data.entries.some(row=>row.lesson_id===item.id&&row.completed_at)?'✓':index>=day?'🔒':String(index+1)}</strong></button>)}</nav>
      {lesson && <section className="pro-card"><span className="pro-overline">Tarefa do dia</span>{materials.filter(item=>item.lesson_id===lesson.id).map(item=><button key={item.id} className="pro-material" onClick={()=>downloadMaterial(item)}>Abrir {item.title} <span>Ler PDF no aplicativo</span></button>)}{pdfUrl && <iframe className="pro-pdf" src={pdfUrl} title="PDF da tarefa do dia" />}</section>}
      {!data.run ? <section className="pro-card pro-start"><span className="pro-overline">Antes de começar</span><h2>Escolha um lote para trabalhar por 7 dias</h2><p>Separe as peças paradas que você quer vender nesta campanha. Use uma meta que faça sentido para esse lote.</p>
        <label>Nome do lote<input value={lot} maxLength={120} onChange={e=>setLot(e.target.value)} placeholder="Ex.: vestidos da coleção anterior" /></label>
        <div className="pro-fields"><label>Peças no lote<input type="number" min="1" value={stock} onChange={e=>setStock(e.target.value)} placeholder="Ex.: 30" /></label><label>Meta de vendas (R$)<input inputMode="decimal" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Ex.: 3000,00" /></label></div>
        {lessons.length!==7||lessons.some(item=>!Array.isArray(item.protocol_checklist)||!item.protocol_checklist.length)?<p>As sete missões ainda estão sendo preparadas pela Suzana.</p>:<button className="pro-primary" disabled={busy} onClick={()=>submit({action:'start',lot_name:lot,starting_pieces:Number(stock),goal_cents:digits(goal)})}>{busy?'Preparando...':'Começar meu Protocolo'}</button>}
      </section> : <>
        <section className="pro-hero"><div><span className="pro-overline">Sua campanha · {data.run.lot_name}</span><h2>{money(totalCents)} <small>em vendas registradas</small></h2><p>{soldPieces} de {data.run.starting_pieces} peças vendidas · {completedCount} de {lessons.length} missões concluídas</p></div><div className="pro-goal"><strong>{percent}% da meta</strong><span>{money(data.run.goal_cents)}</span><div className="pro-bar"><span style={{width:`${percent}%`}} /></div></div></section>
        {lesson ? <>
          <section className="pro-card"><span className="pro-overline">A tarefa de hoje</span><h2>Faça e marque cada passo</h2>{checklist.length?<div className="pro-checklist">{checklist.map((item,index)=><label key={`${lesson.id}-${index}`} className="pro-check"><input type="checkbox" checked={!!checks[index]} onChange={e=>setChecks(old=>old.map((v,i)=>i===index?e.target.checked:v))} />{item}</label>)}</div>:<p>A tarefa deste dia será publicada pela Suzana.</p>}
          </section>
          <section className="pro-card"><span className="pro-overline">Seu registro</span><h2>O que você fez?</h2><p>Esses dados ajudam a orientar sua próxima ação.</p><div className="pro-fields pro-three"><label>Peças postadas<input type="number" min="0" value={piecesPosted} onChange={e=>setPiecesPosted(e.target.value)} placeholder="0" /></label><label>Clientes convidadas<input type="number" min="0" value={invites} onChange={e=>setInvites(e.target.value)} placeholder="0" /></label><label>Conversas<input type="number" min="0" value={conversations} onChange={e=>setConversations(e.target.value)} placeholder="0" /></label></div>
            <label>Me conte como foi<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: mostrei 8 vestidos nos stories e convidei 20 clientes..." /></label>
            <button className="pro-primary" disabled={busy||!checklist.length} onClick={()=>submit({action:'entry',lesson_id:lesson.id,checklist:checks,pieces_posted:piecesPosted,invited_count:invites,conversations_count:conversations,note,complete:checks.length>0&&checks.every(Boolean)},next=>setFeedback(next.guidance))}>{busy?'Salvando...':entry?.completed_at?'Atualizar meu registro':'Salvar e receber orientação'}</button>
            {feedback&&<div role="status" className="pro-feedback"><strong>{feedback.title}</strong><ul>{feedback.actions.map((action,index)=><li key={index}>{action}</li>)}</ul><small>A orientação considera os números e o checklist. Seu relato também fica registrado.</small></div>}
          </section>
        {!preview&&<section className="pro-card"><NotificationPreference cores={{borda:'#e2e0d8',card:'#fff',card2:'#f7f6f2',tx:'#1a1a18',tx2:'#686860'}} description="Ative as notificações do aplicativo para receber a missão de cada dia. O aviso abre a aula correspondente." /></section>}
        <section className="pro-card pro-sale"><div className="pro-headline"><div><span className="pro-overline">Resultado em tempo real</span><h2>Registrar uma venda</h2></div><button className="pro-quiet" onClick={()=>setShowSales(!showSales)}>{showSales?'Ocultar':'Ver'} lançamentos</button></div>
          <div className="pro-fields"><label>Valor da venda (R$)<input inputMode="decimal" value={saleValue} onChange={e=>setSaleValue(e.target.value)} placeholder="Ex.: 199,90" /></label><label>Peças vendidas<input type="number" min="1" value={salePieces} onChange={e=>setSalePieces(e.target.value)} /></label></div>
          <label className="pro-check"><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)} /> Tocar som ao confirmar</label>
          <button className="pro-primary" disabled={busy} onClick={()=>submit({action:'sale',amount_cents:digits(saleValue),pieces:Number(salePieces)},()=>{setSaleValue('');setSalePieces('1');playSound()})}>{busy?'Salvando...':'Confirmar venda'}</button>
          {showSales && <ul className="pro-sales-list">{data.sales.length ? data.sales.map((sale,i)=><li key={sale.id}><span>{sale.pieces} {sale.pieces===1?'peça':'peças'} · {new Date(sale.created_at).toLocaleDateString('pt-BR')}</span><strong>{money(sale.amount_cents)}</strong>{i===0&&<button disabled={busy} onClick={()=>submit({action:'undo_sale',sale_id:sale.id})}>Desfazer</button>}</li>):<li>Nenhuma venda lançada ainda.</li>}</ul>}
        </section>
          <section className="pro-card"><button className="pro-help-toggle" onClick={()=>setHelp(help?'':'options')}>Ainda não vendi. O que faço? {help?'−':'+'}</button>{help&&<div className="pro-help">{['Poucas clientes viram','Viram, mas não perguntaram','Perguntaram, mas não compraram'].map((title,i)=><button key={title} onClick={()=>setHelp(String(i))}>{title}</button>)}{help!=='options'&&<p>{['Priorize clientes que já conhecem a loja e confira se o convite explica quando e como comprar.','Mostre foto real, tamanho, preço e uma combinação. Peça uma resposta simples à cliente.','Retome cada conversa com a peça de interesse e descubra qual informação falta para decidir.'][Number(help)]}</p>}</div>}</section>
          {selected===6&&entry?.completed_at&&<section className="pro-card pro-finish"><span className="pro-overline">Seu balanço</span><h2>{money(totalCents)} em vendas · {soldPieces} peças</h2><p>Você concluiu {completedCount} missões. Anote o que funcionou para planejar a próxima campanha.</p>
            <h3>Conte um pouco sobre sua loja</h3><p>Isso ajuda a Suzana a indicar o próximo passo adequado para você.</p>
            <div className="pro-fields"><label>Faturamento mensal<select value={revenueBand} onChange={e=>setRevenueBand(e.target.value)}><option value="">Selecione</option><option value="ate_20">Até R$ 20 mil</option><option value="20_50">R$ 20 a 50 mil</option><option value="50_100">R$ 50 a 100 mil</option><option value="100_500">R$ 100 a 500 mil</option><option value="500_mais">Acima de R$ 500 mil</option></select></label><label>Pessoas na equipe<input type="number" min="0" max="100" value={teamSize} onChange={e=>setTeamSize(e.target.value)} placeholder="Ex.: 3" /></label></div>
            <button className="pro-primary" disabled={busy||!revenueBand||teamSize===''} onClick={()=>submit({action:'qualify',monthly_revenue_band:revenueBand,team_size:Number(teamSize)})}>{data.run.monthly_revenue_band?'Atualizar dados da loja':'Salvar dados da loja'}</button>
            {data.run.monthly_revenue_band&&<p>Dados da loja salvos. Obrigada por compartilhar.</p>}
            {course.protocol_offer_url&&<div><a className="pro-primary" href={course.protocol_offer_url} target="_blank" rel="noopener noreferrer">Conhecer a mentoria da Suzana</a></div>}
          </section>}
        </>:<section className="pro-card"><h2>As aulas serão publicadas em breve.</h2></section>}
      </>}
    </main>
  </div>
}
