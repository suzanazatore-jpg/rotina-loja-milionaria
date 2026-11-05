import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { contractConfig, buildContractFields, renderContract, sameDocument, maskDocument, maskEmail, maskPhone, formatDocument, REMINDER_HOURS } from './contractTemplates.js'
import { buildContractPdf } from './contractPdf.js'
import { contractPhone, contractWhatsappReady, sendContractWhatsapp } from './contractWhatsapp.js'
import { contractQueueEnabled, enqueueContractTask, runContractTask } from './contractTaskQueue.js'

export { contractPhone } from './contractWhatsapp.js'

export class ContractError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

const OTP_MINUTES = 10
const OTP_MAX_SENDS = 6
const OTP_MAX_ATTEMPTS = 5
const OTP_COOLDOWN_SECONDS = 45

export function contractsEnabled(env = process.env) { return env.CONTRACTS_ENABLED === 'true' }
export function appUrl(env = process.env) { return (env.CONTRACTS_APP_URL || 'https://rotina.suzanazatorre.com.br').replace(/\/$/, '') }
function secret(env = process.env) {
  const value = env.CONTRACT_TOKEN_SECRET
  if (!value || value.length < 32) throw new ContractError('Módulo de contratos sem CONTRACT_TOKEN_SECRET configurado.', 503)
  return value
}
const sha256 = value => createHash('sha256').update(value).digest('hex')

// Link estável por contrato: o mesmo token serve para reenvios e lembretes, sem guardar o token em si.
export function contractToken(contractId, env = process.env) {
  return `${contractId}.${createHmac('sha256', secret(env)).update(`contract:${contractId}`).digest('base64url').slice(0, 32)}`
}
export function parseContractToken(token, env = process.env) {
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(String(token || ''))
  if (!match) return null
  const expected = Buffer.from(contractToken(match[1], env))
  const actual = Buffer.from(String(token))
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? match[1] : null
}
export function signingUrl(contractId, env = process.env) { return `${appUrl(env)}/assinar/${contractToken(contractId, env)}` }
export function validationUrl(contractId, env = process.env) { return `${appUrl(env)}/contrato/validar/${contractId}` }
function otpHash(contractId, code, env = process.env) { return createHmac('sha256', secret(env)).update(`otp:${contractId}:${code}`).digest('hex') }

async function must(query, message = 'Falha no módulo de contratos.', status = 500) {
  const { data, error } = await query
  if (error) throw new ContractError(message, status)
  return data
}

export async function logContractEvent(db, contractId, type, { channel = null, ip = null, userAgent = null, detail = {} } = {}) {
  try { await db.from('contract_events').insert({ contract_id: contractId, type, channel, ip, user_agent: userAgent ? String(userAgent).slice(0, 400) : null, detail }) }
  catch { /* O registro de evento não interrompe o fluxo principal. */ }
}

// ---------------------------------------------------------------- envios

async function sendEmail({ to, name, subject, html, text, attachment, tag }, env = process.env, fetcher = fetch) {
  if (!env.BREVO_API_KEY || !to) return { status: 'skipped' }
  const body = { sender: { name: 'Suzana Zatorre', email: 'suporte@suzanazatorre.com.br' }, to: [{ email: to, name: name || undefined }], subject, htmlContent: html, textContent: text, headers: { 'X-Mailin-custom': tag } }
  if (attachment) body.attachment = [attachment]
  const response = await fetcher('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY }, signal: AbortSignal.timeout(15000), body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Brevo HTTP ${response.status}`)
  return { status: 'sent' }
}

async function sendWhatsapp(payload, env = process.env, fetcher = fetch) {
  return sendContractWhatsapp(payload, env, fetcher)
}

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function emailLayout(title, paragraphs, button) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.5"><h2 style="color:#5b1a26">${escapeHtml(title)}</h2>${paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}${button ? `<p style="margin:28px 0"><a href="${escapeHtml(button.url)}" style="background:#5b1a26;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(button.label)}</a></p><p style="font-size:12px;color:#777">Se o botão não abrir, copie o link: ${escapeHtml(button.url)}</p>` : ''}<p style="font-size:12px;color:#777">Suzana Zatorre Educacional</p></div>`
}

