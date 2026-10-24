import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateTrafficSnapshot} from '../src/lib/trafficImport.js'
const input={meta_account_id:'123',period_start:'2026-10-01',period_end:'2026-10-02',payload:{daily:[{date_start:'2026-10-01',date_stop:'2026-10-01',amount_spent:{value:'5'},lead:'0'}],ads:[{id:'ad',name:'Criativo',image_url:'https://example.com/ad.jpg',access_token:'must-not-persist',results:{value:'3'},result_label:'Lead',cost_per_result:{value:'2'}}]}}
test('import preserves verified creative metrics and strips arbitrary fields',()=>{const result=validateTrafficSnapshot(input);assert.equal(result.payload.ads[0].image_url,'https://example.com/ad.jpg');assert.equal(result.payload.ads[0].access_token,undefined);assert.equal(result.payload.daily[0].leads,0);assert.equal(result.payload.ads[0].results.value,3)})
test('invalid account, impossible dates, mixed intervals and out of range days are rejected',()=>{for(const change of [{meta_account_id:'not-a-meta-account'},{period_start:'2026-02-30'},{period_end:'2026-09-30'},{payload:{daily:[{date_start:'2026-10-01',date_stop:'2026-10-02'}]}},{payload:{daily:[{date_start:'2026-11-01'}]}}])assert.throws(()=>validateTrafficSnapshot({...input,...change}))})
test('daily details preserve dates and require reconciled coverage at every level',()=>{
 const row={id:'1',metric_date:'2026-10-01',spend:5}
 const source={...input,payload:{daily:[row],daily_campaigns:[row],daily_adsets:[row],daily_ads:[row],entity_daily_dates:['2026-10-01']}}
 assert.equal(validateTrafficSnapshot(source).payload.daily_ads[0].metric_date,'2026-10-01')
 for(const payload of [{...source.payload,daily_ads:[]},{...source.payload,daily_ads:[row,row]},{...source.payload,entity_daily_dates:['2026-11-01']},{...source.payload,daily:[]}])assert.throws(()=>validateTrafficSnapshot({...source,payload}))
})
