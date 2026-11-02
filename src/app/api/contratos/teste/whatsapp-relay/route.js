import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { handleWhatsappProbe } from '@/lib/contractConnectionProbe'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(request) { return handleWhatsappProbe(request, { getDb: checkoutAdminClient }) }
