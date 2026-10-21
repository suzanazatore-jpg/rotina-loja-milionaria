'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TUTORIAL_VIDEO_MODULES, TUTORIAL_VIDEO_PROVIDERS, toEmbedUrl } from '@/lib/tutorialVideos'
import { TUTORIAL_COVER_MAX_BYTES, TUTORIAL_COVER_TYPES } from '@/lib/tutorialVideoCovers'
import TutorialVideoPlayer from '@/app/components/TutorialVideoPlayer'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

const iniciais = TUTORIAL_VIDEO_MODULES.map(module => ({
  module_key: module.key,
  title: module.defaultTitle,
  video_url: '',
  is_active: true,
  cover_image_path: null,
  cover_image_url: null,
}))

export default function AdminVideos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [videos, setVideos] = useState(iniciais)
  const [videosCarregados, setVideosCarregados] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState(false)
  const [capasPendentes, setCapasPendentes] = useState({})
  const capasPendentesRef = useRef({})
  const salvandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      Object.values(capasPendentesRef.current).forEach(capa => URL.revokeObjectURL(capa.previewUrl))
    }
  }, [])

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
        setVideosCarregados(true)
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
    if (salvandoRef.current) return
    setVideos(current => current.map(item => item.module_key === moduleKey ? { ...item, [field]: value } : item))
    setMensagem('')
    setErro(false)
  }

  function atualizarCapaPendente(moduleKey, capa) {
    const anterior = capasPendentesRef.current[moduleKey]
    if (anterior) URL.revokeObjectURL(anterior.previewUrl)
    const proximas = { ...capasPendentesRef.current }
    if (capa) proximas[moduleKey] = capa
    else delete proximas[moduleKey]
    capasPendentesRef.current = proximas
    setCapasPendentes(proximas)
  }

  function selecionarCapa(moduleKey, event) {
    const file = event.target.files?.[0]
    // Allow choosing the same file again after removal or a validation error.
    event.target.value = ''
    if (!file || salvandoRef.current) return
    if (!TUTORIAL_COVER_TYPES.includes(file.type) || !file.size || file.size > TUTORIAL_COVER_MAX_BYTES) {
      const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === moduleKey)
      setErro(true)
      setMensagem(`A capa de ${modulo?.label} deve ser uma imagem JPG ou PNG de até 3 MB.`)
      return
    }
    atualizarCapaPendente(moduleKey, { file, previewUrl: URL.createObjectURL(file) })
    setMensagem('')
    setErro(false)
  }

  function removerCapa(moduleKey) {
    if (salvandoRef.current) return
    atualizarCapaPendente(moduleKey, null)
    setVideos(current => current.map(item => item.module_key === moduleKey ? { ...item, cover_image_path: null, cover_image_url: null } : item))
    setMensagem('')
    setErro(false)
  }

  async function salvar() {
    if (salvandoRef.current || !videosCarregados) return
    const linkInvalido = videos.find(item => item.video_url?.trim() && !toEmbedUrl(item.video_url))
    if (linkInvalido) {
      const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === linkInvalido.module_key)
      setErro(true)
      setMensagem(`Confira o link de ${modulo?.label}. Use um link HTTPS de ${TUTORIAL_VIDEO_PROVIDERS}. Para Panda Video e ScaleUp, copie o link de incorporação (embed).`)
      return
    }

    salvandoRef.current = true
    setSalvando(true)
    setMensagem('')
    setErro(false)
    try {
      // Refresh the session before uploading, including when this page stayed open.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sua sessão expirou. Entre novamente para salvar as alterações.')
      if (!montadoRef.current) return
      const accessToken = session.access_token
      setToken(accessToken)
      let videosParaSalvar = videos
      // Upload separately so five 3 MB files never share one request.
      for (const [moduleKey, capa] of Object.entries(capasPendentesRef.current)) {
        const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === moduleKey)
        const body = new FormData()
        body.append('module_key', moduleKey)
        body.append('image', capa.file)
        const resposta = await fetch('/api/admin/videos/capa', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body,
        })
        const dados = await resposta.json().catch(() => ({}))
        if (!resposta.ok || !dados.cover_image_path || !dados.cover_image_url) {
          throw new Error(`Capa de ${modulo?.label}: ${dados.error || 'não foi possível enviar a imagem. Tente salvar novamente.'}`)
        }
        if (!montadoRef.current) return
        videosParaSalvar = videosParaSalvar.map(item => item.module_key === moduleKey ? { ...item, cover_image_path: dados.cover_image_path, cover_image_url: dados.cover_image_url } : item)
        // Keep successful uploads in the draft if another upload or the PUT fails.
        setVideos(videosParaSalvar)
        atualizarCapaPendente(moduleKey, null)
      }
      const payload = videosParaSalvar.map(({ module_key, title, video_url, is_active, cover_image_path }) => ({ module_key, title, video_url, is_active, cover_image_path }))
      const dados = await requisicao('PUT', { videos: payload }, accessToken)
      if (!montadoRef.current) return
      if (Array.isArray(dados.videos)) {
        const salvos = new Map(dados.videos.map(item => [item.module_key, item]))
        setVideos(videosParaSalvar.map(item => ({ ...item, ...salvos.get(item.module_key) })))
      }
      setMensagem('✓ Vídeos salvos. As mudanças já aparecem no aplicativo.')
    } catch (error) {
      if (montadoRef.current) {
        setErro(true)
        setMensagem(error.message || 'Não foi possível salvar. Tente novamente.')
      }
    } finally {
      salvandoRef.current = false
      if (montadoRef.current) setSalvando(false)
    }
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 20 }}>
        <button disabled={salvando} onClick={() => router.push('/admin')} style={botaoSecundario}>← Administração</button>
      </header>

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '28px 18px 100px' }}>
        <p style={{ color: ouro, fontSize: '10px', fontWeight: 900, letterSpacing: '.13em', margin: 0 }}>CONTEÚDO DO APLICATIVO</p>
        <h1 style={{ fontSize: '25px', margin: '5px 0 7px' }}>Vídeos Explicativos</h1>
        <p style={{ color: '#999', fontSize: '14px', lineHeight: 1.55, margin: '0 0 18px' }}>Cole o link da aula de cada ferramenta e, se quiser, escolha uma capa. O vídeo entra no lugar de “Em breve” automaticamente.</p>

        <div style={{ background: '#171409', border: '1px solid #5B4C17', borderRadius: '11px', color: '#E8CA56', padding: '12px 14px', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
          Aceita links HTTPS de {TUTORIAL_VIDEO_PROVIDERS}. Para Panda Video e ScaleUp, copie o link de incorporação (embed). Se deixar o campo vazio, a aluna continuará vendo “Em breve”.
        </div>

        {mensagem && <div role="status" style={{ background: erro ? '#2A1113' : '#122015', border: `1px solid ${erro ? '#74323A' : '#285D35'}`, color: erro ? '#FFB5BD' : '#9DE2AA', borderRadius: '10px', padding: '11px 13px', marginBottom: '16px', fontSize: '13px' }}>{mensagem}</div>}

        <fieldset disabled={salvando || !videosCarregados} aria-busy={salvando} style={{ display: 'grid', gap: '15px', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {videos.map(video => {
            const modulo = TUTORIAL_VIDEO_MODULES.find(item => item.key === video.module_key)
            const embedUrl = toEmbedUrl(video.video_url)
            const linkPreenchido = Boolean(video.video_url?.trim())
            const capaPendente = capasPendentes[video.module_key]
            const coverUrl = capaPendente?.previewUrl || video.cover_image_url
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
                      <input value={video.video_url || ''} maxLength={1000} onChange={event => alterar(video.module_key, 'video_url', event.target.value)} style={{ ...campoStyle, borderColor: linkPreenchido && !embedUrl ? '#A8404A' : '#393939' }} placeholder="Cole o link HTTPS do vídeo" inputMode="url" autoCapitalize="none" />
                    </label>
                    <p style={{ color: linkPreenchido && !embedUrl ? '#FF9AA5' : '#777', fontSize: '11px', margin: '-5px 0 0', lineHeight: 1.45 }}>
                      {linkPreenchido && !embedUrl ? 'Link não reconhecido. Para Panda Video ou ScaleUp, use o link de incorporação (embed), sem o código HTML.' : 'Cole o link do vídeo. No Panda Video ou ScaleUp, use o link de incorporação (embed), sem o código HTML.'}
                    </p>
                    {linkPreenchido && <button type="button" onClick={() => alterar(video.module_key, 'video_url', '')} style={{ ...botaoSecundario, justifySelf: 'start', color: '#FF9AA5' }}>Remover vídeo</button>}
                    <div style={{ display: 'grid', gap: '8px', borderTop: '1px solid #292929', paddingTop: '13px', minWidth: 0 }}>
                      <label style={labelStyle} htmlFor={`capa-${video.module_key}`}>Capa do vídeo (opcional)</label>
                      <p id={`capa-ajuda-${video.module_key}`} style={{ color: '#999', fontSize: '11px', margin: 0, lineHeight: 1.45 }}>Use uma imagem horizontal 16:9, em JPG ou PNG, de até 3 MB. A capa será enviada ao salvar as alterações.</p>
                      {coverUrl && <div style={{ maxWidth: '220px', width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '8px', border: '1px solid #393939' }}>
                        {/* Local blob previews must be displayed without an image optimization request. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coverUrl} alt={`Capa de ${modulo?.label}`} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>}
                      <input id={`capa-${video.module_key}`} type="file" accept="image/jpeg,image/png" aria-describedby={`capa-ajuda-${video.module_key}`} onChange={event => selecionarCapa(video.module_key, event)} style={{ ...campoStyle, fontSize: '12px', padding: '9px', cursor: salvando ? 'wait' : 'pointer' }} />
                      {capaPendente && <span style={{ color: '#E8CA56', fontSize: '11px', overflowWrap: 'anywhere' }}>Nova capa: {capaPendente.file.name} · envio pendente</span>}
                      {(coverUrl || video.cover_image_path) && <button type="button" onClick={() => removerCapa(video.module_key)} style={{ ...botaoSecundario, justifySelf: 'start', color: '#FF9AA5' }}>Remover capa</button>}
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', color: '#777', fontSize: '9px', fontWeight: 900, letterSpacing: '.12em', marginBottom: '7px' }}>PRÉVIA NO APLICATIVO</span>
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#090909', border: '1px solid #2E2E2E', borderRadius: '11px', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                      <TutorialVideoPlayer videoUrl={video.is_active ? video.video_url : ''} coverUrl={coverUrl} title={`Prévia: ${video.title || modulo?.defaultTitle}`} fallback={
                        <div style={{ textAlign: 'center', padding: '18px', color: '#777' }}><div style={{ fontSize: '25px', color: ouro, marginBottom: '7px' }}>▶</div><strong style={{ display: 'block', color: '#AAA', fontSize: '13px' }}>{video.is_active ? 'Em breve' : 'Vídeo pausado'}</strong><small>{video.title || modulo?.defaultTitle}</small></div>
                      } />
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </fieldset>

        <div style={{ position: 'sticky', bottom: '12px', display: 'flex', justifyContent: 'flex-end', marginTop: '18px', pointerEvents: 'none' }}>
          <button onClick={salvar} disabled={salvando || !videosCarregados} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '10px', padding: '12px 20px', fontWeight: 900, fontSize: '14px', cursor: salvando ? 'wait' : 'pointer', opacity: videosCarregados ? 1 : .5, boxShadow: '0 8px 26px rgba(0,0,0,.45)', pointerEvents: 'auto' }}>{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
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
