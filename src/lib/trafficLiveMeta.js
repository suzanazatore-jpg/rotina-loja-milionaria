import { normalizeEntity, numeric } from './trafficReportModel.js'
import { validateTrafficSnapshot } from './trafficImport.js'

export class TrafficLiveError extends Error {
  constructor(message, status = 502) { super(message); this.status = status }
}

export function livePeriod(from, to, now = new Date()) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now)
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1
  if (!valid(from) || !valid(to) || from > to || to > today || days > 93) throw new TrafficLiveError('Selecione um período de até 93 dias, sem datas futuras.', 400)
  return { from, to }
}

// Keep the actual Meta result indicator. Never select a result based on the campaign name/objective.
export function metaInsight(row, currency = 'BRL') {
  const results = Array.isArray(row.results) ? (row.results.length === 1 ? row.results[0] : null) : row.results
  const costs = Array.isArray(row.cost_per_result) ? row.cost_per_result : [row.cost_per_result].filter(Boolean)
  const event = results?.indicator || ''
  const cost = costs.find(c => (c.indicator || c.conversion_type) === event) || (costs.length === 1 ? costs[0] : null)
  const costValue = numeric(cost?.values?.[0]?.value ?? cost?.value)
  const revenue = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase'].map(key => numeric(row.action_values?.find(a => a.action_type === key)?.value)).find(value => value != null)
  return {
    ...normalizeEntity({ ...row, results, cost_per_result: costValue, result_event: event, result_label: event,
      link_click: row.inline_link_clicks, clicks_all: row.clicks, ctr_all: row.ctr, cpc_all: row.cpc, revenue }),
    metric_date: row.date_start, date_start: row.date_start, date_stop: row.date_stop,
    amount_spent: { value: numeric(row.spend), unit: currency },
  }
}

const inflight = new Map()
// Coalesce simultaneous identical reads only; every new visit makes a new request to Meta.
export async function readLiveTraffic({ accountId, from, to, details = true, token, version = 'v25.0', fetcher = fetch }) {
  livePeriod(from, to)
  if (!/^\d+$/.test(accountId || '')) throw new TrafficLiveError('Conta inválida.', 400)
  if (!token) throw new TrafficLiveError('A conexão online da Meta ainda não foi configurada.', 503)
  if (!/^v\d+\.0$/.test(version)) throw new TrafficLiveError('Versão da conexão Meta inválida.', 503)
  const key = `${accountId}:${from}:${to}:${details}`
  if (inflight.has(key)) return inflight.get(key)
  if (inflight.size >= 4) throw new TrafficLiveError('Há outras consultas em andamento. Tente novamente em alguns instantes.', 429)
  const work = collect({ accountId, from, to, details, token, version, fetcher })
  inflight.set(key, work)
  try { return await work } finally { if (inflight.get(key) === work) inflight.delete(key) }
}

