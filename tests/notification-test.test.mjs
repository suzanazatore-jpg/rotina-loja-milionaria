import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/api/notificacoes/teste/route.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
function setup({registered=true,claimError=null,sendError=null}={}) {
  const reads=[],updates=[],sent=[]
  const db={auth:{getUser:async()=>({data:{user:{id:'me'}}})},from(table){
    const query={select(){return query},eq(key,value){reads.push([table,key,value]);return query},async maybeSingle(){return {data:registered?{id:'device',endpoint:'https://push.example.test/me',p256dh:'key',auth:'auth'}:null}},async insert(){return {error:claimError}},update(row){updates.push([table,row]);return query},then(resolve){resolve({error:null})}}
    return query
  }}
  const context=vm.createContext({Response,Date,process:{env:{}},createClient:()=>db,protocolNotificationId:()=> 'test-id',setTimeout:resolve=>resolve(),sendPushNotification:async(sub,payload)=>{sent.push([sub,payload]);if(sendError)throw sendError}})
  vm.runInContext(source+'\nthis.handler=POST',context)
  const request=token=>new Request('https://app.example.test/api/notificacoes/teste',{method:'POST',headers:token?{Authorization:'Bearer test'}:{},body:JSON.stringify({endpoint:'https://push.example.test/me'})})
  return {run:(token=true)=>context.handler(request(token)),reads,updates,sent}
}
test('test push rejects unauthenticated requests without database lookup',async()=>{const s=setup();assert.equal((await s.run(false)).status,401);assert.equal(s.reads.length,0);assert.equal(s.sent.length,0)})
test('test push requires the current device to belong to the authenticated user',async()=>{const s=setup({registered:false});assert.equal((await s.run()).status,409);assert.ok(s.reads.some(x=>x[1]==='user_id'&&x[2]==='me'));assert.ok(s.reads.some(x=>x[1]==='endpoint'));assert.equal(s.sent.length,0)})
test('duplicate test claims cannot send twice',async()=>{const s=setup({claimError:{code:'23505'}});assert.equal((await s.run()).status,429);assert.equal(s.sent.length,0)})
test('expired device is disabled and is never reported as a successful send',async()=>{const s=setup({sendError:{statusCode:410}});assert.equal((await s.run()).status,410);assert.ok(s.updates.some(x=>x[0]==='push_subscriptions'&&x[1].active===false));assert.ok(!s.updates.some(x=>x[1].push_sent_at))})
test('successful send records acceptance, without claiming device delivery',async()=>{const s=setup();const r=await s.run();assert.equal(r.status,200);assert.match((await r.json()).message,/ao serviço/);assert.equal(s.sent.length,1);assert.ok(s.updates.some(x=>x[1].push_device_count===1))})
