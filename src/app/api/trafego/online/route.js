import { trafficDb, trafficUser, TRAFFIC_ADMIN } from '@/lib/trafficReportServer'
import { loadTrafficAccess } from '@/lib/trafficAccess'
import { livePeriod, readLiveTraffic, TrafficLiveError } from '@/lib/trafficLiveMeta'

export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }
export async function POST(request) {
  try {
    const db = trafficDb(), user = await trafficUser(request, db)
    if (!user) return Response.json({ error: 'Entre na sua conta.' }, { status: 401, headers })
    const admin = user.email === TRAFFIC_ADMIN
    if (!admin && !await loadTrafficAccess(db, user.id)) return Response.json({ error: 'Seu acesso a relatórios está inativo.' }, { status: 403, headers })
    let body
    try { body = await request.json() } catch { throw new TrafficLiveError('Pedido inválido.', 400) }
    if (!/^[0-9a-f-]{36}$/i.test(body.client_id || '')) throw new TrafficLiveError('Conta inválida.', 400)
    const { from, to } = livePeriod(body.from, body.to)
    if (!admin) {
      const link = await db.from('traffic_client_users').select('client_id').eq('client_id', body.client_id).eq('user_id', user.id).maybeSingle()
      if (link.error) throw link.error
      if (!link.data) return Response.json({ error: 'Conta não liberada para seu acesso.' }, { status: 403, headers })
    }
    const account = await db.from('traffic_clients').select('id,meta_account_id').eq('id', body.client_id).eq('active', true).maybeSingle()
    if (account.error) throw account.error
    if (!account.data) return Response.json({ error: 'Conta não disponível.' }, { status: 403, headers })
    const data = await readLiveTraffic({ accountId: account.data.meta_account_id, from, to, details: body.details !== false,
      token: process.env.META_ADS_ACCESS_TOKEN, version: process.env.TRAFFIC_META_GRAPH_VERSION || 'v25.0' })
    return Response.json({ ...data, client_id: account.data.id }, { headers })
  } catch (error) {
    // No raw provider responses, bearer tokens or ad-account credentials in logs/responses.
    return Response.json({ error: error instanceof TrafficLiveError ? error.message : 'Não foi possível atualizar agora. Seus dados anteriores foram mantidos.' }, { status: error instanceof TrafficLiveError ? error.status : 500, headers })
  }
}