async function collect({ accountId, from, to, details, token, version, fetcher }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 50000)
  const root = `https://graph.facebook.com/${version}/`
  async function get(path, params = {}) {
    const url = new URL(path, root)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
    let response, body
    try {
      response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      body = await response.json()
    } catch { throw new TrafficLiveError('A Meta demorou a responder. Os dados anteriores foram mantidos.') }
    if (!response.ok || body.error) {
      const code = Number(body.error?.code)
      console.warn('traffic-meta-read', { code, subcode: Number(body.error?.error_subcode) || null, status: response.status, level: params.level || 'metadata' })
      if ([4, 17, 32, 613, 80004].includes(code) || response.status === 429) throw new TrafficLiveError('A Meta limitou as consultas temporariamente. Tente novamente mais tarde.', 429)
      if ([10, 190, 200, 294].includes(code) || [401, 403].includes(response.status)) throw new TrafficLiveError('A conexão Meta não tem acesso a esta conta ou precisa renovar a autorização.', 502)
      throw new TrafficLiveError('A Meta não conseguiu devolver o relatório completo. Os dados anteriores foram mantidos.')
    }
    return body
  }
  async function list(path, params) {
    const rows = [], cursors = new Set()
    let after
    for (let page = 0; page < 50; page++) {
      const body = await get(path, { ...params, limit: 500, ...(after ? { after } : {}) })
      if (!Array.isArray(body.data)) throw new TrafficLiveError('Resposta incompleta da Meta.')
      rows.push(...body.data)
      if (rows.length > 20000) throw new TrafficLiveError('O relatório é muito grande. Selecione um período menor.', 422)
      if (!body.paging?.next) return rows
      after = body.paging?.cursors?.after
      if (!after || cursors.has(after)) throw new TrafficLiveError('A paginação da Meta ficou incompleta.')
      cursors.add(after)
    }
    throw new TrafficLiveError('O relatório é muito grande. Selecione um período menor.', 422)
  }
  try {
    const info = await get(`act_${accountId}`, { fields: 'id,currency' })
    if (String(info.id) !== `act_${accountId}`) throw new TrafficLiveError('A Meta retornou uma conta diferente da solicitada.')
    const fields = 'account_id,spend,impressions,reach,frequency,inline_link_clicks,clicks,ctr,cpc,actions,action_values'
    const common = { time_range: { since: from, until: to }, use_account_attribution_setting: true }
    const insight = (level, daily = false) => list(`act_${accountId}/insights`, {
      ...common, level, fields: fields + (level === 'account' ? '' : ',campaign_id,campaign_name,objective,results,cost_per_result' + (level !== 'campaign' ? ',adset_id,adset_name' : '') + (level === 'ad' ? ',ad_id,ad_name,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions' : '')),
      ...(level === 'account' ? {} : { filtering: [{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE', 'ADSET_PAUSED', 'ARCHIVED', 'CAMPAIGN_PAUSED', 'DELETED', 'DISAPPROVED', 'IN_PROCESS', 'PAUSED', 'PENDING_BILLING_INFO', 'PENDING_REVIEW', 'PREAPPROVED', 'WITH_ISSUES'] }] }),
      ...(daily ? { time_increment: 1 } : {}),
    })
    const [totals, daily] = await Promise.all([insight('account'), insight('account', true)])
    if (totals.length > 1) throw new TrafficLiveError('A Meta retornou totais inesperados.')
    for (const row of [...totals, ...daily]) if (String(row.account_id) !== accountId) throw new TrafficLiveError('Resposta de outra conta bloqueada.')
    // A successful empty account insight means no delivery in this exact interval. Failures never become zero.
    const zero = date => ({ id: accountId, metric_date: date, date_start: date, date_stop: date, spend: 0, impressions: 0, clicks: 0, amount_spent: { value: 0, unit: info.currency || 'BRL' } })
    const days = []
    for (let date = from; date <= to; date = new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) days.push(date)
    const rows = daily.map(row => metaInsight(row, info.currency))
    if (!totals.length && daily.length) throw new TrafficLiveError('Os totais da Meta ficaram incompletos.')
    if (!totals.length) rows.push(...days.map(zero))
    else {
      const dailySpend = rows.reduce((n, row) => n + (row.spend ?? 0), 0)
      if (Math.abs(dailySpend - Number(totals[0].spend)) > .05) throw new TrafficLiveError('O diário da Meta ainda não confere com o total. Tente novamente em instantes.')
      // Confirm any absent day individually instead of assuming a zero from a partial response.
      for (const date of days.filter(date => !rows.some(row => row.metric_date === date))) {
        const confirmed = await list(`act_${accountId}/insights`, { ...common, time_range: { since: date, until: date }, fields, level: 'account' })
        if (confirmed.length > 1 || confirmed.some(row => row.account_id !== accountId)) throw new TrafficLiveError('Resposta diária inesperada da Meta.')
        rows.push(confirmed.length ? metaInsight(confirmed[0], info.currency) : zero(date))
      }
    }
    const payload = { totals: totals.length ? metaInsight(totals[0], info.currency) : zero(from), daily: rows, campaigns: [], adsets: [], ads: [] }
    const warnings = []
    if (details) {
      // Include every delivery status; no ACTIVE-only filter that drops paused historical ads.
      for (const [level, kind] of [['campaign', 'campaigns'], ['adset', 'adsets'], ['ad', 'ads']]) {
        const raw = await insight(level)
        if (raw.some(row => row.account_id !== accountId)) throw new TrafficLiveError('Resposta de outra conta bloqueada.')
        if (raw.some(row => numeric(row.spend) == null) || Math.abs(raw.reduce((n, row) => n + Number(row.spend), 0) - Number(payload.totals.spend)) > .05) throw new TrafficLiveError('O detalhamento da Meta ainda não confere com o investimento total. Os dados anteriores foram mantidos.')
        payload[kind] = raw.map(row => metaInsight(row, info.currency)).filter(row => row.spend > 0 || row.impressions > 0)
      }
      // Fetch creatives by exact ad ID. Missing permission/media is explicit and never fabricated.
      for (let offset = 0; offset < payload.ads.length; offset += 50) {
        const ads = payload.ads.slice(offset, offset + 50)
        try {
          const media = await get('', { ids: ads.map(ad => ad.id).join(','), fields: 'id,creative{id,image_url,thumbnail_url}' })
          for (const ad of ads) {
            const value = media[ad.id]
            if (value?.id === ad.id) ad.image_url = value.creative?.image_url || value.creative?.thumbnail_url || null
          }
        } catch { warnings.push('Algumas imagens de criativos não puderam ser atualizadas.'); break }
      }
    }
    const snapshot = validateTrafficSnapshot({ meta_account_id: accountId, period_start: from, period_end: to, payload })
    return { snapshot, warnings: [...new Set(warnings)], source: 'meta_api' }
  } finally { clearTimeout(timer); controller.abort() }
}
