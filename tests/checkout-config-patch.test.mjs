import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const encode=text=>`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
const tracking=encode(readFileSync(new URL('../src/lib/checkoutTracking.js',import.meta.url),'utf8'))
const settings=encode(readFileSync(new URL('../src/lib/checkoutSettings.js',import.meta.url),'utf8').replace("'./contractTemplates.js'",JSON.stringify(new URL('../src/lib/contractTemplates.js',import.meta.url).href)).replace("'./checkoutTracking.js'",JSON.stringify(tracking)))
const source=readFileSync(new URL('../src/lib/checkoutConfigPatch.js',import.meta.url),'utf8').replace("'./checkoutSettings.js'",JSON.stringify(settings))
const {productCheckoutDraft,checkoutConfigChanges,patchCheckoutConfig}=await import(encode(source))
test('opening legacy offer and saving a color preserves raw settings and thank-you fallback',()=>{
 const offer={thank_you_url:'https://example.org/thanks?origin=live',checkout_config:{appearance_mode:'inherit',contract:{required:true,template:'cvm',term_months:3},future_key:{enabled:true},redirects:{pending:'https://example.org/wait'}}}
 const baseline=productCheckoutDraft(offer,{background:'#ffffff'})
 assert.equal(baseline.redirects.approved,offer.thank_you_url)
 assert.deepEqual(checkoutConfigChanges(baseline,{...baseline}),{})
 const changes=checkoutConfigChanges(baseline,{...baseline,background:'#123456',appearance_mode:'custom'})
 assert.deepEqual(changes,{appearance_mode:'custom',background:'#123456'})
 const saved=patchCheckoutConfig(offer.checkout_config,changes)
 assert.deepEqual(saved,{...offer.checkout_config,appearance_mode:'custom',background:'#123456'})
})
test('redirect edits preserve query strings, unrelated destinations and future settings',()=>{
 const current={redirects:{approved:'https://example.org/thanks',pix:'https://example.org/pix',future:'https://example.org/future'},future_key:5}
 const saved=patchCheckoutConfig(current,{redirects:{...current.redirects,approved:'https://example.org/select?origem=lp-01&name=a%20b'}})
 assert.equal(saved.redirects.approved,'https://example.org/select?origem=lp-01&name=a%20b')
 assert.equal(saved.redirects.pix,current.redirects.pix);assert.equal(saved.redirects.future,current.redirects.future);assert.equal(saved.future_key,5)
 for(const url of ['javascript:alert(1)','https://user:secret@example.org'])assert.throws(()=>patchCheckoutConfig(current,{redirects:{approved:url}}))
})
test('pricing, access and contracts cannot be changed through settings patch',()=>{
 for(const key of ['price_cents','active','payment_methods','plan_id','contract','max_installments','brevo_list_id'])assert.throws(()=>patchCheckoutConfig({}, {[key]:1}),/permitido/)
 assert.throws(()=>patchCheckoutConfig({}, {require_terms:true}),/termos/)
 assert.throws(()=>patchCheckoutConfig({}, {require_privacy:true}),/privacidade/)
})