const MESSAGES = {
  invite: (first, program) => ({ subject: `Seu contrato ${program} está pronto para assinatura`, lead: `Oi, ${first}! Seu pagamento foi confirmado. Para liberar o seu acesso, falta só assinar o contrato do ${program}. Leva menos de 2 minutos, direto pelo celular.` }),
  reminder: (first, program) => ({ subject: `Lembrete: assine o contrato ${program} para liberar seu acesso`, lead: `Oi, ${first}! Seu contrato do ${program} ainda está aguardando assinatura. Assim que assinar, seu acesso é liberado na hora.` }),
}

export async function sendContractInvite(db, contract, customer, kind = 'invite', deps = {}) {
  const env = deps.env || process.env
  if (contractQueueEnabled(env)) {
    const occurrence = deps.occurrence || (kind === 'invite' ? 'initial' : randomUUID())
    const tasks = []
    for (const channel of ['email', 'whatsapp']) {
      if (channel === 'email' ? !customer.email : !contractPhone(customer.phone)) continue
      const key = await enqueueContractTask(db, { contractId: contract.id, kind, channel, occurrence }, deps)
      if (key) tasks.push([channel, key])
    }
    const results = {}
    for (const [channel, key] of tasks) {
      const result = deps.defer ? { status: 'queued' } : await runContractTask(db, key, (task, deliveryId) => deliverContractNotification(db, task, deliveryId, deps), deps)
      results[channel] = result.status
    }
    return results
  }
  return deliverContractInvite(db, contract, customer, kind, deps)
}

async function deliverContractInvite(db, contract, customer, kind, deps = {}) {
  const env = deps.env || process.env, fetcher = deps.fetcher || fetch
  const url = signingUrl(contract.id, env)
  const first = String(customer.name || '').trim().split(/\s+/)[0] || 'tudo bem'
  const program = contract.fields?.programa || 'seu programa'
  const msg = MESSAGES[kind](first, program)
  const results = {}
  for (const [channel, run] of [
    ['email', () => sendEmail({ to: customer.email, name: customer.name, subject: msg.subject, html: emailLayout(msg.subject, [msg.lead], { url, label: 'Ler e assinar o contrato' }), text: `${msg.lead}\n\n${url}`, tag: `contract-${kind}:${contract.id}` }, env, fetcher)],
    ['whatsapp', () => sendWhatsapp({ evento: kind === 'invite' ? 'contrato_enviado' : 'contrato_lembrete', contract_id: contract.id, name: customer.name, phone: customer.phone, link: url, message: `${msg.lead}\n\n👉 ${url}`, delivery_id: deps.deliveryId }, env, fetcher)],
  ]) {
    if (deps.channel && deps.channel !== channel) continue
    try { results[channel] = (await run()).status } catch { results[channel] = 'failed' }
    await logContractEvent(db, contract.id, kind === 'invite' ? 'sent' : 'reminder_sent', { channel, detail: { status: results[channel], ...(deps.deliveryId ? { delivery_id: deps.deliveryId, delivery_state: results[channel] === 'sent' ? 'accepted' : results[channel] } : {}) } })
  }
  return results
}

// ---------------------------------------------------------------- criação / trava de acesso

