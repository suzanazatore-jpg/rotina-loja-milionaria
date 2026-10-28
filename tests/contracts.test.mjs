import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const stub = { contractPdf: `export async function buildContractPdf(){return Buffer.from('%PDF-stub')}` }
const url = name => {
  if (stub[name]) return `data:text/javascript;base64,${Buffer.from(stub[name]).toString('base64')}`
  let source = readFileSync(new URL(`../src/lib/${name}.js`, import.meta.url), 'utf8')
  source = source.replace(/from '(\.\/([^']+)\.js)'/g, (_a, _p, dep) => `from ${JSON.stringify(url(dep))}`)
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}
const T = await import(url('contractTemplates'))
const S = await import(url('contractsServer'))
const env = { CONTRACTS_ENABLED: 'true', CONTRACT_TOKEN_SECRET: 'x'.repeat(40), CONTRACTS_APP_URL: 'https://app.test' }
Object.assign(process.env, env)

// Banco simulado mínimo com filtros eq/neq/in/lte/lt e retorno de linhas.
function memoryDb(tables) {
  const rows = name => (tables[name] ||= [])
  const from = name => {
    const filters = []; let op = 'select', payload = null, single = false, maybe = false, wantRows = false
    const match = r => filters.every(([k, f, v]) => f === 'eq' ? r[k] === v : f === 'neq' ? r[k] !== v : f === 'in' ? v.includes(r[k]) : f === 'lte' ? r[k] !== null && r[k] <= v : f === 'lt' ? r[k] < v : f === 'is' ? r[k] === v : true)
    const q = {
      select() { if (op !== 'select') wantRows = true; return q }, insert(v) { op = 'insert'; payload = v; return q }, update(v) { op = 'update'; payload = v; return q }, upsert(v) { op = 'insert'; payload = v; return q },
      eq(k, v) { filters.push([k, 'eq', v]); return q }, neq(k, v) { filters.push([k, 'neq', v]); return q }, in(k, v) { filters.push([k, 'in', v]); return q }, lte(k, v) { filters.push([k, 'lte', v]); return q }, lt(k, v) { filters.push([k, 'lt', v]); return q }, is(k, v) { filters.push([k, 'is', v]); return q },
      order() { return q }, limit() { return q }, single() { single = true; return q }, maybeSingle() { maybe = true; return q },
      then(resolve) {
        let data = null, error = null
        if (op === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload]
          if (name === 'contracts' && list.some(r => rows(name).some(x => x.order_id === r.order_id))) error = { code: '23505' }
          else { const created = list.map(r => ({ status: 'pending', reminders_sent: 0, otp_attempts: 0, otp_sent_count: 0, created_at: new Date().toISOString(), ...r })); rows(name).push(...created); data = single ? created[0] : created }
        } else if (op === 'update') {
          const hit = rows(name).filter(match); hit.forEach(r => Object.assign(r, payload)); data = wantRows ? hit.map(r => ({ id: r.id })) : null
        } else {
          const hit = rows(name).filter(match); data = single || maybe ? (hit[0] ?? null) : hit
          if (single && !hit.length) error = { message: 'not found' }
        }
        resolve({ data, error })
      },
    }
    return q
  }
  return { from, tables, storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ data: new Blob(['pdf']), error: null }) }) } }
}
const okFetch = calls => async (u, o) => { calls.push({ u, body: JSON.parse(o.body) }); return { ok: true, status: 200 } }

