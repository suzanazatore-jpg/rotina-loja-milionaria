import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {groupWeeklyReports,weeklyDigestNotice,weeklyDeliveryKey,reportPeriodSelection} from '../src/lib/trafficReportDigest.js'
const range={from:'2026-10-19',to:'2026-10-25'}
test('one recipient receives one group for two accounts, while another keeps a separate group',()=>{
 const reports=[{id:'r1',client_id:'a',account_name:'Conta A'},{id:'r2',client_id:'b',account_name:'Conta B'},{id:'r3',client_id:'c',account_name:'Conta C'}]
 const groups=groupWeeklyReports(reports,[{user_id:'u1',client_id:'a'},{user_id:'u1',client_id:'b'},{user_id:'u1',client_id:'a'},{user_id:'u2',client_id:'c'}])
 assert.equal(groups.length,2);assert.equal(groups[0].reports.length,2);assert.equal(groups[1].reports.length,1)
 const notice=weeklyDigestNotice(range,groups[0].reports)
 assert.match(notice.body,/2 contas/);assert.match(notice.details,/Conta A/);assert.match(notice.details,/Conta B/);assert.ok(!notice.details.includes('Conta C'))
 assert.equal(notice.path,'/trafego?from=2026-10-19&to=2026-10-25')
 assert.notEqual(weeklyDeliveryKey(range),weeklyDeliveryKey({from:'2026-10-26',to:'2026-11-01'}))
})
test('period link selects only weeks with a published report returned for this access',()=>{
 const reports=[{period_type:'weekly',period_start:range.from,period_end:range.to}]
 assert.equal(reportPeriodSelection(reports,range.from,range.to).period_start,range.from)
 assert.equal(reportPeriodSelection([],range.from,range.to),null)
 assert.equal(reportPeriodSelection(reports,'bad-date',range.to),null)
})
let source=await readFile(new URL('../src/lib/trafficWeeklyReports.js',import.meta.url),'utf8')
source=source.replace(/^import .*\n/gm,'').replace(/^export \{trafficChannels\}.*\n/gm,'').replace(/^export /gm,'')
const {deliverTraffic}=new Function(source+';return {deliverTraffic};')()
function memoryDeliveries(seed=[]){
 const rows=seed.map(r=>({...r}))
 return {rows,from(){let filters={},mode='read',values,one=false
 const q={insert(v){mode='insert';values=v;return q},update(v){mode='update';values=v;return q},match(v){Object.assign(filters,v);return q},eq(k,v){filters[k]=v;return q},select(){return q},single(){one=true;return q},then(ok,fail){
  let found=rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v))
  if(mode==='insert'){
   const exists=rows.some(r=>r.user_id===values.user_id&&r.channel===values.channel&&(values.test_id?r.test_id===values.test_id:values.batch_key?r.batch_key===values.batch_key:r.report_id===values.report_id))
   if(exists)return Promise.resolve({error:{code:'23505'}}).then(ok,fail)
   rows.push({id:'d'+rows.length,status:'pending',...values});found=[]
  }
  if(mode==='update')found.forEach(r=>Object.assign(r,values))
  return Promise.resolve({data:one?found[0]:found.map(r=>({...r})),error:null}).then(ok,fail)
 }};return q}}
}
test('each channel sends once for the week despite repeated execution or account changes',async()=>{
 const db=memoryDeliveries();let calls=0
 for(const channel of ['app','push','email','whatsapp']){
  const recipient={id:'u1'},send=async()=>{calls++;return {status:'accepted'}}
  await deliverTraffic(db,{batch_key:weeklyDeliveryKey(range),report_ids:['r1','r2']},recipient,channel,send)
  const repeated=await deliverTraffic(db,{batch_key:weeklyDeliveryKey(range),report_ids:['r2','r1','new']},recipient,channel,send)
  assert.equal(repeated.reused,true)
 }
 assert.equal(calls,4);assert.equal(db.rows.length,4)
})
test('migrated historical deliveries and ambiguous sends never trigger another weekly message',async()=>{
 const db=memoryDeliveries([{id:'old',report_id:'r1',report_ids:['r1','r2'],batch_key:weeklyDeliveryKey(range),user_id:'u1',channel:'whatsapp',status:'accepted'}]);let calls=0
 const send=async()=>{calls++;return {status:'accepted'}}
 assert.equal((await deliverTraffic(db,{batch_key:weeklyDeliveryKey(range),report_ids:['r1','r2']},{id:'u1'},'whatsapp',send)).reused,true)
 assert.equal(calls,0)
 const ambiguous=memoryDeliveries()
 await deliverTraffic(ambiguous,{batch_key:weeklyDeliveryKey(range),report_ids:['r1','r2']},{id:'u1'},'email',async()=>{calls++;throw Error('Timeout')})
 const replay=await deliverTraffic(ambiguous,{batch_key:weeklyDeliveryKey(range),report_ids:['r1','r2']},{id:'u1'},'email',send)
 assert.equal(replay.status,'unknown');assert.equal(calls,1)
})
test('different recipients and a new week get their own delivery',async()=>{
 const db=memoryDeliveries();let calls=0
 for(const [id,batch_key] of [['u1',weeklyDeliveryKey(range)],['u2',weeklyDeliveryKey(range)],['u1',weeklyDeliveryKey({from:'2026-10-26',to:'2026-11-01'})]]){
  await deliverTraffic(db,{batch_key,report_ids:['r1']},{id},'app',async()=>{calls++;return {status:'sent'}})
 }
 assert.equal(calls,3)
})

