import { expireOrderAccess } from '@/lib/checkoutAccessServer'
import { timingSafeEqual } from 'node:crypto'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { retryConversions } from '@/lib/checkoutConversionsServer'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'
import { processContractReminders } from '@/lib/contractsServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret || ''}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  try {
    const db = checkoutAdminClient()
    const access = await expireOrderAccess(db)
    let outbound
    try { outbound = await processOutboundWebhooks(db) } catch { outbound = { error: 'queue_pending' } }
    let contracts
    try { contracts = await processContractReminders(db) } catch { contracts = { error: 'reminders_pending' } }
    return Response.json({ ...await retryConversions(db), access, outbound, contracts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Não foi possível processar conversões.' }, { status: 503 }) }
}
