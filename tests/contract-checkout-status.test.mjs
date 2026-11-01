import test from 'node:test'
import assert from 'node:assert/strict'
import { contractCheckoutStatus } from '../src/lib/contractCheckoutStatus.js'
test('checkout orienta assinatura e só oferece continuidade quando o acesso estiver pronto', () => {
  const policy = { required: true, gate_access: true }, url = 'https://example.invalid/sign'
  assert.equal(contractCheckoutStatus(null,policy,null).blocked,true)
  for(const status of ['pending','viewed','signed']) {
    const progress=contractCheckoutStatus({status,fields:{_gate_access:true},fulfillment_status:'awaiting_signature'},policy,url)
    assert.equal(progress.blocked,true);assert.equal(progress.contract.signing_url,url)
  }
  const completed=contractCheckoutStatus({status:'signed',fields:{_gate_access:true},fulfillment_status:'completed',signed_pdf_path:'private/file'},policy,url)
  assert.equal(completed.blocked,false);assert.equal(completed.contract.has_pdf,true)
  assert.equal(contractCheckoutStatus({status:'pending',fields:{_gate_access:true},fulfillment_status:'completed'},policy,url).blocked,true)
  assert.equal(completed.contract.signed_pdf_path,undefined)
  assert.equal(contractCheckoutStatus({status:'canceled',fields:{_gate_access:false},fulfillment_status:'completed'},policy,url).blocked,true)
  assert.equal(contractCheckoutStatus({status:'canceled'},policy,url).contract.signing_url,null)
})
test('oferta sem contrato ou com liberação no pagamento preserva a continuidade', () => {
  assert.equal(contractCheckoutStatus(null,{required:false},null).blocked,false)
  assert.equal(contractCheckoutStatus(null,undefined,null).blocked,false)
  assert.equal(contractCheckoutStatus({status:'pending',fulfillment_status:'not_gated'},{required:true,gate_access:false},'url').blocked,false)
})
