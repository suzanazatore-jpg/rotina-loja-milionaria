import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/app/api/admin/checkout/configuracao-oferta/route.js',import.meta.url),'utf8')
const body=source.replace(/^import .*$/gm,'').replace('export async function PATCH','async function PATCH')
const factory=new Function('NextResponse','isDeepStrictEqual','autorizarAdmin','checkoutAdminClient','loadGlobalCheckoutSettings','patchCheckoutConfig',`${body};return PATCH`)
const offer={id:'0fb4fa16-235d-429d-9948-9a51002535aa',product_id:'c35a5d1c-bf01-4d98-805f-b86f05e345f1',checkout_config:{background:'#ffffff'},thank_you_url:'https://example.org/thanks'}
const request=(extra={})=>({json:async()=>({id:offer.id,product_id:offer.product_id,baseline:offer.checkout_config,thank_you_url:offer.thank_you_url,changes:{background:'#123456'},...extra})})
async function scenario({authorized=true,conflict=false,race=false,redirects=false}={}){
 let written=null,read=false
 const query={select(){return this},eq(){return this},is(){return this},single:async()=>({data:offer}),maybeSingle:async()=>({data:race?null:{...offer,...written}}),update(record){written=record;return this}}
 const db={from(){read=true;return query}}
 const handler=factory({json:(value,{status=200}={})=>({status,...value})},(a,b)=>JSON.stringify(a)===JSON.stringify(b),async()=>authorized,()=>db,async()=>({}),(_current,changes)=>({...offer.checkout_config,...changes}))
 const result=await handler(request(conflict?{baseline:{}}:redirects?{changes:{redirects:{approved:'https://example.org/new'}}}:{}))
 return {result,written,read}
}
test('unauthorized settings writes stop before reading the offer',async()=>{const s=await scenario({authorized:false});assert.equal(s.result.status,401);assert.equal(s.read,false);assert.equal(s.written,null)})
test('stale editor and a racing update return conflict',async()=>{for(const option of [{conflict:true},{race:true}])assert.equal((await scenario(option)).result.status,409)})
test('visual save updates only configuration and never pricing, bumps or legacy thank-you URL',async()=>{const s=await scenario();assert.equal(s.result.status,200);assert.deepEqual(Object.keys(s.written),['checkout_config'])})
test('explicit redirect change synchronizes the existing thank-you column',async()=>{const s=await scenario({redirects:true});assert.equal(s.result.status,200);assert.equal(s.written.thank_you_url,'https://example.org/new')})
