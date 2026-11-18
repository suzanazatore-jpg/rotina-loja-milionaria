import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const code=readFileSync(new URL('../src/lib/checkoutAccessPabblyServer.js',import.meta.url),'utf8')
  .replace("import {sendWebhook} from './checkoutOutboundServer.js'","const sendWebhook = () => { throw new Error('Real network forbidden in tests') }")
  .replace("import {ensureProductIdentification} from './checkoutTagFirstServer.js'","const ensureProductIdentification = async () => ({ready:true})")
const {notifyAccessPabbly}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))

const order={id:'12345678-1234-1234-1234-123456789abc',paid_at:'2026-11-10T11:13:01Z'}
const customer={name:'Aluna Teste',email:'aluna@example.test',phone:'5584999998888'}
function fakeDb({active=true,url='https://connect.pabbly.com/workflow/sendwebhookdata/test'}={}){
 let event=null
 return {
  recorded:()=>event,
  from(table){
   let values=null
   const query={
    select(){return query},
    eq(){return query},
    in(){return query},
    is(){return query},
    maybeSingle(){return Promise.resolve({data:table==='webhook_events'?event:{url,secret:'unit-test-secret',active},error:null})},
    insert(record){event={...record,id:'receipt',processed_at:null};return Promise.resolve({error:null})},
    update(updated){values=updated;return query},
    then(resolve,reject){
      Object.assign(event,values)
      return Promise.resolve({data:values.error==='sending'?[{id:'receipt'}]:null,error:null}).then(resolve,reject)
    }
   }
   return query
  }
 }
}

test('a new paid order uses the same six-digit password for login, email and WhatsApp', async () => {
 const source = readFileSync(new URL('../src/lib/checkoutFulfillmentServer.js', import.meta.url), 'utf8')
  .replace("import { applyOrderAccess } from './checkoutAccessServer.js'", "const applyOrderAccess = async () => ({status:'completed'})")
  .replace("import { PaymentError } from './pagarme.js'", 'const PaymentError = Error')
  .replace("import { enviarEmailBoasVindas } from './enviarEmailBoasVindas.js'", 'export const deliveries = {}; const enviarEmailBoasVindas = async ({senha}) => { deliveries.email = senha }')
  .replace("import { enviarEmailRenovacao } from './enviarEmailRenovacao.js'", "const enviarEmailRenovacao = async () => { throw Error('Unexpected renewal') }")
  .replace("import { notifyAccessPabbly } from './checkoutAccessPabblyServer.js'", 'const notifyAccessPabbly = async (_db, {password}) => { deliveries.whatsapp = password }')
  .replace("const {after} = await import('next/server')", 'const after = callback => { deliveries.after = callback }')
 const {fulfillPaidOrder, deliveries} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
 const rows = {
  orders: {...order, status:'paid', customer_id:'customer', offer_id:'offer', total_cents:1700},
  customers: customer,
  webhook_events: {id:'receipt', error:'ready'},
  order_items: [{product_id:'product', offer_id:'offer', kind:'main'}],
  products: [{id:'product', plan_id:'plan'}],
  plans: [{id:'plan', period_days:180}],
 }
 const db = {
  auth: {admin: {async createUser({password}) {
   deliveries.login = password
   return {data:{user:{id:'profile'}}}
  }}},
  from(table) {
   let data = rows[table] ?? null
   const query = {
    select() { return query }, eq() { return query }, in() { return query },
    single() { return query }, maybeSingle() { return query },
    insert() { return query }, upsert() { return query },
    update() { data = [{id:'receipt'}]; return query },
    then(resolve, reject) { return Promise.resolve({data}).then(resolve, reject) },
   }
   return query
  },
 }
 const env = {CHECKOUT_FULFILLMENT_ENABLED:'true', CHECKOUT_ACCESS_LEDGER_ENABLED:'true', CONTRACTS_ENABLED:'false', VERCEL_ENV:'production'}
 const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
 Object.assign(process.env, env)
 try {
  assert.equal((await fulfillPaidOrder(db, order.id)).fulfillment,'completed')
  await deliveries.after()
  assert.match(deliveries.login,/^[1-9]\d{5}$/)
  assert.equal(deliveries.email,deliveries.login)
  assert.equal(deliveries.whatsapp,deliveries.login)
 } finally {
  for (const [key, value] of Object.entries(previous)) {
   if (value === undefined) delete process.env[key]
   else process.env[key] = value
  }
 }
})

