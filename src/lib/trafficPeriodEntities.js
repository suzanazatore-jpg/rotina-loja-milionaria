import {normalizeEntity, previousRange, safeMedia} from './trafficReportModel.js'

const kinds = ['campaigns', 'adsets', 'ads']
const additive = ['spend','impressions','clicks','clicks_all','results','leads','messages','purchases','revenue','landing_page_views','follows','video_25','video_50','video_75','video_100']
const dateOf = row => row.metric_date || row.date_start

function combine(raw) {
  const groups = new Map()
  for (const row of raw) {
    const item = normalizeEntity(row)
    if (item.spend === 0 && !(item.impressions > 0) && !(item.results > 0)) continue
    if (!groups.has(item.id)) groups.set(item.id, [])
    groups.get(item.id).push(item)
  }
  return [...groups.values()].map(rows => {
    const item = {...rows.at(-1)}
    for (const key of additive) item[key] = rows.every(r => r[key] != null) ? rows.reduce((n,r) => n + r[key], 0) : null
    const sameEvent = new Set(rows.map(r => r.result_label)).size === 1
    if (!sameEvent || rows.length > 1 && /^(reach|alcance)$/i.test(item.result_label)) item.results = null
    if (!sameEvent) item.result_label = 'Eventos diferentes no período'
    // Unique reach and frequency are available only from an exact interval, never a sum of days.
    if (rows.length > 1) { item.reach = null; item.frequency = null }
    item.cost = item.results > 0 && item.spend != null ? item.spend / item.results * (/1.000/.test(item.cost_label) ? 1000 : 1) : null
    item.ctr = item.impressions > 0 && item.clicks != null ? item.clicks / item.impressions * 100 : null
    item.cpc = item.clicks > 0 && item.spend != null ? item.spend / item.clicks : null
    item.cpm = item.impressions > 0 && item.spend != null ? item.spend / item.impressions * 1000 : null
    item.ctr_all = item.impressions > 0 && item.clicks_all != null ? item.clicks_all / item.impressions * 100 : null
    item.cpc_all = item.clicks_all > 0 && item.spend != null ? item.spend / item.clicks_all : null
    return item
  }).filter(r => r.spend > 0 || r.impressions > 0)
}

export function trafficPeriodEntities(snapshots, accountId, from, to) {
  const expected = previousRange(from,to)?.days || 0
  const matching = snapshots.filter(s => s.meta_account_id === accountId).slice().sort((a,b) => String(b.collected_at || '').localeCompare(String(a.collected_at || '')))
  const media = new Map()
  for (const s of matching) for (const ad of [...(s.payload?.ads || []), ...(s.payload?.daily_ads || [])]) {
    const normalized = normalizeEntity(ad), url = safeMedia(normalized.image_url)
    if (!url) continue
    if (!media.has(normalized.id)) media.set(normalized.id, [])
    if (!media.get(normalized.id).includes(url)) media.get(normalized.id).push(url)
  }
  const withMedia = rows => rows.map(r => ({...r, image_url: media.get(r.id)?.[0] || r.image_url, image_urls: media.get(r.id) || (r.image_url ? [r.image_url] : [])}))
  const exact = matching.find(s => s.period_start === from && s.period_end === to)
  if (exact) return {complete:true, days:expected, expected, ...Object.fromEntries(kinds.map(kind => [kind, withMedia((exact.payload?.[kind] || []).map(normalizeEntity))]))}
  const dates = new Map()
  for (const s of matching) {
    const coverage = s.payload?.entity_daily_dates || (s.period_start === s.period_end ? [s.period_start] : [])
    for (const date of coverage) if (date >= from && date <= to && !dates.has(date)) dates.set(date,s)
  }
  const result = {complete:expected > 0 && dates.size === expected, days:dates.size, expected}
  for (const kind of kinds) {
    const raw = []
    for (const [date,s] of [...dates].sort(([a],[b]) => a.localeCompare(b))) {
      const daily = s.payload?.['daily_' + kind]
      raw.push(...(daily ? daily.filter(r => dateOf(r) === date) : s.payload?.[kind] || []))
    }
    result[kind] = withMedia(combine(raw))
  }
  return result
}
