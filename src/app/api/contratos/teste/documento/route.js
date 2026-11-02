import { handleProbeDocument } from '@/lib/contractConnectionProbe'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) { return handleProbeDocument(request) }
