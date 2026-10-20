import {test} from 'node:test'
import assert from 'node:assert/strict'
import {summarizeTraffic} from '../src/lib/trafficMetrics.js'
test('empty and missing metrics remain unknown rather than zero',()=>{assert.equal(summarizeTraffic([]).spend,null);const x=summarizeTraffic([{spend:20,impressions:100,clicks:null,leads:null},{spend:10,impressions:100,clicks:4,leads:null}]);assert.equal(x.clicks,null);assert.equal(x.knownClicks,4);assert.equal(x.ctr,null);assert.equal(x.leads,null)})
test('rates use weighted period totals and explicit zero stays zero',()=>{const x=summarizeTraffic([{spend:20,impressions:100,clicks:2,leads:0},{spend:10,impressions:900,clicks:8,leads:0}]);assert.equal(x.spend,30);assert.equal(x.ctr,1);assert.equal(x.cpc,3);assert.equal(x.leads,0)})
