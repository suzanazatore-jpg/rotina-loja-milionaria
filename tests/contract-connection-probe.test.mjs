import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'
import { connectionProbeConfig, startWhatsappProbe, handleWhatsappProbe, sendEmailProbe, connectionProbeStatus, probePdf } from '../src/lib/contractConnectionProbe.js'
import { prepareContractWhatsappRelay, handleContractWhatsappRelay } from '../src/lib/contractWhatsappRelay.js'

const now = Date.parse('2026-11-02T18:00:00Z')
const env = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example.invalid', CONTRACT_CONNECTION_TEST_ENABLED: 'true', CONTRACT_CONNECTION_TEST_PHONE: '11999999999', CONTRACT_CONNECTION_TEST_EMAIL: 'authorized@example.invalid', CONTRACT_CONNECTION_TEST_EXPIRES_AT: '2026-11-03T18:00:00Z', CONTRACTS_ENABLED: 'false', CONTRACT_WHATSAPP_PROVIDER: 'disabled', CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'false', CONTRACT_BOTCONVERSA_RELAY_ENABLED: 'false', CONTRACT_WHATSAPP_RELAY_SECRET: 'probe-secret-'.repeat(5), CONTRACTS_APP_URL: 'https://preview.example.invalid', CONTRACT_BOTCONVERSA_WEBHOOK_URL: 'https://bridge.example.invalid', CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL: 'https://bot.example.invalid/link', CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL: 'https://bot.example.invalid/copy', BREVO_API_KEY: 'test-key' }
const request = (envelope, changes = {}) => {
  const { relay_token, relay_url, ...body } = envelope
  return new Request(relay_url, { method: 'POST', headers: { Authorization: `Bearer ${relay_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...changes }) })
}
async function capture(db, kind = 'invite') {
  let envelope
  const result = await startWhatsappProbe(db, kind, { env, now, fetcher: async (url, options) => { assert.equal(url, env.CONTRACT_BOTCONVERSA_WEBHOOK_URL + '/'); envelope = JSON.parse(options.body); return { ok: true } } })
  assert.equal(result.status, 'sent')
  return envelope
}

test('teste interno exige Preview, destinatários válidos e janela curta ativa', () => {
  assert.equal(connectionProbeConfig(env, now).phone, '5511999999999')
  for (const change of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'development' }, { CONTRACT_CONNECTION_TEST_ENABLED: 'false' }, { CONTRACT_CONNECTION_TEST_PHONE: '5500000000000' }, { CONTRACT_CONNECTION_TEST_EMAIL: '' }, { CONTRACT_CONNECTION_TEST_EXPIRES_AT: '2026-11-02T17:59:00Z' }, { CONTRACT_CONNECTION_TEST_EXPIRES_AT: '2026-11-05T18:00:00Z' }, { CONTRACT_WHATSAPP_RELAY_SECRET: '' }]) assert.throws(() => connectionProbeConfig({ ...env, ...change }, now))
})

test('reserva real da amostra e envelope usam funções compartilhadas sem criar compra ou contrato', async () => {
  const db = contractMemoryDb(), envelope = await capture(db)
  assert.equal(envelope.phone, '5511999999999')
  assert.match(envelope.relay_token, /^1\.\d{13}\.[A-Za-z0-9_-]{43}$/)
  assert.equal(envelope.relay_url, `${env.CONTRACTS_APP_URL}/api/contratos/teste/whatsapp-relay`)
  assert.match(envelope.name, /SEM COMPRA/)
  assert.ok(db.calls.every(call => call.table === 'webhook_events'))
  await startWhatsappProbe(db, 'invite', { env, now, fetcher: () => assert.fail('não repetir') })
  assert.equal(env.CONTRACTS_ENABLED, 'false')
  assert.equal(env.CONTRACT_WHATSAPP_PROVIDER, 'disabled')
  assert.equal(JSON.stringify(db.tables).includes(envelope.phone), false)
  assert.equal(JSON.stringify(db.tables).includes(envelope.relay_token), false)
})

test('relay de teste valida assinatura e deduplica o envio somente ao contato fixo', async () => {
  const db = contractMemoryDb(), envelope = await capture(db)
  let calls = 0
  const options = { env, now, getDb: () => db, fetcher: async (url, options) => { calls++; assert.equal(url, env.CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL); assert.equal(JSON.parse(options.body).phone, '5511999999999'); return { ok: true } } }
  const responses = await Promise.all(Array.from({ length: 5 }, () => handleWhatsappProbe(request(envelope, { phone: Number(envelope.phone) }), options)))
  assert.equal(calls, 1)
  assert.ok(responses.every(response => [200, 202].includes(response.status)))
  assert.equal((await (await handleWhatsappProbe(request(envelope), options)).json()).duplicate, true)
  assert.equal((await handleContractWhatsappRelay(request(envelope), { env, now, getDb: () => assert.fail('rota geral continua pausada') })).status, 503)
  assert.ok(db.calls.every(call => call.table !== 'contracts'))
})

test('adulteração do destinatário é recusada antes do banco; produção e prazo encerrado não enviam', async () => {
  const db = contractMemoryDb(), envelope = await capture(db)
  const blocked = () => assert.fail('não acessar banco ou provedor')
  assert.equal((await handleWhatsappProbe(request(envelope, { phone: '5521999999999' }), { env, now, getDb: blocked, fetcher: blocked })).status, 403)
  for (const options of [{ env: { ...env, VERCEL_ENV: 'production' }, now }, { env, now: now + 86400001 }]) assert.equal((await handleWhatsappProbe(request(envelope), { ...options, getDb: blocked, fetcher: blocked })).status, 503)
})

test('contrato comum assinado com a mesma chave não é aceito na rota de teste', async () => {
  const db = contractMemoryDb(), captured = await capture(db)
  const base = { ...captured }; delete base.relay_token; delete base.relay_url
  const body = { ...base, contract_id: 'commercial-contract', delivery_id: 'commercial-delivery' }
  const sending = { ...env, CONTRACTS_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'true', CONTRACT_BOTCONVERSA_RELAY_ENABLED: 'true' }
  const signed = await prepareContractWhatsappRelay(db, body, { env: sending, now })
  const response = await handleWhatsappProbe(request({ ...body, ...signed }), { env, now, getDb: () => db, fetcher: () => assert.fail('não enviar contrato comum') })
  assert.equal((await response.json()).status, 'review')
})

test('e-mail tem reserva antes de enviar, contato fixo e recibo sem gravar conteúdo/OTP', async () => {
  const db = contractMemoryDb()
  let calls = 0
  const options = { env, now, fetcher: async (url, options) => { calls++; const body = JSON.parse(options.body); assert.equal(body.to[0].email, env.CONTRACT_CONNECTION_TEST_EMAIL); assert.match(body.subject, /^\[TESTE\]/); return { ok: true, json: async () => ({ messageId: '<probe@brevo.invalid>' }) } } }
  const responses = await Promise.all(Array.from({ length: 5 }, () => sendEmailProbe(db, 'code', options)))
  assert.equal(calls, 1)
  assert.equal(responses.filter(result => result.status === 'accepted').length, 1)
  assert.equal(JSON.stringify(db.tables).includes(env.CONTRACT_CONNECTION_TEST_EMAIL), false)
  assert.equal(JSON.stringify(db.tables).includes('Código de teste:'), false)
  const status = await connectionProbeStatus(db, env, now)
  assert.equal(status.records[0].message_id, '<probe@brevo.invalid>')
  assert.equal(JSON.stringify(status).includes(env.CONTRACT_CONNECTION_TEST_EMAIL), false)
})

test('falha de envio por e-mail permanece em revisão sem repetir automaticamente', async () => {
  const db = contractMemoryDb()
  const result = await sendEmailProbe(db, 'invite', { env, now, fetcher: async () => { throw Error('timeout') } })
  assert.equal(result.status, 'review')
  assert.equal((await sendEmailProbe(db, 'invite', { env, now, fetcher: () => assert.fail('não repetir') })).status, 'already_requested')
})

test('link do PDF aponta somente ao arquivo privado com autorização temporária, sem Vercel', async () => {
  const db = contractMemoryDb(), envelope = await capture(db, 'copy')
  const link = new URL(envelope.link)
  assert.equal(link.origin, env.NEXT_PUBLIC_SUPABASE_URL)
  assert.match(link.pathname, /^\/storage\/v1\/object\/sign\/contracts\/connection-tests\/[a-f0-9]{64}\/demonstrativo\.pdf$/)
  assert.equal(link.searchParams.get('token'), 'storage-test-token')
  const pdf = await PDFDocument.load(await probePdf())
  assert.match(pdf.getTitle(), /SEM ASSINATURA/)
  const response = await handleWhatsappProbe(request(envelope), { env, now, getDb: () => db, fetcher: async url => { assert.equal(url, env.CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL); return { ok: true } } })
  assert.equal((await response.json()).status, 'accepted')
})

test('falha no storage e URL fora do arquivo do teste impedem o envio externo', async () => {
  for (const invalidUrl of ['', 'https://other.example.invalid/file.pdf', 'https://storage.example.invalid/storage/v1/object/sign/contracts/another.pdf?token=x']) {
    const db = contractMemoryDb()
    db.storage.from = () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: invalidUrl }, error: null }) })
    assert.equal((await startWhatsappProbe(db, 'invite', { env, now, fetcher: () => assert.fail('não enviar link incorreto') })).status, 'review')
  }
  const db = contractMemoryDb()
  db.storage.from = () => ({ upload: async () => ({ error: new Error('storage') }) })
  assert.equal((await sendEmailProbe(db, 'copy', { env, now, fetcher: () => assert.fail('não enviar') })).status, 'review')
})

test('configuração inválida ou código WhatsApp não gera registro nem mensagem', async () => {
  const db = contractMemoryDb()
  await assert.rejects(startWhatsappProbe(db, 'code', { env, now }))
  await assert.rejects(sendEmailProbe(db, 'invite', { env: { ...env, VERCEL_ENV: 'production' }, now }))
  assert.equal(db.calls.length, 0)
})
