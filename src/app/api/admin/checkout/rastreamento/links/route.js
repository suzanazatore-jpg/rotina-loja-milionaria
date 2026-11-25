import { randomBytes } from 'node:crypto'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { allRows } from '@/lib/centralRecords'
import { checkoutFunnelFilters, readTrackableLink, trackableCheckoutUrl, trackableShortCode, trackableShortUrl } from '@/lib/checkoutFunnel'

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
const activeOffers = db => db.from('offers').select('id,name,product:products!inner(id,name,marketplace_id)')
  .eq('active', true).eq('product.active', true)
const usesPagarme = offer => (offer.product.marketplace_id || 'pagarme') === 'pagarme'
const withUrls = link => ({ ...link, url: trackableCheckoutUrl(link), shortUrl: trackableShortUrl(link) })

export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 401)
    const params = new URL(request.url).searchParams
    if (params.get('catalogo') === '1') {
      const [offers, links] = await Promise.all([
        allRows(() => activeOffers(db).order('name').order('id')),
        allRows(() => db.from('checkout_trackable_links').select('*').order('created_at', { ascending: false }).order('id')),
      ])
      return json({ offers: offers.filter(usesPagarme), links: links.map(withUrls) })
    }
    let filters
    try {
      filters = checkoutFunnelFilters(params)
    } catch (error) {
      return json({ error: error.message }, 400)
    }
    const { data, error } = await db.rpc('checkout_funnel_report', filters.args)
    if (error) throw error
    const { from, to, group, page } = filters
    return json({ ...data, from, to, group, page })
  } catch {
    return json({ error: 'Não foi possível carregar os links ou as métricas.' }, 500)
  }
}

export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 401)
    let link
    try {
      const text = await request.text()
      if (Buffer.byteLength(text) > 5000) return json({ error: 'Dados do link excedem o limite.' }, 413)
      link = readTrackableLink(JSON.parse(text))
    } catch (error) {
      return json({ error: error instanceof SyntaxError ? 'Dados do link inválidos.' : error.message }, 400)
    }
    const { data: offer, error: offerError } = await activeOffers(db).eq('id', link.offer_id).maybeSingle()
    if (offerError) throw offerError
    if (!offer || !usesPagarme(offer)) return json({ error: 'Selecione uma oferta com checkout ativo.' }, 400)
    const code = trackableShortCode(link.name)
    const insert = shortCode => db.from('checkout_trackable_links')
      .insert({ ...link, short_code: shortCode }).select().single()

    let saved = await insert(code)
    if (saved.error?.code === '23505') {
      saved = await insert(code + '-' + randomBytes(4).toString('hex'))
    }
    if (saved.error) throw saved.error
    return json({ link: withUrls(saved.data) }, 201)
  } catch {
    return json({ error: 'Não foi possível gerar o link.' }, 500)
  }
}
