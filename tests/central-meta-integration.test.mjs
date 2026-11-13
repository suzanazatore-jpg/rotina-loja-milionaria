import test from 'node:test'
import assert from 'node:assert/strict'
import {readCentralMeta} from '../src/lib/centralMetaIntegration.js'
test('user connection reads the credential identity, never the traffic-client registry',async()=>{
 const calls=[]
 const value=await readCentralMeta({token:'test-secret',fetcher:async(url,options)=>{calls.push(String(url));assert.equal(options.headers.Authorization,'Bearer test-secret');return {ok:true,json:async()=>({id:'123',name:'Identity'})}}})
 assert.equal(value.rows[0].id,'123');assert.equal(calls.length,1);assert.match(calls[0],/\/me\?/);assert.doesNotMatch(JSON.stringify(value),/test-secret/)
})
test('managed ad accounts are never misrepresented as linked to Central',async()=>{
 const value=await readCentralMeta({token:'test-secret',tab:'adaccounts',fetcher:async()=>({ok:true,json:async()=>({id:'123',name:'Identity'})})})
 assert.deepEqual(value.rows,[]);assert.match(value.message,/vínculo próprio/)
})
test('missing credentials skip Meta; revoked credentials surface failure instead of a false empty connection',async()=>{
 assert.equal((await readCentralMeta()).configured,false)
 await assert.rejects(()=>readCentralMeta({token:'revoked',fetcher:async()=>({ok:false,json:async()=>({error:{code:190}})})}),/autorização/)
})

test('Meta route enforces admin access before reading identity or tracking',async()=>{
 const {readFileSync}=await import('node:fs')
 const source=readFileSync(new URL('../src/app/api/admin/checkout/integracoes/meta/route.js',import.meta.url),'utf8').replace(/^import .*$/gm,'')
 const injected=`let allowed=false,reads=0;export function configure(v){allowed=v;reads=0}export function count(){return reads}const checkoutAdminClient=()=>({});const autorizarAdmin=async()=>allowed;const loadGlobalTracking=async()=>{reads++;return {meta_pixel_id:'123456'}};const readCentralMeta=async()=>{reads++;return {rows:[]}};${source}`
 const api=await import('data:text/javascript;base64,'+Buffer.from(injected).toString('base64'))
 assert.equal((await api.GET(new Request('https://app.test/api?tab=users'))).status,401)
 assert.equal(api.count(),0)
 api.configure(true)
 assert.equal((await api.GET(new Request('https://app.test/api?tab=invalid'))).status,400)
 assert.equal(api.count(),0)
 const response=await api.GET(new Request('https://app.test/api?tab=pixels'))
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store')
 assert.equal((await response.json()).rows[0].id,'123456')
})