test('valor por extenso e campos do contrato', () => {
  assert.equal(T.valorPorExtenso(360000), 'três mil e seiscentos reais')
  assert.equal(T.valorPorExtenso(450000), 'quatro mil e quinhentos reais')
  assert.equal(T.valorPorExtenso(120000), 'mil e duzentos reais')
  assert.equal(T.valorPorExtenso(70050), 'setecentos reais e cinquenta centavos')
  assert.equal(T.valorPorExtenso(100000), 'mil reais')
  assert.equal(T.valorPorExtenso(210000), 'dois mil e cem reais')
  const offer = { id: 'o', name: 'EVS — Equipe Vende Sozinha [3M]', billing_interval: null, checkout_config: { contract: { required: true, template: 'cvm', term_months: 3 } } }
  const config = T.contractConfig(offer)
  assert.equal(config.term_months, 3)
  const f = T.buildContractFields({ order: { id: 'abcdef12-0000', total_cents: 507204, interest_cents: 57204, installments: 12, payment_method: 'credit_card', paid_at: '2026-10-27T15:00:00Z' }, customer: { name: 'Maria Silva', document: '12345678901', email: 'm@x.com', phone: '5511999998888', billing_address: { line_1: 'Rua A, 10', city: 'São Paulo', state: 'SP', zip_code: '01001000' } }, offer, config })
  assert.equal(f.valor_total, 'R$ 4.500,00')
  assert.equal(f.parcelas, 'parcelado em 12 (doze) parcelas de R$ 422,67 (quatrocentos e vinte e dois reais e sessenta e sete centavos)')
  assert.equal(f.valor_pago, 'R$ 5.072,04')
  assert.equal(f.mentorias_grupo, '06 (seis)'); assert.equal(f.qualificacao, 'pessoa física, inscrita no CPF nº 123.456.789-01')
  assert.equal(f.data_pagamento, '27 de outubro de 2026'); assert.equal(T.quantidade(1, true), '01 (uma)'); assert.equal(T.quantidade(12, true), '12 (doze)')
  assert.equal(f.prazo, '03 (três) meses'); assert.equal(f.prazo_plataforma, '12 (doze) meses')
  assert.equal(f.data_inicio, '27/10/2026'); assert.equal(f.data_fim, '27/01/2027')
  assert.equal(f.documento, '123.456.789-01')
  assert.match(f.endereco, /CEP 01001-000/)
  const { text, missing } = T.renderContract('{nome} paga {valor_total} {inexistente}', f)
  assert.equal(text, 'Maria Silva paga R$ 4.500,00 {inexistente}'); assert.deepEqual(missing, ['inexistente'])
})

test('oferta sem contrato, recorrente e validação do painel', () => {
  assert.equal(T.contractConfig({ checkout_config: {} }), null)
  assert.equal(T.contractConfig({ checkout_config: { contract: { required: true, template: 'outro', term_months: 3 } } }), null)
  const rec = T.contractConfig({ name: 'Plano Infinity 1K', billing_interval: 'month', checkout_config: { contract: { required: true, template: 'trafego' } } })
  assert.equal(rec.recurring, true); assert.equal(rec.term_months, 1)
  assert.deepEqual(T.normalizeContractConfig({ required: false }), { required: false })
  assert.throws(() => T.normalizeContractConfig({ required: true, template: 'cvm', term_months: 0 }))
  assert.deepEqual(T.normalizeContractConfig({ required: true, template: 'trafego', term_months: '3', program_name: '' }), { required: true, template: 'trafego', term_months: 3, program_name: null, gate_access: true, platform_months: 12 })
})

test('token estável, não forjável', () => {
  const id = '11111111-2222-3333-4444-555555555555'
  const t = S.contractToken(id)
  assert.equal(S.parseContractToken(t), id)
  assert.equal(S.parseContractToken(t.slice(0, -1) + (t.at(-1) === 'A' ? 'B' : 'A')), null)
  assert.equal(S.parseContractToken('lixo'), null)
})

function fixture() {
  return memoryDb({
    offers: [{ id: 'offer', name: 'CVM Implementação — [3M]', billing_interval: null, checkout_config: { contract: { required: true, template: 'cvm', term_months: 3 } } }],
    customers: [{ id: 'cust', name: 'Ana Souza', email: 'ana@x.com', phone: '5511988887777', document: '12345678901', billing_address: null }],
    contract_templates: [{ id: 'tpl', slug: 'cvm', name: 'Mentoria', body: '# Contrato {programa}\nCONTRATANTE: {nome} — {valor_total}', version: 2, active: true }],
    contracts: [], contract_events: [],
  })
}
const order = { id: 'order-1', customer_id: 'cust', offer_id: 'offer', event_id: 'checkout:k', total_cents: 300000, installments: 1, payment_method: 'pix', paid_at: '2026-10-27T15:00:00Z' }

