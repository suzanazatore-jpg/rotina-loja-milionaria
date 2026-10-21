'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '14px' }
const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer' }

export default function AdminCarrosseis() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [carrosseis, setCarrosseis] = useState([])
  const [cursos, setCursos] = useState([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [subtitulo, setSubtitulo] = useState('')
  const [publicado, setPublicado] = useState(true)
  const [selecionados, setSelecionados] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token)
      await carregar(session.access_token); setCarregando(false)
    }
    iniciar()
  }, [router])

  async function requisicao(method, body, accessToken = token) {
    const resposta = await fetch('/api/admin/carrosseis', {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir.')
    return dados
  }

  async function carregar(accessToken = token) {
    try {
      const dados = await requisicao('GET', null, accessToken)
      setCarrosseis(dados.carrosseis || []); setCursos(dados.cursos || [])
    } catch (error) { setMensagem(error.message) }
  }

  function abrir(item = null) {
    setEditando(item); setTitulo(item?.title || ''); setSubtitulo(item?.subtitle || '')
    setPublicado(item ? item.is_published : true); setSelecionados((item?.courses || []).map(curso => curso.id))
    setMensagem(''); setModal(true)
  }

  function fechar() { setModal(false); setEditando(null) }
  function adicionar(id) { setSelecionados(lista => lista.includes(id) ? lista : [...lista, id]) }
  function remover(id) { setSelecionados(lista => lista.filter(item => item !== id)) }
  function moverCurso(index, direcao) {
    const destino = index + direcao
    if (destino < 0 || destino >= selecionados.length) return
    setSelecionados(lista => { const nova = [...lista]; [nova[index], nova[destino]] = [nova[destino], nova[index]]; return nova })
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!titulo.trim()) { setMensagem('Informe o nome do carrossel.'); return }
    setSalvando(true); setMensagem('')
    try {
      await requisicao(editando ? 'PUT' : 'POST', { id: editando?.id, title: titulo, subtitle: subtitulo, is_published: publicado, course_ids: selecionados })
      await carregar(); fechar(); setMensagem(editando ? '✓ Carrossel atualizado.' : '✓ Carrossel criado.')
    } catch (error) { setMensagem(error.message) }
    setSalvando(false)
  }

  async function alternar(item) {
    try { await requisicao('PATCH', { action: 'publish', id: item.id, is_published: !item.is_published }); await carregar() }
    catch (error) { setMensagem(error.message) }
  }

  async function excluir(item) {
    if (!confirm(`Excluir o carrossel “${item.title}”? Os cursos não serão apagados.`)) return
    try { await requisicao('DELETE', { id: item.id }); await carregar(); setMensagem('✓ Carrossel excluído. Os cursos foram preservados.') }
    catch (error) { setMensagem(error.message) }
  }

  async function moverCarrossel(index, direcao) {
    const destino = index + direcao
    if (destino < 0 || destino >= carrosseis.length) return
    const nova = [...carrosseis]; [nova[index], nova[destino]] = [nova[destino], nova[index]]; setCarrosseis(nova)
    try { await requisicao('PATCH', { action: 'reorder', ids: nova.map(item => item.id) }) }
    catch (error) { setMensagem(error.message); await carregar() }
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  const porId = Object.fromEntries(cursos.map(curso => [curso.id, curso]))
  const disponiveis = cursos.filter(curso => !selecionados.includes(curso.id))

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}><button onClick={() => router.push('/admin')} style={{ ...botao, background: 'transparent' }}>← Admin</button></header>
    <main style={{ maxWidth: '920px', margin: '0 auto', padding: '26px 18px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '22px' }}>
        <div><p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p><h1 style={{ fontSize: '24px', margin: '5px 0' }}>Carrosséis de Cursos</h1><p style={{ color: '#888', margin: 0 }}>Organize os cursos em seções e defina a ordem exibida para cada aluna.</p></div>
        <button onClick={() => abrir()} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '11px 17px', fontWeight: 900, cursor: 'pointer' }}>+ Novo carrossel</button>
      </div>
      {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

      <section style={{ display: 'grid', gap: '12px' }}>
        {carrosseis.map((item, index) => <article key={item.id} style={{ background: '#111', border: '1px solid #34302A', borderLeft: `3px solid ${item.is_published ? ouro : '#555'}`, borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><button disabled={index === 0} onClick={() => moverCarrossel(index, -1)} style={{ ...miniBotao, opacity: index === 0 ? .3 : 1 }}>↑</button><button disabled={index === carrosseis.length - 1} onClick={() => moverCarrossel(index, 1)} style={{ ...miniBotao, opacity: index === carrosseis.length - 1 ? .3 : 1 }}>↓</button></div>
            <div style={{ flex: 1, minWidth: '190px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><h3 style={{ fontSize: '16px', margin: 0 }}>{item.title}</h3><small style={{ color: item.is_published ? ouro : '#777', background: '#1D1D1D', padding: '3px 7px', borderRadius: '5px', fontWeight: 800 }}>{item.is_published ? 'PUBLICADO' : 'OCULTO'}</small></div><p style={{ color: '#777', fontSize: '12px', margin: '5px 0 0' }}>{item.courses.length} curso(s){item.subtitle ? ` · ${item.subtitle}` : ''}</p></div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}><button onClick={() => alternar(item)} style={botao}>{item.is_published ? 'Ocultar' : 'Publicar'}</button><button onClick={() => abrir(item)} style={botao}>Editar</button><button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button></div>
          </div>
          {!!item.courses.length && <div style={{ display: 'flex', gap: '9px', overflowX: 'auto', marginTop: '14px', paddingBottom: '3px' }}>{item.courses.map(curso => <Capa key={curso.id} curso={curso} />)}</div>}
        </article>)}
        {!carrosseis.length && <div style={{ textAlign: 'center', padding: '50px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', color: '#777' }}><div style={{ fontSize: '38px' }}>▥</div><p>Nenhum carrossel criado. Enquanto estiver assim, a aluna continua vendo todos os cursos liberados em uma única seção.</p></div>}
      </section>
    </main>

    {modal && <div onMouseDown={e => e.target === e.currentTarget && fechar()} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.76)', backdropFilter: 'blur(5px)', display: 'grid', placeItems: 'center', padding: '20px' }}>
      <form onSubmit={salvar} style={{ width: '100%', maxWidth: '590px', maxHeight: '90vh', overflowY: 'auto', background: '#111', border: '1px solid #34302A', borderRadius: '17px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', padding: '19px 21px', borderBottom: '1px solid #2A2A2A' }}><div><h2 style={{ fontSize: '19px', margin: 0 }}>{editando ? 'Editar carrossel' : 'Novo carrossel'}</h2><p style={{ color: '#777', fontSize: '12px', margin: '4px 0 0' }}>Escolha os cursos e coloque na ordem desejada.</p></div><button type="button" onClick={fechar} style={miniBotao}>✕</button></header>
        <div style={{ padding: '19px 21px' }}>
          <label style={{ display: 'block', marginBottom: '13px' }}>Nome da seção *<input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo} placeholder="Ex.: Comece por aqui" /></label>
          <label style={{ display: 'block', marginBottom: '17px' }}>Descrição <small style={{ color: '#777' }}>(opcional)</small><input value={subtitulo} onChange={e => setSubtitulo(e.target.value)} style={campo} placeholder="Uma frase curta para orientar a aluna" /></label>
          <div style={{ marginBottom: '17px' }}><strong style={{ fontSize: '13px' }}>Cursos neste carrossel</strong><p style={{ color: '#777', fontSize: '11px', margin: '3px 0 9px' }}>Use as setas para definir a ordem das capas.</p>
            <div style={{ display: 'grid', gap: '8px' }}>{selecionados.map((id, index) => { const curso = porId[id]; if (!curso) return null; return <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1A1A1A', border: '1px solid #333', borderRadius: '10px', padding: '8px' }}><Capa curso={curso} mini /><strong style={{ flex: 1, fontSize: '13px' }}>{curso.title}</strong><button type="button" disabled={index === 0} onClick={() => moverCurso(index, -1)} style={miniBotao}>↑</button><button type="button" disabled={index === selecionados.length - 1} onClick={() => moverCurso(index, 1)} style={miniBotao}>↓</button><button type="button" onClick={() => remover(id)} style={{ ...miniBotao, color: '#f99' }}>✕</button></div> })}</div>
            {!selecionados.length && <p style={{ color: '#666', fontSize: '12px' }}>Nenhum curso selecionado.</p>}
          </div>
          {!!disponiveis.length && <div style={{ marginBottom: '17px' }}><strong style={{ fontSize: '13px' }}>Adicionar curso</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '8px' }}>{disponiveis.map(curso => <button type="button" key={curso.id} onClick={() => adicionar(curso.id)} style={{ ...botao, color: '#DDD' }}>+ {curso.title}</button>)}</div></div>}
          {!cursos.length && <div style={{ color: '#888', fontSize: '12px', background: '#181818', borderRadius: '9px', padding: '12px', marginBottom: '17px' }}>Cadastre os cursos primeiro para poder adicioná-los ao carrossel.</div>}
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', background: '#181818', border: '1px solid #2A2A2A', borderRadius: '10px', padding: '12px' }}><span><strong style={{ fontSize: '13px' }}>Carrossel publicado</strong><small style={{ display: 'block', color: '#777', marginTop: '2px' }}>Se desligado, não aparece para a aluna.</small></span><input type="checkbox" checked={publicado} onChange={e => setPublicado(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: ouro }} /></label>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', padding: '15px 21px', borderTop: '1px solid #2A2A2A' }}><button type="button" onClick={fechar} style={botao}>Cancelar</button><button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar carrossel'}</button></footer>
      </form>
    </div>}
  </div>
}

function Capa({ curso, mini = false }) {
  return <div style={{ width: mini ? '54px' : '116px', height: mini ? '35px' : '72px', flexShrink: 0, overflow: 'hidden', borderRadius: mini ? '6px' : '9px', background: '#222', border: '1px solid #333', display: 'grid', placeItems: 'center' }}>{curso.cover_image_url ? <img src={curso.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ padding: '4px', textAlign: 'center', fontSize: mini ? '7px' : '10px', color: '#CCC' }}>{curso.title}</span>}</div>
}
const miniBotao = { width: '30px', height: '30px', borderRadius: '7px', background: '#1A1A1A', color: ouro, border: '1px solid #333', cursor: 'pointer' }
function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
