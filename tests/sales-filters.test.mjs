import test from 'node:test'
import assert from 'node:assert/strict'
import {readSales,saleFilters} from '../src/lib/centralRecords.js'

test('tracking distinguishes real UTM attribution from empty or missing values',async()=>{
 const rows=[{id:'source',utm_source:'instagram'},{id:'campaign',utm_campaign:'black'},{id:'empty',utm_source:'   ',utm_medium:''},{id:'missing'},{id:'internal',event_id:'event-123',client_ip:'127.0.0.1'}]
 const db={from(){const query=new Proxy({range(){return {data:rows}}},{get(target,key){return target[key] || (()=>query)}});return query}}
 assert.deepEqual((await readSales(db,new URLSearchParams({tracking:'with'}))).map(r=>r.id),['source','campaign'])
 assert.deepEqual((await readSales(db,new URLSearchParams({tracking:'without'}))).map(r=>r.id),['empty','missing','internal'])
 assert.equal((await readSales(db)).length,5)
 assert.throws(()=>saleFilters(new URLSearchParams({tracking:'invalid'})),/Rastreamento inválido/)
})
