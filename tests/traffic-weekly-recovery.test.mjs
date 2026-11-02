import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {collectWeeklyAccount} from '../src/lib/trafficWeeklyCollection.js'
import {TrafficLiveError} from '../src/lib/trafficLiveMeta.js'
const range={from:'2026-10-26',to:'2026-11-01'},account={id:'client',meta_account_id:'123'}
const daily=Array.from({length:7},(_,i)=>({metric_date:new Date(Date.parse(range.from+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),spend:10,impressions:100}))
const snapshot=()=>({meta_account_id:'123',period_start:range.from,period_end:range.to,collected_at:'2026-11-02T12:00:00Z',payload:{totals:{spend:70,impressions:700,amount_spent:{value:70,unit:'BRL'}},daily:daily.map(r=>({...r}))}})
function memory(){
 const writes=[],rows=[]
 return {writes,from(table){let mode='read',value
  const q={insert(v){mode='insert';value=v;return q},upsert(v){mode='upsert';value=v;return q},update(v){mode='update';value=v;return q},select(){return q},eq(){return q},gte(){return q},lte(){return q},single(){return q},then(ok,bad){if(mode!=='read')writes.push({table,mode,value});if(table==='traffic_daily_metrics'&&mode==='upsert')rows.push(...value);const data=table==='traffic_clients'?account:table==='traffic_daily_metrics'?rows:{id:'run'};return Promise.resolve({data,error:null}).then(ok,bad)}};return q}}
}
test('weekly collection verifies seven persisted days and finalizes its run without sending',async()=>{
 const db=memory();const result=await collectWeeklyAccount(db,account,range,{reader:async args=>{assert.equal(args.accountId,'123');assert.equal(args.details,true);return {snapshot:snapshot()}},env:{META_ADS_ACCESS_TOKEN:'test'}})
 assert.equal(result.status,'saved');assert.equal(db.writes.at(-1).value.status,'success');assert.equal(db.writes.filter(w=>w.table==='traffic_daily_metrics')[0].value.length,7)
 assert.ok(db.writes.every(w=>!['traffic_reports','traffic_report_deliveries','user_notifications'].includes(w.table)))
})
test('missing days, wrong account and inconsistent spend never replace saved data',async()=>{
 for(const mutate of [s=>s.payload.daily.pop(),s=>s.meta_account_id='456',s=>s.payload.daily[0].spend=1]){
  const db=memory(),value=snapshot();mutate(value);const result=await collectWeeklyAccount(db,account,range,{reader:async()=>({snapshot:value})})
  assert.equal(result.status,'failed');assert.equal(db.writes.at(-1).value.status,'failed');assert.ok(!db.writes.some(w=>w.mode==='upsert'))
 }
})
test('authorization errors remain visible; unexpected provider secrets stay private',async()=>{
 for(const error of [new TrafficLiveError('Renove a autorização desta conta.'),new Error('Bearer secret-value')]){
  const db=memory();const result=await collectWeeklyAccount(db,account,range,{reader:async()=>{throw error}})
  assert.equal(result.status,'failed');assert.ok(!JSON.stringify(db.writes).includes('secret-value'));if(error instanceof TrafficLiveError)assert.match(result.reason,/autorização/)
 }
})
let route=await readFile(new URL('../src/app/api/admin/trafego/semana/route.js',import.meta.url),'utf8')
route=route.replace(/^import .*\n/gm,'').replace(/export const /g,'const ').replace('export async function POST','async function POST')
const handler=new Function('trafficDb','trafficUser','TRAFFIC_ADMIN','runTrafficWeekly',route+';return POST')
test('recovery rejects non-admins, arbitrary recipients and unsupported actions before any work',async()=>{
 let calls=0
 const run=async()=>{calls++;return {ready:1}}
 for(const [user,body,status] of [[null,{action:'send'},403],[{email:'student'},{action:'prepare'},403],[{email:'admin'},{action:'send',recipientId:'other'},400],[{email:'admin'},{action:'bad'},400]]){
  const post=handler(()=>({}),async()=>user,'admin',run);const response=await post(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}));assert.equal(response.status,status)
 }
 assert.equal(calls,0)
 const options=[];const post=handler(()=>({}),async()=>({email:'admin'}),'admin',async(now,settings)=>{options.push(settings);return {ready:1}})
 for(const action of ['prepare','send'])assert.equal((await post(new Request('https://example.test',{method:'POST',body:JSON.stringify({action})}))).status,200)
 assert.deepEqual(options,[{notify:false,collectMissing:true},{notify:true,collectMissing:false}])
})
test('weekly text uses confirmed period totals when one daily click/conversion value is unavailable',async()=>{
 const {rangeTotals}=await import('../src/lib/trafficReportModel.js')
 const source=(await readFile(new URL('../src/lib/trafficWeeklyReports.js',import.meta.url),'utf8')).replace(/^import .*\n/gm,'').replace(/^export \{trafficChannels\}.*\n/gm,'').replace(/^export /gm,'')
 const summary=new Function('rangeTotals',source+';return weeklySummary;')(rangeTotals)
 const exact=snapshot();exact.payload.totals.clicks=71;exact.payload.campaigns=[{id:'c',spend:70,result_event:'onsite_conversion.messaging_conversation_started_7d',results:2}]
 const text=summary({name:'Conta'},daily.map(r=>({...r,data_status:'ok',clicks:null})),range,exact).summary
 assert.match(text,/Cliques no link: 71/);assert.match(text,/Conversas iniciadas: 2/)
})
