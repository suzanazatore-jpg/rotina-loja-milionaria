import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { integrationStatus } from '../src/lib/integrationStatusServer.js'
import { INTEGRATIONS } from '../src/lib/integrationCatalog.js'

test('catalog summarizes configuration without leaking credentials, destinations or tracking IDs',()=>{
  const statuses=integrationStatus({BREVO_API_KEY:'private-brevo',META_ADS_ACCESS_TOKEN:'private-meta',PABBLY_CAMPANHA_WEBHOOK_URL:'https://private.example/hook'},{gtm_id:'GTM-PRIVATE',meta_pixel_id:'123456789'})
  assert.equal(statuses.brevo.configured,true)
  assert.equal(statuses.meta.configured,true)
  assert.equal(statuses['google-tag-manager'].configured,true)
  assert.equal(statuses.pabbly.configured,true)
  const payload=JSON.stringify(statuses)
  for (const secret of ['private-brevo','private-meta','private.example','GTM-PRIVATE','123456789']) assert.ok(!payload.includes(secret))
})
test('contract providers preserve activation and validation rules',()=>{
  const configured={CONTRACT_BOTCONVERSA_WEBHOOK_URL:'https://hooks.example/contract'}
  const status=integrationStatus(configured)
  assert.equal(status.botconversa.label,'Configurado · contratos pausados')
  assert.equal(status.contracts.configured,false)
  assert.equal(status['papo-reto'].configured,false)
  assert.equal(integrationStatus({...configured,CONTRACT_WHATSAPP_PROVIDER:'disabled'}).botconversa.configured,false)
  assert.equal(integrationStatus({CONTRACT_WHATSAPP_PROVIDER:'papo_reto',CONTRACT_PAPO_RETO_WEBHOOK_URL:'https://hooks.example/contract'})['papo-reto'].configured,false)
  assert.equal(integrationStatus({CONTRACT_WHATSAPP_PROVIDER:'papo_reto',CONTRACT_PAPO_RETO_WEBHOOK_URL:'https://hooks.example/contract',CONTRACT_PAPO_RETO_WEBHOOK_TOKEN:'private-token'})['papo-reto'].configured,true)
})
test('payment summary follows gateway environment guards without enabling live payments',()=>{
  const env={PAGARME_SECRET_KEY:'sk_live_private',PAGARME_BASE_URL:'https://api.pagar.me/core/v5'}
  assert.equal(integrationStatus(env).pagarme.configured,false)
  assert.equal(integrationStatus({...env,CHECKOUT_LIVE_ENABLED:'true'}).pagarme.label,'Configurado · produção')
  assert.equal(integrationStatus({PAGARME_SECRET_KEY:'sk_test_private'}).pagarme.label,'Configurado · teste')
  assert.equal(env.CHECKOUT_LIVE_ENABLED,undefined)
})

let source=readFileSync(new URL('../src/app/api/admin/checkout/integracoes/route.js',import.meta.url),'utf8')
source=source.replace(/^import .*$/gm,'')
const route=await import('data:text/javascript;base64,'+Buffer.from(`let allowed=false, reads=0; export function configure(value){allowed=value;reads=0}; export function readCount(){return reads}; const checkoutAdminClient=()=>({}); const autorizarAdmin=async()=>allowed; const loadGlobalTracking=async()=>{reads++;return {}}; const integrationStatus=()=>({brevo:{configured:false}}); ${source}`).toString('base64'))
test('integration API refuses unauthorized requests before reading configuration',async()=>{
  route.configure(false)
  const response=await route.GET(new Request('https://app.test/api/admin/checkout/integracoes'))
  assert.equal(response.status,401)
  assert.equal(route.readCount(),0)
  assert.equal(response.headers.get('Cache-Control'),'no-store')
  route.configure(true)
  const authorized=await route.GET(new Request('https://app.test/api/admin/checkout/integracoes'))
  assert.equal(authorized.status,200)
  assert.equal(route.readCount(),1)
  assert.deepEqual(await authorized.json(),{statuses:{brevo:{configured:false}}})
})
test('all actionable destinations exist in this application; planned Google Ads never claims a connection',()=>{
  for(const item of INTEGRATIONS)for(const [,href]of item.actions)assert.doesNotThrow(()=>readFileSync(new URL(`../src/app${href}/page.js`,import.meta.url)))
  assert.equal(INTEGRATIONS.find(item=>item.id==='google-ads').planned,true)
  assert.equal(integrationStatus()['google-ads'],undefined)
})
