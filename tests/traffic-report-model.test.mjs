import {test} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeEntity,numeric,previousRange,rangeTotals,lastClosedWeek,safeMedia,selectTrafficSnapshot} from '../src/lib/trafficReportModel.js'
test('keeps unavailable values unknown and explicit zero intact',()=>{for(const v of [null,undefined,'','Not available',{},NaN])assert.equal(numeric(v),null);assert.equal(numeric('0'),0)})
test('custom conversion result remains the campaign result, link CTR is distinct',()=>{const r=normalizeEntity({amount_spent:{value:'120',unit:'BRL'},impressions:'1000',link_click:'20',results:{indicator:'conversions:custom.Live da Su',values:[{value:'3'}]},cost_per_result:{value:'40',conversion_type:'Live da Su'},ctr_all:'8'});assert.equal(r.results,3);assert.equal(r.result_label,'Live da Su');assert.equal(r.cost,40);assert.equal(r.ctr,2);assert.equal(r.ctr_all,8);assert.equal(r.cpc,6)})
test('period totals never sum daily reach or average frequency',()=>{const rows=[{metric_date:'2026-10-01',data_status:'ok',spend:10,clicks:1,impressions:100,reach:90,frequency:1.11},{metric_date:'2026-10-02',data_status:'ok',spend:20,clicks:9,impressions:900,reach:400,frequency:2.25}];const t=rangeTotals(rows,'2026-10-01','2026-10-02');assert.equal(t.ctr,1);assert.equal(t.cpc,3);assert.equal(t.reach,null);assert.equal(t.frequency,null);assert.equal(t.revenue,null);const exact=rangeTotals(rows,'2026-10-01','2026-10-02',{period_start:'2026-10-01',period_end:'2026-10-02',payload:{totals:{reach:450,frequency:2.222}}});assert.equal(exact.reach,450);assert.equal(exact.frequency,2.222)})
test('date boundaries use equal length comparison and last closed Brazilian week',()=>{assert.deepEqual(previousRange('2026-10-01','2026-10-07'),{from:'2026-09-24',to:'2026-09-30',days:7});assert.deepEqual(lastClosedWeek(new Date('2026-10-26T11:00:00Z')),{from:'2026-10-19',to:'2026-10-25'});assert.equal(previousRange('2026-10-07','2026-10-01'),null)})
test('unsafe media cannot be rendered or opened',()=>{assert.equal(safeMedia('javascript:alert(1)'),null);assert.equal(safeMedia('https://user:pass@example.com'),null);assert.equal(safeMedia('https://example.com/image.jpg'),'https://example.com/image.jpg')})

test('snapshots choose the exact account and period without overwriting month or previous week',()=>{const snapshots=[{meta_account_id:'a',period_start:'2026-10-01',period_end:'2026-10-20',collected_at:'2026-10-21T06:00:00Z'},{meta_account_id:'a',period_start:'2026-10-12',period_end:'2026-10-18',collected_at:'2026-10-21T07:00:00Z'},{meta_account_id:'b',period_start:'2026-10-12',period_end:'2026-10-18',collected_at:'2099-01-01'}];assert.equal(selectTrafficSnapshot(snapshots,'a').period_start,'2026-10-01');assert.equal(selectTrafficSnapshot(snapshots,'a','2026-10-12','2026-10-18').period_start,'2026-10-12');assert.equal(selectTrafficSnapshot(snapshots,'none'),undefined)})

test('Meta video quartiles accept scalar and list responses',()=>{assert.equal(normalizeEntity({video_p25_watched_actions:'16'}).video_25,16);assert.equal(normalizeEntity({video_p50_watched_actions:[{value:'8'}]}).video_50,8);assert.equal(normalizeEntity({video_p100_watched_actions:null}).video_100,null)})

test('cards reconcile campaign conversations without counting reach or mixing reporting levels',()=>{
 const campaigns=[{id:'c1',spend:121.35,messages:26,result_label:'Conversas por mensagem iniciadas',results:26},{id:'c2',spend:85.53,result_label:'Alcance',results:11021},{id:'c3',spend:140.38,messages:16,result_label:'Conversas por mensagem iniciadas',results:16}]
 const t=rangeTotals([],'2026-10-01','2026-10-25',{period_start:'2026-10-01',period_end:'2026-10-25',payload:{totals:{spend:347.26},campaigns,ads:campaigns,adsets:campaigns}})
 assert.equal(t.messages,42);assert.equal(t.purchases,null);assert.equal(t.leads,null);assert.match(t.metric_notes.messages,/Soma das campanhas/)
})
test('technical conversation and purchase indicators retain meaning after normalization',()=>{
 const conversation=normalizeEntity({results:{indicator:'actions:onsite_conversion.messaging_conversation_started_7d',values:[{value:'6'}]}})
 assert.equal(conversation.messages,6);assert.equal(conversation.cost_label,'Custo por conversa iniciada')
 assert.equal(normalizeEntity(conversation).result_event,conversation.result_event)
 assert.equal(normalizeEntity({result_label:'actions:offsite_conversion.fb_pixel_purchase',results:2}).purchases,2)
 for(const indicator of ['offsite_conversion.fb_pixel_custom.Live da Su','actions:onsite_conversion.messaging_first_reply','reach']){
  const r=normalizeEntity({results:{indicator,value:99}});assert.equal(r.messages,null);assert.equal(r.leads,null)
 }
})
test('normalized landing views and attributed follows survive a second read',()=>{
 const r=normalizeEntity(normalizeEntity({landing_page_view:15,instagram_profile_follow_v2:23}))
 assert.equal(r.landing_page_views,15);assert.equal(r.follows,23)
})
test('partial campaign events are labelled and incomplete period details do not feed cards',()=>{
 const campaigns=[{id:'c1',spend:10,result_label:'Conversas por mensagem iniciadas',results:6},{id:'c2',spend:5,result_label:'Conversas por mensagem iniciadas',results:null}]
 const complete=rangeTotals([],'2026-10-25','2026-10-25',null,{complete:true,campaigns})
 assert.equal(complete.messages,6);assert.match(complete.metric_notes.messages,/parcial/)
 assert.equal(rangeTotals([],'2026-10-25','2026-10-25',null,{complete:false,campaigns}).messages,null)
})
test('period ratios use the displayed totals and duplicate dates are not added twice',()=>{
 const row={metric_date:'2026-10-25',data_status:'ok',spend:10,clicks:1,impressions:100}
 const t=rangeTotals([row,row],'2026-10-25','2026-10-25',{period_start:'2026-10-25',period_end:'2026-10-25',payload:{totals:{spend:20,link_click:4,impressions:200}}})
 assert.equal(t.days,1);assert.equal(t.spend,20);assert.equal(t.ctr,2);assert.equal(t.cpc,5);assert.equal(t.cpm,100)
 assert.equal(rangeTotals([row,row],'2026-10-25','2026-10-25').spend,10)
})
