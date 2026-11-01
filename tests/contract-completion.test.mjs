import test from 'node:test'
import assert from 'node:assert/strict'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'
import { completeSignedContract, scheduleContractCompletion, processContractTasks } from '../src/lib/contractCompletionServer.js'

const env = { CONTRACTS_ENABLED: 'true', CONTRACT_DELIVERY_QUEUE_ENABLED: 'true', CONTRACT_WHATSAPP_PROVIDER: 'botconversa', VERCEL_ENV: 'preview' }
const signed = { id: 'contract', status: 'signed', order_id: 'order', fulfillment_status: 'awaiting_signature', signed_pdf_path: null }
test('assinatura persiste: falha do PDF é recuperada sem repetir um acesso concluído', async () => {
  const db = contractMemoryDb({ contracts: [signed] })
  let pdfCalls = 0, accessCalls = 0
  const deps = { env, fulfill: async () => { accessCalls++; return { fulfillment: 'completed' } }, finalize: async () => {
    if (++pdfCalls === 1) throw new Error('storage indisponível')
    db.tables.contracts[0].signed_pdf_path = 'contract/signed.pdf'
  } }
  const first = await completeSignedContract(db, signed.id, deps)
  assert.equal(first.status, 'retry'); assert.equal(first.has_pdf, false)
  assert.equal(db.tables.contracts[0].status, 'signed')
  assert.equal((await completeSignedContract(db, signed.id, deps)).status, 'completed')
  assert.equal(pdfCalls, 2); assert.equal(accessCalls, 1)
  assert.equal(db.tables.webhook_events.length, 2) // cópia: uma tarefa por canal
  assert.ok(db.tables.contract_events.some(row => row.type === 'pdf_failed'))
})
test('liberação desligada ou com falha não é registrada como acesso liberado', async () => {
  for (const status of ['disabled', 'waiting_payment', 'throw']) {
    const db = contractMemoryDb({ contracts: [{ ...signed, signed_pdf_path: 'contract/signed.pdf' }] })
    const deps = { env, fulfill: async () => { if (status === 'throw') throw new Error('temporário'); return { fulfillment: status } } }
    assert.equal((await completeSignedContract(db, signed.id, deps)).status, 'retry')
    assert.ok(!db.tables.contract_events.some(row => row.type === 'access_released'))
    deps.fulfill = async () => ({ fulfillment: 'completed' })
    assert.equal((await completeSignedContract(db, signed.id, deps)).status, 'completed')
    assert.equal(db.tables.webhook_events.length, 2) // retomada não duplica cópias
  }
})
test('conclusão duplicada preserva PDF e não refaz a liberação', async () => {
  const db = contractMemoryDb({ contracts: [{ ...signed, signed_pdf_path: 'contract/signed.pdf', fulfillment_status: 'completed' }] })
  const deps = { env, now: 1000, fulfill: () => assert.fail('já liberado'), finalize: () => assert.fail('PDF preservado') }
  assert.equal((await scheduleContractCompletion(db, signed.id, deps)).status, 'completed')
  assert.equal((await scheduleContractCompletion(db, signed.id, deps)).status, 'unchanged')
  assert.equal(db.tables.webhook_events.length, 3) // conclusão + 2 canais
})
test('cron recupera interrupção ocorrida depois de gravar a assinatura', async () => {
  const db = contractMemoryDb({ contracts: [signed] })
  const deps = { env, now: 1000, finalize: async () => { db.tables.contracts[0].signed_pdf_path = 'contract/signed.pdf' }, fulfill: async () => ({ fulfillment: 'completed' }) }
  const result = await processContractTasks(db, deps)
  assert.equal(result.completed, 1)
  assert.equal(db.tables.contracts[0].fulfillment_status, 'completed')
  assert.equal(db.tables.webhook_events.length, 3)
  assert.equal(db.tables.contracts[0].fields._completion_queued,true)
})
test('cron pausado e contrato não assinado não executam a conclusão', async () => {
  assert.equal((await processContractTasks({ from: () => assert.fail('sem consulta') }, { env: {} })).disabled, true)
  const db = contractMemoryDb({ contracts: [{ ...signed, status: 'pending' }] })
  await assert.rejects(completeSignedContract(db, signed.id, { env, fulfill: () => assert.fail('pendente') }), /ainda não assinado/)
})
