import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { contractWhatsappDispatchGuardEnabled } from './contractWhatsappDispatch.js'

const TYPE = 'contract.whatsapp.relay'
const DAY = 86400000
const MAX_BODY = 16384
const EVENTS = ['contrato_enviado', 'contrato_lembrete', 'contrato_assinado']
const scope = env => env.VERCEL_ENV === 'production' ? 'production' : 'test'
export const contractWhatsappRelayEnabled = (env = process.env) => env.CONTRACT_BOTCONVERSA_RELAY_ENABLED === 'true'
class RelayError extends Error {
  constructor(status) { super('Não foi possível confirmar este envio.'); this.status = status }
}
async function checked(query) {
  const { data, error } = await query
  if (error) throw new RelayError(503)
  return data
}
function https(value) {
  let url
  try { url = new URL(value) } catch { throw new RelayError(503) }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new RelayError(503)
  return url.href
}
export function contractWhatsappRelayConfiguration(env = process.env) {
  const key = env.CONTRACT_WHATSAPP_RELAY_SECRET
  if (!key || key.length < 32) throw new RelayError(503)
  const base = https(env.CONTRACTS_APP_URL)
  const url = new URL('/api/contratos/whatsapp-relay', base).href
  const link = https(env.CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL)
  const copy = https(env.CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL)
  // Destinos vêm somente da configuração do servidor. Evita apontar de volta ao intermediário.
  if ([link, copy].some(target => target === url || target === env.CONTRACT_BOTCONVERSA_WEBHOOK_URL || target === env.CONTRACT_WHATSAPP_WEBHOOK_URL)) throw new RelayError(503)
  return { key, url, link, copy }
}
export function contractWhatsappRelayReady(env = process.env) {
  try { contractWhatsappRelayConfiguration(env); return true } catch { return false }
}
function canonical(input) {
  if (!input || Number(input.schema_version) !== 1 || !EVENTS.includes(input.evento) || typeof input.delivery_id !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(input.delivery_id) || typeof input.contract_id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.contract_id)) throw new RelayError(400)
  for (const [field, max] of [['name', 300], ['message', 6000], ['link', 2048]]) if (typeof input[field] !== 'string' || !input[field] || input[field].length > max) throw new RelayError(400)
  // O Pabbly converte sequências numéricas em JSON numbers na execução automática.
  // Só inteiros exatos são normalizados; a assinatura continua vinculada à mesma string.
  const phone = typeof input.phone === 'number' && Number.isSafeInteger(input.phone) ? String(input.phone) : input.phone
  if (typeof phone !== 'string' || !/^55\d{10,11}$/.test(phone) || input.code !== undefined || input.program !== undefined && (typeof input.program !== 'string' || input.program.length > 500)) throw new RelayError(400)
  // Não aceita destinos externos no corpo; link é conteúdo assinado, não o endpoint de envio.
  const body = { schema_version: 1, delivery_id: input.delivery_id, contract_id: input.contract_id, evento: input.evento, name: input.name, phone, message: input.message, ...(input.program ? { program: input.program } : {}), link: input.link }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) throw new RelayError(413)
  return body
}
const fingerprint = (body, key) => createHmac('sha256', key).update(`payload:${JSON.stringify(body)}`).digest('hex')
const signature = (digest, expires, env, key) => createHmac('sha256', key).update(JSON.stringify(['relay-v1', scope(env), expires, digest])).digest('base64url')
const rowKey = (id, env) => `contract-relay:${createHash('sha256').update(JSON.stringify([scope(env), id])).digest('hex')}`
function active(env) {
  return contractWhatsappRelayEnabled(env) && contractWhatsappDispatchGuardEnabled(env) && env.CONTRACTS_ENABLED === 'true' && (env.CONTRACT_WHATSAPP_PROVIDER || 'botconversa') === 'botconversa'
}

// Executado depois da reserva do aplicativo e antes do POST ao Pabbly.
// Só o aplicativo assina o conteúdo. O token não é gravado no banco nem devolvido pelo painel.
export async function prepareContractWhatsappRelay(db, input, { env = process.env, now = Date.now() } = {}) {
  if (!active(env) || !db) throw new RelayError(503)
  const config = contractWhatsappRelayConfiguration(env), body = canonical(input)
  const digest = fingerprint(body, config.key), id = rowKey(body.delivery_id, env)
  const metadata = { schema_version: 1, delivery_id: body.delivery_id, contract_id: body.contract_id, evento: body.evento, provider: 'botconversa', environment: scope(env), fingerprint: digest }
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: id, type: TYPE, payload: { ...metadata, state: 'waiting', created_at: new Date(now).toISOString(), expires_at: new Date(now + DAY).toISOString() }, error: 'waiting', processed_at: null }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  const row = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', id).eq('type', TYPE).single())
  if (!row || Object.entries(metadata).some(([field, value]) => row.payload?.[field] !== value)) throw new RelayError(409)
  const expires = Date.parse(row.payload.expires_at)
  if (!Number.isFinite(expires) || expires <= now) throw new RelayError(409)
  return { relay_url: config.url, relay_token: `1.${expires}.${signature(digest, expires, env, config.key)}` }
}

