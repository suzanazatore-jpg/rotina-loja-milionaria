import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/checkoutTracking.js',import.meta.url),'utf8')
const {normalizeTracking,resolveTracking,trackingMode}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const global={gtm_id:'GTM-ABCDEFG',meta_pixel_id:'123456789'}
test('new offers inherit global identifiers and global updates immediately',()=>{
 assert.deepEqual(resolveTracking({},global),{...global,source:'inherit'})
 assert.equal(resolveTracking({tracking_mode:'inherit',gtm_id:'GTM-OLDID'},global).gtm_id,global.gtm_id)
 assert.equal(resolveTracking({}, {...global,gtm_id:'GTM-NEWID'}).gtm_id,'GTM-NEWID')
})
test('custom offers replace the whole global configuration, including blank values',()=>{
 assert.deepEqual(resolveTracking({tracking_mode:'custom',meta_pixel_id:'987654321'},global),{gtm_id:'',meta_pixel_id:'987654321',source:'custom'})
 assert.equal(trackingMode({gtm_id:'GTM-OLDID'}),'custom')
 assert.equal(resolveTracking({gtm_id:'GTM-OLDID'},global).gtm_id,'GTM-OLDID')
})
test('disabled offers inherit no IDs and identifiers are validated without accepting scripts',()=>{
 assert.deepEqual(resolveTracking({tracking_mode:'off',gtm_id:'GTM-OLDID'},global),{gtm_id:'',meta_pixel_id:'',source:'off'})
 assert.deepEqual(normalizeTracking({gtm_id:' gtm-abcdefg ',meta_pixel_id:' 123456 '}),{gtm_id:'GTM-ABCDEFG',meta_pixel_id:'123456'})
 assert.throws(()=>normalizeTracking({gtm_id:'<script>alert(1)</script>'}))
 assert.throws(()=>normalizeTracking({meta_pixel_id:'secret_token'}))
 assert.throws(()=>normalizeTracking(null))
})
