/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  // Link curto de checkout: pay.suzanazatorre.com.br/<link-curto> abre /p/<link-curto>
  // (link curto definido na oferta, no admin). /desafio7dias fica fixo para não quebrar links já divulgados.
  // Só vale para o domínio pay; os links /checkout/... continuam iguais.
  async rewrites() {
    const pay = [{ type: 'host', value: 'pay.suzanazatorre.com.br' }]
    return [
      { source: '/desafio7dias', has: pay, destination: '/checkout/protocolo-zerando-estoque-47' },
      { source: '/:code([a-zA-Z0-9_-]{1,60})', has: pay, destination: '/p/:code' },
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
