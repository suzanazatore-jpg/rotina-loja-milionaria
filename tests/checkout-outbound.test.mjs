import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const payloadURL = `data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../src/lib/checkoutWebhookPayload.js', import.meta.url))).toString('base64')}`
const load = name => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8').replace("'./checkoutWebhookPayload.js'", JSON.stringify(payloadURL))).toString('base64')}`)
const { normalizeWebhook } = await load('checkoutWebhookSettings')
const { publicIPv4, sendWebhook, processOutboundWebhooks } = await load('checkoutOutboundServer')
const valid = { name:'BotConversa',url:'https://example.com/hook',events:['order.paid'],product_ids:null,active:false }
test('validates events, products and public HTTPS destinations',()=>{
 assert.deepEqual(normalizeWebhook({...valid,events:['order.paid','order.paid']}),valid)
 for(const value of [{url:'http://example.com'}, {url:'https://localhost/hook'}, {url:'https://127.0.0.1'}, {url:'https://user:pass@example.com'}, {url:'https://example.com:444'}, {events:['invalid']}, {events:[]}, {product_ids:[]}, {product_ids:['invalid']}]) assert.throws(()=>normalizeWebhook({...valid,...value}))
})
test('blocks nonpublic DNS results before creating a connection',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','198.18.0.1','224.0.0.1','::1']) assert.equal(publicIPv4(ip),false,ip)
 assert.equal(publicIPv4('8.8.8.8'),true)
 await assert.rejects(sendWebhook('https://example.com',{},'secret','id',async()=>[{address:'127.0.0.1',family:4}]))
 await assert.rejects(sendWebhook('https://example.com',{},'secret','id',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]))
})
function db(steps){return {from(table){const ops=[];const q=new Proxy({}, {get(_target,key){if(key==='then')return(resolve,reject)=>{try{const step=steps.shift();assert.ok(step,`Unexpected ${table}`);assert.equal(step.table,table);step.check?.(ops);resolve({data:step.data,error:step.error})}catch(e){reject(e)}};return(...args)=>{ops.push([key,...args]);return q}}});return q}}}
const row={id:'delivery',webhook_id:'hook',status:'pending',attempts:0,payload:{environment:'test'}}
const hook={url:'https://example.com',secret:'secret',active:true}
const env={CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED:'true',CHECKOUT_OUTBOUND_TEST_ENABLED:'true',VERCEL_ENV:'preview',PAGARME_BASE_URL:'https://sdx-api.pagar.me/core/v5'}
test('paused workers never query or send',async()=>assert.equal((await processOutboundWebhooks(db([]),{env:{}})).disabled,true))
test('test events cannot reach production and inactive destinations are skipped',async()=>{
 for(const [destination,settings] of [[hook,{...env,VERCEL_ENV:'production'}],[{...hook,active:false},env]]){
  const steps=[{table:'webhook_deliveries',data:[row]},{table:'outbound_webhooks',data:destination}]
  assert.equal((await processOutboundWebhooks(db(steps),{env:settings,sender:()=>assert.fail('must not send')})).sent,0);assert.equal(steps.length,0)
 }
})
test('conditional claim prevents concurrent sends, successes record receipt, failures back off',async()=>{
 for(const code of [204,503]){
  const steps=[{table:'webhook_deliveries',data:[row]},{table:'outbound_webhooks',data:hook},{table:'webhook_deliveries',data:[{id:'delivery'}],check(ops){assert.ok(ops.some(op=>op[0]==='eq'&&op[1]==='status'&&op[2]==='pending'))}},{table:'webhook_deliveries',data:null,check(ops){const update=ops.find(op=>op[0]==='update')[1];assert.equal(update.status,code===204?'delivered':'retry');assert.equal(update.response_body,null);if(code===503)assert.equal(update.next_attempt_at,new Date(300000).toISOString())}}]
  let calls=0
  assert.equal((await processOutboundWebhooks(db(steps),{env,now:0,sender:async(_url,payload,secret,id)=>{calls++;assert.equal(id,'delivery');assert.equal(secret,'secret');assert.equal(payload.environment,'test');return code}})).sent,code===204?1:0)
  assert.equal(calls,1);assert.equal(steps.length,0)
 }
 const steps=[{table:'webhook_deliveries',data:[row]},{table:'outbound_webhooks',data:hook},{table:'webhook_deliveries',data:[]}]
 await processOutboundWebhooks(db(steps),{env,sender:()=>assert.fail('lost claim')})
})
test('admin API rejects unauthorized access before data reads and writes',async()=>{
 const shared=readFileSync(new URL('../src/lib/checkoutWebhookSettings.js',import.meta.url),'utf8')
 const sharedURL=`data:text/javascript;base64,${Buffer.from(shared).toString('base64')}`
 const source=readFileSync(new URL('../src/app/api/admin/checkout/webhooks/route.js',import.meta.url),'utf8')
 .replace("'@/lib/checkoutWebhookPayload'",JSON.stringify(payloadURL))
 .replace("import { after } from 'next/server'",'const after = () => {}')
 .replace("import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'",'const processOutboundWebhooks = () => {}')
 .replace("import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'",'const autorizarAdmin = async () => false; const checkoutAdminClient = () => ({from(){throw new Error("must not access data")}})')
 .replace("'@/lib/checkoutWebhookSettings'",JSON.stringify(sharedURL))
 const {GET,POST}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
 assert.equal((await GET(new Request('https://example.com/api/admin/checkout/webhooks'))).status,401)
 assert.equal((await POST(new Request('https://example.com/api/admin/checkout/webhooks',{method:'POST',body:JSON.stringify({action:'toggle',id:'hook',active:true})}))).status,401)
})
test('detail audit and last update stay scoped to the selected webhook',async()=>{
 const id='00000000-0000-4000-8000-000000000001'
 const shared=readFileSync(new URL('../src/lib/checkoutWebhookSettings.js',import.meta.url),'utf8')
 const sharedURL=`data:text/javascript;base64,${Buffer.from(shared).toString('base64')}`
 const calls=[]
 globalThis.__webhookScopeDB={from(table){const ops=[];calls.push({table,ops});const q=new Proxy({}, {get(_target,key){if(key==='then')return resolve=>resolve({data:[],count:0,error:null});return(...args)=>{ops.push([key,...args]);return q}}});return q}}
 const source=readFileSync(new URL('../src/app/api/admin/checkout/webhooks/route.js',import.meta.url),'utf8')
 .replace("'@/lib/checkoutWebhookPayload'",JSON.stringify(payloadURL))
 .replace("import { after } from 'next/server'",'const after = () => {}')
 .replace("import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'",'const processOutboundWebhooks = () => {}')
 .replace("import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'",'const autorizarAdmin = async () => true; const checkoutAdminClient = () => globalThis.__webhookScopeDB')
 .replace("'@/lib/checkoutWebhookSettings'",JSON.stringify(sharedURL))
 try {
  const {GET}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const response=await GET(new Request(`https://example.com/api/admin/checkout/webhooks?tab=auditoria&webhook_id=${id}`))
  assert.equal(response.status,200)
  const audit=calls.find(call=>call.ops.some(op=>op[0]==='or'))
  assert.equal(audit.table,'webhook_events')
  assert.deepEqual(audit.ops.find(op=>op[0]==='or'),['or',`payload->>webhook_id.eq.${id},payload->>target_id.eq.${id}`])
  assert.ok(calls.some(call=>call.ops.some(op=>op[0]==='eq'&&op[1]==='payload->>target_id'&&op[2]===id)))
  assert.ok(calls.every(call=>call.ops.every(op=>op[0]!=='select'||!String(op[1]).includes('secret'))))
 } finally {delete globalThis.__webhookScopeDB}
})
test('self access callback never reaches sender or claims a delivery',async()=>{
 const steps=[{table:'webhook_deliveries',data:[row]},{table:'outbound_webhooks',data:{...hook,url:'https://rotina.suzanazatorre.com.br/api/webhook-guru'}}]
 assert.equal((await processOutboundWebhooks(db(steps),{env,sender:()=>assert.fail('self callback')})).sent,0)
 assert.equal(steps.length,0)
})
test('worker converts only Guru destinations and injects server token at delivery time',async()=>{
 const payload={id:'delivery',event:'order.paid',environment:'test',order:{id:'order',status:'paid',paid_at:'2026-10-24T12:00:00Z',total_cents:4700,subtotal_cents:4700,discount_cents:0,interest_cents:0,installments:1},customer:{email:'test@example.invalid',phone:'5599999999999'},items:[{product_id:'product',product_code:'1790286704',price_cents:4700}]}
 const steps=[{table:'webhook_deliveries',data:[{...row,payload}]},{table:'outbound_webhooks',data:{...hook,payload_format:'guru',product_ids:['product']}},{table:'webhook_deliveries',data:[{id:'delivery'}]},{table:'webhook_deliveries',data:null}]
 let body
 await processOutboundWebhooks(db(steps),{env:{...env,GURU_ACCOUNT_TOKEN:'server-test-token'},sender:async(_url,value)=>{body=value;return 204}})
 assert.equal(body.contact.email,'test@example.invalid');assert.equal(body.product.id,'1790286704');assert.equal(body.payment.total,47)
 assert.equal(body.api_token,'server-test-token');assert.equal(payload.api_token,undefined);assert.equal(steps.length,0)
})
