import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { checkoutVisitRow } from '@/lib/checkoutVisitServer'

const reply = status => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply(415)
  if (Number(request.headers.get('content-length')) > 1024) return reply(413)
  let row
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 1024) return reply(413)
    row = checkoutVisitRow(JSON.parse(text))
  } catch { return reply(400) }
  if (!row) return reply(400)
  try {
    const db = checkoutAdminClient()
    const { error } = await db.from('checkout_visits').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    return reply(204)
  } catch { return reply(503) }
}
