// First campaign explicitly linked to the Central. Traffic-management client accounts are independent.
export const challengeTracking = {
  productId: 'c35a5d1c-bf01-4d98-805f-b86f05e345f1',
  campaignId: '120249652559160280',
  accountId: '254700222756827',
  campaignName: 'Desafio_7D_Vs.08',
}

export const isMetaId = value => /^\d{5,30}$/.test(value || '')
const purchaseAction = 'offsite_conversion.fb_pixel_purchase'

function metaReader({ token, version, fetcher, timeout }) {
  if (!token || !/^v\d+\.0$/.test(version)) throw new Error('Conexão Meta indisponível.')
  const signal = AbortSignal.timeout(timeout)
  return async (path, params) => {
    const url = new URL(`https://graph.facebook.com/${version}/${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal })
    if (!response.ok) throw new Error('Relatório Meta indisponível.')
    const body = await response.json()
    if (body.error) throw new Error('Relatório Meta indisponível.')
    return body
  }
}

export async function readTrackingMeta({ from, to, token, version = 'v25.0', fetcher = fetch }) {
  const { accountId, campaignId } = challengeTracking
  const get = metaReader({ token, version, fetcher, timeout: 9000 })
  const account = await get(`act_${accountId}`, { fields: 'account_id,currency,timezone_name' })
  if (account.account_id !== accountId || account.currency !== 'BRL' || account.timezone_name !== 'America/Sao_Paulo') {
    throw new Error('Conta Meta incompatível com o relatório.')
  }

  const rows = new Map()
  const cursors = new Set()
  let after
  for (let page = 0; page < 20; page++) {
    const body = await get(`${campaignId}/insights`, {
      level: 'ad',
      time_range: JSON.stringify({ since: from, until: to }),
      fields: 'account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,spend,actions,action_values',
      limit: '100',
      ...(after ? { after } : {}),
    })
    if (!Array.isArray(body.data)) throw new Error('Resposta da Meta incompleta.')
    for (const row of body.data) {
      const spend = Number(row.spend)
      const purchases = Number(row.actions?.find(action => action.action_type === purchaseAction)?.value ?? 0)
      const purchaseValue = row.action_values?.find(action => action.action_type === purchaseAction)?.value
      const reportedValue = purchaseValue == null || purchaseValue === '' ? null : Number(purchaseValue)
      if (row.account_id !== accountId || row.campaign_id !== campaignId ||
        !row.date_start || !row.date_stop || row.date_start < from || row.date_stop > to || row.date_start > row.date_stop ||
        !isMetaId(row.ad_id) || !isMetaId(row.adset_id) ||
        rows.has(row.ad_id) || row.spend == null || !Number.isFinite(spend) || spend < 0 ||
        !Number.isFinite(purchases) || purchases < 0) {
        throw new Error('Resposta da Meta fora do escopo esperado.')
      }
      rows.set(row.ad_id, {
        campaign: row.campaign_id, campaignName: row.campaign_name,
        adset: row.adset_id, adsetName: row.adset_name, ad: row.ad_id, adName: row.ad_name,
        spend: Math.round(spend * 100), purchases,
        purchaseValue: Number.isFinite(reportedValue) && reportedValue >= 0 ? Math.round(reportedValue * 100) : purchases === 0 ? 0 : null,
      })
    }
    if (!body.paging?.next) return { rows: [...rows.values()], updatedAt: new Date().toISOString() }
    after = body.paging.cursors?.after
    if (!after || cursors.has(after)) throw new Error('Paginação da Meta incompleta.')
    cursors.add(after)
  }
  throw new Error('Relatório Meta incompleto.')
}

export async function readTrackingAd(order, { token, version = 'v25.0', fetcher = fetch }) {
  const { accountId, campaignId } = challengeTracking
  if (order.utm_campaign !== campaignId || !isMetaId(order.utm_content)) return null
  const get = metaReader({ token, version, fetcher, timeout: 3500 })
  const ad = await get(order.utm_content, { fields: 'id,name,account_id,adset{id,name},campaign{id,name}' })
  if (ad.id !== order.utm_content || ad.account_id !== accountId ||
    ad.campaign?.id !== campaignId || ad.adset?.id !== order.utm_term) return null
  return { ad: ad.name, adset: ad.adset.name, campaign: ad.campaign.name }
}
