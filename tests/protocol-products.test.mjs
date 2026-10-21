import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const helper=vm.createContext({})
vm.runInContext(readFileSync(new URL('../src/lib/protocolProducts.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\nthis.normalize=normalizeProtocolProducts',helper)
const normalize=helper.normalize

test('accepts 30 products and totals their quantities',()=>{const result=normalize(Array.from({length:30},(_,i)=>({name:` Produto ${i+1} `,quantity:'2'})));assert.equal(result.total,60);assert.equal(result.products.length,30);assert.equal(result.products[0].name,'Produto 1')})
test('rejects missing names, fractional/negative quantities, empty lists and excessive totals',()=>{for(const list of [[],[{name:'',quantity:2}],[{name:'A',quantity:1.5}],[{name:'A',quantity:-1}],[{name:'A',quantity:true}],[{name:'A',quantity:100000},{name:'B',quantity:1}],Array.from({length:201},()=>({name:'A',quantity:1}))])assert.throws(()=>normalize(list))})
const route=readFileSync(new URL('../src/app/api/protocolo/route.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
function setup({existing=false,sold=0}={}){
 const writes=[],filters=[]
 const db={auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@example.test'}}})},from(table){
   const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},match(v){filters.push([table,'match',v]);return q},order(){return q},or(){return q},insert(v){writes.push([table,'insert',v]);return q},update(v){writes.push([table,'update',v]);return q},maybeSingle(){return q},then(resolve){return Promise.resolve({data:table==='courses'?{id:'course',is_published:true,protocol_enabled:true}:table==='profiles'?{role:'admin',status:'active'}:table==='lessons'?Array.from({length:7},()=>({protocol_checklist:['A']})):table==='protocol_runs'?(existing?{owner_id:'owner'}:null):table==='protocol_sales'?[{pieces:sold}]:[]}).then(resolve)}};return q}}
 const ctx=vm.createContext({Response,Intl,Date,normalizeProtocolProducts:normalize,PROTOCOL_EDITING_OPEN:true,createClient:()=>db,process:{env:{}}})
 vm.runInContext(route+'\nthis.handler=POST',ctx)
 return {writes,filters,run:body=>ctx.handler(new Request('https://test/api/protocolo',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({slug:'protocolo',...body})}))}
}
test('start computes stock on the server instead of trusting a supplied total',async()=>{const s=setup();assert.equal((await s.run({action:'start',lot_name:'Campanha',products:[{name:'Vestido',quantity:5},{name:'Blusa',quantity:7}],starting_pieces:999,goal_cents:10000})).status,200);assert.equal(s.writes[0][2].starting_pieces,12);assert.equal(s.writes[0][2].owner_id,'owner')})
test('existing campaigns can add products without resetting other campaign fields',async()=>{const s=setup({existing:true,sold:3});assert.equal((await s.run({action:'products',products:[{name:'Vestido',quantity:5}]})).status,200);assert.deepEqual(Object.keys(s.writes[0][2]).sort(),['products','starting_pieces']);assert.ok(s.filters.some(x=>x[0]==='protocol_runs'&&x[1]==='match'&&x[2].owner_id==='owner'))})
test('cannot reduce the stock below recorded sales',async()=>{const s=setup({existing:true,sold:6});assert.equal((await s.run({action:'products',products:[{name:'Vestido',quantity:5}]})).status,400);assert.equal(s.writes.length,0)})
