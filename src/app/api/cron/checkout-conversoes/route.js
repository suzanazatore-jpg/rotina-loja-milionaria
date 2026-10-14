import { timingSafeEqual } from 'node:crypto'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { retryConversions } from '@/lib/checkoutConversionsServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret || ''}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  try {
    return Response.json(await retryConversions(checkoutAdminClient()), { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Não foi possível processar conversões.' }, { status: 503 }) }
}
