import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { validId } from '@/lib/centralRecords'
import { readTrackingAd } from '@/lib/centralTrackingMeta'
import { readTrackingReport, trackingFilters } from '@/lib/centralTrackingReport'

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 401)
    const params = new URL(request.url).searchParams
    const meta = { token: process.env.META_ADS_ACCESS_TOKEN, version: process.env.TRAFFIC_META_GRAPH_VERSION || 'v25.0' }
    if (params.has('pedido')) {
      const id = params.get('pedido')
      if (!validId(id)) return json({ error: 'Pedido inválido.' }, 400)
      const { data, error } = await db.from('orders').select('utm_campaign,utm_term,utm_content').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'Pedido não encontrado.' }, 404)
      return json({ names: await readTrackingAd(data, meta).catch(() => null) })
    }
    let filters
    try { filters = trackingFilters(params) } catch (error) { return json({ error: error.message }, 400) }
    return json(await readTrackingReport(db, filters, meta))
  } catch {
    return json({ error: 'Não foi possível carregar o rastreamento.' }, 500)
  }
}
