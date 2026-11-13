import { expireOrderAccess } from '@/lib/checkoutAccessServer'
import { timingSafeEqual } from 'node:crypto'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { retryConversions, reconcileMissingConversions } from '@/lib/checkoutConversionsServer'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'
import { processContractReminders } from '@/lib/contractsServer'
import { processContractTasks } from '@/lib/contractCompletionServer'
import { processCheckoutSaleEmails } from '@/lib/checkoutSaleEmailNotifications'

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
    let reconciliation
    try { reconciliation = await reconcileMissingConversions(db) } catch { reconciliation = { error: 'reconciliation_pending' } }
    let conversions
    try { conversions = await retryConversions(db) } catch { conversions = { error: 'conversions_pending' } }
    const access = await expireOrderAccess(db)
    let outbound
    try { outbound = await processOutboundWebhooks(db) } catch { outbound = { error: 'queue_pending' } }
    let contracts
    try { contracts = await processContractReminders(db) } catch { contracts = { error: 'reminders_pending' } }
    let contract_tasks
    try { contract_tasks = await processContractTasks(db) } catch { contract_tasks = { error: 'tasks_pending' } }
    let sale_emails
    try { sale_emails = await processCheckoutSaleEmails(db) } catch { sale_emails = { error: 'sale_email_queue_pending' } }
    return Response.json({ ...conversions, reconciliation, access, outbound, contracts, contract_tasks, sale_emails }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Não foi possível processar conversões.' }, { status: 503 }) }
}
