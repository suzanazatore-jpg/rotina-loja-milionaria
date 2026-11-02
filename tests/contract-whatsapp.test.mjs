import test from 'node:test'
import assert from 'node:assert/strict'
import { contractPhone, contractWhatsappConfiguration, contractWhatsappReady, sendContractWhatsapp, CONTRACT_WHATSAPP_EVENTS } from '../src/lib/contractWhatsapp.js'

const payload = { contract_id: 'contract-test', evento: 'contrato_enviado', name: 'Cliente Teste', program: 'Programa teste', phone: '(84) 99999-9999', message: 'Mensagem de teste', link: 'https://example.invalid/assinar/test', delivery_id: 'delivery-test-1' }
test('webhook legado e Papo_reto usam o mesmo contrato de dados, com um único destino', async () => {
  const calls = []
  const fetcher = async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return { ok: true } }
  const bot = { CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://bot.example.invalid/hook' }
  const papo = { ...bot, CONTRACT_WHATSAPP_PROVIDER: 'papo_reto', CONTRACT_PAPO_RETO_WEBHOOK_URL: 'https://papo.example.invalid/hook', CONTRACT_PAPO_RETO_WEBHOOK_TOKEN: 'fake-test-token' }
  assert.equal((await sendContractWhatsapp(payload, bot, fetcher)).delivery_state, 'accepted')
  assert.equal((await sendContractWhatsapp(payload, papo, fetcher)).provider, 'papo_reto')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].body, calls[1].body)
  assert.equal(calls[0].body.phone, '5584999999999')
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fake-test-token')
  assert.equal(calls[0].options.headers['X-Delivery-Id'], payload.delivery_id)
  assert.equal(calls[0].options.redirect, 'error')
  assert.equal(calls[1].url, papo.CONTRACT_PAPO_RETO_WEBHOOK_URL)
})
test('pausa, destino ausente e Papo_reto sem segredo não enviam nem usam fallback', async () => {
  for (const env of [{}, { CONTRACT_WHATSAPP_PROVIDER: 'disabled', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://bot.example.invalid' }, { CONTRACT_WHATSAPP_PROVIDER: 'papo_reto', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://bot.example.invalid' }, { CONTRACT_WHATSAPP_PROVIDER: 'papo_reto', CONTRACT_PAPO_RETO_WEBHOOK_URL: 'https://papo.example.invalid' }]) {
    assert.equal((await sendContractWhatsapp(payload, env, () => assert.fail('envio pausado'))).status, 'skipped')
    assert.equal(contractWhatsappReady(env), false)
  }
})
test('eventos do contrato, número brasileiro, HTTPS e timeout são controlados', async () => {
  for (const phone of ['84999999999', '5584999999999', '(84)99999-9999']) assert.equal(contractPhone(phone), '5584999999999')
  assert.equal(contractPhone('123'), null)
  for (const destination of ['http://bot.example.invalid', 'https://user:secret@bot.example.invalid', 'invalid']) assert.throws(() => contractWhatsappConfiguration({ CONTRACT_WHATSAPP_WEBHOOK_URL: destination }))
  assert.throws(() => contractWhatsappConfiguration({ CONTRACT_WHATSAPP_PROVIDER: 'unknown' }))
  const env = { CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://bot.example.invalid', CONTRACT_WHATSAPP_OTP_ENABLED: 'true' }
  for (const evento of CONTRACT_WHATSAPP_EVENTS) await sendContractWhatsapp({ ...payload, evento }, env, async (_url, options) => { assert.ok(options.signal instanceof AbortSignal); return { ok: true } })
  await assert.rejects(sendContractWhatsapp({ ...payload, evento: 'release_access' }, env), /event_invalid/)
  await assert.rejects(sendContractWhatsapp(payload, env, async () => ({ ok: false, status: 503 })), /http_503/)
  await assert.rejects(sendContractWhatsapp(payload, env, async () => { throw new Error('timeout') }), /timeout/)
})
