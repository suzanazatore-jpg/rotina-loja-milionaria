import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutAttribution } from '../src/lib/checkoutAttribution.js'
function browser(href, cookie = '') {
 const values=new Map()
 return {location:{href},document:{cookie},localStorage:{getItem:()=>null},sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}}
}
test('preserves a real click timestamp across reload, without manufacturing fbp or fbc',()=>{
 const target=browser('https://pay.example/desafio?fbclid=Real_Click_123')
 assert.deepEqual(checkoutAttribution(target,100000),{fbclid:'Real_Click_123',click_time:100000})
 assert.deepEqual(checkoutAttribution(target,110000),{fbclid:'Real_Click_123',click_time:100000})
 target.location.href='https://pay.example/desafio'
 assert.deepEqual(checkoutAttribution(target,120000),{fbclid:'Real_Click_123',click_time:100000})
 assert.deepEqual(checkoutAttribution(browser('https://pay.example/desafio'),100000),{})
})
test('collects only valid identifiers and honors explicit refusal',()=>{
 const target=browser('https://pay.example/desafio?fbclid=RealClick','_fbp=fb.1.1794432600000.12345; _fbc=invalid')
 assert.equal(checkoutAttribution(target).fbp,'fb.1.1794432600000.12345')
 assert.equal(checkoutAttribution(target).fbc,undefined)
 target.localStorage.getItem=()=> 'denied'
 assert.deepEqual(checkoutAttribution(target),{})
})
test('storage failures never block checkout or leak arbitrary storage fields',()=>{
 const target=browser('https://pay.example/desafio')
 target.sessionStorage.getItem=()=>JSON.stringify({fbclid:'RealClick',click_time:100000,secret:'not-a-meta-field'})
 assert.deepEqual(checkoutAttribution(target,110000),{fbclid:'RealClick',click_time:100000})
 target.localStorage.getItem=()=>{throw new Error('blocked')}
 assert.deepEqual(checkoutAttribution(target),{})
})
