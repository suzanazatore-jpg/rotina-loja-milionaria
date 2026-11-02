import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { handleContractWhatsappRelay } from '@/lib/contractWhatsappRelay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request) {
  return handleContractWhatsappRelay(request, { getDb: checkoutAdminClient })
}
