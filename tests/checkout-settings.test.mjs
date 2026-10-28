import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const tracking=readFileSync(new URL('../src/lib/checkoutTracking.js',import.meta.url),'utf8')
const trackingUrl=`data:text/javascript;base64,${Buffer.from(tracking).toString('base64')}`
const source=readFileSync(new URL('../src/lib/checkoutSettings.js',import.meta.url),'utf8').replace("'./contractTemplates.js'",JSON.stringify(new URL('../src/lib/contractTemplates.js',import.meta.url).href)).replace("'./checkoutTracking.js'",JSON.stringify(trackingUrl))
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
test('focused template keeps editable copy local and accepts an explicit fixed deadline',()=>{
 const config=normalizeCheckoutSettings({layout:'focused',product_display_name:'Curso da loja',headline:'Sua chamada',headline_highlight:'em 7 dias',countdown_enabled:true,countdown_ends_at:'2030-10-24T20:00:00-03:00'})
 assert.equal(config.layout,'focused');assert.equal(config.product_display_name,'Curso da loja');assert.equal(config.countdown_ends_at,'2030-10-24T23:00:00.000Z')
 assert.throws(()=>normalizeCheckoutSettings({countdown_enabled:true}),/data e hora/)
 assert.throws(()=>normalizeCheckoutSettings({countdown_ends_at:'invalid'}),/data válida/)
 const inherited=resolveCheckoutSettings({appearance_mode:'inherit',headline:'Chamada da oferta',product_display_name:'Nome da oferta'},{layout:'focused',headline:'Não substituir',product_display_name:'Não substituir'})
 assert.equal(inherited.layout,'focused');assert.equal(inherited.headline,'Chamada da oferta');assert.equal(inherited.product_display_name,'Nome da oferta')
 assert.throws(()=>validateCheckoutForm({countdown_enabled:true,countdown_ends_at:'2000-01-01T00:00:00Z'},{}),/encerrado/)
 validateCheckoutForm({countdown_enabled:false,countdown_ends_at:'2000-01-01T00:00:00Z'},{})
})
test('offer form profiles stay independent from the account while seller identity inherits',()=>{
 const config=resolveCheckoutSettings({appearance_mode:'inherit',layout:'guru',form_profile:'compact'},{layout:'banner',form_profile:'complete',company_name:'Empresa real',company_document:'12.345.678/0001-90',company_address:'Rua da empresa'})
 assert.equal(config.layout,'banner');assert.equal(config.form_profile,'compact');assert.equal(config.company_name,'Empresa real');assert.equal(config.company_document,'12.345.678/0001-90')
 assert.equal(normalizeCheckoutSettings({}).form_profile,'complete')
 assert.equal(normalizeCheckoutSettings({layout:'guru'}).layout,'guru')
 assert.throws(()=>normalizeCheckoutSettings({company_document:'123'}),/CNPJ/)
})

test('offer contract survives normalization and appearance inheritance without becoming a global default',()=>{
 const contract={required:true,template:'evs',term_months:3,gate_access:true,platform_months:12,program_name:'Equipe Vendendo Sozinha'}
 const offer={appearance_mode:'inherit',contract}
 assert.deepEqual(normalizeCheckoutSettings(offer).contract,contract)
 assert.deepEqual(resolveCheckoutSettings(offer,{contract:{...contract,template:'trafego'}}).contract,contract)
 assert.deepEqual(resolveCheckoutSettings({}, {contract}).contract,{required:false})
 assert.throws(()=>normalizeCheckoutSettings({contract:{...contract,term_months:0}}),/prazo/)
})
