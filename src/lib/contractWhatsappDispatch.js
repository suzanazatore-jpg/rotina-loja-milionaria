import { createHash, randomUUID } from 'node:crypto'

export const contractWhatsappDispatchGuardEnabled = (env = process.env) => env.CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED === 'true'
const TYPE = 'contract.whatsapp.dispatch'
const environment = env => env.VERCEL_ENV === 'production' ? 'production' : 'test'
async function checked(query) {
  const { data, error } = await query
  if (error) throw new Error('whatsapp_dispatch_unavailable')
  return data
}

// Reserva antes do HTTP. Uma tentativa cujo resultado é desconhecido nunca é reaberta
// automaticamente: retomar depois de um timeout pode repetir uma mensagem já aceita.
// O receptor ainda precisa impedir suas próprias repetições pelo delivery_id.
export async function runContractWhatsappDispatch(db, identity, dispatch, { env = process.env, now = Date.now() } = {}) {
  if (!db) throw new Error('whatsapp_dispatch_database_required')
  const { delivery_id, contract_id, evento, provider } = identity
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(delivery_id || '') || typeof contract_id !== 'string' || !contract_id || !['botconversa', 'papo_reto'].includes(provider)) throw new Error('whatsapp_dispatch_identity_invalid')
  const scope = environment(env)
  const key = `contract-whatsapp:${createHash('sha256').update(JSON.stringify([scope, delivery_id])).digest('hex')}`
  const metadata = { schema_version: 1, delivery_id, contract_id, evento, provider, environment: scope }
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: key, type: TYPE, payload: { ...metadata, state: 'ready' }, error: 'ready', processed_at: null }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  const row = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', key).eq('type', TYPE).single())
  if (!row || Object.entries(metadata).some(([name, value]) => row.payload?.[name] !== value)) throw new Error('whatsapp_dispatch_identity_conflict')
  const result = { provider, delivery_id }
  if (row.payload.state === 'accepted') return { ...result, status: 'sent', delivery_state: 'accepted' }
  if (row.payload.state !== 'ready') return { ...result, status: 'review', delivery_state: 'unknown' }
  const claim = randomUUID()
  const pending = { ...metadata, state: 'dispatching', claim, started_at: new Date(now).toISOString() }
  const claimed = await checked(db.from('webhook_events').update({ payload: pending, error: 'dispatching' }).eq('pagarme_event_id', key).eq('type', TYPE).eq('payload->>state', 'ready').select('pagarme_event_id'))
  if (!claimed?.length) return { ...result, status: 'review', delivery_state: 'unknown' }
  let accepted = false
  try { await dispatch(); accepted = true } catch { /* Não guardar erro externo que possa conter dados do envio. */ }
  const finished = { ...pending, state: accepted ? 'accepted' : 'review' }
  delete finished.claim
  const saved = await checked(db.from('webhook_events').update({ payload: finished, error: accepted ? null : 'review', processed_at: accepted ? new Date(now).toISOString() : null }).eq('pagarme_event_id', key).eq('type', TYPE).eq('payload->>claim', claim).select('pagarme_event_id'))
  if (!saved?.length) throw new Error('whatsapp_dispatch_unavailable')
  return { ...result, status: accepted ? 'sent' : 'review', delivery_state: accepted ? 'accepted' : 'unknown' }
}
