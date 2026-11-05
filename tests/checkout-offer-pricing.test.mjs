import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const route=readFileSync(new URL('../src/app/api/admin/checkout/route.js',import.meta.url),'utf8')
const definitions=route.slice(route.indexOf('const TIPOS_PRODUTO'),route.indexOf('async function salvarBumps'))
const montarOferta=new Function('reaisParaCentavos','normalizeCheckoutSettings','loadGlobalCheckoutSettings','offerPath',definitions+';return montarOferta')(
  value=>Math.round(Number(String(value).replace(',','.'))*100), value=>value,async()=>({}),value=>value,
)
const db={from:()=>({select(){return this},eq(){return this},async single(){return {data:{id:'p',type:'one_time',slug:'p'}}}})}
const base={id:'existing',product_id:'p',name:'Desafio',price:'27,00',payment_methods:['credit_card','pix'],checkout_config:{redirects:{}}}
test('promotion uses effective price for every payment path and retains the list price for editing',async()=>{
 const record=await montarOferta(db,{...base,promo_price:'19,90'})
 assert.equal(record.price_cents,1990)
 assert.equal(record.checkout_config.regular_price_cents,2700)
 const cleared=await montarOferta(db,{...base,promo_price:'',checkout_config:record.checkout_config})
 assert.equal(cleared.price_cents,2700)
 assert.equal(cleared.checkout_config.regular_price_cents,null)
})
test('invalid promotional prices cannot be saved',async()=>{
 for(const price of ['0','27,00','50','abc'])await assert.rejects(montarOferta(db,{...base,promo_price:price}),/promocional/)
})
