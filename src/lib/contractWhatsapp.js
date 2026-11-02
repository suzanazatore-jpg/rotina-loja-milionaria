import { randomUUID } from 'node:crypto'
import { contractWhatsappDispatchGuardEnabled, runContractWhatsappDispatch } from './contractWhatsappDispatch.js'
import { contractWhatsappRelayEnabled, contractWhatsappRelayConfiguration, prepareContractWhatsappRelay } from './contractWhatsappRelay.js'

export const CONTRACT_WHATSAPP_EVENTS = ['contrato_enviado', 'contrato_lembrete', 'contrato_codigo', 'contrato_assinado']

export function contractPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  return /^55\d{10,11}$/.test(phone) ? phone : null
}

// O receptor é configurado pelo servidor; nenhum endpoint do Papo_reto é presumido.
export function contractWhatsappConfiguration(env = process.env) {
  const provider = env.CONTRACT_WHATSAPP_PROVIDER || 'botconversa'
  if (!['botconversa', 'papo_reto', 'disabled'].includes(provider)) throw new Error('whatsapp_provider_invalid')
  if (provider === 'disabled') return { provider, ready: false }
  const destination = provider === 'papo_reto' ? env.CONTRACT_PAPO_RETO_WEBHOOK_URL : env.CONTRACT_BOTCONVERSA_WEBHOOK_URL || env.CONTRACT_WHATSAPP_WEBHOOK_URL
  if (!destination) return { provider, ready: false }
  let url
  try { url = new URL(destination) } catch { throw new Error('whatsapp_destination_invalid') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('whatsapp_destination_invalid')
  const token = provider === 'papo_reto' ? env.CONTRACT_PAPO_RETO_WEBHOOK_TOKEN : env.CONTRACT_BOTCONVERSA_WEBHOOK_TOKEN
  // O receptor futuro deve validar a autenticação antes da troca de provedor.
  if (provider === 'papo_reto' && !token) return { provider, ready: false }
  return { provider, ready: true, url: url.href, token }
}

export function contractWhatsappReady(env = process.env) {
  try { return contractWhatsappConfiguration(env).ready } catch { return false }
}

export function contractWhatsappCodeReady(env = process.env) {
  return env.CONTRACT_WHATSAPP_OTP_ENABLED === 'true' && contractWhatsappReady(env)
}

export async function sendContractWhatsapp(payload, env = process.env, fetcher = fetch, deps = {}) {
  const config = contractWhatsappConfiguration(env)
  const phone = contractPhone(payload.phone)
  if (!config.ready || !phone) return { status: 'skipped', provider: config.provider }
  if (!CONTRACT_WHATSAPP_EVENTS.includes(payload.evento)) throw new Error('whatsapp_event_invalid')
  if (payload.evento === 'contrato_codigo' && !contractWhatsappCodeReady(env)) return { status: 'skipped', provider: config.provider }
  const guarded = contractWhatsappDispatchGuardEnabled(env)
  const relay = config.provider === 'botconversa' && contractWhatsappRelayEnabled(env)
  if (relay) {
    if (!guarded || env.CONTRACTS_ENABLED !== 'true' || payload.evento === 'contrato_codigo') throw new Error('whatsapp_relay_not_ready')
    contractWhatsappRelayConfiguration(env)
  }
  if (guarded && !payload.delivery_id && payload.evento !== 'contrato_codigo') throw new Error('whatsapp_stable_delivery_id_required')
  const deliveryId = payload.delivery_id || randomUUID()
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(deliveryId)) throw new Error('whatsapp_delivery_id_invalid')
  // Campos compatíveis com o webhook atual. O protocolo v1 é o contrato do receptor futuro.
  const body = { schema_version: 1, delivery_id: deliveryId, contract_id: payload.contract_id, evento: payload.evento, name: payload.name, phone, message: payload.message, ...(payload.program ? { program: payload.program } : {}), ...(payload.link ? { link: payload.link } : {}), ...(payload.code ? { code: payload.code } : {}) }
  const transmit = async () => {
    const envelope = relay ? await prepareContractWhatsappRelay(deps.db, body, { env, now: deps.now }) : {}
    const response = await fetcher(config.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Delivery-Id': deliveryId, ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
      body: JSON.stringify({ ...body, ...envelope }),
    })
    if (!response.ok) throw new Error(`whatsapp_http_${response.status}`)
  }
  if (guarded) return runContractWhatsappDispatch(deps.db, { delivery_id: deliveryId, contract_id: payload.contract_id, evento: payload.evento, provider: config.provider }, transmit, { env, now: deps.now })
  await transmit()
  // "sent" preserva o contrato legado; delivery_state é somente aceite HTTP, não entrega/leitura.
  return { status: 'sent', delivery_state: 'accepted', provider: config.provider, delivery_id: deliveryId }
}
