import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const code=fs.readFileSync(new URL('../src/app/api/admin/trafego/clientes/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export async function GET','async function GET')
function route(user){
 const tables={traffic_client_users:[{user_id:'approved',client_id:'a'},{user_id:'approved',client_id:'b'}],profiles:[{id:'approved',name:'Aprovada',role:'student'},{id:'other',name:'Sem aprovação',role:'student'}],traffic_clients:[{id:'a',name:'Conta A',active:true},{id:'b',name:'Conta B',active:true},{id:'c',name:'Outra',active:true}]}
 const db={auth:{getUser:async()=>({data:{user}})},from(table){let rows=tables[table];return {select(){return this},in(k,ids){rows=rows.filter(r=>ids.includes(r[k]));return this},eq(k,v){rows=rows.filter(r=>r[k]===v);return this},then(resolve){resolve({data:rows,error:null})}}}}
 return new Function('createClient','NextResponse',code+';return GET')(()=>db,{json:(body,opts)=>new Response(JSON.stringify(body),opts)})
}
const request=token=>new Request('https://rotina.test/api/admin/trafego/clientes',{headers:token?{authorization:'Bearer test'}:{}})
test('approved clients list denies anonymous, invalid sessions and students',async()=>{assert.equal((await route()(request(false))).status,401);assert.equal((await route()(request(true))).status,401);assert.equal((await route({id:'student'})(request(true))).status,403)})
test('office list includes only linked students and preserves multiple accounts',async()=>{const r=await route({email:'suporte@suzanazatorre.com.br'})(request(true));const result=await r.json();assert.equal(r.status,200);assert.equal(result.clients.length,1);assert.equal(result.clients[0].id,'approved');assert.deepEqual(result.clients[0].accounts.map(a=>a.id),['a','b']);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Vary'),'Authorization')})
