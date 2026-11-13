import { SALES_RECIPIENTS, commerceNotice } from './commerceNotices.js'
import { sendPushNotification } from './pushNotifications.js'
import { allRows } from './centralRecords.js'

async function checked(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// Compatibilidade com as assinaturas ainda cobradas no Guru.
// Eventos gerados pela própria Central já foram tratados por notifyPaidOrder.
export async function notifyGuruCommerce(db, payload, profileId, renewal) {
  if (process.env.VERCEL_ENV !== 'production' || payload.source_system === 'central_vendas') return
  const subscription = payload.webhook_type === 'subscription'
  if (subscription ? payload.last_status !== 'active' || payload.current_invoice?.status !== 'paid' : payload.status !== 'approved') return
  const invoice = subscription ? payload.current_invoice?.id : payload.id
  const value = subscription ? payload.current_invoice?.value : Math.round(Number(payload.payment?.total) * 100)
  if (!invoice || !Number.isSafeInteger(value) || value < 0) throw Error('Evento aprovado sem identificador ou valor verificável para notificação.')
  const customer = subscription ? payload.subscriber : payload.contact
  const product = payload.product?.name || payload.products?.[0]?.name
  const marker = `guru-commerce:${String(invoice).slice(0, 180)}`
  // Persiste a classificação inicial: reenvio da primeira fatura não vira renovação.
  await checked(db.from('webhook_events').upsert({ pagarme_event_id: marker, type: 'guru.commerce', payload: { renewal: Boolean(renewal), profile_id: profileId } }, { onConflict: 'pagarme_event_id', ignoreDuplicates: true }))
  const event = await checked(db.from('webhook_events').select('payload').eq('pagarme_event_id', marker).single())
  const order = { total_cents: value, parent_order_id: event.payload.renewal ? String(invoice) : null }
  const people = SALES_RECIPIENTS.map(id => ({ id, renewal: false }))
  if (event.payload.renewal && event.payload.profile_id) people.push({ id: event.payload.profile_id, renewal: true })
  for (const person of people) await checked(db.from('user_notifications').upsert({ user_id: person.id, commerce_key: `${marker}:${person.renewal ? 'student' : 'owner'}`, ...commerceNotice(order, customer || {}, product, person.renewal), notification_type: 'personalizada', scheduled_for: new Date().toISOString().slice(0, 10) }, { onConflict: 'user_id,commerce_key', ignoreDuplicates: true }))
}

export async function notifyPaidOrder(db, orderId) {
  if (process.env.VERCEL_ENV !== 'production') return { status: 'preview_disabled' }
  const order = await checked(db.from('orders').select('*').eq('id', orderId).single())
  if (order.status !== 'paid' || !order.paid_at) return { status: 'not_paid' }
  const config = await checked(db.from('commerce_notification_config').select('activated_at').eq('id', true).single())
  if (new Date(order.paid_at) < new Date(config.activated_at)) return { status: 'historical' }
  const customer = await checked(db.from('customers').select('name,profile_id,email').eq('id', order.customer_id).single())
  const offer = await checked(db.from('offers').select('product:products(name)').eq('id', order.offer_id).single())
  const itemOrder = order.parent_order_id || order.id
  const items = await checked(db.from('order_items').select('product:products(name)').eq('order_id', itemOrder))
  const product = items?.length ? items.map(item => item.product?.name).filter(Boolean).join(' + ') : offer.product?.name
  const people = SALES_RECIPIENTS.map(id => ({ id, renewal: false }))
  // Uma compra adicional de aluno existente não é uma renovação.
  if (order.parent_order_id) {
    let profileId = customer.profile_id
    if (!profileId) {
      const profile = await checked(db.from('profiles').select('id').eq('email', customer.email).maybeSingle())
      profileId = profile?.id
    }
    if (profileId) people.push({ id: profileId, renewal: true })
  }
  for (const person of people) {
    const commerce_key = `paid:${order.id}:${person.renewal ? 'student' : 'owner'}`
    const notice = commerceNotice(order, customer, product, person.renewal)
    await checked(db.from('user_notifications').upsert({
      user_id: person.id, commerce_key, ...notice, notification_type: 'personalizada',
      scheduled_for: order.paid_at.slice(0, 10),
    }, { onConflict: 'user_id,commerce_key', ignoreDuplicates: true }))
  }
  return { status: 'recorded' }
}

export async function processCommercePush(db, send = sendPushNotification) {
  if (process.env.VERCEL_ENV !== 'production') return { status: 'preview_disabled' }
  const now = new Date().toISOString()
  // Inscrições podem ser ativadas depois da compra. O sininho nunca depende de push.
  const notices = await allRows(() => db.from('user_notifications').select('id,user_id,title,body,target_url,commerce_key').not('commerce_key', 'is', null).gte('sent_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('id'))
  for (const notice of notices) {
    const devices = await checked(db.from('push_subscriptions').select('id').eq('user_id', notice.user_id).eq('active', true))
    if (devices.length) await checked(db.from('commerce_push_deliveries').upsert(devices.map(device => ({ notification_id: notice.id, subscription_id: device.id })), { onConflict: 'notification_id,subscription_id', ignoreDuplicates: true }))
  }
  await checked(db.from('commerce_push_deliveries').update({ status: 'pending', locked_at: null }).eq('status', 'sending').lt('locked_at', new Date(Date.now() - 5 * 60000).toISOString()))
  const pending = await checked(db.from('commerce_push_deliveries').select('*').eq('status', 'pending').lte('next_attempt_at', now).order('next_attempt_at').limit(30))
  let sent = 0, failed = 0
  for (const delivery of pending) {
    const claim = await checked(db.from('commerce_push_deliveries').update({ status: 'sending', locked_at: now, attempts: delivery.attempts + 1 }).eq('id', delivery.id).eq('status', 'pending').select('id'))
    if (!claim.length) continue
    const notice = notices.find(item => item.id === delivery.notification_id)
    const device = await checked(db.from('push_subscriptions').select('id,endpoint,p256dh,auth,active').eq('id', delivery.subscription_id).maybeSingle())
    if (!notice || !device?.active) {
      await checked(db.from('commerce_push_deliveries').update({ status: 'expired', locked_at: null }).eq('id', delivery.id))
      continue
    }
    try {
      await send({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, { title: notice.title, body: notice.body, url: '/painel', tag: notice.commerce_key, icon: '/pwa-icon-192.png', badge: '/notification-badge.png' })
      await checked(db.from('commerce_push_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', delivery.id))
      sent++
    } catch (error) {
      const expired = [404, 410].includes(error.statusCode)
      if (expired) await checked(db.from('push_subscriptions').update({ active: false }).eq('id', device.id))
      await checked(db.from('commerce_push_deliveries').update({ status: expired ? 'expired' : 'pending', locked_at: null, next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(delivery.attempts, 6))).toISOString(), last_error: expired ? 'Dispositivo desativado' : 'Falha no provedor push' }).eq('id', delivery.id))
      failed++
    }
  }
  return { sent, failed }
}

export async function reconcileCommerceNotices(db) {
  if (process.env.VERCEL_ENV !== 'production') return { status: 'preview_disabled' }
  const config = await checked(db.from('commerce_notification_config').select('activated_at').eq('id', true).single())
  const orders = await allRows(() => db.from('orders').select('id').eq('status', 'paid').gte('paid_at', config.activated_at).order('id'))
  for (const order of orders) await notifyPaidOrder(db, order.id)
  return processCommercePush(db)
}