test('weekly runner prepares first and sends only one notice per recipient and channel',async()=>{
 const tables={
  traffic_report_settings:[{id:true,weekly_enabled:true,email_enabled:true,whatsapp_enabled:true,push_enabled:true}],
  traffic_client_users:[{client_id:'a',user_id:'u1'},{client_id:'b',user_id:'u1'},{client_id:'c',user_id:'u2'}],
  traffic_clients:['a','b','c'].map(id=>({id,name:'Conta '+id,active:true})),
  traffic_daily_metrics:['a','b','c'].flatMap(client_id=>Array.from({length:7},(_,i)=>({client_id,metric_date:'2026-10-'+(19+i),data_status:'ok',spend:10,clicks:1,impressions:100}))),
  traffic_reports:['a','b','c'].map(id=>({id:'r'+id,client_id:id,period_type:'weekly',period_start:range.from,period_end:range.to,published_at:'2026-10-26T11:00:00Z'})),
  profiles:['u1','u2'].map(id=>({id,name:id,email:id+'@example.test'})),perfis:[],traffic_report_deliveries:[]
 }
 const db={from(table){let filters=[],mode='read',values,one=false
 const q={select(){return q},order(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},match(v){for(const [k,val] of Object.entries(v))q.eq(k,val);return q},single(){one=true;return q},maybeSingle(){one=true;return q},insert(v){mode='insert';values=v;return q},update(v){mode='update';values=v;return q},then(ok,fail){
  const rows=tables[table];let found=rows.filter(r=>filters.every(f=>f(r)))
  if(mode==='insert'){
   if(rows.some(r=>r.user_id===values.user_id&&r.channel===values.channel&&r.batch_key===values.batch_key))return Promise.resolve({error:{code:'23505'}}).then(ok,fail)
   rows.push({id:'d'+rows.length,status:'pending',...values});found=[]
  }
  if(mode==='update')found.forEach(r=>Object.assign(r,values))
  return Promise.resolve({data:one?found[0]||null:found.map(r=>({...r})),error:null}).then(ok,fail)
 }};return q}}
 const sends=[]
 const runner=new Function('lastClosedWeek','rangeTotals','trafficDb','allRows','loadTrafficAccess','sendTrafficChannel','groupWeeklyReports','weeklyDigestNotice','weeklyDeliveryKey',source+';return runTrafficWeekly;')(
  ()=>range,
  rows=>({days:rows.length,spend:rows.reduce((n,r)=>n+r.spend,0),impressions:rows.reduce((n,r)=>n+r.impressions,0)}),
  ()=>db,async fn=>(await fn()).data,async()=>true,
  async(db,profile,channel,notice)=>{sends.push({user:profile.id,channel,notice});return {status:'accepted'}},
  groupWeeklyReports,weeklyDigestNotice,weeklyDeliveryKey)
 await runner(new Date('2026-10-26T13:00:00Z'),{notify:false});assert.equal(sends.length,0)
 await runner(new Date('2026-10-26T13:00:00Z'));await runner(new Date('2026-10-26T13:00:00Z'))
 assert.equal(sends.length,8);assert.equal(sends.filter(r=>r.user==='u1').length,4)
 for(const item of sends.filter(r=>r.user==='u1')){assert.match(item.notice.details,/Conta a/);assert.match(item.notice.details,/Conta b/);assert.ok(!item.notice.details.includes('Conta c'))}
})
