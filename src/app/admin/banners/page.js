'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '8px', padding: '10px 12px', fontSize: '14px' }
const vazio = { title: '', link_url: '', sort_order: 0, is_active: true, starts_at: '', ends_at: '', image_url: '' }

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
  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState('')
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
    const formData = body instanceof FormData
    const resposta = await fetch('/api/admin/banners', {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(!formData && body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: formData ? body : JSON.stringify(body) } : {}),
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
  function escolherArquivo(evento) {
    const selecionado = evento.target.files?.[0] || null
    if (selecionado && selecionado.size > 5 * 1024 * 1024) { setMensagem('A imagem deve ter no máximo 5 MB.'); evento.target.value = ''; return }
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    setArquivo(selecionado); setPreview(selecionado ? URL.createObjectURL(selecionado) : form.image_url || '')
    setMensagem('')
  }
  function limpar() {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    setEditando(null); setForm(vazio); setArquivo(null); setPreview(''); setMensagem('')
  }
  function editar(item) {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    setEditando(item.id); setArquivo(null); setPreview(item.image_url || '')
    setForm({ ...vazio, ...item, title: item.title || '', link_url: item.link_url || '', starts_at: dataLocal(item.starts_at), ends_at: dataLocal(item.ends_at) })
    setMensagem(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!editando && !arquivo) { setMensagem('Escolha a imagem do banner.'); return }
    setSalvando(true); setMensagem('')
    try {
      const dados = new FormData()
      if (arquivo) dados.append('image', arquivo)
      if (editando) dados.append('id', editando)
      dados.append('title', form.title)
      dados.append('link_url', form.link_url)
      dados.append('sort_order', String(form.sort_order))
      dados.append('is_active', String(form.is_active))
      dados.append('starts_at', form.starts_at ? new Date(form.starts_at).toISOString() : '')
      dados.append('ends_at', form.ends_at ? new Date(form.ends_at).toISOString() : '')
      await requisicao(editando ? 'PATCH' : 'POST', dados)
      await carregar(); limpar(); setMensagem('✓ Banner salvo com sucesso.')
    } catch (error) { setMensagem(error.message) }
    setSalvando(false)
  }

  async function excluir(item) {
    if (!confirm('Excluir este banner?')) return
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
        <p style={{ color: '#888', margin: '0 0 22px' }}>Suba as imagens que ficarão girando no topo do painel das alunas.</p>
        {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

        <form onSubmit={salvar} style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '18px', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 5px' }}>{editando ? 'Editar banner' : 'Novo banner'}</h2>
          <p style={{ color: '#777', fontSize: '12px', margin: '0 0 15px' }}>Formato recomendado: 1920 × 600 px. JPG, PNG ou WEBP, até 5 MB.</p>
          <label style={{ display: 'block', border: '1px dashed #5b4c17', borderRadius: '12px', background: '#0A0A0A', padding: '16px', cursor: 'pointer', textAlign: 'center' }}>
            {preview ? <img src={preview} alt="Prévia do banner" style={{ width: '100%', aspectRatio: '16 / 5', objectFit: 'cover', borderRadius: '8px', display: 'block', marginBottom: '12px' }} /> : <div style={{ padding: '32px 12px', color: '#999' }}><strong style={{ color: ouro }}>↑ Escolher imagem do banner</strong><br /><small>ou arraste o arquivo para cá</small></div>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={escolherArquivo} style={{ display: 'none' }} />
            {preview && <span style={{ color: ouro, fontSize: '13px', fontWeight: 700 }}>Trocar imagem</span>}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px', marginTop: '14px' }}>
            <label>Nome interno <small style={{ color: '#777' }}>(opcional)</small><input value={form.title} onChange={e => alterar('title', e.target.value)} style={campo} placeholder="Ex.: Campanha de agosto" /></label>
            <label>Link ao clicar <small style={{ color: '#777' }}>(opcional)</small><input value={form.link_url} onChange={e => alterar('link_url', e.target.value)} style={campo} placeholder="https://" /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
            <label>Ordem<input type="number" value={form.sort_order} onChange={e => alterar('sort_order', e.target.value)} style={campo} /></label>
            <label>Mostrar a partir de<input type="datetime-local" value={form.starts_at} onChange={e => alterar('starts_at', e.target.value)} style={campo} /></label>
            <label>Ocultar depois de<input type="datetime-local" value={form.ends_at} onChange={e => alterar('ends_at', e.target.value)} style={campo} /></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '15px', cursor: 'pointer' }}><input type="checkbox" checked={form.is_active} onChange={e => alterar('is_active', e.target.checked)} /> Banner publicado</label>
          <div style={{ display: 'flex', gap: '9px', marginTop: '17px' }}>
            <button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '8px', padding: '10px 17px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Enviando...' : 'Salvar banner'}</button>
            {editando && <button type="button" onClick={limpar} style={botao}>Cancelar</button>}
          </div>
        </form>

        <div style={{ display: 'grid', gap: '12px' }}>
          {banners.map(item => <article key={item.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderLeft: `3px solid ${item.is_active ? ouro : '#444'}`, borderRadius: '12px', padding: '12px', display: 'grid', gridTemplateColumns: 'minmax(180px, 280px) 1fr', gap: '15px', alignItems: 'center' }}>
            {item.image_url ? <img src={item.image_url} alt={item.title || 'Banner'} style={{ width: '100%', aspectRatio: '16 / 5', objectFit: 'cover', borderRadius: '8px' }} /> : <div style={{ background: '#222', color: '#777', padding: '20px', textAlign: 'center', borderRadius: '8px' }}>Sem imagem</div>}
            <div><strong>{item.title || 'Banner sem nome'}</strong><p style={{ color: '#888', fontSize: '13px', margin: '4px 0 10px' }}>Ordem {item.sort_order} · {item.is_active ? 'publicado' : 'oculto'}</p><div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}><button onClick={() => alternar(item)} style={botao}>{item.is_active ? 'Ocultar' : 'Publicar'}</button><button onClick={() => editar(item)} style={botao}>Editar</button><button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button></div></div>
          </article>)}
          {!banners.length && <div style={{ color: '#888', background: '#111', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '18px' }}>Nenhum banner de imagem cadastrado.</div>}
        </div>
      </main>
    </div>
  )
}

const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '7px', padding: '8px 10px', cursor: 'pointer' }
function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
