import test from 'node:test'
import assert from 'node:assert/strict'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'
import { sendContractWhatsapp, contractWhatsappCodeReady } from '../src/lib/contractWhatsapp.js'
import { runContractWhatsappDispatch } from '../src/lib/contractWhatsappDispatch.js'
import { enqueueContractTask, runContractTask, processContractTaskQueue } from '../src/lib/contractTaskQueue.js'
import { deliverContractNotification } from '../src/lib/contractsServer.js'

const env = { CONTRACTS_ENABLED: 'true', CONTRACT_DELIVERY_QUEUE_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://example.invalid/hook', CONTRACT_WHATSAPP_DISPATCH_GUARD_ENABLED: 'true', CONTRACT_TOKEN_SECRET: 'x'.repeat(40), VERCEL_ENV: 'preview' }
const payload = { delivery_id: 'dispatch-test', contract_id: 'contract-test', evento: 'contrato_enviado', name: 'Exemplo fictício', phone: '5500000000000', program: 'Programa fictício', link: 'https://example.invalid/assinar', message: 'Nunca enviar' }
const identity = { ...payload, provider: 'botconversa' }

test('aceite HTTP é preservado em nova execução e nenhuma informação da mensagem entra na reserva', async () => {
  const db = contractMemoryDb()
  let calls = 0
  const fetcher = async (_url, request) => { calls++; assert.equal(JSON.parse(request.body).program, payload.program); return { ok: true } }
  assert.equal((await sendContractWhatsapp(payload, env, fetcher, { db })).delivery_state, 'accepted')
  assert.equal((await sendContractWhatsapp(payload, env, fetcher, { db })).status, 'sent')
  assert.equal(calls, 1)
  const stored = JSON.stringify(db.tables.webhook_events)
  for (const value of [payload.phone, payload.name, payload.message, payload.link, payload.program, env.CONTRACT_WHATSAPP_WEBHOOK_URL]) assert.equal(stored.includes(value), false)
})

test('duas chamadas concorrentes disputam uma reserva antes do HTTP', async () => {
  const db = contractMemoryDb()
  let calls = 0
  const results = await Promise.all(Array.from({ length: 5 }, () => sendContractWhatsapp(payload, env, async () => { calls++; return { ok: true } }, { db })))
  assert.equal(calls, 1)
  assert.ok(results.every(item => ['sent', 'review'].includes(item.status)))
  assert.equal(db.tables.webhook_events[0].payload.state, 'accepted')
})

test('timeout e resposta negativa exigem revisão e não são reenviados automaticamente', async () => {
  for (const failure of ['timeout', 'http']) {
    const db = contractMemoryDb()
    let calls = 0
    const fetcher = async () => { calls++; if (failure === 'timeout') throw new Error(`timeout ${payload.phone}`); return { ok: false, status: 503 } }
    assert.equal((await sendContractWhatsapp(payload, env, fetcher, { db })).status, 'review')
    assert.equal((await sendContractWhatsapp(payload, env, fetcher, { db, now: Date.now() + 86400000 })).status, 'review')
    assert.equal(calls, 1)
    assert.equal(db.tables.webhook_events[0].payload.state, 'review')
    assert.equal(JSON.stringify(db.tables.webhook_events).includes(payload.phone), false)
  }
})

test('interrupção ao salvar o aceite deixa reserva fechada para repetição', async () => {
  const db = contractMemoryDb()
  db.failNextReceipt = true
  let calls = 0
  const fetcher = async () => { calls++; return { ok: true } }
  await assert.rejects(sendContractWhatsapp(payload, env, fetcher, { db }), /dispatch_unavailable/)
  assert.equal(db.tables.webhook_events[0].payload.state, 'dispatching')
  assert.equal((await sendContractWhatsapp(payload, env, fetcher, { db })).status, 'review')
  assert.equal(calls, 1)
})

test('banco ausente ou indisponível impede o HTTP e não usa fallback', async () => {
  const noSend = () => assert.fail('sem reserva não enviar')
  await assert.rejects(sendContractWhatsapp(payload, env, noSend), /database_required/)
  const db = { from: () => ({ upsert: async () => ({ error: { message: 'offline' } }) }) }
  await assert.rejects(sendContractWhatsapp(payload, env, noSend, { db }), /dispatch_unavailable/)
  await assert.rejects(sendContractWhatsapp({ ...payload, delivery_id: undefined }, env, noSend, { db }), /stable_delivery_id_required/)
})

test('mesmo identificador não muda contrato, evento ou provedor e ambientes não compartilham reservas', async () => {
  const db = contractMemoryDb()
  await runContractWhatsappDispatch(db, identity, async () => {}, { env })
  for (const change of [{ contract_id: 'another' }, { evento: 'contrato_assinado' }, { provider: 'papo_reto' }]) await assert.rejects(runContractWhatsappDispatch(db, { ...identity, ...change }, () => assert.fail('não redirecionar'), { env }), /identity_conflict/)
  let calls = 0
  await runContractWhatsappDispatch(db, identity, async () => { calls++ }, { env: { ...env, VERCEL_ENV: 'production' } })
  assert.equal(calls, 1)
  assert.equal(db.tables.webhook_events.length, 2)
})

test('código de WhatsApp exige chave própria e nenhum código é persistido na reserva', async () => {
  const otp = { ...payload, evento: 'contrato_codigo', code: '000000', delivery_id: undefined }
  assert.equal(contractWhatsappCodeReady(env), false)
  assert.equal((await sendContractWhatsapp(otp, env, () => assert.fail('código pausado'))).status, 'skipped')
  const db = contractMemoryDb()
  await sendContractWhatsapp(otp, { ...env, CONTRACT_WHATSAPP_OTP_ENABLED: 'true' }, async () => ({ ok: true }), { db })
  assert.equal(JSON.stringify(db.tables.webhook_events).includes('000000'), false)
})

test('tarefa WhatsApp incerta sai das retentativas e não interrompe o e-mail', async () => {
  const db = contractMemoryDb({ contracts: [{ id: 'contract-test', status: 'pending', customer_id: 'test', fields: { programa: 'Fictício', _gate_access: true } }], customers: [{ id: 'test', name: payload.name, email: 'test@example.invalid', phone: payload.phone }] })
  const deps = { env: { ...env, BREVO_API_KEY: 'fake' }, now: 1000, fetcher: async () => { throw new Error('timeout') } }
  const wa = await enqueueContractTask(db, { contractId: 'contract-test', kind: 'invite', channel: 'whatsapp' }, deps)
  const email = await enqueueContractTask(db, { contractId: 'contract-test', kind: 'invite', channel: 'email' }, deps)
  const dispatch = (task, id) => deliverContractNotification(db, task, id, deps)
  assert.equal((await runContractTask(db, wa, dispatch, deps)).status, 'review')
  assert.equal((await runContractTask(db, email, dispatch, deps)).status, 'retry')
  const channels = []
  await processContractTaskQueue(db, async task => { channels.push(task.channel); return { status: 'sent' } }, { ...deps, now: 301001 })
  assert.deepEqual(channels, ['email'])
  assert.equal(db.tables.webhook_events.find(row => row.pagarme_event_id === wa).error, 'review')
})

test('aceite salvo antes de uma interrupção da fila impede novo HTTP na retomada', async () => {
  const db = contractMemoryDb()
  const deps = { env, now: 1000 }
  const key = await enqueueContractTask(db, { contractId: payload.contract_id, kind: 'invite', channel: 'whatsapp' }, deps)
  let calls = 0
  const dispatch = async (_task, id) => {
    const result = await sendContractWhatsapp({ ...payload, delivery_id: id }, env, async () => { calls++; return { ok: true } }, { db })
    db.failNextReceipt = true
    return result
  }
  await assert.rejects(runContractTask(db, key, dispatch, deps), /queue_unavailable/)
  await runContractTask(db, key, (_task, id) => sendContractWhatsapp({ ...payload, delivery_id: id }, env, () => assert.fail('já aceito'), { db }), { env, now: 181001 })
  assert.equal(calls, 1)
  assert.equal(db.tables.webhook_events.find(row => row.pagarme_event_id === key).payload.state, 'accepted')
})
