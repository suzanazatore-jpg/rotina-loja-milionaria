import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const ctx=vm.createContext({Date,Set})
vm.runInContext(readFileSync(new URL('../src/lib/protocolNotificationAudience.js',import.meta.url),'utf8').replace(/^export /gm,''),ctx)
function db({fail=false}={}){
 const calls=[]
 return {calls,from(table){assert.equal(table,'enrollments');let ids=[];const q={select(){return q},in(k,v){assert.equal(k,'profile_id');ids=v;return q},eq(k,v){calls.push([k,v]);return q},or(v){assert.match(v,/expires_at.is.null,expires_at.gt./);return q},order(){return q},range(){return Promise.resolve(fail?{error:new Error('lookup failed')}:{data:ids.filter(id=>id.startsWith('protocol')).map(profile_id=>({profile_id}))})}};return q}}
}
test('removes all protocol devices and keeps other students',async()=>{const client=db();const rows=[{user_id:'protocol1',id:'a'},{user_id:'protocol1',id:'b'},{user_id:'regular',id:'c'}];const result=await ctx.withoutProtocolStudents(client,rows);assert.equal(result.length,1);assert.equal(result[0].id,'c');assert.ok(client.calls.some(([k,v])=>k==='status'&&v==='active'));assert.ok(client.calls.some(([k,v])=>k==='courses.protocol_enabled'&&v===true))})
test('checks users in batches without dropping later protocol students',async()=>{const rows=Array.from({length:450},(_,i)=>({user_id:`protocol${i}`}));assert.equal((await ctx.withoutProtocolStudents(db(),rows)).length,0)})
test('fails closed when enrollment lookup fails',async()=>{await assert.rejects(()=>ctx.withoutProtocolStudents(db({fail:true}),[{user_id:'protocol1'}]),/lookup failed/)})
test('does not query for an empty audience',async()=>{assert.equal((await ctx.withoutProtocolStudents({from(){throw new Error('unexpected')}},[])).length,0)})