test('new access is sent once to Pabbly with the exact existing workflow fields',async()=>{
 const db=fakeDb(), sent=[]
 const sender=async(_url,payload)=>{sent.push(payload);return {status:200}}
 const password='615204'
 const result=await notifyAccessPabbly(db,{order,customer,password,productName:'Desafio 7 Dias',sender})
 assert.equal(result.status,'accepted_by_pabbly')
 assert.equal(sent.length,1)
 assert.equal(sent[0].email,customer.email)
 assert.equal(sent[0].nome,customer.name)
 assert.equal(sent[0].telefone,customer.phone)
 assert.equal(sent[0].senha,password)
 assert.equal(sent[0].link_app,'https://rotina.suzanazatorre.com.br/login')
 assert.equal(sent[0].nome_produto,'Desafio 7 Dias')
 assert.equal(JSON.stringify(db.recorded()).includes(password),false)
 assert.equal((await notifyAccessPabbly(db,{order,customer,password,sender})).status,'already_sent')
 assert.equal(sent.length,1)
})

test('existing student receives recovery instructions without password reset',async()=>{
 const db=fakeDb(), sent=[]
 const result=await notifyAccessPabbly(db,{order,customer,productName:'Desafio',sender:async(_url,payload)=>{sent.push(payload);return {status:200}}})
 assert.equal(result.status,'accepted_by_pabbly')
 assert.match(sent[0].link_app,/esqueci-senha$/)
 assert.match(sent[0].senha,/link de recuperação/)
})

test('provider failures are recorded for reattempts without changing payment state',async()=>{
 const db=fakeDb()
 const failed=await notifyAccessPabbly(db,{order,customer,password:'secret',sender:async()=>({status:500})})
 assert.equal(failed.status,'failed')
 assert.equal(db.recorded().error,'retry')
 const retried=await notifyAccessPabbly(db,{order,customer,password:'secret',sender:async()=>({status:200})})
 assert.equal(retried.status,'accepted_by_pabbly')
 assert.ok(db.recorded().processed_at)
})

test('only the approved Pabbly domain is permitted',async()=>{
 const db=fakeDb({url:'https://invalid.example/receive'})
 const result=await notifyAccessPabbly(db,{order,customer,password:'secret',sender:async()=>{throw Error('not allowed')}})
 assert.equal(result.status,'invalid_destination')
 assert.equal(db.recorded(),null)
})

test('product tag is checked before the access flow and a missing tag delays WhatsApp only',async()=>{
 const db=fakeDb(), steps=[]
 const first=await notifyAccessPabbly(db,{order,customer,password:'temporary-password',
   productTagGate:async()=>{steps.push('tag_not_ready');return {ready:false,reason:'product_tag_pending'}},
   sender:async()=>{throw Error('access must not run yet')}})
 assert.equal(first.status,'waiting_product_tag')
 assert.equal(db.recorded().error,'waiting_tag')
 assert.deepEqual(steps,['tag_not_ready'])
 const second=await notifyAccessPabbly(db,{order,customer,password:'temporary-password',
   productTagGate:async()=>{steps.push('tag_delivered');return {ready:true,reason:'product_tag_accepted'}},
   sender:async()=>{steps.push('send_access');return {status:200}}})
 assert.equal(second.status,'accepted_by_pabbly')
 assert.deepEqual(steps,['tag_not_ready','tag_delivered','send_access'])
})
