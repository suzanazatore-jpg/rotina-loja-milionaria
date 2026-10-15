import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { processOutboundWebhooks } from '@/lib/checkoutOutboundServer'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { normalizeWebhook, UUID } from '@/lib/checkoutWebhookSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fields = 'id,name,url,events,product_ids,active,created_at'
async function checked(query) {
  const result = await query
  if (result.error) throw new Error('Não foi possível consultar ou salvar os webhooks.')
  return result
}
export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return reply({ error: 'Acesso restrito ao administrador.' }, 401)
    const url = new URL(request.url)
    const tab = url.searchParams.get('tab') || 'cadastros'
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
    const limit = 25
    const hook = url.searchParams.get('webhook_id')
    if (hook && !UUID.test(hook)) return reply({ error: 'Webhook inválido.' }, 400)
    const [webhooks, products] = await Promise.all([
      checked(db.from('outbound_webhooks').select(fields).order('created_at', { ascending: false })),
      checked(db.from('products').select('id,name,code').order('name')),
    ])
    let query
    if (tab === 'atividades') {
      query = db.from('webhook_deliveries').select('id,webhook_id,event_type,order_id,subscription_id,status,attempts,next_attempt_at,response_status,created_at,delivered_at', { count: 'exact' })
      if (hook) query = query.eq('webhook_id', hook)
      const state = url.searchParams.get('status')
      if (state && state !== 'todos') query = query.eq('status', state)
      query = query.order('created_at', { ascending: false })
    } else if (tab === 'auditoria') {
      query = db.from('webhook_events').select('id,payload,received_at,processed_at,error', { count: 'exact' }).eq('type', 'checkout.webhook.admin').order('received_at', { ascending: false })
      if (hook) query = query.or(`payload->>webhook_id.eq.${hook},payload->>target_id.eq.${hook}`)
    } else if (tab === 'recebimentos') {
      query = db.from('webhook_events').select('id,pagarme_event_id,type,received_at,processed_at,error', { count: 'exact' }).like('pagarme_event_id', 'hook_%').order('received_at', { ascending: false })
    } else if (tab !== 'cadastros') return reply({ error: 'Aba inválida.' }, 400)
    const activity = query ? await checked(query.range((page - 1) * limit, page * limit - 1)) : { data: [], count: 0 }
    const latest = hook ? await checked(db.from('webhook_events').select('processed_at').eq('type', 'checkout.webhook.admin').eq('payload->>target_id', hook).in('payload->>action', ['save', 'toggle']).not('processed_at', 'is', null).order('processed_at', { ascending: false }).limit(1)) : { data: [] }
    return reply({ webhooks: webhooks.data, products: products.data, rows: activity.data, count: activity.count, page, limit, updated_at: latest.data?.[0]?.processed_at || null, delivery_enabled: process.env.CHECKOUT_OUTBOUND_WEBHOOKS_ENABLED === 'true' })
  } catch { return reply({ error: 'Não foi possível carregar os webhooks.' }, 500) }
}

export async function POST(request) {
  let db, auditId
  try {
    db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return reply({ error: 'Acesso restrito ao administrador.' }, 401)
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 16384) return reply({ error: 'Cadastro excede o limite.' }, 413)
    let input
    try { input = JSON.parse(raw) } catch { return reply({ error: 'Requisição inválida.' }, 400) }
    if (!input || typeof input !== 'object') return reply({ error: 'Requisição inválida.' }, 400)
    const { action = 'save', id } = input
    if (id && !UUID.test(id)) return reply({ error: 'Identificador inválido.' }, 400)
    if (!['save', 'toggle', 'retry'].includes(action) || action !== 'save' && !id) return reply({ error: 'Ação inválida.' }, 400)
    let record
    if (action === 'save') {
      try { record = normalizeWebhook(input.dados || {}) } catch (error) { return reply({ error: error.message }, 400) }
      if (record.product_ids) {
        const products = await checked(db.from('products').select('id').in('id', record.product_ids))
        if (products.data.length !== record.product_ids.length) return reply({ error: 'Produto não encontrado.' }, 400)
      }
    }
    if (action === 'toggle' && typeof input.active !== 'boolean') return reply({ error: 'Status inválido.' }, 400)
    // Auditoria nunca armazena URL, segredo ou dados pessoais da compradora.
    auditId = `webhook-admin:${randomUUID()}`
    await checked(db.from('webhook_events').insert({ pagarme_event_id: auditId, type: 'checkout.webhook.admin', payload: { action, target_id: id || null, name: record?.name || null }, error: 'processing' }))
    let savedId = id
    let webhookId = id
    if (action === 'retry') {
      const delivery = await checked(db.from('webhook_deliveries').select('webhook_id,status').eq('id', id).maybeSingle())
      if (!delivery.data || !['failed', 'retry'].includes(delivery.data.status)) throw new Error('Somente envios com falha podem voltar para a fila.')
      webhookId = delivery.data.webhook_id
      await checked(db.from('webhook_events').update({ payload: { action, target_id: id, webhook_id: webhookId } }).eq('pagarme_event_id', auditId))
      const hook = await checked(db.from('outbound_webhooks').select('active').eq('id', delivery.data.webhook_id).single())
      if (!hook.data.active) throw new Error('Ative o webhook antes de solicitar um reenvio.')
      const changed = await checked(db.from('webhook_deliveries').update({ status: 'pending', next_attempt_at: new Date().toISOString() }).eq('id', id).in('status', ['failed', 'retry']).select('id'))
      if (!changed.data.length) throw new Error('O envio já está sendo processado. Atualize a lista.')
    } else {
      const query = action === 'toggle' ? db.from('outbound_webhooks').update({ active: input.active }).eq('id', id) : id ? db.from('outbound_webhooks').update(record).eq('id', id) : db.from('outbound_webhooks').insert(record)
      const saved = await checked(query.select('id').single())
      savedId = saved.data.id
      webhookId = savedId
    }
    await checked(db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: null, payload: { action, target_id: savedId, webhook_id: webhookId, name: record?.name || null } }).eq('pagarme_event_id', auditId))
    if (action === 'retry') after(async () => { try { await processOutboundWebhooks(db) } catch { console.error('checkout outbound: fila pendente') } })
    return reply({ ok: true, id: savedId })
  } catch (error) {
    if (db && auditId) await db.from('webhook_events').update({ error: 'action_failed' }).eq('pagarme_event_id', auditId).is('processed_at', null)
    return reply({ error: error.message || 'Não foi possível salvar o webhook.' }, 400)
  }
}
