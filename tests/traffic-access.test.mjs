import {test} from 'node:test'
import assert from 'node:assert/strict'
import {trafficAccessAllowed} from '../src/lib/trafficAccess.js'
const current=new Date('2026-10-20T20:00:00Z')
const input={profile:{status:'active'},legacy:{acesso_expira_em:'2026-10-20'},plans:[{offer_id:'1773344369'}]}
test('both traffic offers grant eligibility without an ad account',()=>{assert.equal(trafficAccessAllowed(input,current),true);assert.equal(trafficAccessAllowed({...input,plans:[{offer_id:'1715729806'}]},current),true)})
test('unrelated, removed, expired or blocked plans cannot grant traffic access',()=>{for(const x of [{...input,plans:[]},{...input,plans:[{offer_id:'1708106221'}]},{...input,profile:{status:'blocked'}},{...input,legacy:{acesso_expira_em:'2026-10-19'}},{...input,legacy:{status_assinatura:'reembolsado'}}])assert.equal(trafficAccessAllowed(x,current),false)})
