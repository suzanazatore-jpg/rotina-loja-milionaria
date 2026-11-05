import { sendWebhook } from './checkoutOutboundServer.js'

// O BotConversa recebe somente dados de acesso de perfis recém-criados.
// A senha nunca é salva em log, fila ou evento de auditoria.
export async function notifyNewStudentAccess(db, { orderId, customer, password }) {
  const url = process.env.CHECKOUT_PABBLY_ACCESS_URL
  const marker = `access-whatsapp:${orderId}`
  if (!url || !password || !/^\d{8}$/.test(password)) return 'not_configured'
  let phone = String(customer.phone || '').replace(/\D/g, '')
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`
  if (!/^55\d{10,11}$/.test(phone)) return 'invalid_phone'
  // Inserção única por pedido: impede duas solicitações se o gateway repetir um webhook.
  const { error: markError } = await db.from('webhook_events').insert({
    pagarme_event_id: marker, type: 'checkout.access.whatsapp',
    payload: { order_id: orderId, destination: 'pabbly_access', status: 'processing' }, error: 'processing',
  })
  if (markError) return markError.code === '23505' ? 'already_recorded' : 'record_error'
  let status = 'failed'
  let responseStatus = null
  try {
    const { data: item } = await db.from('order_items').select('product_id').eq('order_id', orderId).eq('kind', 'main').limit(1).maybeSingle()
    const { data: product } = item?.product_id ? await db.from('products').select('name').eq('id', item.product_id).maybeSingle() : { data: null }
    const name = String(customer.name || '').trim()
    const data = {
      tipo_acesso: 'rotina',
      telefone: phone,
      senha: password,
      primeiro_nome: name.split(/\s+/)[0] || 'Aluna',
      nome_produto: product?.name || 'Rotina da Loja Milionária',
      nome: name,
      link_app: 'https://rotina.suzanazatorre.com.br/login',
      evento: 'boas_vindas',
      email: String(customer.email || '').trim(),
    }
    responseStatus = await sendWebhook(url, data, 'checkout-access', marker)
    if (responseStatus >= 200 && responseStatus < 300) status = 'accepted'
  } catch { /* A aprovação e o acesso não dependem do canal externo. */ }
  await db.from('webhook_events').update({
    error: status === 'accepted' ? null : 'review_required',
    processed_at: status === 'accepted' ? new Date().toISOString() : null,
    payload: { order_id: orderId, destination: 'pabbly_access', status, response_status: responseStatus },
  }).eq('pagarme_event_id', marker)
  return status
}