export async function createContractForOrder(db, order, offer, config, deps = {}) {
  const existing = await must(db.from('contracts').select('*').eq('order_id', order.id).maybeSingle())
  if (existing) return { contract: existing, created: false }
  const template = await must(db.from('contract_templates').select('*').eq('slug', config.template).eq('active', true).maybeSingle())
  if (!template) throw new ContractError(`Modelo de contrato "${config.template}" não encontrado ou inativo.`, 409)
  const customer = await must(db.from('customers').select('*').eq('id', order.customer_id).single())
  const fields = buildContractFields({ order, customer: deps.purchaseBuyer || customer, offer, config })
  const { text, missing } = renderContract(template.body, fields)
  if (missing.length) throw new ContractError(`Modelo com campos não preenchidos: ${missing.join(', ')}. Revise o contrato antes de emitir.`, 409)
  const id = randomUUID()
  const now = new Date(deps.now || Date.now())
  const row = { id, order_id: order.id, customer_id: customer.id, offer_id: offer.id, template_id: template.id, template_version: template.version, status: 'pending', token_hash: sha256(contractToken(id, deps.env)), fields: { ...fields, _gate_access: config.gate_access }, body: text, original_sha256: sha256(text), next_reminder_at: new Date(now.getTime() + REMINDER_HOURS[0] * 3600e3).toISOString(), fulfillment_status: config.gate_access ? 'awaiting_signature' : 'not_gated' }
  const inserted = await db.from('contracts').insert(row).select('*').single()
  if (inserted.error) {
    // Corrida entre webhook e conciliação: o outro processo já criou o contrato.
    if (inserted.error.code === '23505') return { contract: await must(db.from('contracts').select('*').eq('order_id', order.id).single()), created: false }
    throw new ContractError('Não foi possível criar o contrato.', 500)
  }
  await logContractEvent(db, id, 'created', { detail: { template: template.slug, version: template.version, missing_fields: missing } })
  const sent = await sendContractInvite(db, inserted.data, customer, 'invite', deps)
  return { contract: inserted.data, created: true, sent }
}

/**
 * Chamado antes de liberar o acesso de um pedido pago.
 * Retorna blocked=true enquanto o contrato exigido não estiver assinado.
 */
