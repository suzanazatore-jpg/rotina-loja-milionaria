import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// Exercise the catalog's real handler with an in-memory API; never touch live products.
const catalog=readFileSync(new URL('../src/app/admin/checkout/page.js',import.meta.url),'utf8')
const handler=catalog.slice(catalog.indexOf('  async function alternar('),catalog.indexOf('  async function salvarDetalhe('))
const filter=catalog.match(/const visibleProducts = (.+)\n/)[1]
const defaultStatus=catalog.match(/\[statusFilter,setStatusFilter\] = useState\('([^']+)'\)/)[1]
const shown=new Function('produtos','statusFilter','busca','codigo','typeFilter','marketplaceFilter',`return ${filter}`)
const visible=(products,status=defaultStatus)=>shown(products,status,'','','all','all').map(p=>p.id)
function catalogHarness(api){
 const state={products:[{id:'p',name:'Produto',slug:'produto',active:true},{id:'other',name:'Outro',slug:'outro',active:true}],saving:false,messages:[],reloads:0}
 const toggle=new Function('api','setSalvando','setMensagem','setProdutos','carregar','salvando',`${handler};return alternar;`)(api,v=>{state.saving=v},v=>{state.messages.push(v)},fn=>{state.products=fn(state.products)},async()=>{state.reloads++},false)
 return {state,toggle}
}

test('catalog waits for confirmation, hides a disabled product and permits reactivation through hidden filter',async()=>{
 let confirm,request
 const {state,toggle}=catalogHarness((method,body)=>{request={method,body};return new Promise(resolve=>{confirm=resolve})})
 const pending=toggle('produto',state.products[0])
 assert.equal(state.saving,true)
 assert.deepEqual(visible(state.products).sort(),['other','p'])
 assert.deepEqual(request,{method:'PATCH',body:{entidade:'produto',id:'p',active:false}})
 confirm({ok:true});await pending
 assert.equal(state.saving,false)
 assert.deepEqual(visible(state.products),['other'])
 assert.deepEqual(visible(state.products,'inactive'),['p'])
 assert.deepEqual(visible(state.products,'all').sort(),['other','p'])
 assert.match(state.messages.at(-1),/novas compras desativadas/)
 const reactivation=toggle('produto',state.products[0])
 assert.equal(request.body.active,true)
 confirm({ok:true});await reactivation
 assert.deepEqual(visible(state.products).sort(),['other','p'])
 assert.deepEqual(visible(state.products,'inactive'),[])
 assert.equal(state.products[1].active,true)
})

test('failed save leaves the product visible and reports the error without claiming success',async()=>{
 const {state,toggle}=catalogHarness(async()=>{throw Error('Não foi possível salvar.')})
 await toggle('produto',state.products[0])
 assert.equal(state.products[0].active,true)
 assert.deepEqual(visible(state.products).sort(),['other','p'])
 assert.equal(state.messages.at(-1),'Não foi possível salvar.')
 assert.equal(state.saving,false)
})

test('existing offer toggle keeps its own update and reload behaviour',async()=>{
 const calls=[]
 const {state,toggle}=catalogHarness(async(...args)=>{calls.push(args)})
 await toggle('oferta',{id:'o',active:true})
 assert.deepEqual(calls,[['PATCH',{entidade:'oferta',id:'o',active:false}]])
 assert.equal(state.reloads,1)
 assert.ok(state.products.every(p=>p.active))
})

const route=readFileSync(new URL('../src/app/api/admin/checkout/route.js',import.meta.url),'utf8')
const patch=route.slice(route.indexOf('export async function PATCH('))
const patchModule=await import('data:text/javascript;base64,'+Buffer.from(`let database,authorized; export function configure(db,allow=true){database=db;authorized=allow} const checkoutAdminClient=()=>database; const autorizarAdmin=async()=>authorized; const erro=(error,status=400)=>Response.json({error},{status}); const NextResponse={json:body=>Response.json(body)};\n${patch}`).toString('base64'))
const moduleUrl=name=>{let source=readFileSync(new URL(`../src/lib/${name}.js`,import.meta.url),'utf8');source=source.replace(/from '(\.\/([^']+)\.js)'/g,(_all,_path,dependency)=>`from ${JSON.stringify(moduleUrl(dependency))}`);return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`}
let publicSource=readFileSync(new URL('../src/lib/checkoutPublicServer.js',import.meta.url),'utf8')
publicSource=publicSource.replace("import { checkoutAdminClient } from './checkoutAdminServer.js'", "const checkoutAdminClient=()=>{throw Error('Unexpected live database access')}")
publicSource=publicSource.replace(/from '(\.\/([^']+)\.js)'/g,(_all,_path,dependency)=>`from ${JSON.stringify(moduleUrl(dependency))}`)
const {loadCheckoutOffer}=await import('data:text/javascript;base64,'+Buffer.from(publicSource).toString('base64'))
function database(){
 const products=[{id:'p',name:'Produto',active:true,type:'one_time',plan_id:'plan'}]
 const offers=['one','two'].map(id=>({id,slug:id,product_id:'p',active:true,name:id,price_cents:4700,payment_methods:['pix'],max_installments:1,checkout_config:{}}))
 const tables={products,offers,order_bumps:[],checkout_settings:[{id:'global',checkout_config:{}}]}
 const calls=[]
 return {products,offers,calls,from(table){let filters=[],values
 const q={select(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},order(){return q},update(v){values=v;return q},then(resolve){calls.push(table);const rows=(tables[table]||[]).filter(row=>filters.every(f=>f(row)));if(values)rows.forEach(row=>Object.assign(row,values));resolve({data:rows,error:null})},async maybeSingle(){const result=await q;return{data:result.data[0]||null,error:null}}};return q}}
}
const request=(active)=>new Request('https://app.test/api/admin/checkout',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({entidade:'produto',id:'p',active})})

test('saved product state blocks every offer checkout and reactivation restores them without rewriting offers',async()=>{
 const db=database();patchModule.configure(db)
 const originalOffers=structuredClone(db.offers)
 for(const slug of ['one','two'])assert.ok(await loadCheckoutOffer(slug,db))
 assert.equal((await patchModule.PATCH(request(false))).status,200)
 assert.equal(db.products[0].active,false)
 for(const slug of ['one','two'])assert.equal(await loadCheckoutOffer(slug,db),null)
 assert.deepEqual(db.offers,originalOffers)
 assert.equal((await patchModule.PATCH(request(true))).status,200)
 for(const slug of ['one','two'])assert.ok(await loadCheckoutOffer(slug,db))
 assert.deepEqual(db.offers,originalOffers)
})

test('unauthorized toggle does not write or expose a product',async()=>{
 const db=database();patchModule.configure(db,false)
 assert.equal((await patchModule.PATCH(request(false))).status,401)
 assert.equal(db.products[0].active,true)
 assert.deepEqual(db.calls,[])
})
