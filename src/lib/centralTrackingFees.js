import { gatewayConfiguration } from './pagarme.js'

// Bound provider requests on each refresh; totals with incomplete fee coverage stay unknown.
const maxCharges = 50

export async function readTrackingFees(orders, fetcher = fetch, env = process.env) {
  const charges = new Map()
  for (const order of orders) {
    const id = order.pagarme_charge_id
    if (/^ch_[a-zA-Z0-9_-]{1,60}$/.test(id || '') && !charges.has(id)) charges.set(id, order)
    if (charges.size >= maxCharges) break
  }
  const ids = [...charges.keys()]
  const fees = new Map()
  if (!ids.length) return fees
  let gateway
  try { gateway = gatewayConfiguration(env) } catch { return fees }
  if (gateway.base !== 'https://api.pagar.me/core/v5') return fees

  const signal = AbortSignal.timeout(8500)
  const authorization = `Basic ${Buffer.from(`${gateway.key}:`).toString('base64')}`
  async function readCharge(id) {
    const seen = new Set()
    const order = charges.get(id)
    let cursor, fee = 0, amount = 0, pixWithoutChargeId = false
    const finish = () => {
      if (seen.size && (!pixWithoutChargeId || amount === order.total_cents)) fees.set(id, fee)
    }
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${gateway.base}/payables`)
      url.searchParams.set('charge_id', id)
      url.searchParams.set('type', 'credit')
      url.searchParams.set('size', '100')
      if (cursor) url.searchParams.set('forward_cursor', cursor)
      const response = await fetcher(url, { headers: { Authorization: authorization }, cache: 'no-store', signal })
      if (!response.ok) return
      const body = await response.json()
      if (!Array.isArray(body.data) || !body.paging) return
      for (const row of body.data) {
        const pixWithoutId = row.charge_id == null && row.payment_method === 'pix' && order.payment_method === 'pix'
        if ((row.charge_id !== id && !pixWithoutId) || row.type !== 'credit' || !row.id || seen.has(row.id) ||
          !Number.isSafeInteger(row.fee) || row.fee < 0) return
        seen.add(row.id)
        pixWithoutChargeId ||= pixWithoutId
        amount += Number.isSafeInteger(row.amount) && row.amount > 0 ? row.amount : NaN
        fee += row.fee
      }
      const total = body.paging.total
      if (Number.isSafeInteger(total) && seen.size >= total) {
        if (seen.size === total && !body.paging.next) finish()
        return
      }
      const next = body.paging?.forward_cursor
      if (!next) {
        if (!body.paging.next && !(total > seen.size)) finish()
        return
      }
      if (next === cursor || !body.data.length) return
      cursor = next
    }
  }
  for (let offset = 0; offset < ids.length && !signal.aborted; offset += 5) {
    await Promise.allSettled(ids.slice(offset, offset + 5).map(readCharge))
  }
  return fees
}
