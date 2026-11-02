import test from 'node:test'
import assert from 'node:assert/strict'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'
import { prepareContractWhatsappRelay, handleContractWhatsappRelay, contractWhatsappRelaySummary } from '../src/lib/contractWhatsappRelay.js'
import { sendContractWhatsapp } from '../src/lib/contractWhatsapp.js'

const now = Date.parse('2026-11-02T12:00:00Z')
const env = { CONTRACTS_ENABLED: 'true', CONTRACT_DELIVERY_QUEUE_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'true', CONTRACT_BOTCONVERSA_RELAY_ENABLED: 'true', CONTRACT_WHATSAPP_RELAY_SECRET: 'r'.repeat(40), CONTRACTS_APP_URL: 'https://app.example.invalid', CONTRACT_BOTCONVERSA_WEBHOOK_URL: 'https://bridge.example.invalid', CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL: 'https://bot.example.invalid/link', CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL: 'https://bot.example.invalid/copy', VERCEL_ENV: 'preview' }
const payload = { schema_version: 1, delivery_id: 'relay-test-1', contract_id: 'contract-1', evento: 'contrato_enviado', name: 'FICTÍCIO', phone: '5500000000000', program: 'Programa de exemplo', link: 'https://example.invalid/assinar/ficticio', message: 'Mapeamento fictício. Nenhum envio real.' }
const fixture = (status = 'pending') => contractMemoryDb({ contracts: [{ id: payload.contract_id, status, signed_pdf_path: status === 'signed' ? 'contract-1/signed.pdf' : null }] })
const request = (token, body = payload) => new Request(`${env.CONTRACTS_APP_URL}/api/contratos/whatsapp-relay`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
const invoke = (db, envelope, options = {}) => handleContractWhatsappRelay(request(envelope.relay_token, options.body || payload), { env, now, getDb: () => db, fetcher: () => assert.fail('não enviar'), ...options })

test('aplicativo assina o conteúdo e o relay normaliza o schema mapeado pelo Pabbly', async () => {
  const db = fixture()
  let bridgeBody
  const sent = await sendContractWhatsapp(payload, env, async (url, options) => { assert.equal(url, new URL(env.CONTRACT_BOTCONVERSA_WEBHOOK_URL).href); bridgeBody = JSON.parse(options.body); return { ok: true } }, { db, now })
  assert.equal(sent.delivery_state, 'accepted') // Aceite do Pabbly, ainda sem aceite do BotConversa.
  assert.equal(bridgeBody.relay_url, `${env.CONTRACTS_APP_URL}/api/contratos/whatsapp-relay`)
  assert.match(bridgeBody.relay_token, /^1\.\d{13}\.[A-Za-z0-9_-]{43}$/)
  const calls = []
  const response = await invoke(db, bridgeBody, { body: { ...payload, schema_version: '1', phone: Number(payload.phone) }, fetcher: async (url, options) => { calls.push(url); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal); assert.deepEqual(JSON.parse(options.body), payload); return { ok: true } } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).delivery_state, 'provider_accepted')
  assert.deepEqual(calls, [env.CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL])
  const stored = JSON.stringify(db.tables.webhook_events)
  for (const value of [payload.phone, payload.name, payload.message, payload.link, payload.program, bridgeBody.relay_token, env.CONTRACT_WHATSAPP_RELAY_SECRET]) assert.equal(stored.includes(value), false)
})

test('reexecutar apenas a etapa de envio ou executar concorrentemente não repete o BotConversa', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  let calls = 0
  const options = { fetcher: async () => { calls++; return { ok: true } } }
  const responses = await Promise.all(Array.from({ length: 6 }, () => invoke(db, envelope, options)))
  assert.equal(calls, 1)
  assert.ok(responses.every(response => [200, 202].includes(response.status)))
  const replay = await invoke(db, envelope)
  assert.equal(replay.status, 200)
  assert.deepEqual(await replay.json(), { status: 'accepted', delivery_state: 'provider_accepted', duplicate: true })
})

test('timeout e HTTP negativo permanecem em revisão sem nova tentativa externa', async () => {
  for (const fail of ['timeout', '503']) {
    const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
    let calls = 0
    const outcome = await invoke(db, envelope, { fetcher: async () => { calls++; if (fail === 'timeout') throw new Error(`private ${payload.phone}`); return { ok: false, status: 503 } } })
    assert.equal(outcome.status, 202)
    assert.equal((await outcome.json()).status, 'review')
    assert.equal((await invoke(db, envelope)).status, 202)
    assert.equal(calls, 1)
    assert.equal(db.tables.webhook_events[0].payload.state, 'review')
    assert.equal(JSON.stringify(db.tables.webhook_events).includes(payload.phone), false)
  }
})

test('falha ao gravar o aceite mantém reserva fechada após reexecução do Pabbly', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  db.failNextReceipt = true
  assert.equal((await invoke(db, envelope, { fetcher: async () => ({ ok: true }) })).status, 503)
  assert.equal(db.tables.webhook_events[0].payload.state, 'dispatching')
  assert.equal((await invoke(db, envelope)).status, 202)
  assert.equal(contractWhatsappRelaySummary(db.tables.webhook_events[0], now + 60001).state, 'review')
})

test('assinatura, telefone, link, evento, contrato e ambiente adulterados são recusados antes do banco', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  for (const change of [{ phone: '5511999999999' }, { link: 'https://other.example.invalid' }, { evento: 'contrato_assinado' }, { contract_id: 'other' }, { message: 'Outro texto' }, { name: 'Outro nome' }, { program: 'Outro programa' }]) {
    const response = await invoke(db, envelope, { body: { ...payload, ...change }, getDb: () => assert.fail('autenticar antes do banco') })
    assert.equal(response.status, 403)
  }
  for (const changedEnv of [{ ...env, VERCEL_ENV: 'production' }, { ...env, CONTRACT_WHATSAPP_RELAY_SECRET: 'other'.repeat(8) }]) assert.equal((await invoke(db, envelope, { env: changedEnv, getDb: () => assert.fail('não consultar') })).status, 403)
})

