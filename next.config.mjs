/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  // Link curto de checkout: pay.suzanazatorre.com.br/<link-curto> abre /p/<link-curto>
  // (/p/ aceita a URL amigável da oferta, o link curto personalizado ou o código da oferta).
  // Só vale para o domínio pay; os links /checkout/... continuam iguais.
  async rewrites() {
    const pay = [{ type: 'host', value: 'pay.suzanazatorre.com.br' }]
    return [
      { source: '/:code([a-zA-Z0-9_-]{1,60})', has: pay, destination: '/p/:code' },
    ]
  },
  // URL amigável antiga do Desafio (já divulgada em anúncios/página de vendas) → URL nova.
  async redirects() {
    return [
      { source: '/checkout/protocolo-zerando-estoque-47', destination: '/checkout/desafio7dias', permanent: false },
    ]
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
