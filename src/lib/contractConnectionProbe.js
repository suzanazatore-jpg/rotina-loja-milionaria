import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { contractPhone, contractWhatsappConfiguration } from './contractWhatsapp.js'
import { prepareContractWhatsappRelay, handleContractWhatsappRelay } from './contractWhatsappRelay.js'
import { runContractWhatsappDispatch } from './contractWhatsappDispatch.js'
import { buildContractPdf } from './contractPdf.js'
import { sendEmail, emailLayout } from './contractsServer.js'

const TYPE = 'contract.connection.probe'
const KINDS = ['invite', 'reminder', 'copy', 'code']
const EVENTS = { invite: 'contrato_enviado', reminder: 'contrato_lembrete', copy: 'contrato_assinado' }
const NAME = 'TESTE TECNICO - SEM COMPRA'
const PROGRAM = 'TESTE DE CONEXAO - SEM CONTRATO COMERCIAL'
const sha = text => createHash('sha256').update(text).digest('hex')
class ProbeError extends Error {
  constructor(message, status = 503) { super(message); this.status = status }
}
async function checked(query) {
  const result = await query
  if (result.error) throw new ProbeError('Não foi possível confirmar o registro do teste.')
  return result.data
}

export function connectionProbeConfig(env = process.env, now = Date.now()) {
  const expires = Date.parse(env.CONTRACT_CONNECTION_TEST_EXPIRES_AT)
  const phone = contractPhone(env.CONTRACT_CONNECTION_TEST_PHONE)
  const email = String(env.CONTRACT_CONNECTION_TEST_EMAIL || '').trim().toLowerCase()
  const secret = env.CONTRACT_WHATSAPP_RELAY_SECRET
  if (env.VERCEL_ENV !== 'preview' || env.CONTRACT_CONNECTION_TEST_ENABLED !== 'true' || !Number.isFinite(expires) || expires <= now || expires > now + 48 * 3600000 || !phone || !/^55[1-9]\d{10,11}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !secret || secret.length < 32) throw new ProbeError('Teste interno pausado ou prazo encerrado.')
  const base = new URL(env.CONTRACTS_APP_URL)
  if (base.protocol !== 'https:' || base.username || base.password || base.hash) throw new ProbeError('Endereço de homologação inválido.')
  const target = createHmac('sha256', secret).update(JSON.stringify([phone, email, expires])).digest('hex')
  return { phone, email, expires, secret, target, origin: base.origin }
}

function executionEnv(env) {
  return { ...env, CONTRACTS_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'true', CONTRACT_BOTCONVERSA_RELAY_ENABLED: 'true' }
}
function identity(kind, config) { return `probe-${sha(`${config.target}:${kind}`).slice(0, 40)}` }
function proof(id, config) { return createHmac('sha256', config.secret).update(`connection-probe:${id}:${config.expires}`).digest('base64url') }
function documentUrl(id, config, pdf = false) {
  const url = new URL('/api/contratos/teste/documento', config.origin)
  url.searchParams.set('id', id); url.searchParams.set('proof', proof(id, config))
  if (pdf) url.searchParams.set('pdf', '1')
  return url.href
}
function probePayload(kind, config) {
  const id = identity(kind, config)
  return { schema_version: 1, delivery_id: `${id}:whatsapp`, contract_id: id, evento: EVENTS[kind], name: NAME, phone: config.phone, program: PROGRAM, message: 'TESTE TECNICO AUTORIZADO. Nenhuma compra, assinatura comercial ou liberação de acesso foi realizada. Confira o documento demonstrativo no link.', link: documentUrl(id, config, kind === 'copy') }
}

