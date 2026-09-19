'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TUTORIAL_VIDEO_MODULES, toEmbedUrl } from '@/lib/tutorialVideos'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

const iniciais = TUTORIAL_VIDEO_MODULES.map(module => ({
  module_key: module.key,
  title: module.defaultTitle,
  video_url: '',
  is_active: true,
}))

export default function AdminVideos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [videos, setVideos] = useState(iniciais)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState(false)

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }

      setAutorizado(true)
      setToken(session.access_token)
      try {
        const resposta = await fetch('/api/admin/videos', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const dados = await resposta.json()
        if (!resposta.ok) throw new Error(dados.error || 'Não foi possível carregar os vídeos.')
        setVideos(dados.videos || iniciais)
      } catch (error) {
        setErro(true)
        setMensagem(error.message)
      }
      setCarregando(false)
    }
    iniciar()
  }, [router])

  async function requisicao(method, body, accessToken = token) {
    const resposta = await fetch('/api/admin/videos', {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir a operação.')
    return dados
  }

  function alterar(moduleKey, field, value) {
    setVideos(current => current.map(item => item.module_key === moduleKey ? { ...item, [field]: value } : item))
    setMensagem('')
    setErro(false)
  }

  async function salvar() {
    const linkInvalido = videos.find(item => item.video_url?.trim() && !toEmbedUrl(item.video_url))
    if (linkInvalido) {
      const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === linkInvalido.module_key)
      setErro(true)
      setMensagem(`Confira o link de ${modulo?.label}. Use um link HTTPS do YouTube, Vimeo ou Loom.`)
      return
    }

    setSalvando(true)
    setMensagem('')
    setErro(false)
    try {
      await requisicao('PUT', { videos })
      setMensagem('✓ Vídeos salvos. As mudanças já aparecem no aplicativo.')
    } catch (error) {
      setErro(true)
      setMensagem(error.message)
    }
    setSalvando(false)
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => router.push('/admin')} style={botaoSecundario}>← Administração</button>
      </header>

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '28px 18px 100px' }}>
        <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.13em', margin: 0 }}>CONTEÚDO DO APLICATIVO</p>
        <h1 style={{ fontSize: '25px', margin: '5px 0 7px' }}>Vídeos Explicativos</h1>
        <p style={{ color: '#999', fontSize: '14px', lineHeight: 1.55, margin: '0 0 18px' }}>Cole o link da aula de cada ferramenta. O vídeo entra no lugar de “Em breve” automaticamente.</p>

        <div style={{ background: '#171409', border: '1px solid #5B4C17', borderRadius: '11px', color: '#E8CA56', padding: '12px 14px', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
          Aceita links HTTPS do YouTube, Vimeo e Loom. Se deixar o campo vazio, a aluna continuará vendo “Em breve”.
        </div>

        {mensagem && <div role="status" style={{ background: erro ? '#2A1113' : '#122015', border: `1px solid ${erro ? '#74323A' : '#285D35'}`, color: erro ? '#FFB5BD' : '#9DE2AA', borderRadius: '10px', padding: '11px 13px', marginBottom: '16px', fontSize: '13px' }}>{mensagem}</div>}

        <div style={{ display: 'grid', gap: '15px' }}>
          {videos.map(video => {
            const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === video.module_key)
            const embedUrl = toEmbedUrl(video.video_url)
            const linkPreenchido = Boolean(video.video_url?.trim())
            return (
              <article key={video.module_key} className="video-admin-card" style={{ background: '#111', border: `1px solid ${video.is_active ? '#4E421B' : '#292929'}`, borderLeft: `3px solid ${video.is_active ? ouro : '#444'}`, borderRadius: '14px', padding: '17px' }}>
                <div className="video-admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ display: 'block', color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.1em', marginBottom: '4px' }}>MÓDULO</span>
                    <h2 style={{ fontSize: '17px', margin: 0 }}>{modulo?.label}</h2>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: video.is_active ? '#FFF' : '#777', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                    <input type="checkbox" checked={video.is_active} onChange={event => alterar(video.module_key, 'is_active', event.target.checked)} />
                    {video.is_active ? 'Ativo' : 'Pausado'}
                  </label>
                </div>

                <div className="video-admin-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .85fr)', gap: '16px', alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: '13px' }}>
                    <label style={labelStyle}>Título mostrado para a aluna
                      <input value={video.title || ''} maxLength={120} onChange={event => alterar(video.module_key, 'title', event.target.value)} style={campoStyle} placeholder={modulo?.defaultTitle} />
                    </label>
                    <label style={labelStyle}>Link da aula
                      <input value={video.video_url || ''} onChange={event => alterar(video.module_key, 'video_url', event.target.value)} style={{ ...campoStyle, borderColor: linkPreenchido && !embedUrl ? '#A8404A' : '#393939' }} placeholder="https://www.youtube.com/watch?v=..." inputMode="url" autoCapitalize="none" />
                    </label>
                    <p style={{ color: linkPreenchido && !embedUrl ? '#FF9AA5' : '#777', fontSize: '11px', margin: '-5px 0 0', lineHeight: 1.45 }}>
                      {linkPreenchido && !embedUrl ? 'Este link ainda não é reconhecido.' : 'Pode colar o link normal do vídeo; o sistema prepara a exibição.'}
                    </p>
                    {linkPreenchido && <button type="button" onClick={() => alterar(video.module_key, 'video_url', '')} style={{ ...botaoSecundario, justifySelf: 'start', color: '#FF9AA5' }}>Remover vídeo</button>}
                  </div>

                  <div>
                    <span style={{ display: 'block', color: '#777', fontSize: '9px', fontWeight: 900, letterSpacing: '.12em', marginBottom: '7px' }}>PRÉVIA NO APLICATIVO</span>
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#090909', border: '1px solid #2E2E2E', borderRadius: '11px', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                      {embedUrl && video.is_active ? (
                        <iframe src={embedUrl} title={`Prévia: ${video.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '18px', color: '#777' }}><div style={{ fontSize: '25px', color: ouro, marginBottom: '7px' }}>▶</div><strong style={{ display: 'block', color: '#AAA', fontSize: '13px' }}>{video.is_active ? 'Em breve' : 'Vídeo pausado'}</strong><small>{video.title || modulo?.defaultTitle}</small></div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div style={{ position: 'sticky', bottom: '12px', display: 'flex', justifyContent: 'flex-end', marginTop: '18px', pointerEvents: 'none' }}>
          <button onClick={salvar} disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '10px', padding: '12px 20px', fontWeight: 900, fontSize: '14px', cursor: salvando ? 'wait' : 'pointer', boxShadow: '0 8px 26px rgba(0,0,0,.45)', pointerEvents: 'auto' }}>{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </main>

      <style>{`
        @media (max-width: 720px) {
          .video-admin-card { padding: 14px !important; }
          .video-admin-grid { grid-template-columns: 1fr !important; }
          .video-admin-header { align-items: flex-start !important; }
        }
      `}</style>
    </div>
  )
}

const labelStyle = { display: 'grid', gap: '7px', color: '#EAEAEA', fontSize: '12px', fontWeight: 800 }
const campoStyle = { width: '100%', boxSizing: 'border-box', background: '#090909', color: '#FFF', border: '1px solid #393939', borderRadius: '9px', padding: '11px 12px', fontSize: '14px', outline: 'none' }
const botaoSecundario = { display: 'inline-flex', alignItems: 'center', background: '#151515', border: '1px solid #363636', borderRadius: '8px', color: ouro, padding: '8px 11px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100vh', background: '#080808', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div>
}
