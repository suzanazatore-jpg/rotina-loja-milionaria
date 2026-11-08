import test from 'node:test'
import assert from 'node:assert/strict'
import {filterStorageKey,readFilters} from '../src/lib/centralFilterStorage.js'
const defaults={status:'todos',produto:'',inicio:'',fim:''}
function storage(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)}}
test('applied filters survive leaving and restoring a page, including empty and false values',()=>{
 const db=storage(),chosen={status:'paid',produto:'product',inicio:'2026-11-01',fim:'2026-11-08'}
 db.setItem(filterStorageKey('vendas'),JSON.stringify(chosen))
 assert.deepEqual(readFilters(db,'vendas',defaults),chosen)
 db.setItem(filterStorageKey('switch'),JSON.stringify(false));assert.equal(readFilters(db,'switch',true),false)
})
test('sections and product-specific filters stay independent',()=>{
 const db=storage();db.setItem(filterStorageKey('vendas'),JSON.stringify({...defaults,status:'paid'}))
 assert.deepEqual(readFilters(db,'clientes',defaults),defaults)
 assert.deepEqual(readFilters(db,'vendas-produto:other',defaults),defaults)
})
test('clear persists defaults and never restores a previous selection',()=>{
 const db=storage();db.setItem(filterStorageKey('vendas'),JSON.stringify({...defaults,status:'paid'}))
 db.setItem(filterStorageKey('vendas'),JSON.stringify(defaults));assert.deepEqual(readFilters(db,'vendas',defaults),defaults)
})
test('malformed or inaccessible storage and outdated filter fields fall back safely',()=>{
 const db=storage();db.setItem(filterStorageKey('vendas'),'{bad');assert.deepEqual(readFilters(db,'vendas',defaults),defaults)
 db.setItem(filterStorageKey('vendas'),JSON.stringify({status:[],produto:'p',obsolete:'ignored'}))
 assert.deepEqual(readFilters(db,'vendas',defaults),{...defaults,produto:'p'})
 assert.deepEqual(readFilters({getItem(){throw Error('blocked')}},'vendas',defaults),defaults)
})
test('an explicit product link overrides saved product while keeping other selections',()=>{
 const db=storage();db.setItem(filterStorageKey('vendas'),JSON.stringify({...defaults,status:'paid',produto:'old'}))
 assert.deepEqual(readFilters(db,'vendas',defaults,{produto:'new'}),{...defaults,status:'paid',produto:'new'})
})
