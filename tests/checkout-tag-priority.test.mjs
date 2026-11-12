import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/checkoutTagFirstServer.js', import.meta.url), 'utf8')
  .replace("import { processOutboundWebhooks } from './checkoutOutboundServer.js'",
    "const processOutboundWebhooks = () => { throw Error('External requests forbidden in tests') }")
const { ensureProductIdentification, isProductTagDestination } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

const tagUrl = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/123/test/'
const baseHook = {id:'tag',url:tagUrl,active:true,events:['order.paid'],product_ids:['product']}
function db({items=[{product_id:'product'}],hooks=[baseHook],receipts=[{id:'receipt',webhook_id:'tag',status:'pending'}],errorTable=null}={}) {
  return {from(table) {
    const query = {
      select(){return query},eq(){return query},in(){return query},
      then(resolve,reject){
        const rows = {order_items:items,outbound_webhooks:hooks,webhook_deliveries:receipts}
        return Promise.resolve({data:rows[table]||[],error:table===errorTable?{message:'test failure'}:null}).then(resolve,reject)
      }
    }
    return query
  }}
}
test('recognizes only exact BotConversa automation webhook host and path',()=>{
  assert.equal(isProductTagDestination(tagUrl),true)
  assert.equal(isProductTagDestination('https://example.com/api/v1/webhooks-automation/catch/tag'),false)
  assert.equal(isProductTagDestination('https://new-backend.botconversa.com.br.evil.example/api/v1/webhooks-automation/catch/tag'),false)
  assert.equal(isProductTagDestination('http://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/tag'),false)
})
test('sends only the purchased product tag webhook before access',async()=>{
  const receipts=[{id:'tag-delivery',webhook_id:'tag',status:'pending'},{id:'other-delivery',webhook_id:'other',status:'pending'}]
  const database=db({receipts,hooks:[baseHook,{id:'other',url:tagUrl,active:true,events:['order.paid'],product_ids:['other-product']}]})
  const sent=[]
  const result=await ensureProductIdentification(database,'order',{dispatch:async(_db,{deliveryIds})=>{
    sent.push(...deliveryIds)
    receipts[0].status='delivered'
  }})
  assert.equal(result.ready,true)
  assert.deepEqual(sent,['tag-delivery'])
})
test('missing or failed product tagging is never mistaken for confirmation',async()=>{
  const missing=await ensureProductIdentification(db({receipts:[]}), 'order',{dispatch:()=>assert.fail('should not dispatch absent receipt')})
  assert.equal(missing.ready,false)
  const failed=await ensureProductIdentification(db(), 'order',{dispatch:async()=>{}})
  assert.equal(failed.ready,false)
})
test('products with no BotConversa product tag do not block their access',async()=>{
  const result=await ensureProductIdentification(db({hooks:[{...baseHook,product_ids:['another-product']}],receipts:[]}), 'order',{dispatch:()=>assert.fail('must not dispatch')})
  assert.equal(result.ready,true)
  assert.equal(result.reason,'no_product_tag_hook')
})
test('database failure holds the WhatsApp access but leaves payments untouched',async()=>{
  const result=await ensureProductIdentification(db({errorTable:'webhook_deliveries'}), 'order',{dispatch:()=>assert.fail('must not dispatch')})
  assert.equal(result.ready,false)
})
