// Keep unknown values unknown. Never infer conversions from cost-per-action.
export function numeric(value) {
  if (value && typeof value === 'object') value = value.value
  if (value == null || value === '' || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
export function safeMedia(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null } catch { return null }
}
export function selectTrafficSnapshot(snapshots, accountId, from, to) {
  const matching = snapshots.filter(s => s.meta_account_id === accountId)
  const exact = from && to ? matching.filter(s => s.period_start === from && s.period_end === to) : []
  if (from && from === to) {
    const daily = matching.flatMap(s => {
      if (!(s.payload?.entity_daily_dates || []).includes(from) || !['campaigns','adsets','ads'].every(k => Array.isArray(s.payload?.['daily_' + k]))) return []
      const total = s.payload?.daily?.find(r => (r.metric_date || r.date_start) === from)
      if (!total) return []
      return [{...s, period_start:from, period_end:to, payload:{totals:total, daily:[total], ...Object.fromEntries(['campaigns','adsets','ads'].map(k => [k,s.payload['daily_' + k].filter(r => (r.metric_date || r.date_start) === from)]))}}]
    })
    const newest = [...exact, ...daily].sort((a,b) => String(b.collected_at || '').localeCompare(String(a.collected_at || '')))[0]
    if (newest) return newest
  }
  return (exact.length ? exact : matching).slice().sort((a,b) =>
    String(b.period_end || '').localeCompare(String(a.period_end || '')) ||
    String(a.period_start || '').localeCompare(String(b.period_start || '')) ||
    String(b.collected_at || '').localeCompare(String(a.collected_at || '')))[0]
}
const CONVERSATIONS = 'onsite_conversion.messaging_conversation_started_7d'
const EVENT_ALIASES = {
  'Conversas por mensagem iniciadas': CONVERSATIONS,
  'Conversas iniciadas': CONVERSATIONS,
  'Alcance': 'reach',
  'Compras no site': 'offsite_conversion.fb_pixel_purchase',
}
export function resultEvent(row = {}) {
  const raw = String(row.result_event || row.results?.indicator || row.cost_per_result?.conversion_type || row.result_label || '')
  return EVENT_ALIASES[raw] || raw.replace(/^(actions|conversions):/, '')
}
function eventLabel(event, fallback) {
  if (event === CONVERSATIONS) return 'Conversas por mensagem iniciadas'
  if (event === 'reach') return 'Alcance'
  if (event === 'offsite_conversion.fb_pixel_purchase') return 'Compras no site'
  return fallback || event
}
export function normalizeEntity(row = {}) {
  const spend = numeric(row.spend ?? row.amount_spent)
  const impressions = numeric(row.impressions)
  const clicks = numeric(row.link_click ?? row.inline_link_clicks ?? row.clicks)
  const results = numeric(row.results?.values?.[0]?.value ?? row.results?.value ?? row.results)
  const rawLabel = row.result_label || row.cost_per_result?.conversion_type || row.results?.indicator || ''
  const event = resultEvent(row)
  const action = key => numeric(row[key] ?? row.actions?.find(x => x.action_type === key || x.action_type === 'actions:' + key)?.value)
  const conversion = (key, events) => numeric(row[key]) ?? events.map(action).find(n => n != null) ?? (events.includes(event) ? results : null)
  return {
    id: String(row.id || row.ad_id || row.adset_id || row.campaign_id || ''),
    name: row.name || row.ad_name || row.adset_name || row.campaign_name || 'Sem nome',
    campaign_id: row.campaign_id || null, campaign_name: row.campaign_name || '', adset_id: row.adset_id || null,
    objective: row.objective || '', status: row.effective_status || row.status || '',
    spend, impressions, clicks, reach: numeric(row.reach), frequency: numeric(row.frequency),
    ctr: clicks != null && impressions > 0 ? clicks / impressions * 100 : null,
    cpc: spend != null && clicks > 0 ? spend / clicks : null,
    cpm: spend != null && impressions > 0 ? spend / impressions * 1000 : null,
    clicks_all: numeric(row.clicks_all), ctr_all: numeric(row.ctr_all), cpc_all: numeric(row.cpc_all),
    results, result_event: event, result_label: eventLabel(event, String(rawLabel).replace(/^conversions:/, '')),
    cost: numeric(row.cost_per_result ?? row.cost) ?? (spend != null && results > 0 ? spend / results * (event === 'reach' ? 1000 : 1) : null),
    cost_label: event === 'reach' ? 'Custo por 1.000 contas alcançadas' : event === CONVERSATIONS ? 'Custo por conversa iniciada' : event === 'offsite_conversion.fb_pixel_purchase' ? 'Custo por compra no site' : row.cost_label || 'Custo por resultado',
    leads: conversion('leads', ['lead']), purchases: conversion('purchases', ['omni_purchase', 'offsite_conversion.fb_pixel_purchase']),
    messages: conversion('messages', [CONVERSATIONS]),
    revenue: numeric(row.revenue ?? row.omni_purchase_values),
    landing_page_views: numeric(row.landing_page_views) ?? action('landing_page_view'),
    follows: numeric(row.follows) ?? action('instagram_profile_follow_v2'),
    image_url: safeMedia(row.image_url || row.thumbnail_url || row.creative?.image_url || row.creative?.thumbnail_url),
    preview_url: safeMedia(row.preview_url),
    video_25: numeric(row.video_25 ?? row.video_p25_watched_actions?.[0]?.value ?? row.video_p25_watched_actions),
    video_50: numeric(row.video_50 ?? row.video_p50_watched_actions?.[0]?.value ?? row.video_p50_watched_actions),
    video_75: numeric(row.video_75 ?? row.video_p75_watched_actions?.[0]?.value ?? row.video_p75_watched_actions),
    video_100: numeric(row.video_100 ?? row.video_p100_watched_actions?.[0]?.value ?? row.video_p100_watched_actions),
  }
}
export function previousRange(from, to) {
  const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`)
  const days = Math.round((end - start) / 86400000) + 1
  if (!Number.isFinite(days) || days < 1) return null
  return { from: new Date(+start - days * 86400000).toISOString().slice(0,10), to: new Date(+start - 86400000).toISOString().slice(0,10), days }
}
// Only campaign rows contribute here: never add campaign, adset and ad totals together.
// Missing events stay unknown; the note identifies a campaign sum instead of an account-wide total.
export function campaignConversionTotals(campaigns = []) {
  const rows = campaigns.map(normalizeEntity), result = {}, notes = {}
  for (const key of ['messages', 'leads', 'purchases']) {
    const known = rows.filter(r => r[key] != null)
    if (!known.length) { result[key] = null; continue }
    result[key] = known.reduce((sum,r) => sum + r[key], 0)
    const events = key === 'messages' ? [CONVERSATIONS] : key === 'leads' ? ['lead'] : ['omni_purchase','offsite_conversion.fb_pixel_purchase']
    const missing = rows.some(r => events.includes(r.result_event) && r[key] == null && r.spend > 0)
    notes[key] = 'Soma das campanhas com este evento informado.' + (missing ? ' Há campanhas sem quantidade informada; total parcial.' : '')
  }
  return {...result, notes}
}
export function rangeTotals(rows, from, to, snapshot, entities) {
  const selected = [...new Map(rows.filter(r => r.metric_date >= from && r.metric_date <= to && r.data_status === 'ok').map(r => [r.metric_date,r])).values()]
  const sum = key => selected.length && selected.every(r => numeric(r[key]) != null) ? selected.reduce((n,r) => n + numeric(r[key]),0) : null
  const exact = snapshot?.period_start === from && snapshot?.period_end === to
  const total = exact ? normalizeEntity(snapshot.payload?.totals) : null
  const campaigns = entities?.complete ? entities.campaigns : exact ? snapshot.payload?.campaigns : []
  const conversions = campaignConversionTotals(campaigns || [])
  const conversion = key => total?.[key] ?? conversions[key] ?? sum(key)
  const spend = total?.spend ?? sum('spend'), clicks = total?.clicks ?? sum('clicks'), impressions = total?.impressions ?? sum('impressions')
  const revenue = total?.revenue ?? sum('revenue')
  return {spend, clicks, impressions,
    leads: conversion('leads'), messages: conversion('messages'), purchases: conversion('purchases'), revenue,
    metric_notes: Object.fromEntries(Object.entries(conversions.notes).filter(([key]) => total?.[key] == null)),
    ctr: clicks != null && impressions > 0 ? clicks/impressions*100 : null,
    cpc: spend != null && clicks > 0 ? spend/clicks : null,
    cpm: spend != null && impressions > 0 ? spend/impressions*1000 : null,
    // Reach cannot be summed across days; frequency cannot be averaged.
    reach: total?.reach ?? (selected.length === 1 && from === to ? numeric(selected[0].reach) : null),
    frequency: total?.frequency ?? (selected.length === 1 && from === to ? numeric(selected[0].frequency) : null),
    roas: revenue != null && spend > 0 ? revenue/spend : null,
    days: selected.length, expected: previousRange(from,to)?.days || 0,
  }
}
export function lastClosedWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now)
  const end = new Date(`${today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay()+6)%7) - 1)
  return {from:new Date(+end - 6*86400000).toISOString().slice(0,10),to:end.toISOString().slice(0,10)}
}
