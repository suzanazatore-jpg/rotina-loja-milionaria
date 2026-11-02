import { createHash, randomUUID } from 'node:crypto'

const TYPE = 'contract.task'
const KINDS = ['invite', 'reminder', 'signed_copy', 'completion']
const MAX_ATTEMPTS = 8
const LEASE_MS = 180000
export const contractQueueEnabled = (env = process.env) => env.CONTRACT_DELIVERY_QUEUE_ENABLED === 'true'
const mode = env => env.VERCEL_ENV === 'production' ? 'production' : 'test'
async function checked(query) {
  const { data, error } = await query
  if (error) throw new Error('contract_queue_unavailable')
  return data
}

// Servidor exclusivo. Não persiste OTP, mensagens, tokens, URLs nem contatos.
export async function enqueueContractTask(db, { contractId, kind, channel, occurrence = 'initial' }, { env = process.env, now = Date.now() } = {}) {
  if (!KINDS.includes(kind) || !['email', 'whatsapp', 'internal'].includes(channel) || (kind === 'completion') !== (channel === 'internal')) throw new Error('contract_task_invalid')
  const environment = mode(env)
  const target = channel === 'whatsapp' ? env.CONTRACT_WHATSAPP_PROVIDER || 'botconversa' : channel
  if (channel === 'whatsapp' && target === 'disabled') return null
  const key = `contract-task:${createHash('sha256').update(JSON.stringify([contractId, kind, channel, occurrence, environment])).digest('hex')}`
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: key, type: TYPE, payload: { schema_version: 1, contract_id: contractId, kind, channel, occurrence, environment, target, attempts: 0, next_attempt_at: new Date(now).toISOString() }, error: 'ready', processed_at: null }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  return key
}

export async function runContractTask(db, key, dispatch, { env = process.env, now = Date.now() } = {}) {
  if (!contractQueueEnabled(env) || env.CONTRACTS_ENABLED !== 'true') return { status: 'paused' }
  const row = await checked(db.from('webhook_events').select('pagarme_event_id,payload,error,processed_at').eq('pagarme_event_id', key).eq('type', TYPE).maybeSingle())
  if (!row || row.processed_at || !['ready', 'retry', 'processing'].includes(row.error)) return { status: 'unchanged' }
  const task = row.payload
  if (task.environment !== mode(env) || new Date(task.next_attempt_at).getTime() > now) return { status: 'waiting' }
  if (task.channel === 'whatsapp' && task.target !== (env.CONTRACT_WHATSAPP_PROVIDER || 'botconversa')) return { status: 'provider_changed' }
  if (!KINDS.includes(task.kind) || task.schema_version !== 1 || !Number.isInteger(task.attempts) || task.attempts < 0) throw new Error('contract_task_invalid')
  const claim = randomUUID()
  const payload = { ...task, state: 'processing', attempts: task.attempts + 1, claim, next_attempt_at: new Date(now + LEASE_MS).toISOString() }
  const claimed = await checked(db.from('webhook_events').update({ error: 'processing', payload }).eq('pagarme_event_id', key).is('processed_at', null).eq('error', row.error).eq('payload->>next_attempt_at', task.next_attempt_at).select('pagarme_event_id'))
  if (!claimed?.length) return { status: 'busy' }
  let outcome
  try { outcome = await dispatch(task, key) } catch { outcome = { status: 'retry' } }
  const done = ['sent', 'completed', 'canceled'].includes(outcome?.status)
  const review = outcome?.status === 'review'
  const failed = !done && payload.attempts >= MAX_ATTEMPTS
  const savedPayload = { ...payload, state: review ? 'review' : outcome?.status === 'sent' ? 'accepted' : done ? outcome.status : failed ? 'failed' : 'retry', next_attempt_at: new Date(now + Math.min(86400000, 300000 * 2 ** (payload.attempts - 1))).toISOString() }
  delete savedPayload.claim
  await checked(db.from('webhook_events').update({ payload: savedPayload, error: review ? 'review' : done ? null : failed ? 'failed' : 'retry', processed_at: done ? new Date(now).toISOString() : null }).eq('pagarme_event_id', key).eq('payload->>claim', claim))
  return { status: review ? 'review' : done ? savedPayload.state : failed ? 'failed' : 'retry' }
}

export async function processContractTaskQueue(db, dispatch, deps = {}) {
  const env = deps.env || process.env, now = deps.now ?? Date.now()
  if (!contractQueueEnabled(env) || env.CONTRACTS_ENABLED !== 'true') return { disabled: true, checked: 0 }
  const provider = env.CONTRACT_WHATSAPP_PROVIDER || 'botconversa'
  if (!['botconversa', 'papo_reto', 'disabled'].includes(provider)) throw new Error('whatsapp_provider_invalid')
  const due = await checked(db.from('webhook_events').select('pagarme_event_id').eq('type', TYPE).is('processed_at', null).eq('payload->>environment', mode(env)).or(`payload->>channel.neq.whatsapp,payload->>target.eq.${provider}`).in('error', ['ready', 'retry', 'processing']).lte('payload->>next_attempt_at', new Date(now).toISOString()).order('received_at').limit(3))
  const results = []
  for (const row of due || []) results.push(await runContractTask(db, row.pagarme_event_id, dispatch, { env, now }))
  return { disabled: false, checked: results.length, accepted: results.filter(row => row.status === 'accepted').length, completed: results.filter(row => row.status === 'completed').length, failed: results.filter(row => row.status === 'failed').length, review_required: results.filter(row => row.status === 'review').length }
}
