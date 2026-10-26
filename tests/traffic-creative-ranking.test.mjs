import {test} from 'node:test'
import assert from 'node:assert/strict'
import {creativeGroups} from '../src/lib/trafficCreativeRanking.js'
import {normalizeEntity} from '../src/lib/trafficReportModel.js'
test('ranking never compares different campaigns or conversion events',()=>{
 const ad=(id,campaign,event,cost,results=10)=>({id,campaign_id:campaign,result_label:event,cost,results,spend:20})
 const groups=creativeGroups([ad('a','1','lead',2),ad('b','1','lead',4),ad('c','1','reach',1),ad('d','2','lead',.5),ad('zero','1','lead',null,0),ad('unknown','1','lead',null,null)])
 assert.equal(groups.length,3);assert.equal(groups[0].best.id,'a');assert.equal(groups[0].worst.id,'b');assert.deepEqual(groups[0].noResults.map(x=>x.id),['zero']);assert.equal(groups[1].worst,null);assert.equal(groups[2].worst,null)
})
test('ties do not manufacture a worst creative and unknown cost is excluded',()=>{const g=creativeGroups([{id:'a',campaign_id:'1',result_label:'lead',cost:2,results:5,spend:10},{id:'b',campaign_id:'1',result_label:'lead',cost:2,results:10,spend:20}])[0];assert.equal(g.best.id,'b');assert.equal(g.worst,null)})
test('awareness cost is correctly expressed per thousand reached, including import roundtrip',()=>{const a=normalizeEntity({campaign_name:'Awareness',amount_spent:20,results:{indicator:'reach',values:[{value:'10000'}]}});assert.equal(a.cost,2);assert.match(a.cost_label,/1.000/);assert.equal(a.campaign_name,'Awareness');assert.equal(normalizeEntity(a).cost_label,a.cost_label)})

test('technical and readable labels for the same message event share a ranking',()=>{
 const make=(id,result_label)=>normalizeEntity({id,campaign_id:'c',result_label,spend:10,results:2,cost:5})
 const groups=creativeGroups([make('a','Conversas por mensagem iniciadas'),make('b','actions:onsite_conversion.messaging_conversation_started_7d')])
 assert.equal(groups.length,1);assert.equal(groups[0].rows.length,2)
})
