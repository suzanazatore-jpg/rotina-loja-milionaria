export default function manifest() {
  return {
    id: '/painel',
    name: 'Rotina da Loja Milionária',
    short_name: 'App Rotina',
    description: 'Rotina, metas, campanhas e conteúdos para transformar a gestão da sua loja.',
    start_url: '/painel',
    scope: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    lang: 'pt-BR',
    categories: ['business', 'education', 'productivity'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
