/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  async redirects() {
    return [
      {
        source: '/admin/central-vendas',
        has: [{ type: 'host', value: 'rotina-loja-milionaria-git-checkout-painel-admin-mariano12\\.vercel\\.app' }],
        destination: 'https://rotina.suzanazatorre.com.br/admin/central-vendas',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [{ source: '/:code([a-zA-Z0-9_-]{1,60})', has: [{type:'host',value:'pay.suzanazatorre.com.br'}], destination:'/p/:code' }]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
};

export default nextConfig;