test('token vencido, ausente ou sem reserva não permite enviar', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  assert.equal((await invoke(db, envelope, { now: now + 86400001, getDb: () => assert.fail('token expirou') })).status, 403)
  assert.equal((await invoke(db, { relay_token: 'invalid' }, { getDb: () => assert.fail('sem autenticação') })).status, 401)
  assert.equal((await invoke(fixture(), envelope)).status, 403)
})

test('normalização numérica não aceita arredondamento, telefone distinto ou valores não inteiros', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  for (const phone of [Number.MAX_SAFE_INTEGER + 1, 5584996633020.5, null, {}, '55 84996633020']) {
    assert.equal((await invoke(db, envelope, { body: { ...payload, phone }, getDb: () => assert.fail('não acessar banco') })).status, 400)
  }
  assert.equal((await invoke(db, envelope, { body: { ...payload, phone: 5511999999999 }, getDb: () => assert.fail('assinatura diferente') })).status, 403)
})

test('pausa e configuração incompleta bloqueiam sem banco e sem expor segredos', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  for (const change of [{ CONTRACT_BOTCONVERSA_RELAY_ENABLED: 'false' }, { CONTRACTS_ENABLED: 'false' }, { CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'false' }, { CONTRACT_WHATSAPP_PROVIDER: 'papo_reto' }, { CONTRACT_WHATSAPP_RELAY_SECRET: '' }, { CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL: 'http://unsafe.invalid' }, { CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL: env.CONTRACT_BOTCONVERSA_WEBHOOK_URL }]) {
    const response = await invoke(db, envelope, { env: { ...env, ...change }, getDb: () => assert.fail('pausado') })
    assert.equal(response.status, 503)
    assert.equal((await response.text()).includes(env.CONTRACT_WHATSAPP_RELAY_SECRET), false)
  }
})

test('contrato cancelado/assinado suprime convite e cópia só sai com assinatura e PDF', async () => {
  for (const status of ['signed', 'canceled']) {
    const db = fixture(status), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
    assert.equal((await (await invoke(db, envelope)).json()).status, 'canceled')
  }
  const signed = { ...payload, evento: 'contrato_assinado' }
  for (const status of ['pending', 'signed']) {
    const db = fixture(status), envelope = await prepareContractWhatsappRelay(db, signed, { env, now })
    const response = await invoke(db, envelope, { body: signed, fetcher: async url => { assert.equal(status, 'signed'); assert.equal(url, env.CONTRACT_BOTCONVERSA_COPY_RECEIVER_URL); return { ok: true } } })
    assert.equal((await response.json()).status, status === 'signed' ? 'accepted' : 'canceled')
  }
  const db = fixture('signed'); db.tables.contracts[0].signed_pdf_path = null
  const envelope = await prepareContractWhatsappRelay(db, signed, { env, now })
  assert.equal((await (await invoke(db, envelope, { body: signed })).json()).status, 'canceled')
})

test('lembrete usa o receptor de link e uma nova ocorrência tem identidade própria', async () => {
  const db = fixture()
  let calls = 0
  for (const delivery_id of ['reminder-24', 'reminder-48']) {
    const body = { ...payload, delivery_id, evento: 'contrato_lembrete' }, envelope = await prepareContractWhatsappRelay(db, body, { env, now })
    const response = await invoke(db, envelope, { body, fetcher: async url => { calls++; assert.equal(url, env.CONTRACT_BOTCONVERSA_LINK_RECEIVER_URL); return { ok: true } } })
    assert.equal(response.status, 200)
  }
  assert.equal(calls, 2)
})

test('espera sem execução vira revisão e resumo do painel não revela fingerprint ou token', async () => {
  const db = fixture()
  await prepareContractWhatsappRelay(db, payload, { env, now })
  const record = db.tables.webhook_events[0]
  assert.equal(contractWhatsappRelaySummary(record, now).state, 'waiting')
  const summary = contractWhatsappRelaySummary(record, now + 900001)
  assert.equal(summary.state, 'review')
  assert.deepEqual(Object.keys(summary).sort(), ['id', 'contract_id', 'state', 'created_at', 'started_at'].sort())
})

test('corpo malformado/grande, OTP e identidade reutilizada com outro conteúdo são recusados', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  for (const text of ['not-json', 'x'.repeat(17000)]) {
    const response = await handleContractWhatsappRelay(new Request(env.CONTRACTS_APP_URL, { method: 'POST', headers: { Authorization: `Bearer ${envelope.relay_token}` }, body: text }), { env, now, getDb: () => assert.fail('não consultar') })
    assert.equal(response.status, text.length > 16384 ? 413 : 400)
  }
  await assert.rejects(prepareContractWhatsappRelay(db, { ...payload, evento: 'contrato_codigo', code: '000000' }, { env, now }))
  await assert.rejects(prepareContractWhatsappRelay(db, { ...payload, phone: '5511999999999' }, { env, now }))
  assert.equal(db.tables.webhook_events.length, 1)
})

test('falha no banco impede o BotConversa e retorno não afirma sucesso', async () => {
  const db = fixture(), envelope = await prepareContractWhatsappRelay(db, payload, { env, now })
  const unavailable = { from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ error: { message: 'offline' } }) }) }
  assert.equal((await invoke(unavailable, envelope)).status, 503)
})