export async function startWhatsappProbe(db, kind, { env = process.env, now = Date.now(), fetcher = fetch } = {}) {
  if (!EVENTS[kind]) throw new ProbeError('Código por WhatsApp continua indisponível.', 400)
  const config = connectionProbeConfig(env, now), body = probePayload(kind, config), sendingEnv = executionEnv(env)
  const destination = contractWhatsappConfiguration(sendingEnv)
  if (!destination.ready) throw new ProbeError('Entrada do Pabbly não configurada.')
  const metadata = { kind, target: config.target, expires_at: new Date(config.expires).toISOString(), environment: 'test', probe_id: body.contract_id }
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: body.contract_id, type: TYPE, payload: metadata, error: null }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  const row = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', body.contract_id).eq('type', TYPE).single())
  if (Object.entries(metadata).some(([key, value]) => row?.payload?.[key] !== value)) throw new ProbeError('O teste não corresponde ao destinatário autorizado.')
  return runContractWhatsappDispatch(db, { delivery_id: body.delivery_id, contract_id: body.contract_id, evento: body.evento, provider: 'botconversa' }, async () => {
    const envelope = await prepareContractWhatsappRelay(db, body, { env: sendingEnv, now })
    const response = await fetcher(destination.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Delivery-Id': body.delivery_id, ...(destination.token ? { Authorization: `Bearer ${destination.token}` } : {}) }, body: JSON.stringify({ ...body, ...envelope, relay_url: new URL('/api/contratos/teste/whatsapp-relay', config.origin).href }) })
    if (!response.ok) throw new ProbeError('Sem confirmação do Pabbly.')
  }, { env: sendingEnv, now })
}

export async function handleWhatsappProbe(request, { env = process.env, now = Date.now(), getDb, fetcher = fetch } = {}) {
  let config
  try { config = connectionProbeConfig(env, now) } catch { return Response.json({ error: 'Teste interno pausado.' }, { status: 503 }) }
  return handleContractWhatsappRelay(request, { env: executionEnv(env), now, getDb, fetcher, resolveContract: async (db, body) => {
    const kind = Object.keys(EVENTS).find(key => EVENTS[key] === body.evento)
    if (!kind) return null
    const expected = probePayload(kind, config)
    if (Object.keys(expected).some(key => body[key] !== expected[key])) return null
    const row = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', body.contract_id).eq('type', TYPE).maybeSingle())
    if (row?.payload?.target !== config.target || row.payload.kind !== kind || row.payload.environment !== 'test' || Date.parse(row.payload.expires_at) !== config.expires) return null
    // Fixture de transporte, sem inserir contrato, pedido, assinatura ou acesso.
    return { status: kind === 'copy' ? 'signed' : 'pending', signed_pdf_path: kind === 'copy' ? 'demonstrativo-sem-assinatura.pdf' : null }
  } })
}

export async function probePdf() {
  const body = '# TESTE TECNICO - SEM VALIDADE CONTRATUAL\nEste PDF demonstra somente a geracao e o transporte de um anexo.\nNenhuma compra foi realizada. Nenhum contrato comercial foi assinado.\nNenhum plano, acesso ou obrigacao foi criado.\nA jornada real de assinatura e liberacao sera validada separadamente.'
  return buildContractPdf({ body, title: 'TESTE TECNICO - PDF DEMONSTRATIVO SEM ASSINATURA', originalSha256: sha(body), validationUrl: 'Documento demonstrativo, sem assinatura comercial', events: [] })
}

