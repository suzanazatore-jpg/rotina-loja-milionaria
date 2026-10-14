import { randomBytes } from 'node:crypto'
import { PaymentError } from './pagarme.js'
import { enviarEmailBoasVindas } from './enviarEmailBoasVindas.js'
import { enviarEmailRenovacao } from './enviarEmailRenovacao.js'

async function checked(query) {
  const { data, error } = await query
  if (error) throw new PaymentError('Falha ao liberar o plano do app.', 500)
  return data
}

// Expiração ancorada no pagamento, nunca no horário de uma retentativa.
export function accessExpiration(paidAt, periodDays) {
  if (!Number.isInteger(periodDays) || periodDays <= 0) throw new PaymentError('Plano sem prazo de acesso válido.', 409)
  const date = new Date(paidAt)
  if (Number.isNaN(date.getTime())) throw new PaymentError('Data de pagamento inválida.', 409)
  date.setUTCDate(date.getUTCDate() + periodDays)
  return date.toISOString()
}

export async function loadPurchasedPlans(db, order) {
  const items = await checked(db.from('order_items').select('product_id,offer_id,kind').eq('order_id', order.id))
  let planIds
  if (order.event_id?.startsWith('checkout:')) {
    const request = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', `request:${order.event_id.slice(9)}`).maybeSingle())
    const snapshot = request?.payload?.items
    if (snapshot) {
      if (!Array.isArray(snapshot) || snapshot.length !== items.length || snapshot.some(item => !item.plan_id || !items.some(purchased => purchased.product_id === item.product_id && purchased.offer_id === item.offer_id && purchased.kind === item.kind))) throw new PaymentError('Os planos não correspondem aos itens comprados.', 409)
      planIds = [...new Set(snapshot.map(item => item.plan_id))]
    }
  }
  if (!planIds) {
    let productIds = [...new Set((items || []).map(item => item.product_id))]
    // Compatibilidade com ciclos e pedidos anteriores, sem itens adicionais.
    if (!productIds.length) {
      const offer = await checked(db.from('offers').select('product_id').eq('id', order.offer_id).single())
      productIds = [offer.product_id]
    }
    const products = await checked(db.from('products').select('id,plan_id').in('id', productIds))
    if (products.length !== productIds.length || products.some(product => !product.plan_id)) throw new PaymentError('Um produto comprado está sem plano.', 409)
    planIds = [...new Set(products.map(product => product.plan_id))]
  }
  const plans = await checked(db.from('plans').select('id,period_days').in('id', planIds))
  if (!plans.length || plans.length !== planIds.length) throw new PaymentError('Plano comprado não encontrado.', 409)
  return plans.map(plan => ({ ...plan, expires_at: accessExpiration(order.paid_at, plan.period_days) }))
}

export async function fulfillPaidOrder(db, orderId) {
  if (process.env.CHECKOUT_FULFILLMENT_ENABLED !== 'true') return { fulfillment: 'disabled' }
  const order = await checked(db.from('orders').select('*').eq('id', orderId).single())
  if (order.status !== 'paid' || !order.paid_at) return { fulfillment: 'waiting_payment' }
  const marker = `access:${order.id}`
  const created = await db.from('webhook_events').insert({ pagarme_event_id: marker, type: 'checkout.access', payload: { order_id: order.id }, error: 'ready' })
  if (created.error && created.error.code !== '23505') throw new PaymentError('Falha ao registrar liberação.', 500)
  const event = await checked(db.from('webhook_events').select('*').eq('pagarme_event_id', marker).single())
  if (event.processed_at) return { fulfillment: 'completed' }
  if (event.error === 'processing') throw new PaymentError('Liberação em andamento. Verifique o evento antes de repetir.', 503)
  const claimed = await checked(db.from('webhook_events').update({ error: 'processing' }).eq('id', event.id).eq('error', event.error).select('id'))
  if (!claimed?.length) throw new PaymentError('Liberação em andamento.', 503)
  try {
    const customer = await checked(db.from('customers').select('*').eq('id', order.customer_id).single())
    const plans = await loadPurchasedPlans(db, order)
    const expiration = plans.map(plan => plan.expires_at).sort().at(-1)
    let profile = await checked(db.from('perfis').select('id,acesso_expira_em').eq('email', customer.email).maybeSingle())
    let password
    if (!profile) {
      password = randomBytes(18).toString('base64url')
      const { data, error } = await db.auth.admin.createUser({ email: customer.email, password, email_confirm: true })
      if (error) throw new PaymentError('Não foi possível criar o acesso. Verifique se a conta já existe.', 409)
      profile = { id: data.user.id }
      await checked(db.from('perfis').upsert({ id: profile.id, email: customer.email, nome: customer.name, whatsapp: customer.phone, tipo_acesso: 'rotina', acesso_expira_em: expiration, status_assinatura: 'ativo' }))
    } else {
      const keep = profile.acesso_expira_em && new Date(profile.acesso_expira_em) > new Date(expiration)
      await checked(db.from('perfis').update({ acesso_expira_em: keep ? profile.acesso_expira_em : expiration, status_assinatura: 'ativo' }).eq('id', profile.id))
    }
    await checked(db.from('profiles').upsert({ id: profile.id, name: customer.name, email: customer.email, phone: customer.phone, role: 'student', status: 'active', updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true }))
    const courseExpirations = new Map()
    for (const plan of plans) {
      await checked(db.from('profile_plans').upsert({ profile_id: profile.id, plan_id: plan.id }, { onConflict: 'profile_id,plan_id', ignoreDuplicates: true }))
      const links = await checked(db.from('plan_courses').select('course_id').eq('plan_id', plan.id))
      for (const { course_id } of links || []) {
        const current = courseExpirations.get(course_id)
        if (!current || plan.expires_at > current) courseExpirations.set(course_id, plan.expires_at)
      }
    }
    for (const [course_id, expiration] of courseExpirations) {
      const existing = await checked(db.from('enrollments').select('id,expires_at').eq('profile_id', profile.id).eq('course_id', course_id))
      if (existing.length) {
        const forever = existing.some(row => row.expires_at === null)
        const expires_at = forever ? null : new Date(Math.max(new Date(expiration).getTime(), ...existing.map(row => new Date(row.expires_at).getTime()))).toISOString()
        await checked(db.from('enrollments').update({ status: 'active', expires_at, updated_at: new Date().toISOString() }).in('id', existing.map(row => row.id)))
      } else {
        await checked(db.from('enrollments').insert({ profile_id: profile.id, course_id, status: 'active', source: 'pagarme', purchased_at: order.paid_at, expires_at: expiration }))
      }
    }
    await checked(db.from('customers').update({ profile_id: profile.id }).eq('id', customer.id))
    // Falha de email fica registrada para reenvio no painel; não repete a liberação.
    let emailStatus = 'sent'
    try {
      if (password) await enviarEmailBoasVindas({ nome: customer.name, email: customer.email, senha: password })
      else await enviarEmailRenovacao({ nome: customer.name, email: customer.email, valor: (order.total_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), proximaCobranca: new Date(expiration).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) })
    } catch { emailStatus = 'failed' }
    await checked(db.from('webhook_events').update({ processed_at: new Date().toISOString(), error: emailStatus === 'failed' ? 'Email não enviado; reenviar pelo painel de alunas.' : null, payload: { order_id: order.id, profile_id: profile.id, plan_ids: plans.map(plan => plan.id), email_status: emailStatus } }).eq('id', event.id))
    return { fulfillment: 'completed', email_status: emailStatus }
  } catch (error) {
    await db.from('webhook_events').update({ error: 'retry' }).eq('id', event.id)
    throw error
  }
}
