import { ContractError, finalizeSignedContract, logContractEvent, sendSignedContractCopies, deliverContractNotification } from './contractsServer.js'
import { fulfillPaidOrder } from './checkoutFulfillmentServer.js'
import { contractQueueEnabled, enqueueContractTask, runContractTask, processContractTaskQueue } from './contractTaskQueue.js'

async function checked(query) {
  const { data, error } = await query
  if (error) throw new ContractError('Não foi possível atualizar a conclusão do contrato.', 503)
  return data
}

export async function completeSignedContract(db, contractId, deps = {}) {
  const contract = await checked(db.from('contracts').select('*').eq('id', contractId).single())
  if (contract.status !== 'signed') throw new ContractError('Contrato ainda não assinado.', 409)
  let hasPdf = Boolean(contract.signed_pdf_path)
  if (!hasPdf) {
    try {
      await (deps.finalize || finalizeSignedContract)(db, contractId, { ...deps, sendCopy: false })
      hasPdf = true
    } catch { await logContractEvent(db, contractId, 'pdf_failed') }
  }
  let accessStatus = contract.fulfillment_status
  if (accessStatus !== 'completed') {
    try {
      const result = await (deps.fulfill || fulfillPaidOrder)(db, contract.order_id)
      accessStatus = result.fulfillment
      await checked(db.from('contracts').update({ fulfillment_status: accessStatus }).eq('id', contractId))
      await logContractEvent(db, contractId, accessStatus === 'completed' ? 'access_released' : 'access_pending', { detail: { fulfillment: accessStatus, email: result.email_status || null } })
    } catch {
      accessStatus = 'retry'
      await checked(db.from('contracts').update({ fulfillment_status: 'retry' }).eq('id', contractId))
      await logContractEvent(db, contractId, 'access_failed')
    }
  }
  if (hasPdf) {
    // A fila torna o envio de cada cópia independente e idempotente no estado local.
    // No modo legado, envia a cópia somente na primeira conclusão com PDF novo.
    if (contractQueueEnabled(deps.env || process.env) || !contract.signed_pdf_path) await sendSignedContractCopies(db, contractId, deps)
  }
  return { status: hasPdf && accessStatus === 'completed' ? 'completed' : 'retry', has_pdf: hasPdf, access_status: accessStatus }
}

export async function dispatchContractTask(db, task, deliveryId, deps = {}) {
  if (task.kind === 'completion') return completeSignedContract(db, task.contract_id, deps)
  return deliverContractNotification(db, task, deliveryId, deps)
}

export async function scheduleContractCompletion(db, contractId, deps = {}) {
  if (!contractQueueEnabled(deps.env || process.env)) return completeSignedContract(db, contractId, deps)
  const contract = await checked(db.from('contracts').select('status,fields').eq('id', contractId).single())
  if (contract.status !== 'signed') throw new ContractError('Contrato ainda não assinado.', 409)
  const key = await enqueueContractTask(db, { contractId, kind: 'completion', channel: 'internal', occurrence: deps.occurrence || 'initial' }, deps)
  await checked(db.from('contracts').update({ fields: { ...contract.fields, _completion_queued: true } }).eq('id', contractId))
  return runContractTask(db, key, (task, deliveryId) => dispatchContractTask(db, task, deliveryId, deps), deps)
}

export async function processContractTasks(db, deps = {}) {
  const env = deps.env || process.env
  if (!contractQueueEnabled(env) || env.CONTRACTS_ENABLED !== 'true') return { disabled: true, checked: 0 }
  // Recupera a interrupção entre gravar a assinatura e enfileirar sua conclusão.
  const signed = await checked(db.from('contracts').select('id,fields').eq('status', 'signed').is('fields->>_completion_queued', null).or('fulfillment_status.is.null,fulfillment_status.neq.completed,signed_pdf_path.is.null').order('signed_at').limit(3))
  for (const contract of signed || []) {
    await enqueueContractTask(db, { contractId: contract.id, kind: 'completion', channel: 'internal' }, deps)
    await checked(db.from('contracts').update({ fields: { ...contract.fields, _completion_queued: true } }).eq('id', contract.id))
  }
  return processContractTaskQueue(db, (task, deliveryId) => dispatchContractTask(db, task, deliveryId, deps), deps)
}
