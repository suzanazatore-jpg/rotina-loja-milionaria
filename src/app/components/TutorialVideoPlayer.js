'use client'

import { useState } from 'react'
import { toEmbedUrl } from '@/lib/tutorialVideos'

function coverSource(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['https:', 'blob:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

export default function TutorialVideoPlayer({ videoUrl, coverUrl, title = 'Vídeo explicativo', fallback = null }) {
  const embedUrl = toEmbedUrl(videoUrl)
  if (!embedUrl) return fallback

  // A new video or cover starts at its poster, without resetting state in an effect.
  return <Player key={JSON.stringify([videoUrl, coverUrl])} embedUrl={embedUrl} coverUrl={coverSource(coverUrl)} title={title} />
}

function Player({ embedUrl, coverUrl, title }) {
  const [aberto, setAberto] = useState(false)
  const [imagemFalhou, setImagemFalhou] = useState(false)

  if (!coverUrl || aberto || imagemFalhou) {
    return <iframe src={embedUrl} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ display: 'block', width: '100%', height: '100%', border: 0 }} />
  }

  return (
    <button type="button" aria-label={`Abrir vídeo: ${title}`} onClick={() => setAberto(true)} style={{ position: 'relative', width: '100%', height: '100%', padding: 0, border: 0, cursor: 'pointer', background: '#090909', color: '#FFF', display: 'grid', placeItems: 'center', overflow: 'hidden', outlineOffset: '-4px' }}>
      {/* Unoptimized images also support local blob previews and the public Storage URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coverUrl} alt="" onError={() => setImagemFalhou(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 25%, rgba(0,0,0,.48))' }} />
      <span style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: '9px', textShadow: '0 1px 5px #000', fontSize: '13px', fontWeight: 800 }}>
        <span aria-hidden="true" style={{ width: '58px', height: '58px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(9,9,9,.78)', border: '2px solid #D4AF37', color: '#F5D76E', fontSize: '24px', paddingLeft: '3px', boxSizing: 'border-box' }}>▶</span>
        Assistir vídeo
      </span>
    </button>
  )
}
