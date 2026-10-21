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
export function normalizeEntity(row = {}) {
  const spend = numeric(row.spend ?? row.amount_spent)
  const impressions = numeric(row.impressions)
  const clicks = numeric(row.link_click ?? row.inline_link_clicks ?? row.clicks)
  const results = numeric(row.results?.values?.[0]?.value ?? row.results?.value ?? row.results)
  const rawLabel = row.result_label || row.cost_per_result?.conversion_type || row.results?.indicator || ''
  const action = key => numeric(row[key] ?? row.actions?.find(x => x.action_type === key)?.value)
  return {
    id: String(row.id || row.ad_id || row.adset_id || row.campaign_id || ''),
    name: row.name || row.ad_name || row.adset_name || row.campaign_name || 'Sem nome',
    campaign_id: row.campaign_id || null, adset_id: row.adset_id || null,
    objective: row.objective || '', status: row.effective_status || row.status || '',
    spend, impressions, clicks, reach: numeric(row.reach), frequency: numeric(row.frequency),
    ctr: clicks != null && impressions > 0 ? clicks / impressions * 100 : null,
    cpc: spend != null && clicks > 0 ? spend / clicks : null,
    cpm: spend != null && impressions > 0 ? spend / impressions * 1000 : null,
    clicks_all: numeric(row.clicks_all), ctr_all: numeric(row.ctr_all), cpc_all: numeric(row.cpc_all),
    results, result_label: String(rawLabel).replace(/^conversions:/, ''),
    cost: numeric(row.cost_per_result ?? row.cost) ?? (spend != null && results > 0 ? spend / results : null),
    leads: numeric(row.leads) ?? action('lead'), purchases: numeric(row.purchases) ?? action('omni_purchase'),
    messages: numeric(row.messages) ?? action('onsite_conversion.messaging_conversation_started_7d'),
    revenue: numeric(row.revenue ?? row.omni_purchase_values),
    landing_page_views: action('landing_page_view'),
    follows: action('instagram_profile_follow_v2'),
    image_url: safeMedia(row.image_url || row.thumbnail_url || row.creative?.image_url || row.creative?.thumbnail_url),
    preview_url: safeMedia(row.preview_url),
    video_25: numeric(row.video_25 ?? row.video_p25_watched_actions?.[0]?.value),
    video_50: numeric(row.video_50 ?? row.video_p50_watched_actions?.[0]?.value),
    video_75: numeric(row.video_75 ?? row.video_p75_watched_actions?.[0]?.value),
    video_100: numeric(row.video_100 ?? row.video_p100_watched_actions?.[0]?.value),
  }
}
export function previousRange(from, to) {
  const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`)
  const days = Math.round((end - start) / 86400000) + 1
  if (!Number.isFinite(days) || days < 1) return null
  return { from: new Date(+start - days * 86400000).toISOString().slice(0,10), to: new Date(+start - 86400000).toISOString().slice(0,10), days }
}
export function rangeTotals(rows, from, to, snapshot) {
  const selected = rows.filter(r => r.metric_date >= from && r.metric_date <= to && r.data_status === 'ok')
  const sum = key => selected.length && selected.every(r => numeric(r[key]) != null) ? selected.reduce((n,r) => n + numeric(r[key]),0) : null
  const spend = sum('spend'), clicks = sum('clicks'), impressions = sum('impressions'), revenue = sum('revenue')
  const exact = snapshot?.period_start === from && snapshot?.period_end === to
  const total = exact ? normalizeEntity(snapshot.payload?.totals) : null
  const resolvedRevenue = total?.revenue ?? revenue
  return { spend: total?.spend ?? spend, clicks: total?.clicks ?? clicks, impressions: total?.impressions ?? impressions,
    leads: total?.leads ?? sum('leads'), messages: total?.messages ?? sum('messages'), purchases: total?.purchases ?? sum('purchases'), revenue: resolvedRevenue,
    ctr: total?.ctr ?? (clicks != null && impressions > 0 ? clicks/impressions*100 : null),
    cpc: total?.cpc ?? (spend != null && clicks > 0 ? spend/clicks : null),
    cpm: total?.cpm ?? (spend != null && impressions > 0 ? spend/impressions*1000 : null),
    // Reach cannot be summed across days; frequency cannot be averaged.
    reach: total?.reach ?? (selected.length === 1 && from === to ? numeric(selected[0].reach) : null),
    frequency: total?.frequency ?? (selected.length === 1 && from === to ? numeric(selected[0].frequency) : null),
    roas: resolvedRevenue != null && (total?.spend ?? spend) > 0 ? resolvedRevenue/(total?.spend ?? spend) : null,
    days: selected.length, expected: previousRange(from,to)?.days || 0,
  }
}
export function lastClosedWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now)
  const end = new Date(`${today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay()+6)%7) - 1)
  return {from:new Date(+end - 6*86400000).toISOString().slice(0,10),to:end.toISOString().slice(0,10)}
}