function verify(input, token, env, now, key) {
  const match = /^1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token || '')
  if (!match || Number(match[1]) <= now || Number(match[1]) > now + DAY) throw new RelayError(403)
  const body = canonical(input), digest = fingerprint(body, key)
  const expected = Buffer.from(signature(digest, Number(match[1]), env, key))
  if (!timingSafeEqual(expected, Buffer.from(match[2]))) throw new RelayError(403)
  return { body, digest, expires: Number(match[1]) }
}
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const result = (state, duplicate = false) => response({ status: state === 'accepted' ? 'accepted' : state === 'canceled' ? 'canceled' : 'review', delivery_state: state === 'accepted' ? 'provider_accepted' : state === 'canceled' ? 'not_submitted' : 'unknown', duplicate }, ['accepted', 'canceled'].includes(state) ? 200 : 202)

async function smallJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new RelayError(413)
  if (!request.body) throw new RelayError(400)
  const reader = request.body.getReader(), chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel(); throw new RelayError(413) }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RelayError(400) }
}

// Uma única etapa do Pabbly chama este endpoint. Toda reexecução, inclusive isolada,
// passa pela mesma reserva antes do HTTP ao BotConversa. Não há lease que reabra envios incertos.
export async function handleContractWhatsappRelay(request, { getDb, env = process.env, now = Date.now(), fetcher = fetch, resolveContract } = {}) {
  if (request.method !== 'POST') return response({ error: 'Método inválido.' }, 405)
  if (!active(env)) return response({ error: 'Receptor pausado.' }, 503)
  try {
    const config = contractWhatsappRelayConfiguration(env)
    const authorization = request.headers.get('authorization') || ''
    if (!/^Bearer 1\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(authorization)) return response({ error: 'Não autorizado.' }, 401)
    const { body, digest, expires } = verify(await smallJson(request), authorization.slice(7), env, now, config.key)
    const db = getDb(), id = rowKey(body.delivery_id, env)
    const row = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', id).eq('type', TYPE).maybeSingle())
    const saved = row?.payload
    if (!saved || saved.fingerprint !== digest || saved.environment !== scope(env) || saved.provider !== 'botconversa' || saved.contract_id !== body.contract_id || saved.evento !== body.evento || Date.parse(saved.expires_at) !== expires) throw new RelayError(403)
    if (saved.state !== 'waiting') return result(saved.state, true)
    const claim = randomUUID(), pending = { ...saved, state: 'dispatching', claim, started_at: new Date(now).toISOString() }
    const claimed = await checked(db.from('webhook_events').update({ payload: pending, error: 'dispatching' }).eq('pagarme_event_id', id).eq('type', TYPE).eq('payload->>state', 'waiting').select('pagarme_event_id'))
    if (!claimed?.length) return result('review', true)
    let state = 'review'
    try {
      const contract = resolveContract ? await resolveContract(db, body) : await checked(db.from('contracts').select('status,signed_pdf_path').eq('id', body.contract_id).maybeSingle())
      if (!contract) throw new RelayError(409)
      const eligible = body.evento === 'contrato_assinado' ? contract.status === 'signed' && Boolean(contract.signed_pdf_path) : ['pending', 'viewed'].includes(contract.status)
      if (!eligible) state = 'canceled'
      else {
        const sent = await fetcher(body.evento === 'contrato_assinado' ? config.copy : config.link, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Delivery-Id': body.delivery_id }, body: JSON.stringify(body) })
        if (sent.ok) state = 'accepted'
      }
    } catch { /* Resultado incerto: sem erro bruto ou payload no registro. */ }
    const finished = { ...pending, state }
    delete finished.claim
    const terminal = ['accepted', 'canceled'].includes(state)
    const updated = await checked(db.from('webhook_events').update({ payload: finished, error: terminal ? null : 'review', processed_at: terminal ? new Date(now).toISOString() : null }).eq('pagarme_event_id', id).eq('type', TYPE).eq('payload->>claim', claim).select('pagarme_event_id'))
    if (!updated?.length) throw new RelayError(503)
    return result(state)
  } catch (error) {
    return response({ error: 'Não foi possível confirmar este envio.' }, error instanceof RelayError ? error.status : 503)
  }
}

export function contractWhatsappRelaySummary(row, now = Date.now()) {
  const data = row.payload
  const stale = data.state === 'waiting' && (now - Date.parse(data.created_at) >= 900000 || now >= Date.parse(data.expires_at)) || data.state === 'dispatching' && now - Date.parse(data.started_at) >= 60000
  return { id: row.pagarme_event_id, contract_id: data.contract_id, state: stale ? 'review' : data.state, created_at: data.created_at, started_at: data.started_at || null }
}
