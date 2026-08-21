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

export default function AdminPlanos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [planos, setPlanos] = useState([])
  const [cursos, setCursos] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [editando, setEditando] = useState(null)
  const [nome, setNome] = useState('')
  const [ofertaId, setOfertaId] = useState('')
  const [periodoDias, setPeriodoDias] = useState('')
  const [preco, setPreco] = useState('')
  const [urlVenda, setUrlVenda] = useState('')
  const [cursoIds, setCursoIds] = useState([])
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
    const [rp, rc, rv] = await Promise.all([
      supabase.from('plans').select('*').order('created_at'),
      supabase.from('courses').select('id,title').order('title'),
      supabase.from('plan_courses').select('plan_id,course_id'),
    ])
    if (rp.error) {
      setMensagem('A estrutura de Planos ainda precisa ser aplicada no Supabase do app.')
      return
    }
    setPlanos(rp.data || [])
    setCursos(rc.data || [])
    setVinculos(rv.data || [])
  }

  function limpar() {
    setEditando(null); setNome(''); setOfertaId(''); setPeriodoDias('')
    setPreco(''); setUrlVenda(''); setCursoIds([])
  }

  function editar(plano) {
    setEditando(plano.id)
    setNome(plano.name || '')
    setOfertaId(plano.offer_id || '')
    setPeriodoDias(plano.period_days || '')
    setPreco(plano.price ?? '')
    setUrlVenda(plano.sale_url || '')
    setCursoIds(vinculos.filter(v => v.plan_id === plano.id).map(v => v.course_id))
    setMensagem('')
  }

  function alternarCurso(id) {
    setCursoIds(atual => atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id])
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
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '26px 18px 60px' }}>
        <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p>
        <h1 style={{ fontSize: '24px', margin: '5px 0' }}>Planos e Ofertas</h1>
        <p style={{ color: '#888', margin: '0 0 22px' }}>Defina a validade e quais cursos cada plano libera.</p>
        {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

        <form onSubmit={salvar} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '18px', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 15px' }}>{editando ? 'Editar plano' : 'Novo plano'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <label>Nome<input value={nome} onChange={e => setNome(e.target.value)} style={campo} placeholder="Ex.: Plano anual" /></label>
            <label>ID da oferta<input value={ofertaId} onChange={e => setOfertaId(e.target.value)} style={campo} placeholder="Opcional" /></label>
            <label>Validade em dias<input type="number" min="1" value={periodoDias} onChange={e => setPeriodoDias(e.target.value)} style={campo} placeholder="Ex.: 365" /></label>
            <label>Preço<input value={preco} onChange={e => setPreco(e.target.value)} style={campo} placeholder="Ex.: 997,00" /></label>
          </div>
          <label style={{ display: 'block', marginTop: '12px' }}>Link de venda<input value={urlVenda} onChange={e => setUrlVenda(e.target.value)} style={campo} placeholder="https://" /></label>
          <div style={{ marginTop: '15px' }}>
            <p style={{ margin: '0 0 9px', fontWeight: 700, fontSize: '14px' }}>Cursos liberados</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {cursos.map(curso => <button key={curso.id} type="button" onClick={() => alternarCurso(curso.id)} style={{ border: cursoIds.includes(curso.id) ? `1px solid ${ouro}` : '1px solid #333', background: cursoIds.includes(curso.id) ? '#30280d' : '#171717', color: '#FFF', borderRadius: '999px', padding: '8px 11px', cursor: 'pointer' }}>{curso.title}</button>)}
              {!cursos.length && <span style={{ color: '#777', fontSize: '13px' }}>Nenhum curso cadastrado no app.</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '9px', marginTop: '17px' }}>
            <button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '8px', padding: '10px 17px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar plano'}</button>
            {editando && <button type="button" onClick={limpar} style={{ background: '#222', color: '#FFF', border: '1px solid #333', borderRadius: '8px', padding: '10px 17px', cursor: 'pointer' }}>Cancelar</button>}
          </div>
        </form>

        <div style={{ display: 'grid', gap: '10px' }}>
          {planos.map(plano => {
            const total = vinculos.filter(v => v.plan_id === plano.id).length
            return <div key={plano.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '15px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div><strong>{plano.name}</strong><p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>{plano.period_days ? `${plano.period_days} dias` : 'Sem validade automática'} · {total} curso{total === 1 ? '' : 's'}</p></div>
              <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => editar(plano)} style={botaoSecundario}>Editar</button><button onClick={() => excluir(plano)} style={{ ...botaoSecundario, color: '#f99' }}>Excluir</button></div>
            </div>
          })}
          {!planos.length && <p style={{ color: '#777' }}>Nenhum plano cadastrado.</p>}
        </div>
      </main>
    </div>
  )
}

const botaoSecundario = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '7px', padding: '8px 10px', cursor: 'pointer' }

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
