import test from 'node:test'
import assert from 'node:assert/strict'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'
import { enqueueContractTask, runContractTask, processContractTaskQueue } from '../src/lib/contractTaskQueue.js'
import { deliverContractNotification, processContractReminders } from '../src/lib/contractsServer.js'

const env = { CONTRACTS_ENABLED: 'true', CONTRACT_DELIVERY_QUEUE_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', VERCEL_ENV: 'preview' }
const task = { contractId: 'contract-1', kind: 'invite', channel: 'email' }
test('fila pausada não consulta o banco nem dispara envios', async () => {
  const db = { from: () => assert.fail('sem consulta') }, dispatch = () => assert.fail('sem envio')
  assert.equal((await processContractTaskQueue(db, dispatch, { env: {} })).disabled, true)
  assert.equal((await runContractTask(db, 'key', dispatch, { env: { ...env, CONTRACTS_ENABLED: 'false' } })).status, 'paused')
})
test('identidade por ocorrência/canal preserva aceite e impede reinício por duplicata', async () => {
  const db = contractMemoryDb(), options = { env, now: 1000 }
  const key = await enqueueContractTask(db, task, options)
  const other = await enqueueContractTask(db, { ...task, channel: 'whatsapp' }, options)
  assert.notEqual(key, other)
  let sent = 0
  await runContractTask(db, key, async () => { sent++; return { status: 'sent' } }, options)
  assert.equal(await enqueueContractTask(db, task, options), key)
  await runContractTask(db, key, () => assert.fail('duplicado'), options)
  assert.equal(sent, 1)
  assert.equal(db.tables.webhook_events[0].payload.state, 'accepted')
  assert.ok(db.tables.webhook_events[0].processed_at)
  assert.deepEqual(Object.keys(db.tables.webhook_events[0].payload).filter(key => /code|token|phone|message|url/.test(key)), [])
  await assert.rejects(enqueueContractTask(db, { ...task, kind: 'otp' }, options), /invalid/)
})
test('retentativas e disputa de claim não repetem o canal já aceito', async () => {
  const db = contractMemoryDb(), options = { env, now: 1000 }
  const email = await enqueueContractTask(db, task, options)
  const whatsapp = await enqueueContractTask(db, { ...task, channel: 'whatsapp' }, options)
  let emailCalls = 0, waCalls = 0
  const dispatch = async task => { if (task.channel === 'email') { emailCalls++; return { status: 'sent' } } waCalls++; throw new Error('503') }
  await Promise.all([runContractTask(db, email, dispatch, options), runContractTask(db, email, dispatch, options)])
  await runContractTask(db, whatsapp, dispatch, options)
  assert.equal(emailCalls, 1); assert.equal(waCalls, 1)
  assert.equal((await runContractTask(db, whatsapp, dispatch, { env, now: 2000 })).status, 'waiting')
  await processContractTaskQueue(db, async task => { assert.equal(task.channel, 'whatsapp'); waCalls++; return { status: 'sent' } }, { env, now: 301001 })
  assert.equal(emailCalls, 1); assert.equal(waCalls, 2)
})
test('interrupção e recibo perdido retomam após a reserva, com o mesmo delivery_id', async () => {
  const db = contractMemoryDb(), options = { env, now: 1000 }
  const key = await enqueueContractTask(db, task, options)
  db.failNextReceipt = true
  const ids = []
  const dispatch = async (_task, deliveryId) => { ids.push(deliveryId); return { status: 'sent' } }
  await assert.rejects(runContractTask(db, key, dispatch, options), /queue_unavailable/)
  assert.equal((await runContractTask(db, key, dispatch, { env, now: 2000 })).status, 'waiting')
  await runContractTask(db, key, dispatch, { env, now: 181001 })
  assert.deepEqual(ids, [key, key]) // O receptor precisa deduplicar; não se promete exactly-once externo.
})
test('ambiente ou provedor diferente não reaproveita tarefas antigas', async () => {
  const db = contractMemoryDb(), options = { env, now: 1000 }
  const key = await enqueueContractTask(db, { ...task, channel: 'whatsapp' }, options)
  const dispatch = () => assert.fail('não transmitir')
  assert.equal((await runContractTask(db, key, dispatch, { env: { ...env, VERCEL_ENV: 'production' }, now: 1000 })).status, 'waiting')
  assert.equal((await runContractTask(db, key, dispatch, { env: { ...env, CONTRACT_WHATSAPP_PROVIDER: 'papo_reto' }, now: 1000 })).status, 'provider_changed')
  assert.equal((await processContractTaskQueue(db, dispatch, { env: { ...env, CONTRACT_WHATSAPP_PROVIDER: 'papo_reto' }, now: 1000 })).checked, 0)
})
test('falhas têm limite e cancelamento encerra uma tarefa sem enviar', async () => {
  const db = contractMemoryDb(), key = await enqueueContractTask(db, task, { env, now: 1000 })
  let now = 1000
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await runContractTask(db, key, async () => ({ status: 'retry' }), { env, now })
    assert.equal(result.status, attempt === 7 ? 'failed' : 'retry')
    now = Date.parse(db.tables.webhook_events[0].payload.next_attempt_at) + 1
  }
  await runContractTask(db, key, () => assert.fail('tentativas esgotadas'), { env, now })
  const other = await enqueueContractTask(db, { ...task, occurrence: 'manual' }, { env, now })
  assert.equal((await runContractTask(db, other, async () => ({ status: 'canceled' }), { env, now })).status, 'canceled')
})
test('lembretes persistem por canal antes de avançar, mesmo se os serviços falharem', async () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const db = contractMemoryDb({ contracts: [{ id: 'contract-1', status: 'pending', customer_id: 'buyer', fields: { programa: 'Programa teste' }, reminders_sent: 0, created_at: '2026-10-30T12:00:00Z', next_reminder_at: '2026-10-31T12:00:00Z' }], customers: [{ id: 'buyer', name: 'Teste', email: 'test@example.invalid', phone: '5584999999999' }] })
  const deps = { env: { ...env, CONTRACT_TOKEN_SECRET: 'x'.repeat(40), BREVO_API_KEY: 'fake-test', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://bot.example.invalid' }, now, fetcher: async () => ({ ok: false, status: 503 }) }
  await processContractReminders(db, deps)
  assert.equal(db.tables.contracts[0].reminders_sent, 1)
  assert.equal(db.tables.webhook_events.length, 2)
  await processContractTaskQueue(db, (task, id) => deliverContractNotification(db, task, id, deps), deps)
  assert.ok(db.tables.webhook_events.every(row => row.error === 'retry'))
  assert.ok(db.tables.webhook_events.every(row => row.payload.attempts === 1))
  db.tables.contracts[0].status = 'signed'
  await processContractTaskQueue(db, (task, id) => deliverContractNotification(db, task, id, { ...deps, fetcher: () => assert.fail('assinou, parar lembrete') }), { ...deps, now: now + 301000 })
  assert.ok(db.tables.webhook_events.every(row => row.payload.state === 'canceled'))
})
