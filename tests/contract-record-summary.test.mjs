import test from 'node:test'
import assert from 'node:assert/strict'
import { readContractDelivery } from '../src/lib/centralRecords.js'
import { contractMemoryDb } from './helpers/contract-memory-db.mjs'

test('detalhe de renovação reúne contrato original e estado recente de cada canal', async () => {
  const db=contractMemoryDb({contracts:[{id:'contract',order_id:'origin',status:'signed',signed_at:'2026-11-01',fulfillment_status:'completed',signed_pdf_path:'private/pdf',body:'não expor texto',token_hash:'não expor hash'}],webhook_events:[
    {type:'contract.task',payload:{contract_id:'contract',channel:'whatsapp',target:'botconversa',state:'retry',attempts:2},error:'retry'},
    {type:'contract.task',payload:{contract_id:'contract',channel:'email',target:'email',state:'accepted',attempts:1},processed_at:'2026-11-01'},
  ]})
  const result=await readContractDelivery(db,{id:'renewal',parent_order_id:'origin'})
  assert.equal(result.status,'signed');assert.equal(result.access_status,'completed');assert.equal(result.has_pdf,true)
  assert.equal(result.channels.email.state,'accepted');assert.equal(result.channels.whatsapp.state,'retry')
  assert.ok(!JSON.stringify(result).includes('não expor'))
  assert.equal(result.signed_pdf_path,undefined)
})
test('venda sem contrato não cria dados nem consulta mensagens', async () => {
  const db=contractMemoryDb()
  assert.equal(await readContractDelivery(db,{id:'order'}),null)
  assert.equal(db.calls.length,1);assert.equal(db.calls[0].op,'select')
})