export async function sendEmailProbe(db, kind, { env = process.env, now = Date.now(), fetcher = fetch } = {}) {
  if (!KINDS.includes(kind)) throw new ProbeError('Teste desconhecido.', 400)
  const config = connectionProbeConfig(env, now)
  if (!env.BREVO_API_KEY) throw new ProbeError('Brevo não configurado.')
  const id = `${identity(kind, config)}:email`
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: id, type: `${TYPE}.email`, payload: { kind, target: config.target, environment: 'test', state: 'ready' }, error: 'ready' }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  const claim = await checked(db.from('webhook_events').update({ payload: { kind, target: config.target, environment: 'test', state: 'processing' }, error: 'processing' }).eq('pagarme_event_id', id).eq('type', `${TYPE}.email`).eq('payload->>state', 'ready').select('pagarme_event_id'))
  if (!claim?.length) return { status: 'already_requested', message: 'Teste já solicitado. Confira o histórico antes de repetir.' }
  let state = 'review', messageId
  const labels = { invite: 'Link do documento de teste', reminder: 'Lembrete demonstrativo', copy: 'PDF demonstrativo em anexo', code: 'Código demonstrativo por e-mail' }
  const lead = kind === 'code' ? `Código de teste: ${randomInt(100000, 1000000)}. Este código não autoriza assinatura ou acesso e não deve ser usado em contratos reais.` : 'Este é um teste autorizado da conexão de contratos. Nenhuma compra foi realizada, nenhum contrato foi assinado e nenhum acesso foi liberado.'
  const url = documentUrl(identity(kind, config), config, kind === 'copy')
  try {
    const sent = await sendEmail({ to: config.email, name: 'Contato autorizado de homologação', subject: `[TESTE] ${labels[kind]} — Suzana Zatorre`, html: emailLayout(labels[kind], [lead], kind === 'code' ? null : { url, label: kind === 'copy' ? 'Abrir PDF demonstrativo' : 'Abrir documento de teste' }), text: `${lead}${kind === 'code' ? '' : `\n\n${url}`}`, tag: id, ...(kind === 'copy' ? { attachment: { name: 'teste-sem-validade-contratual.pdf', content: (await probePdf()).toString('base64') } } : {}) }, env, fetcher)
    if (sent.status === 'sent') { state = 'accepted'; messageId = sent.message_id }
  } catch { /* Sem repetição automática depois de resultado incerto. */ }
  const saved = await checked(db.from('webhook_events').update({ payload: { kind, target: config.target, environment: 'test', state, ...(messageId ? { message_id: messageId } : {}) }, error: state === 'accepted' ? null : 'review', processed_at: new Date(now).toISOString() }).eq('pagarme_event_id', id).eq('type', `${TYPE}.email`).eq('payload->>state', 'processing').select('pagarme_event_id'))
  if (!saved?.length) throw new ProbeError('Sem confirmação do registro; revisar antes de repetir.')
  return { status: state, ...(messageId ? { message_id: messageId } : {}) }
}

export async function connectionProbeStatus(db, env = process.env, now = Date.now()) {
  const config = connectionProbeConfig(env, now)
  const ids = Object.values(KINDS).map(kind => identity(kind, config))
  const columns = 'pagarme_event_id,type,payload,error,received_at'
  const groups = await Promise.all([
    checked(db.from('webhook_events').select(columns).eq('type', TYPE).in('pagarme_event_id', ids)),
    checked(db.from('webhook_events').select(columns).eq('type', `${TYPE}.email`).in('pagarme_event_id', ids.map(id => `${id}:email`))),
    checked(db.from('webhook_events').select(columns).in('type', ['contract.whatsapp.dispatch', 'contract.whatsapp.relay']).in('payload->>contract_id', ids)),
  ])
  const rows = groups.flat().filter(Boolean)
  return { enabled: true, phone: `${config.phone.slice(0, 4)}*****${config.phone.slice(-4)}`, email: config.email.replace(/^(.).+(@.*)$/, '$1***$2'), expires_at: new Date(config.expires).toISOString(), records: (rows || []).filter(row => ids.some(id => row.pagarme_event_id.startsWith(id) || row.payload?.contract_id === id)).map(row => ({ id: row.pagarme_event_id, type: row.type, state: row.payload?.state || row.error || 'prepared', kind: row.payload?.kind, received_at: row.received_at, message_id: row.payload?.message_id })) }
}

export async function handleProbeDocument(request, { env = process.env, now = Date.now() } = {}) {
  try {
    const config = connectionProbeConfig(env, now), url = new URL(request.url)
    const id = url.searchParams.get('id') || '', token = url.searchParams.get('proof') || ''
    const expected = proof(id, config)
    if (!KINDS.some(kind => identity(kind, config) === id) || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return new Response('Teste não encontrado.', { status: 404 })
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }
    if (url.searchParams.get('pdf') === '1') return new Response(new Uint8Array(await probePdf()), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="teste-sem-validade-contratual.pdf"' } })
    return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste técnico de contratos</title><main style="max-width:650px;margin:60px auto;padding:24px;font:18px/1.6 Arial;color:#252525"><h1>Teste técnico de conexão</h1><p><strong>Documento demonstrativo, sem validade contratual.</strong></p><p>Nenhuma compra foi realizada, nenhum contrato comercial foi assinado e nenhum acesso foi liberado.</p><p>O recebimento desta página confirma apenas que o link do teste abriu. A assinatura real será validada em outra etapa.</p><p>Suzana Zatorre Educacional</p></main></html>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } })
  } catch { return new Response('Teste interno pausado.', { status: 503 }) }
}
