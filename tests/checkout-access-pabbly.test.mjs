import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const code=readFileSync(new URL('../src/lib/checkoutAccessPabblyServer.js',import.meta.url),'utf8')
  .replace("import {sendWebhook} from './checkoutOutboundServer.js'","const sendWebhook = () => { throw new Error('Real network forbidden in tests') }")
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

test('new access is sent once to Pabbly with the exact existing workflow fields',async()=>{
 const db=fakeDb(), sent=[]
 const sender=async(_url,payload)=>{sent.push(payload);return {status:200}}
 const result=await notifyAccessPabbly(db,{order,customer,password:'temporary-password',productName:'Desafio 7 Dias',sender})
 assert.equal(result.status,'accepted_by_pabbly')
 assert.equal(sent.length,1)
 assert.equal(sent[0].email,customer.email)
 assert.equal(sent[0].nome,customer.name)
 assert.equal(sent[0].telefone,customer.phone)
 assert.equal(sent[0].senha,'temporary-password')
 assert.equal(sent[0].link_app,'https://rotina.suzanazatorre.com.br/login')
 assert.equal(sent[0].nome_produto,'Desafio 7 Dias')
 assert.equal(JSON.stringify(db.recorded()).includes('temporary-password'),false)
 assert.equal((await notifyAccessPabbly(db,{order,customer,password:'temporary-password',sender})).status,'already_sent')
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
