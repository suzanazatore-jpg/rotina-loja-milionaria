import { PaymentError } from './pagarme.js'

export async function applyOrderAccess(db, orderId, profileId, planIds = null, newProfile = false) {
  const { data, error } = await db.rpc('checkout_apply_access', { p_order: orderId, p_profile: profileId, p_plans: planIds, p_new_profile: newProfile })
  if (error) throw new PaymentError('Não foi possível reconciliar os acessos da compra.', 503)
  return data
}
export async function reverseOrderAccess(db, orderId) {
  if (process.env.CHECKOUT_ACCESS_LEDGER_ENABLED !== 'true') return { access_reversal: 'disabled' }
  const { data: order, error } = await db.from('orders').select('id,status,customer_id,event_id').eq('id', orderId).single()
  if (error) throw new PaymentError('Pedido não encontrado para revisar o acesso.', 503)
  if (!['refunded','chargedback'].includes(order.status)) return { access_reversal: 'unchanged' }
  const { data: grants, error: grantError } = await db.from('checkout_access_grants').select('profile_id').eq('order_id', order.id).maybeSingle()
  if (grantError) throw new PaymentError('Não foi possível localizar a origem do acesso.', 503)
  let result = { status: 'review_required', reason: 'missing_provenance' }
  if (grants) result = await applyOrderAccess(db, order.id, grants.profile_id)
  else {
    const prior = await db.from('webhook_events').select('processed_at').eq('pagarme_event_id', `access:${order.id}`).maybeSingle()
    if (prior.error) throw new PaymentError('Não foi possível consultar a liberação.', 503)
    if (!prior.data?.processed_at) result = { status: 'completed', reason: 'not_granted' }
  }
  const saved = await db.from('webhook_events').upsert({ pagarme_event_id: `revoke:${order.id}`, type: 'checkout.access_reversal', payload: { order_id: order.id, status: result.status, reason: result.reason || order.status }, processed_at: result.status === 'completed' ? new Date().toISOString() : null, error: result.status === 'review_required' ? 'review_required' : null }, { onConflict: 'pagarme_event_id' })
  if (saved.error) throw new PaymentError('Não foi possível registrar a revisão de acesso.', 503)
  return { access_reversal: result.status }
}
export async function expireOrderAccess(db) {
  if (process.env.CHECKOUT_ACCESS_LEDGER_ENABLED !== 'true') return { disabled: true, checked: 0 }
  const { data, error } = await db.from('checkout_access_grants').select('order_id,profile_id').is('revoked_at', null).eq('review_required', false).lte('next_expiration', new Date().toISOString()).order('next_expiration').limit(4)
  if (error) throw new PaymentError('Não foi possível consultar acessos vencidos.', 503)
  let review = 0
  for (const row of data || []) {
    const result = await applyOrderAccess(db, row.order_id, row.profile_id)
    if (result.status === 'review_required') review++
  }
  return { disabled: false, checked: data?.length || 0, review }
}
