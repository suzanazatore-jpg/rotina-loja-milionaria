'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = {
  width: '100%', background: '#0A0A0A', color: '#FFF', border: '1px solid #333',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box',
}

const CONTEUDOS_APP = [
  { id: 'calendar', nome: 'Calendário', descricao: 'Calendário mensal de conteúdos' },
  { id: 'campaigns', nome: 'Campanhas', descricao: 'Campanhas e ações de vendas' },
  { id: 'routine', nome: 'Rotina', descricao: 'Rotina semanal da lojista' },
  { id: 'team_goals', nome: 'Meta da Equipe', descricao: 'Metas da equipe e das vendedoras' },
  { id: 'mentorship', nome: 'Aulas da Mentoria', descricao: 'Gravações e encontros da Mentoria' },
  { id: 'assistant', nome: 'Assistente Virtual', descricao: 'Orientação inteligente dentro do aplicativo' },
]

export default function AdminPlanos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [planos, setPlanos] = useState([])
  const [cursos, setCursos] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [conteudosPlanos, setConteudosPlanos] = useState([])
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [nome, setNome] = useState('')
  const [ofertaId, setOfertaId] = useState('')
  const [periodoDias, setPeriodoDias] = useState('')
  const [preco, setPreco] = useState('')
  const [urlVenda, setUrlVenda] = useState('')
  const [cursoIds, setCursoIds] = useState([])
  const [conteudoIds, setConteudoIds] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true)
      await carregar()
      setCarregando(false)
    }
    iniciar()
  }, [router])

  async function carregar() {
    const [rp, rc, rv, rconteudos] = await Promise.all([
      supabase.from('plans').select('*').order('created_at'),
      supabase.from('courses').select('id,title').order('title'),
      supabase.from('plan_courses').select('plan_id,course_id'),
      supabase.from('plan_app_contents').select('plan_id,content_key'),
    ])
    if (rp.error) {
      setMensagem('A estrutura de Planos ainda precisa ser aplicada no Supabase do app.')
      return
    }
    setPlanos(rp.data || [])
    setCursos(rc.data || [])
    setVinculos(rv.data || [])
    setConteudosPlanos(rconteudos.data || [])
  }

  function limpar() {
    setEditando(null); setNome(''); setOfertaId(''); setPeriodoDias('')
    setPreco(''); setUrlVenda(''); setCursoIds([]); setConteudoIds([])
    setFormAberto(false)
  }

  function cadastrar() {
    setEditando(null); setNome(''); setOfertaId(''); setPeriodoDias('')
    setPreco(''); setUrlVenda(''); setCursoIds([]); setConteudoIds([])
    setMensagem(''); setFormAberto(true)
  }

  function editar(plano) {
    setEditando(plano.id)
    setNome(plano.name || '')
    setOfertaId(plano.offer_id || '')
    setPeriodoDias(plano.period_days || '')
    setPreco(plano.price ?? '')
    setUrlVenda(plano.sale_url || '')
    setCursoIds(vinculos.filter(v => v.plan_id === plano.id).map(v => v.course_id))
    setConteudoIds(conteudosPlanos.filter(v => v.plan_id === plano.id).map(v => v.content_key))
    setMensagem('')
    setFormAberto(true)
  }

  function alternarCurso(id) {
    setCursoIds(atual => atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id])
  }

  function alternarConteudo(id) {
    setConteudoIds(atual => atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id])
  }

  async function salvar(e) {
    e.preventDefault()
    if (!nome.trim()) { setMensagem('Informe o nome do plano.'); return }
    setSalvando(true); setMensagem('')
    const payload = {
      name: nome.trim(), offer_id: ofertaId.trim() || null,
      period_days: periodoDias ? Number(periodoDias) : 365,
      price: preco === '' ? null : Number(String(preco).replace(',', '.')),
      sale_url: urlVenda.trim() || null, updated_at: new Date().toISOString(),
    }
    const resultado = editando
      ? await supabase.from('plans').update(payload).eq('id', editando).select('id').single()
      : await supabase.from('plans').insert(payload).select('id').single()
    if (resultado.error) { setMensagem('Não foi possível salvar: ' + resultado.error.message); setSalvando(false); return }
    const planoId = resultado.data.id
    await supabase.from('plan_courses').delete().eq('plan_id', planoId)
    if (cursoIds.length) {
      const { error } = await supabase.from('plan_courses').insert(cursoIds.map(courseId => ({ plan_id: planoId, course_id: courseId })))
      if (error) { setMensagem('O plano foi salvo, mas os cursos não foram vinculados.'); setSalvando(false); return }
    }
    const { error: erroLimparConteudos } = await supabase.from('plan_app_contents').delete().eq('plan_id', planoId)
    if (erroLimparConteudos) { setMensagem('O plano foi salvo, mas a estrutura de Conteúdo do Aplicativo ainda precisa ser aplicada no Supabase.'); setSalvando(false); return }
    if (conteudoIds.length) {
      const { error } = await supabase.from('plan_app_contents').insert(conteudoIds.map(contentKey => ({ plan_id: planoId, content_key: contentKey })))
      if (error) { setMensagem('O plano foi salvo, mas os conteúdos do aplicativo não foram vinculados.'); setSalvando(false); return }
    }
    await carregar(); limpar(); setMensagem('✓ Plano salvo com sucesso.'); setSalvando(false)
  }

  async function excluir(plano) {
    if (!confirm(`Excluir o plano "${plano.name}"?`)) return
    const { error } = await supabase.from('plans').delete().eq('id', plano.id)
    if (error) { setMensagem('Não foi possível excluir: ' + error.message); return }
    await carregar(); if (editando === plano.id) limpar(); setMensagem('✓ Plano excluído.')
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: ouro, padding: '7px 12px', cursor: 'pointer' }}>← Admin</button>
      </header>
      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '26px 18px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <div><p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p><h1 style={{ fontSize: '24px', margin: '5px 0' }}>Planos e Ofertas</h1><p style={{ color: '#888', margin: 0 }}>Cada plano liga uma oferta do Guru aos cursos e conteúdos que ela libera.</p></div>
          <button onClick={cadastrar} style={{ background: '#ff2b67', color: '#fff', border: 0, borderRadius: '999px', padding: '11px 18px', fontWeight: 900, cursor: 'pointer' }}>＋ Cadastrar plano</button>
        </div>
        {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}
        <div style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', overflow: 'hidden' }}>
          {planos.map(plano => {
            const total = vinculos.filter(v => v.plan_id === plano.id).length
            const totalConteudos = conteudosPlanos.filter(v => v.plan_id === plano.id).length
            return <div key={plano.id} style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', borderBottom: '1px solid #282428' }}>
              <div><strong>{plano.name}</strong><p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>ID da oferta: {plano.offer_id || 'não informado'} · {plano.period_days ? `${plano.period_days} dias` : 'Sem validade'} · {total} curso{total === 1 ? '' : 's'} · {totalConteudos} conteúdo{totalConteudos === 1 ? '' : 's'} do app</p></div>
              <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => editar(plano)} style={botaoSecundario}>Editar</button><button onClick={() => excluir(plano)} style={{ ...botaoSecundario, color: '#f99' }}>Excluir</button></div>
            </div>
          })}
          {!planos.length && <p style={{ color: '#777' }}>Nenhum plano cadastrado.</p>}
        </div>
      </main>

      {formAberto && <div onMouseDown={e => e.target === e.currentTarget && !salvando && limpar()} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: '18px' }}>
        <form onSubmit={salvar} style={{ width: 'min(820px,100%)', maxHeight: '92vh', overflowY: 'auto', background: '#141214', border: '1px solid #373238', borderRadius: '18px', boxShadow: '0 28px 90px #000' }}>
          <header style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '18px 20px', background: '#171417', borderBottom: '1px solid #302b30' }}><div><h2 style={{ fontSize: 18, margin: 0 }}>{editando ? 'Editar plano' : 'Cadastrar plano'}</h2><p style={{ color: '#777', fontSize: 12, margin: '4px 0 0' }}>Defina a oferta do Guru e tudo o que este plano libera.</p></div><button type="button" onClick={limpar} disabled={salvando} aria-label="Fechar" style={{ width: 34, height: 34, background: '#242024', color: '#aaa', border: '1px solid #3c373c', borderRadius: 9, fontSize: 20, cursor: 'pointer' }}>×</button></header>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}><label>Nome<input value={nome} onChange={e => setNome(e.target.value)} style={campo} placeholder="Ex.: Plano anual" /></label><label>ID da oferta do Guru<input value={ofertaId} onChange={e => setOfertaId(e.target.value)} style={campo} placeholder="Código da oferta" /></label><label>Validade em dias<input type="number" min="1" value={periodoDias} onChange={e => setPeriodoDias(e.target.value)} style={campo} placeholder="Ex.: 365" /></label><label>Preço<input value={preco} onChange={e => setPreco(e.target.value)} style={campo} placeholder="Ex.: 997,00" /></label></div>
            <label style={{ display: 'block', marginTop: 12 }}>Link de venda<input value={urlVenda} onChange={e => setUrlVenda(e.target.value)} style={campo} placeholder="https://" /></label>
            <section style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #302b30' }}><p style={{ margin: '0 0 9px', fontWeight: 800, fontSize: 14 }}>Cursos liberados</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{cursos.map(curso => <button key={curso.id} type="button" onClick={() => alternarCurso(curso.id)} style={{ border: cursoIds.includes(curso.id) ? `1px solid ${ouro}` : '1px solid #333', background: cursoIds.includes(curso.id) ? '#30280d' : '#1b191b', color: '#FFF', borderRadius: '999px', padding: '8px 11px', cursor: 'pointer' }}>{cursoIds.includes(curso.id) ? '✓ ' : ''}{curso.title}</button>)}{!cursos.length && <span style={{ color: '#777', fontSize: 13 }}>Nenhum curso cadastrado.</span>}</div></section>
            <section style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #302b30' }}><p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14 }}>Conteúdo do Aplicativo</p><p style={{ margin: '0 0 11px', color: '#777', fontSize: 12 }}>Escolha o que as alunas deste plano poderão acessar.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 9 }}>{CONTEUDOS_APP.map(item => { const ativo = conteudoIds.includes(item.id); return <button key={item.id} type="button" onClick={() => alternarConteudo(item.id)} aria-pressed={ativo} style={{ textAlign: 'left', border: ativo ? `1px solid ${ouro}` : '1px solid #333', background: ativo ? '#30280d' : '#1b191b', color: '#FFF', borderRadius: 10, padding: '11px 12px', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 13 }}>{ativo ? '✓ ' : ''}{item.nome}</strong><small style={{ color: '#888', fontSize: 11 }}>{item.descricao}</small></button> })}</div></section>
          </div>
          <footer style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', background: '#171417', borderTop: '1px solid #302b30' }}><button type="button" onClick={limpar} disabled={salvando} style={{ background: '#242124', color: '#fff', border: '1px solid #3c373c', borderRadius: 9, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button><button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: 9, padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar plano'}</button></footer>
        </form>
      </div>}
    </div>
  )
}

const botaoSecundario = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '7px', padding: '8px 10px', cursor: 'pointer' }

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
