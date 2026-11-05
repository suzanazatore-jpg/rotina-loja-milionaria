import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { signCheckoutSession } from '../src/lib/checkoutSession.js'

const secret='route-test-secret-at-least-thirty-two-characters'
const state={admin:false,ready:true,paid:false,delivery:false,payCalls:0,cookie:null}
const loaded={offer:{id:'pilot'},product:{id:'product'},config:{redirects:{approved:'https://example.org/access'}}}
const db={from(table){let event='';const q={select(){return q},eq(key,value){if(key==='pagarme_event_id')event=value;return q},async maybeSingle(){
 if(table==='orders')return {data:state.paid?{id:'order',status:'paid',total_cents:2700,payment_method:'pix'}:null}
 if(table==='contracts')return {data:null}
 return {data:event.startsWith('access:')?(state.delivery?{processed_at:'2026-11-04T12:00:00Z'}:null):{payload:{items:[]}}}
 }};return q}}
globalThis.__liveRoute={state,loaded,db}
let source=readFileSync(new URL('../src/app/api/checkout/[slug]/route.js',import.meta.url),'utf8')
source=source.replace(/^import .* from .*\n/gm,'')
const prelude=`
import { CHECKOUT_SESSION_MAX_AGE,signCheckoutSession,readCheckoutSession,safeCheckoutRedirect } from '${new URL('../src/lib/checkoutSession.js',import.meta.url).href}';
const {state,loaded,db}=globalThis.__liveRoute;
const NextResponse=Response;
class PaymentError extends Error {constructor(message,status=400){super(message);this.status=status}}
const cookies=async()=>({get:()=>state.cookie?{value:state.cookie}:null,set:(_n,value)=>{state.cookie=value}});
const checkoutAdminClient=()=>db;
const loadCheckoutOffer=async()=>loaded;
const checkoutPaymentConfiguration=()=>({ready:state.ready,mode:'live',adminOnly:true,publicKey:''});
const autorizarAdmin=async()=>state.admin;
const checkoutExpired=()=>false;
const validateCheckoutForm=()=>{};
const createPayment=async()=>{state.payCalls++;state.paid=true;return {order_id:'order',status:'paid'}};
const fulfillPaidOrder=async()=>{throw new Error('delivery temporarily unavailable')};
const deliverPaidConversion=async()=>{};
const purchaseAnalytics=()=>null;
const contractCheckoutStatus=()=>({contract_required:false,contract:null,blocked:false});
const signingUrl=()=>'';
`
const {POST,GET}=await import(`data:text/javascript;base64,${Buffer.from(prelude+source).toString('base64')}`)
const request=(body,origin='https://example.org')=>new Request('https://example.org/api/checkout/pilot',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
const context={params:Promise.resolve({slug:'pilot'})}
test('live route denies visitors and CSRF; successful charge remains paid when delivery fails',async()=>{
 const previous=process.env.CHECKOUT_SESSION_SECRET;process.env.CHECKOUT_SESSION_SECRET=secret
 try {
  assert.equal((await POST(request({action:'start'},'https://other.example'),context)).status,403)
  assert.equal((await POST(request({action:'start'}),context)).status,401)
  assert.equal(state.cookie,null);assert.equal(state.payCalls,0)
  state.admin=true;state.ready=false
  assert.equal((await POST(request({action:'start'}),context)).status,503)
  state.ready=true
  assert.equal((await POST(request({action:'start'}),context)).status,200)
  const originalCookie=state.cookie
  assert.equal((await POST(request({action:'start'}),context)).status,200)
  assert.equal(state.cookie,originalCookie)
  assert.equal((await POST(request({action:'pay',payment_method:'credit_card',card_token:'token_a'}),context)).status,503)
  assert.equal((await POST(request({action:'pay',payment_method:'pix',bumps:['extra']}),context)).status,400)
  assert.equal((await POST(request({action:'pay',payment_method:'pix',total_cents:1}),context)).status,400)
  assert.equal(state.payCalls,0)
  const paid=await POST(request({action:'pay',payment_method:'pix'}),context)
  assert.equal(paid.status,200)
  const result=await paid.json()
  assert.equal(result.status,'paid');assert.equal(result.fulfillment,'pending');assert.equal(result.redirect_url,null)
  assert.equal(state.payCalls,1)
  state.delivery=true
  const status=await GET(new Request('https://example.org/api/checkout/pilot'),context)
  const complete=await status.json()
  assert.equal(complete.fulfillment,'completed');assert.equal(complete.redirect_url,'https://example.org/access')
  state.cookie=signCheckoutSession('other',secret)
  assert.equal((await GET(new Request('https://example.org/api/checkout/pilot'),context)).status,401)
 } finally {if(previous===undefined)delete process.env.CHECKOUT_SESSION_SECRET;else process.env.CHECKOUT_SESSION_SECRET=previous;delete globalThis.__liveRoute}
})
