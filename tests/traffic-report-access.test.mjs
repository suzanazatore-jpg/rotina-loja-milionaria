import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
// Load the actual server query function with only external auth/client dependencies replaced.
let source=await readFile(new URL('../src/lib/trafficReportServer.js',import.meta.url),'utf8')
source=source.replace("import { createClient } from '@supabase/supabase-js'",'const createClient=()=>{throw Error("unused")}').replace("import { loadTrafficAccess } from './trafficAccess'",'const loadTrafficAccess=async(db,id)=>db.eligible.includes(id)')
source=source.replace("import { normalizeEntity } from './trafficReportModel.js'", 'const normalizeEntity=row=>row')
const {reportData,allRows}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
function fixture(){
 const tables={traffic_client_users:[{client_id:'a',user_id:'alice'},{client_id:'b',user_id:'bob'},{client_id:'c',user_id:'alice'}],traffic_clients:[{id:'a',name:'A',meta_account_id:'1',active:true},{id:'b',name:'B',meta_account_id:'2',active:true},{id:'c',name:'C',meta_account_id:'3',active:false}],traffic_daily_metrics:[{client_id:'a',metric_date:'2026-10-20',spend:10},{client_id:'b',metric_date:'2026-10-20',spend:999}],traffic_reports:[{id:'r1',client_id:'a',published_at:'2026-10-20',period_end:'2026-10-19'},{id:'draft',client_id:'a',published_at:null},{id:'future',client_id:'a',published_at:'2099-01-01'},{id:'r2',client_id:'b',published_at:'2026-10-20'}],traffic_metric_snapshots:[{meta_account_id:'1',payload:{ads:[{id:'ad-a'}]}},{meta_account_id:'2',payload:{ads:[{id:'ad-b'}]}}],profiles:[]}
 const queries=[]
 return {eligible:['alice','bob'],queries,from(table){queries.push(table);let rows=[...tables[table]];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},not(k,op,v){rows=rows.filter(r=>r[k]!==v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},order(){return q},async range(from,to){return {data:rows.slice(from,to+1),error:null}}};return q}}
}
test('Alice cannot read Bob data, images, inactive accounts, drafts or future reports',async()=>{const db=fixture();const d=await reportData(db,{id:'alice',email:'alice@example.com'});assert.deepEqual(d.accounts.map(a=>a.id),['a']);assert.deepEqual(d.metrics.map(a=>a.spend),[10]);assert.deepEqual(d.snapshots.map(a=>a.meta_account_id),['1']);assert.deepEqual(d.reports.map(a=>a.id),['r1']);assert.deepEqual(d.clients,[])})
test('expired access stops before all data queries even when account remains linked',async()=>{const db=fixture();db.eligible=[];assert.equal(await reportData(db,{id:'alice'}),null);assert.equal(db.queries.length,0)})
test('unlinked eligible customer gets no data',async()=>{const db=fixture();db.eligible.push('new');const d=await reportData(db,{id:'new'});assert.equal(d.pending,true);assert.deepEqual(d.snapshots,[])})
test('pagination retrieves beyond default PostgREST page size',async()=>{const all=Array.from({length:1205},(_,i)=>i);let pages=0;const result=await allRows(()=>({range:async(a,b)=>{pages++;return {data:all.slice(a,b+1)}}}));assert.equal(result.length,1205);assert.equal(pages,3)})
