import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { checkoutFunnelEvent, recordCheckoutFunnel } from '@/lib/checkoutFunnelServer'

const reply = status => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply(415)
  if (Number(request.headers.get('content-length')) > 4600) return reply(413)
  let visit
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 4600) return reply(413)
    visit = checkoutFunnelEvent(JSON.parse(text))
  } catch {
    return reply(400)
  }
  if (!visit) return reply(400)
  try {
    await recordCheckoutFunnel(checkoutAdminClient(), visit)
    return reply(204)
  } catch {
    return reply(503)
  }
}
