export const TUTORIAL_VIDEO_MODULES = [
  { key: 'routine', label: 'Rotina', defaultTitle: 'Como executar a rotina da loja' },
  { key: 'campaigns', label: 'Campanhas de Vendas', defaultTitle: 'Como usar a campanha do mês' },
  { key: 'calendar', label: 'Calendário de Postagens', defaultTitle: 'Como usar o calendário de postagens' },
  { key: 'team_goals', label: 'Metas', defaultTitle: 'Como usar a calculadora de metas' },
  { key: 'pricing', label: 'Precificação e Lucro', defaultTitle: 'Como usar a calculadora de precificação' },
]

export const TUTORIAL_VIDEO_KEYS = new Set(TUTORIAL_VIDEO_MODULES.map(item => item.key))

export function toEmbedUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    const host = url.hostname.toLowerCase().replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : ''
    }

    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean)
      const id = url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '')
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : ''
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      const id = host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts[0]
      return /^\d+$/.test(id || '') ? `https://player.vimeo.com/video/${id}` : ''
    }

    if (host === 'loom.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      const id = ['share', 'embed'].includes(parts[0]) ? parts[1] : ''
      return id ? `https://www.loom.com/embed/${encodeURIComponent(id)}` : ''
    }
  } catch {
    return ''
  }

  return ''
}
