import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../src/lib/checkoutFulfillmentServer.js',import.meta.url),'utf8')
  .replace("await import('./contractsServer.js')", "({contractGate:async()=>{throw new Error('queue temporarily unavailable')}})")
  .replace(/from '(\.\/[^']+\.js)'/g,(_all,path)=>`from ${JSON.stringify(new URL(`../src/lib/${path.slice(2)}`,import.meta.url).href)}`)
const {fulfillPaidOrder}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('falha de criação/fila solicita conciliação novamente sem registrar acesso concluído', async()=>{
  const saved={CONTRACTS_ENABLED:process.env.CONTRACTS_ENABLED,CHECKOUT_FULFILLMENT_ENABLED:process.env.CHECKOUT_FULFILLMENT_ENABLED}
  Object.assign(process.env,{CONTRACTS_ENABLED:'true',CHECKOUT_FULFILLMENT_ENABLED:'true'})
  let calls=0
  const db={from(table){assert.equal(table,'orders');calls++;const query={select(){return query},eq(){return query},single:async()=>({data:{id:'order',status:'paid',paid_at:'2026-11-01T12:00:00Z'},error:null})};return query}}
  try{
    await assert.rejects(fulfillPaidOrder(db,'order'),error=>error.status===503&&/conciliação/.test(error.message))
    assert.equal(calls,1)
  }finally{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