test('pedido pago gera um único contrato, envia link e bloqueia o acesso', async () => {
  const db = fixture(), calls = []
  const deps = { env: { ...env, BREVO_API_KEY: 'k', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://wa.test/hook' }, fetcher: okFetch(calls) }
  const gate = await S.contractGate(db, order, deps)
  assert.equal(gate.blocked, true)
  const again = await S.contractGate(db, order, deps)
  assert.equal(again.contract_id, gate.contract_id)
  assert.equal(db.tables.contracts.length, 1)
  const c = db.tables.contracts[0]
  assert.equal(c.body, '# Contrato CVM Implementação — [3M]\nCONTRATANTE: Ana Souza — R$ 3.000,00')
  assert.equal(c.template_version, 2)
  assert.equal(calls.length, 2) // e-mail + WhatsApp, só na primeira vez
  assert.ok(calls.some(x => x.body.evento === 'contrato_enviado' && x.body.link.startsWith('https://app.test/assinar/')))
  assert.deepEqual(await S.contractGate(db, { ...order, id: 'r', event_id: 'cycle:x', parent_order_id: 'order-1' }, deps), { required: false })
  assert.deepEqual(await S.contractGate(db, order, { ...deps, env: { ...deps.env, CONTRACTS_ENABLED: 'false' } }), { required: false })
})

test('assinatura exige CPF da compra, código válido e desenho; libera a trava', async () => {
  const db = fixture(), calls = []
  const deps = { env: { ...env, BREVO_API_KEY: 'k', CONTRACT_WHATSAPP_WEBHOOK_URL: 'https://wa.test/hook' }, fetcher: okFetch(calls) }
  const { contract_id } = await S.contractGate(db, order, deps)
  const token = S.contractToken(contract_id)
  await S.requestContractCode(db, token, 'whatsapp', { ip: '1.1.1.1' }, deps)
  const code = calls.at(-1).body.code
  assert.match(code, /^\d{6}$/)
  await assert.rejects(S.requestContractCode(db, token, 'email', {}, deps), /Aguarde/)
  const png = 'data:image/png;base64,' + 'A'.repeat(400)
  await assert.rejects(S.signContract(db, token, { accepted: true, document: '999.999.999-99', code, signature: png }, {}, deps), /não confere/)
  await assert.rejects(S.signContract(db, token, { accepted: true, document: '123.456.789-01', code: '000000' === code ? '111111' : '000000', signature: png }, {}, deps), /incorreto/)
  await assert.rejects(S.signContract(db, token, { accepted: false, document: '12345678901', code, signature: png }, {}, deps), /aceitar/)
  const ok = await S.signContract(db, token, { accepted: true, document: '123.456.789-01', code, signature: png }, { ip: '2.2.2.2', userAgent: 'UA' }, deps)
  assert.equal(ok.already, false); assert.equal(ok.order_id, 'order-1')
  const c = db.tables.contracts[0]
  assert.equal(c.status, 'signed'); assert.equal(c.signed_ip, '2.2.2.2'); assert.equal(c.otp_hash, null)
  assert.equal((await S.signContract(db, token, {}, {}, deps)).already, true)
  const gate = await S.contractGate(db, order, deps)
  assert.equal(gate.blocked, false); assert.equal(gate.signed, true)
  assert.ok(db.tables.contract_events.some(e => e.type === 'signed'))
})

test('lembretes: no máximo três, só para pendentes vencidos', async () => {
  const db = fixture(), calls = []
  const deps = { env: { ...env, BREVO_API_KEY: 'k' }, fetcher: okFetch(calls) }
  await S.contractGate(db, order, deps)
  const c = db.tables.contracts[0]
  c.created_at = '2026-10-01T00:00:00Z'; c.next_reminder_at = '2026-10-02T00:00:00Z'
  calls.length = 0
  for (let i = 0; i < 5; i++) await S.processContractReminders(db, { ...deps, now: Date.parse('2026-10-10T00:00:00Z') })
  assert.equal(c.reminders_sent, 3); assert.equal(c.next_reminder_at, null)
  assert.equal(calls.length, 3)
})

test('PDF real preserves Portuguese text, spans pages and includes signature audit',async()=>{
 const {buildContractPdf}=await import('../src/lib/contractPdf.js')
 const {PDFDocument}=await import('pdf-lib')
 const body=readFileSync(new URL('../docs/contratos-modelos/evs.md',import.meta.url),'utf8')
 const pdf=await buildContractPdf({body,title:'Contrato EVS — Treinamento',originalSha256:'a'.repeat(64),validationUrl:'https://app.test/contrato/validar/11111111-2222-3333-4444-555555555555',signature:{name:'Cliente Teste',document:'***.***.***-**',signedAtText:'27/10/2026 20:00',channel:'email'},events:[{when:'27/10/2026',label:'Contrato assinado'}]})
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-')
 const document=await PDFDocument.load(pdf)
 assert.ok(document.getPageCount()>=3)
 assert.equal(document.getTitle(),'Contrato EVS — Treinamento')
})
