import { allRows, readConversionReceipt, saleFilters } from './centralRecords.js'
import { challengeTracking, isMetaId, readTrackingMedia, readTrackingMeta } from './centralTrackingMeta.js'
import { readTrackingFees } from './centralTrackingFees.js'

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })
const reversedStatuses = ['refunded', 'chargedback']
const media = order => [order.utm_campaign, order.utm_term, order.utm_content].map(value => value?.trim() || '')
const keyFor = (campaign, adset, ad) => JSON.stringify([campaign || '', adset || '', ad || ''])

function addDays(day, count) {
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

export function trackingFilters(params, now = new Date()) {
  const today = dayFormat.format(now)
  const { inicio, fim, produto } = saleFilters(params)
  const to = fim || today
  const from = inicio || addDays(to, -6)
  if (from > to || to > today) throw new Error('Período inválido.')
  return { from, to, productId: params.has('produto') ? produto : challengeTracking.productId }
}

function addSale(row, order, fees) {
  row.approved++
  row.gross += order.total_cents
  if (reversedStatuses.includes(order.status)) row.refunds += order.total_cents
  if (row.fees !== null) row.fees = fees.has(order.pagarme_charge_id) ? row.fees + fees.get(order.pagarme_charge_id) : null
}

function metaEfficiency({ purchases, spend, purchaseValue }) {
  return {
    metaCpa: purchases > 0 && spend != null ? Math.round(spend / purchases) : null,
    metaRoas: spend > 0 && purchaseValue != null ? purchaseValue / spend : null,
  }
}

export function summarizeTracking(orders, receipts, meta, fees, visits = null) {
  const groups = new Map()
  const totals = {
    approved: 0, accepted: 0, unknown: 0, withAdIds: 0, gross: 0, refunds: 0, fees: 0,
    spend: meta ? 0 : null, purchases: meta ? 0 : null, purchaseValue: meta ? 0 : null,
  }
  for (const row of meta?.rows || []) {
    const key = keyFor(row.campaign, row.adset, row.ad)
    groups.set(key, { key, approved: 0, gross: 0, refunds: 0, fees: 0, ...row })
    totals.spend += row.spend
    totals.purchases += row.purchases
    totals.purchaseValue = totals.purchaseValue != null && row.purchaseValue != null ? totals.purchaseValue + row.purchaseValue : null
  }

  const visitsByAd = new Map()
  for (const visit of visits?.byAd || []) {
    const { campaign, adset, ad, count } = visit
    const key = keyFor(campaign, adset, ad)
    visitsByAd.set(key, count)
    if (!groups.has(key)) groups.set(key, { key, campaign, adset, ad, approved: 0, gross: 0, refunds: 0, fees: 0, spend: null, purchases: null })
  }

  const sales = orders.map(order => {
    const [campaign, adset, ad] = media(order)
    const source = order.utm_source?.trim() || ''
    const origin = source || order.utm_medium?.trim() || ''
    const key = (campaign || adset || ad) ? keyFor(campaign, adset, ad) : `origin:${origin}`
    const conversion = readConversionReceipt(receipts.get(order.id))
    if (!groups.has(key)) groups.set(key, { key, campaign, adset, ad, origin, approved: 0, gross: 0, refunds: 0, fees: 0, spend: null, purchases: null })
    const row = groups.get(key)
    addSale(row, order, fees)
    addSale(totals, order, fees)
    if (conversion?.state === 'accepted') totals.accepted++
    if ([campaign, adset, ad].every(isMetaId)) totals.withAdIds++
    if (!campaign && !adset && !ad && !origin) totals.unknown++
    return {
      id: order.id, key, code: order.pagarme_charge_id || order.id,
      product: order.offer?.product?.name, paidAt: order.paid_at,
      amount: order.total_cents, status: order.status,
      source: origin, campaign: row.campaignName || campaign, ad: row.adName || ad,
      conversion,
    }
  })

  const rows = [...groups.values()].map(row => ({
    ...row,
    ...metaEfficiency(row),
    visits: visits?.total != null && [row.campaign, row.adset, row.ad].every(isMetaId) ? visitsByAd.get(row.key) ?? 0 : null,
    cpa: row.spend != null && row.approved ? Math.round(row.spend / row.approved) : null,
    net: row.spend != null && row.fees != null ? row.gross - row.refunds - row.fees - row.spend : null,
  })).sort((a, b) => b.approved - a.approved || (b.spend ?? -1) - (a.spend ?? -1))
  return { totals: { ...totals, ...metaEfficiency(totals) }, rows, sales }
}

export function checkoutVisitWindow(result, from, until) {
  const since = result?.since
  if (!since) return { status: 'waiting', total: null, since: null, complete: false, byAd: [] }
  const started = Date.parse(since)
  const available = started < Date.parse(until)
  return {
    status: available ? 'recording' : 'historical',
    total: available ? result.total : null,
    since, complete: started <= Date.parse(from),
    byAd: available ? result.by_ad : [],
  }
}

async function readVisits(db, { from, until, productId }) {
  try {
    const { data, error } = await db.rpc('checkout_visit_report', { p_from: from, p_until: until, p_product_id: productId || null })
    if (error || !data || !Number.isSafeInteger(data.total) || !Array.isArray(data.by_ad)) throw new Error('Contagem indisponível.')
    return checkoutVisitWindow(data, from, until)
  } catch {
    return { status: 'unavailable', total: null, since: null, complete: false, byAd: [] }
  }
}

export async function readTrackingReport(db, filters, metaOptions) {
  const { from, to, productId } = filters
  const firstInstant = `${from}T00:00:00-03:00`
  const until = `${addDays(to, 1)}T00:00:00-03:00`
  const linked = productId === challengeTracking.productId
  const productsRequest = allRows(() => db.from('products').select('id,name').order('name').order('id'))
  const metaRequest = linked ? readTrackingMeta({ from, to, ...metaOptions }).catch(() => null) : null
  const ordersRequest = allRows(() => {
    let query = db.from('orders')
      .select('id,status,total_cents,pagarme_charge_id,payment_method,paid_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,offer:offers!inner(product_id,product:products(name))')
      .in('status', ['paid', ...reversedStatuses])
      .gte('paid_at', firstInstant).lt('paid_at', until)
    if (productId) query = query.eq('offer.product_id', productId)
    return query.order('paid_at', { ascending: false }).order('id')
  }, 10000)

  const [orders, products, meta, receipts, fees, { byAd, ...visits }] = await Promise.all([
    ordersRequest, productsRequest, metaRequest,
    ordersRequest.then(orders => readTrackingReceipts(db, orders)),
    ordersRequest.then(orders => readTrackingFees(orders)),
    readVisits(db, { from: firstInstant, until, productId }),
  ])
  const report = summarizeTracking(orders, receipts, meta, fees, { ...visits, byAd })
  const rows = linked ? await readTrackingMedia(report.rows, metaOptions) : report.rows
  return {
    ...report,
    rows,
    visits,
    from, to, products, productId, defaultProductId: challengeTracking.productId, updatedAt: new Date().toISOString(),
    meta: { status: linked ? (meta ? 'ready' : 'unavailable') : 'unlinked', updatedAt: meta?.updatedAt },
  }
}

async function readTrackingReceipts(db, orders) {
  const result = new Map()
  for (let offset = 0; offset < orders.length; offset += 100) {
    const markers = orders.slice(offset, offset + 100).map(order => `capi:${order.id}`)
    const { data, error } = await db.from('webhook_events')
      .select('pagarme_event_id,processed_at,error,payload')
      .eq('type', 'checkout.capi').in('pagarme_event_id', markers)
    if (error) throw error
    for (const row of data || []) result.set(row.pagarme_event_id.slice(5), row)
  }
  return result
}
