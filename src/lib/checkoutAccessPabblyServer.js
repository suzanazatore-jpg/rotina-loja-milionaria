import {randomUUID} from 'node:crypto'
import {sendWebhook} from './checkoutOutboundServer.js'

// Entrega de acesso é separada do pagamento e não altera o checkout.
// O endereço do Pabbly fica no banco administrativo, nunca no navegador ou no GitHub.
const INTEGRATION_ID = 'principal'
const LOGIN_URL = 'https://rotina.suzanazatorre.com.br/login'
const RECOVERY_URL = 'https://rotina.suzanazatorre.com.br/esqueci-senha'

export async function notifyAccessPabbly(db, {order, customer, password, productName, sender = sendWebhook}) {
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
  if (!password) return {status:'existing_account'} // Senha existente nunca é recuperada ou inventada.
  // Nunca registrar a senha no banco, logs ou auditoria.
  const created = await db.from('webhook_events').insert({pagarme_event_id:marker,type:'checkout.access.pabbly',payload:{order_id:order.id,channel:'pabbly'},error:'ready'})
  if (created.error && created.error.code !== '23505') return {status:'failed',reason:'receipt_unavailable'}
  const claimed = await db.from('webhook_events').update({error:'sending'}).eq('pagarme_event_id',marker).in('error',['ready','retry']).is('processed_at',null).select('id')
  if (claimed.error || !claimed.data?.length) return {status:'in_progress'}
  try {
    const phoneDigits = String(customer.phone).replace(/\D/g,'')
    const phone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`
    const response = await sender(hook.url, {
      email: customer.email,
      nome: customer.name,
      telefone: phone,
      senha: password,
      link_app: LOGIN_URL,
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
