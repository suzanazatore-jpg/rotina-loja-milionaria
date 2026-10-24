import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const tracking=readFileSync(new URL('../src/lib/checkoutTracking.js',import.meta.url),'utf8')
const trackingUrl=`data:text/javascript;base64,${Buffer.from(tracking).toString('base64')}`
const source=readFileSync(new URL('../src/lib/checkoutSettings.js',import.meta.url),'utf8').replace("'./checkoutTracking.js'",JSON.stringify(trackingUrl))
const {normalizeCheckoutSettings,resolveCheckoutSettings,checkoutSettingsDraft,validateCheckoutForm}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('legacy offer preserves identity and does not inherit a changed global appearance',()=>{
 const config=resolveCheckoutSettings({background:'#101010',store_name:'Oferta antiga'},{background:'#ffffff',store_name:'Novo padrão'})
 assert.equal(config.background,'#101010');assert.equal(config.store_name,'Oferta antiga');assert.equal(config.appearance_mode,'custom')
})
test('inherit updates shared identity only, keeping offer content, destinations and tracking independent',()=>{
 const offer={appearance_mode:'inherit',subtitle:'Curso',product_image_url:'https://example.org/course.png',tracking_mode:'off',redirects:{approved:'https://example.org/thanks'}}
 const config=resolveCheckoutSettings(offer,{accent:'#123456',store_name:'Marca',subtitle:'Não herdar',product_image_url:'https://example.org/other.png',redirects:{approved:'https://example.org/wrong'},meta_pixel_id:'1234567'})
 assert.equal(config.accent,'#123456');assert.equal(config.store_name,'Marca');assert.equal(config.subtitle,'Curso');assert.equal(config.product_image_url,offer.product_image_url);assert.equal(config.redirects.approved,offer.redirects.approved);assert.equal(config.tracking_mode,'off');assert.equal(config.meta_pixel_id,'')
 assert.equal(resolveCheckoutSettings(offer,{accent:'#654321'}).accent,'#654321')
})
test('editor draft allows unfinished URLs while saved settings reject scripts and credentials',()=>{
 assert.equal(checkoutSettingsDraft({logo_url:'https://'}).logo_url,'https://')
 for(const url of ['javascript:alert(1)','https://user:password@example.org']) assert.throws(()=>normalizeCheckoutSettings({logo_url:url}))
})
test('email confirmation is optional, case insensitive and enforced when configured',()=>{
 validateCheckoutForm({},{});validateCheckoutForm({confirm_email:true},{customer:{email:'Loja@example.org'},email_confirmation:' loja@example.org '})
 assert.throws(()=>validateCheckoutForm({confirm_email:true},{customer:{email:'one@example.org'},email_confirmation:'two@example.org'}),/emails/)
})
test('mandatory acceptance rejects missing URLs, missing consent and truthy strings',()=>{
 for(const consent of [undefined,false,'true']) assert.throws(()=>validateCheckoutForm({require_terms:true,terms_url:'https://example.org/terms'},{terms_accepted:consent}),/termos/)
 assert.throws(()=>validateCheckoutForm({require_terms:true},{terms_accepted:true}),/termos/)
 assert.throws(()=>validateCheckoutForm({require_privacy:true,privacy_url:'https://example.org/privacy'},{privacy_accepted:false}),/privacidade/)
 validateCheckoutForm({require_terms:true,terms_url:'https://example.org/terms',require_privacy:true,privacy_url:'https://example.org/privacy'},{terms_accepted:true,privacy_accepted:true})
})
