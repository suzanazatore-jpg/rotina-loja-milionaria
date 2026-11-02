import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { connectionProbeStatus, sendEmailProbe, startWhatsappProbe } from '@/lib/contractConnectionProbe'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
async function authorize(request) {
  if (process.env.VERCEL_ENV !== 'preview') return null
  const db = checkoutAdminClient()
  return await autorizarAdmin(request, db) ? db : null
}
export async function GET(request) {
  const db = await authorize(request)
  if (!db) return json({ error: 'Acesso restrito à homologação administrativa.' }, 403)
  try { return json(await connectionProbeStatus(db)) } catch { return json({ enabled: false, error: 'Teste interno pausado ou configuração pendente.' }) }
}
export async function POST(request) {
  const db = await authorize(request)
  if (!db) return json({ error: 'Acesso restrito à homologação administrativa.' }, 403)
  try {
    if (Number(request.headers.get('content-length')) > 1000) return json({ error: 'Requisição inválida.' }, 413)
    const body = await request.json()
    if (Object.keys(body).some(key => !['channel', 'kind'].includes(key))) return json({ error: 'O destinatário é definido somente no servidor.' }, 400)
    if (!['email', 'whatsapp'].includes(body.channel)) return json({ error: 'Canal inválido.' }, 400)
    return json(await (body.channel === 'email' ? sendEmailProbe(db, body.kind) : startWhatsappProbe(db, body.kind)))
  } catch { return json({ error: 'Teste sem confirmação. Confira o histórico antes de repetir.' }, 503) }
}
