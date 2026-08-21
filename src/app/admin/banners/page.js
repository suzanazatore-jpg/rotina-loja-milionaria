'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '8px', padding: '10px 12px', fontSize: '14px' }
const vazio = { tag: '📣 Aviso', title: '', body: '', sort_order: 0, is_active: true, starts_at: '', ends_at: '' }

function dataLocal(valor) {
  if (!valor) return ''
  const data = new Date(valor)
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export default function AdminBanners() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [banners, setBanners] = useState([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token)
      await carregar(session.access_token)
      setCarregando(false)
    }
    iniciar()
  }, [router])

  async function requisicao(method, body, accessToken = token) {
    const resposta = await fetch('/api/admin/banners', {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir a operação.')
    return dados
  }

  async function carregar(accessToken = token) {
    try { const dados = await requisicao('GET', null, accessToken); setBanners(dados.banners || []) }
    catch (error) { setMensagem(error.message) }
  }

  function alterar(nome, valor) { setForm(atual => ({ ...atual, [nome]: valor })) }
  function limpar() { setEditando(null); setForm(vazio); setMensagem('') }
  function editar(item) {
    setEditando(item.id)
    setForm({ ...item, body: item.body || '', starts_at: dataLocal(item.starts_at), ends_at: dataLocal(item.ends_at) })
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!form.title.trim()) { setMensagem('Informe o título do banner.'); return }
    setSalvando(true); setMensagem('')
    try {
      await requisicao(editando ? 'PATCH' : 'POST', {
        ...form, ...(editando ? { id: editando } : {}),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      })
      await carregar(); limpar(); setMensagem('✓ Banner salvo com sucesso.')
    } catch (error) { setMensagem(error.message) }
    setSalvando(false)
  }

  async function excluir(item) {
    if (!confirm(`Excluir o banner “${item.title}”?`)) return
    try { await requisicao('DELETE', { id: item.id }); await carregar(); if (editando === item.id) limpar(); setMensagem('✓ Banner excluído.') }
    catch (error) { setMensagem(error.message) }
  }

  async function alternar(item) {
    try { await requisicao('PATCH', { ...item, is_active: !item.is_active }); await carregar(); setMensagem(item.is_active ? 'Banner ocultado.' : '✓ Banner publicado.') }
    catch (error) { setMensagem(error.message) }
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
        <h1 style={{ fontSize: '24px', margin: '5px 0' }}>Banners do Painel</h1>
        <p style={{ color: '#888', margin: '0 0 22px' }}>Gerencie os avisos exibidos no topo da página inicial das alunas.</p>
        {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

        <form onSubmit={salvar} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '18px', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 15px' }}>{editando ? 'Editar banner' : 'Novo banner'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px' }}>
            <label>Etiqueta<input value={form.tag} onChange={e => alterar('tag', e.target.value)} style={campo} placeholder="📣 Aviso" /></label>
            <label>Título *<input value={form.title} onChange={e => alterar('title', e.target.value)} style={campo} placeholder="Ex.: Novidade desta semana" /></label>
          </div>
          <label style={{ display: 'block', marginTop: '12px' }}>Texto<textarea value={form.body} onChange={e => alterar('body', e.target.value)} style={{ ...campo, minHeight: '80px', resize: 'vertical' }} placeholder="Mensagem que aparecerá no painel" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
            <label>Ordem<input type="number" value={form.sort_order} onChange={e => alterar('sort_order', e.target.value)} style={campo} /></label>
            <label>Mostrar a partir de<input type="datetime-local" value={form.starts_at} onChange={e => alterar('starts_at', e.target.value)} style={campo} /></label>
            <label>Ocultar depois de<input type="datetime-local" value={form.ends_at} onChange={e => alterar('ends_at', e.target.value)} style={campo} /></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '15px', cursor: 'pointer' }}><input type="checkbox" checked={form.is_active} onChange={e => alterar('is_active', e.target.checked)} /> Banner publicado</label>
          <div style={{ display: 'flex', gap: '9px', marginTop: '17px' }}>
            <button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '8px', padding: '10px 17px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar banner'}</button>
            {editando && <button type="button" onClick={limpar} style={botao}>Cancelar</button>}
          </div>
        </form>

        <div style={{ display: 'grid', gap: '10px' }}>
          {banners.map(item => <article key={item.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderLeft: `3px solid ${item.is_active ? ouro : '#444'}`, borderRadius: '12px', padding: '15px', display: 'flex', justifyContent: 'space-between', gap: '15px', alignItems: 'center' }}>
            <div><small style={{ color: ouro }}>{item.tag}</small><strong style={{ display: 'block', marginTop: '4px' }}>{item.title}</strong><p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>{item.body || 'Sem texto'} · ordem {item.sort_order} · {item.is_active ? 'publicado' : 'oculto'}</p></div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}><button onClick={() => alternar(item)} style={botao}>{item.is_active ? 'Ocultar' : 'Publicar'}</button><button onClick={() => editar(item)} style={botao}>Editar</button><button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button></div>
          </article>)}
          {!banners.length && <div style={{ color: '#888', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '18px' }}>Nenhum banner cadastrado. Enquanto a lista estiver vazia, o painel mantém os avisos atuais.</div>}
        </div>
      </main>
    </div>
  )
}

const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '7px', padding: '8px 10px', cursor: 'pointer' }
function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