export async function contractGate(db, order, deps = {}) {
  const env = deps.env || process.env
  if (!contractsEnabled(env)) return { required: false }
  let purchase = order
  if (order.event_id?.startsWith('cycle:') || order.parent_order_id) {
    if (!order.parent_order_id) throw new ContractError('Renovação sem compra original.', 409)
    purchase = await must(db.from('orders').select('*').eq('id', order.parent_order_id).single())
    if (!purchase || purchase.parent_order_id || purchase.customer_id !== order.customer_id || purchase.offer_id !== order.offer_id || purchase.status !== 'paid') throw new ContractError('Compra original da renovação requer revisão.', 409)
  }
  let contract = await must(db.from('contracts').select('*').eq('order_id', purchase.id).maybeSingle())
  if (contract) {
    if (contractQueueEnabled(env) && ['pending', 'viewed'].includes(contract.status)) {
      const customer = await must(db.from('customers').select('name,email,phone').eq('id', contract.customer_id).single())
      await sendContractInvite(db, contract, customer, 'invite', { ...deps, defer: true })
    }
    return contractDecision(contract)
  }
  let offer, purchaseBuyer
  if (purchase.event_id?.startsWith('checkout:')) {
    const snapshot = await must(db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${purchase.event_id.slice(9)}`).maybeSingle())
    const policy = snapshot?.payload?.contract_policy
    purchaseBuyer = snapshot?.payload?.fiscal_buyer
    if (policy) {
      if (policy.version !== 1 || policy.offer_id !== purchase.offer_id || !policy.contract || typeof policy.contract.required !== 'boolean') throw new ContractError('Regra de contrato da compra inválida.', 409)
      offer = { id: purchase.offer_id, name: policy.name, billing_interval: policy.billing_interval, checkout_config: { contract: policy.contract } }
    }
  }
  // Pedidos anteriores ao snapshot mantêm compatibilidade pela configuração atual da oferta.
  offer ||= await must(db.from('offers').select('*').eq('id', purchase.offer_id).single())
  const config = contractConfig(offer)
  if (offer.checkout_config?.contract?.required === true && !config) throw new ContractError('Oferta com contrato obrigatório sem configuração válida.', 409)
  if (!config) return { required: false }
  ;({ contract } = await createContractForOrder(db, purchase, offer, config, {...deps, purchaseBuyer}))
  return contractDecision(contract)
}

function contractDecision(contract) {
  const signed = contract.status === 'signed'
  const gated = contract.fields?._gate_access ?? contract.fulfillment_status !== 'not_gated'
  return { required: true, signed, blocked: contract.status === 'canceled' || gated && !signed, contract_id: contract.id }
}

// ---------------------------------------------------------------- página pública

async function loadByToken(db, token) {
  const id = parseContractToken(token)
  if (!id) throw new ContractError('Link de contrato inválido.', 404)
  const contract = await must(db.from('contracts').select('*').eq('id', id).maybeSingle())
  if (!contract) throw new ContractError('Contrato não encontrado.', 404)
  const customer = await must(db.from('customers').select('id,name,email,phone,document').eq('id', contract.customer_id).single())
  return { contract, customer }
}

export async function viewContract(db, token, meta = {}) {
  const { contract, customer } = await loadByToken(db, token)
  if (contract.status === 'pending') {
    await db.from('contracts').update({ status: 'viewed', updated_at: new Date().toISOString() }).eq('id', contract.id).eq('status', 'pending')
    contract.status = 'viewed'
  }
  if (contract.status !== 'signed') await logContractEvent(db, contract.id, 'viewed', { ip: meta.ip, userAgent: meta.userAgent })
  return {
    status: contract.status,
    title: contract.fields?.programa ? `Contrato — ${contract.fields.programa}` : 'Contrato',
    body: contract.body,
    original_sha256: contract.original_sha256,
    signer: { name: customer.name, document: maskDocument(customer.document), email: maskEmail(customer.email), phone: maskPhone(customer.phone) },
    channels: { whatsapp: Boolean(contractPhone(customer.phone) && contractWhatsappReady()), email: Boolean(customer.email && process.env.BREVO_API_KEY) },
    signed_at: contract.signed_at,
    has_pdf: Boolean(contract.signed_pdf_path),
    access_status: contract.fulfillment_status || 'awaiting_signature',
    validation_url: validationUrl(contract.id),
  }
}

export async function requestContractCode(db, token, channel, meta = {}, deps = {}) {
  const env = deps.env || process.env, fetcher = deps.fetcher || fetch, now = Date.now()
  if (!['whatsapp', 'email'].includes(channel)) throw new ContractError('Canal inválido.')
  const { contract, customer } = await loadByToken(db, token)
  if (contract.status === 'signed') throw new ContractError('Este contrato já foi assinado.', 409)
  if (contract.status === 'canceled') throw new ContractError('Este contrato foi cancelado.', 410)
  if (contract.otp_sent_count >= OTP_MAX_SENDS) throw new ContractError('Limite de códigos atingido. Fale com o suporte.', 429)
  if (contract.otp_expires_at && new Date(contract.otp_expires_at).getTime() - OTP_MINUTES * 60e3 > now - OTP_COOLDOWN_SECONDS * 1e3) throw new ContractError('Aguarde alguns segundos para pedir um novo código.', 429)
  const code = String(randomInt(0, 1e6)).padStart(6, '0')
  const updated = await must(db.from('contracts').update({ otp_hash: otpHash(contract.id, code, env), otp_channel: channel, otp_expires_at: new Date(now + OTP_MINUTES * 60e3).toISOString(), otp_attempts: 0, otp_sent_count: contract.otp_sent_count + 1, updated_at: new Date(now).toISOString() }).eq('id', contract.id).eq('otp_sent_count', contract.otp_sent_count).select('id'))
  if (!updated?.length) throw new ContractError('Tente novamente.', 409)
  const text = `Seu código para assinar o contrato é ${code}. Ele vale por ${OTP_MINUTES} minutos. Não compartilhe com ninguém.`
  let status
  try {
    status = channel === 'email'
      ? (await sendEmail({ to: customer.email, name: customer.name, subject: `Código de assinatura: ${code}`, html: emailLayout('Seu código de assinatura', [text]), text, tag: `contract-otp:${contract.id}` }, env, fetcher)).status
      : (await sendWhatsapp({ evento: 'contrato_codigo', contract_id: contract.id, name: customer.name, phone: customer.phone, code, message: text }, env, fetcher)).status
  } catch { status = 'failed' }
  await logContractEvent(db, contract.id, 'otp_sent', { channel, ip: meta.ip, userAgent: meta.userAgent, detail: { status } })
  if (status !== 'sent') throw new ContractError('Não conseguimos enviar o código por esse canal. Tente o outro.', 502)
  return { sent: true, channel, destination: channel === 'email' ? maskEmail(customer.email) : maskPhone(customer.phone), expires_in: OTP_MINUTES * 60 }
}

export async function signContract(db, token, input, meta = {}, deps = {}) {
  const env = deps.env || process.env, now = new Date(deps.now || Date.now())
  const { contract, customer } = await loadByToken(db, token)
  if (contract.status === 'signed') return { already: true, contract_id: contract.id, order_id: contract.order_id }
  if (contract.status === 'canceled') throw new ContractError('Este contrato foi cancelado.', 410)
  if (input?.accepted !== true) throw new ContractError('É preciso aceitar os termos para assinar.')
  const png = String(input?.signature || '')
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 400000 || png.length < 200) throw new ContractError('Desenhe sua assinatura antes de concluir.')
  if (!customer.document) throw new ContractError('Contrato sem documento cadastrado. Fale com o suporte.', 409)
  if (!sameDocument(input?.document, customer.document)) {
    await logContractEvent(db, contract.id, 'document_mismatch', { ip: meta.ip, userAgent: meta.userAgent })
    throw new ContractError('O CPF/CNPJ não confere com o da compra.')
  }
  if (!contract.otp_hash || !contract.otp_expires_at || new Date(contract.otp_expires_at) < now) throw new ContractError('Código expirado. Peça um novo código.')
  if (contract.otp_attempts >= OTP_MAX_ATTEMPTS) throw new ContractError('Muitas tentativas. Peça um novo código.', 429)
  const code = String(input?.code || '').replace(/\D/g, '')
  const expected = Buffer.from(contract.otp_hash), actual = Buffer.from(otpHash(contract.id, code, env))
  if (code.length !== 6 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await db.from('contracts').update({ otp_attempts: contract.otp_attempts + 1 }).eq('id', contract.id).eq('otp_attempts', contract.otp_attempts)
    await logContractEvent(db, contract.id, 'otp_failed', { ip: meta.ip, userAgent: meta.userAgent })
    throw new ContractError('Código incorreto.')
  }
  const signedAt = now.toISOString()
  const updated = await must(db.from('contracts').update({ status: 'signed', signer_name: customer.name, signer_document: formatDocument(customer.document), signature_png: png, signed_at: signedAt, signed_ip: meta.ip || null, signed_user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 400) : null, signed_channel: contract.otp_channel, otp_hash: null, next_reminder_at: null, updated_at: signedAt }).eq('id', contract.id).neq('status', 'signed').in('status', ['pending', 'viewed']).select('id'))
  if (!updated?.length) return { already: true, contract_id: contract.id, order_id: contract.order_id }
  await logContractEvent(db, contract.id, 'signed', { channel: contract.otp_channel, ip: meta.ip, userAgent: meta.userAgent, detail: { document: maskDocument(customer.document), original_sha256: contract.original_sha256 } })
  return { already: false, contract_id: contract.id, order_id: contract.order_id }
}

// ---------------------------------------------------------------- PDF final e cópia assinada

const EVENT_LABELS = { created: 'Contrato gerado a partir do pedido', sent: 'Link de assinatura enviado', reminder_sent: 'Lembrete enviado', viewed: 'Contrato visualizado', otp_sent: 'Código de verificação enviado', otp_failed: 'Código incorreto informado', document_mismatch: 'Documento divergente informado', signed: 'Contrato assinado', pdf_generated: 'PDF assinado gerado', signed_copy_sent: 'Cópia assinada enviada', access_released: 'Acesso liberado', canceled: 'Contrato cancelado' }
const fmtWhen = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export async function finalizeSignedContract(db, contractId, deps = {}) {
  const env = deps.env || process.env
  const contract = await must(db.from('contracts').select('*').eq('id', contractId).single())
  if (contract.status !== 'signed') throw new ContractError('Contrato ainda não assinado.', 409)
  if (contract.signed_pdf_path) {
    if (deps.sendCopy !== false) await sendSignedContractCopies(db, contractId, deps)
    return { path: contract.signed_pdf_path, sha256: contract.signed_pdf_sha256 }
  }
  const customer = await must(db.from('customers').select('name,email,phone,document').eq('id', contract.customer_id).single())
  const events = await must(db.from('contract_events').select('type,channel,ip,detail,created_at').eq('contract_id', contract.id).order('created_at'))
  const pdf = await buildContractPdf({
    body: contract.body,
    title: contract.fields?.programa ? `Contrato — ${contract.fields.programa} — Pedido ${contract.fields.pedido}` : 'Contrato',
    originalSha256: contract.original_sha256,
    validationUrl: validationUrl(contract.id, env),
    signature: { name: contract.signer_name, document: contract.signer_document, email: customer.email, phone: customer.phone, ip: contract.signed_ip, userAgent: contract.signed_user_agent, channel: contract.signed_channel, signedAtText: fmtWhen(contract.signed_at), png: contract.signature_png },
    events: (events || []).filter(e => EVENT_LABELS[e.type]).map(e => ({ when: fmtWhen(e.created_at), label: EVENT_LABELS[e.type], detail: [e.channel === 'whatsapp' ? 'WhatsApp' : e.channel === 'email' ? 'e-mail' : null, e.ip ? `IP ${e.ip}` : null, e.detail?.status && e.detail.status !== 'sent' ? e.detail.status : null].filter(Boolean).join(' · ') })),
  })
  const path = `${contract.id}/contrato-assinado.pdf`
  const upload = await db.storage.from('contracts').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (upload.error) throw new ContractError('Não foi possível salvar o PDF assinado.', 503)
  const pdfHash = sha256(pdf)
  await must(db.from('contracts').update({ signed_pdf_path: path, signed_pdf_sha256: pdfHash, updated_at: new Date().toISOString() }).eq('id', contract.id))
  await logContractEvent(db, contract.id, 'pdf_generated', { detail: { sha256: pdfHash } })
  if (deps.sendCopy !== false) await sendSignedContractCopies(db, contractId, deps)
  return { path, sha256: pdfHash }
}

export async function sendSignedContractCopies(db, contractId, deps = {}) {
  const env = deps.env || process.env
  if (contractQueueEnabled(env)) {
    for (const channel of ['email', 'whatsapp']) await enqueueContractTask(db, { contractId, kind: 'signed_copy', channel, occurrence: deps.occurrence || 'initial' }, deps)
    return { status: 'queued' }
  }
  const results = {}
  for (const channel of ['email', 'whatsapp']) results[channel] = (await deliverContractNotification(db, { contract_id: contractId, kind: 'signed_copy', channel }, null, deps)).status
  return results
}

// Cada tarefa é de um único canal. Reenvios não recriam o PDF nem geram OTP.
export async function deliverContractNotification(db, task, deliveryId, deps = {}) {
  const env = deps.env || process.env, fetcher = deps.fetcher || fetch
  const contract = await must(db.from('contracts').select('*').eq('id', task.contract_id).single())
  if (contract.status === 'canceled' || task.kind !== 'signed_copy' && contract.status === 'signed') return { status: 'canceled' }
  const customer = await must(db.from('customers').select('name,email,phone').eq('id', contract.customer_id).single())
  if (['invite', 'reminder'].includes(task.kind)) {
    const results = await deliverContractInvite(db, contract, customer, task.kind, { ...deps, channel: task.channel, deliveryId })
    return { status: results[task.channel] || 'retry' }
  }
  if (task.kind !== 'signed_copy' || contract.status !== 'signed' || !contract.signed_pdf_path) return { status: 'retry' }
  const download = `${appUrl(env)}/api/contratos/${contractToken(contract.id, env)}?pdf=1`
  const subject = `Contrato assinado — ${contract.fields?.programa || 'Suzana Zatorre'}`
  const lead = `Seu contrato foi assinado com sucesso. Acompanhe a liberação do acesso na página de assinatura. Sua cópia está disponível no link abaixo.`
  let result
  try {
    if (task.channel === 'email') {
      const file = await db.storage.from('contracts').download(contract.signed_pdf_path)
      if (file.error) throw file.error
      const pdf = Buffer.from(await file.data.arrayBuffer())
      result = await sendEmail({ to: customer.email, name: customer.name, subject, html: emailLayout(subject, [lead], { url: download, label: 'Baixar contrato assinado' }), text: `${lead}\n\n${download}`, attachment: { name: 'contrato-assinado.pdf', content: pdf.toString('base64') }, tag: `contract-signed:${contract.id}` }, env, fetcher)
    } else {
      result = await sendWhatsapp({ evento: 'contrato_assinado', contract_id: contract.id, name: customer.name, phone: customer.phone, link: download, message: `${lead}\n\n${download}`, delivery_id: deliveryId }, env, fetcher)
    }
  } catch { result = { status: 'failed' } }
  await logContractEvent(db, contract.id, 'signed_copy_sent', { channel: task.channel, detail: { status: result.status, ...(deliveryId ? { delivery_id: deliveryId, delivery_state: result.status === 'sent' ? 'accepted' : result.status } : {}) } })
  return result
}

export async function downloadSignedPdf(db, token) {
  const { contract } = await loadByToken(db, token)
  if (contract.status !== 'signed' || !contract.signed_pdf_path) throw new ContractError('PDF ainda não disponível.', 404)
  const file = await db.storage.from('contracts').download(contract.signed_pdf_path)
  if (file.error) throw new ContractError('Não foi possível baixar o PDF.', 503)
  return Buffer.from(await file.data.arrayBuffer())
}

export async function validationView(db, contractId) {
  if (!/^[0-9a-f-]{36}$/.test(String(contractId))) return null
  const { data } = await db.from('contracts').select('status,signed_at,original_sha256,signed_pdf_sha256,signer_name,created_at,fields').eq('id', contractId).maybeSingle()
  if (!data) return null
  return { status: data.status, signed_at: data.signed_at, created_at: data.created_at, original_sha256: data.original_sha256, signed_pdf_sha256: data.signed_pdf_sha256, program: data.fields?.programa || null, signer: data.signer_name ? data.signer_name.trim().split(/\s+/).map((p, i) => i === 0 ? p : p[0] + '.').join(' ') : null }
}

// ---------------------------------------------------------------- lembretes (cron)

export async function processContractReminders(db, deps = {}) {
  const env = deps.env || process.env, now = new Date(deps.now || Date.now())
  if (!contractsEnabled(env)) return { disabled: true, sent: 0 }
  const due = await must(db.from('contracts').select('*').in('status', ['pending', 'viewed']).lte('next_reminder_at', now.toISOString()).lt('reminders_sent', REMINDER_HOURS.length).order('next_reminder_at').limit(5))
  let sent = 0
  for (const contract of due || []) {
    const next = contract.reminders_sent + 1
    const nextAt = next < REMINDER_HOURS.length ? new Date(new Date(contract.created_at).getTime() + REMINDER_HOURS[next] * 3600e3).toISOString() : null
    const customer = await must(db.from('customers').select('name,email,phone').eq('id', contract.customer_id).single())
    // Persiste a ocorrência antes de avançar. Falhas de entrega serão retomadas por canal.
    if (contractQueueEnabled(env)) await sendContractInvite(db, contract, customer, 'reminder', { ...deps, occurrence: `reminder:${next}`, defer: true })
    const claimed = await must(db.from('contracts').update({ reminders_sent: next, next_reminder_at: nextAt }).eq('id', contract.id).eq('reminders_sent', contract.reminders_sent).select('id'))
    if (!claimed?.length) continue
    if (!contractQueueEnabled(env)) await sendContractInvite(db, contract, customer, 'reminder', deps)
    sent++
  }
  return { disabled: false, sent: contractQueueEnabled(env) ? 0 : sent, scheduled: contractQueueEnabled(env) ? sent : 0 }
}
