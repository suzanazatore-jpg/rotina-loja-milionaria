import {randomUUID} from 'node:crypto'
import {sendWebhook} from './checkoutOutboundServer.js'
import {ensureProductIdentification} from './checkoutTagFirstServer.js'

// Entrega de acesso é separada do pagamento e não altera o checkout.
// O endereço do Pabbly fica no banco administrativo, nunca no navegador ou no GitHub.
const INTEGRATION_ID = 'principal'
const LOGIN_URL = 'https://rotina.suzanazatorre.com.br/login'
const RECOVERY_URL = 'https://rotina.suzanazatorre.com.br/esqueci-senha'

export async function notifyAccessPabbly(db, {order, customer, password, productName, sender = sendWebhook, productTagGate = ensureProductIdentification}) {
  const marker = `access-pabbly:${order.id}`
  const eventResult = await db.from('webhook_events').select('id,error,processed_at').eq('pagarme_event_id',marker).maybeSingle()
  if (eventResult.error) return {status:'failed',reason:'status_unavailable'}
  if (eventResult.data?.processed_at) return {status:'already_sent'}
  if (eventResult.data?.error === 'sending') return {status:'in_progress'}
  const configured = await db.from('checkout_access_pabbly_config').select('url,secret,active').eq('id',INTEGRATION_ID).maybeSingle()
  if (configured.error || !configured.data?.active) return {status:'not_configured'}
  const hook = configured.data
  let target
  try { target = new URL(hook.url) } catch { return {status:'invalid_destination'} }
  if (target.protocol !== 'https:' || target.hostname !== 'connect.pabbly.com' || !target.pathname.startsWith('/workflow/sendwebhookdata/')) return {status:'invalid_destination'}
  if (!customer?.email || !customer?.phone || !customer?.name || !order?.paid_at) return {status:'incomplete_customer'}
  // Contas existentes recebem instruções para definir uma senha; nunca copiamos nem alteramos a senha atual.
  // Nunca registrar a senha no banco, logs ou auditoria.
  const created = await db.from('webhook_events').insert({pagarme_event_id:marker,type:'checkout.access.pabbly',payload:{order_id:order.id,channel:'pabbly'},error:'ready'})
  if (created.error && created.error.code !== '23505') return {status:'failed',reason:'receipt_unavailable'}
  // A etiqueta de produto deve ser recebida pelo BotConversa ANTES de
  // dispararmos o fluxo com login e senha. Não interferimos no pagamento ou no
  // acesso já liberado por e-mail. Uma falha fica registrada para retentativa.
  let identification
  try { identification = await productTagGate(db, order.id) } catch { identification = {ready:false,reason:'tag_check_failed'} }
  if (identification?.ready !== true) {
    const waiting = await db.from('webhook_events').update({error:'waiting_tag'})
      .eq('pagarme_event_id',marker).in('error',['ready','retry','waiting_tag']).is('processed_at',null)
    if (waiting.error) return {status:'failed',reason:'tag_wait_receipt_failed'}
    return {status:'waiting_product_tag',reason:identification?.reason || 'tag_pending'}
  }
  const claimed = await db.from('webhook_events').update({error:'sending'}).eq('pagarme_event_id',marker).in('error',['ready','retry','waiting_tag']).is('processed_at',null).select('id')
  if (claimed.error || !claimed.data?.length) return {status:'in_progress'}
  try {
    const phoneDigits = String(customer.phone).replace(/\D/g,'')
    const phone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`
    const response = await sender(hook.url, {
      email: customer.email,
      nome: customer.name,
      telefone: phone,
      senha: password || 'Use a sua senha atual; para criar outra, utilize o link de recuperação.',
      link_app: password ? LOGIN_URL : RECOVERY_URL,
      nome_produto: productName || 'Curso adquirido',
      evento: 'acesso_liberado',
      tipo_acesso: 'curso',
      order_id: order.id,
    }, hook.secret || '', randomUUID())
    const code = typeof response === 'number' ? response : response?.status
    if (!(code >= 200 && code < 300)) throw new Error('pabbly_response_not_successful')
    await db.from('webhook_events').update({error:null,processed_at:new Date().toISOString()}).eq('pagarme_event_id',marker).eq('error','sending')
    return {status:'accepted_by_pabbly'}
  } catch {
    await db.from('webhook_events').update({error:'retry'}).eq('pagarme_event_id',marker).eq('error','sending')
    return {status:'failed',reason:'pabbly_send_failed'}
  }
}

export {RECOVERY_URL}

 
// Recupera somente notificações explicitamente retidas pela identificação do
// produto. Como a senha temporária nunca é persistida, a retentativa instrui
// a aluna a usar o link seguro de recuperação, sem criar ou trocar credenciais.
export async function retryWaitingTagAccess(db, { limit = 3, notify = notifyAccessPabbly } = {}) {
  const waiting = await db.from('webhook_events')
    .select('pagarme_event_id,payload')
    .eq('type','checkout.access.pabbly').eq('error','waiting_tag')
    .is('processed_at',null).order('received_at',{ascending:true}).limit(limit)
  if (waiting.error) return {checked:0,sent:0,error:'queue_unavailable'}
  let sent = 0
  for (const event of waiting.data || []) {
    const orderId = event.payload?.order_id
    if (!/^[0-9a-f-]{36}$/i.test(orderId || '')) continue
    const purchase = await db.from('orders').select('id,customer_id,offer_id,status,paid_at').eq('id',orderId).maybeSingle()
    if (purchase.error || purchase.data?.status !== 'paid') continue
    const customer = await db.from('customers').select('name,email,phone').eq('id',purchase.data.customer_id).maybeSingle()
    if (customer.error || !customer.data) continue
    const offer = await db.from('offers').select('name').eq('id',purchase.data.offer_id).maybeSingle()
    try {
      const result = await notify(db,{order:purchase.data,customer:customer.data,productName:offer.data?.name})
      if (result?.status === 'accepted_by_pabbly') sent++
    } catch { /* O registro fica na fila para uma próxima tentativa. */ }
  }
  return {checked:(waiting.data || []).length,sent}
}
