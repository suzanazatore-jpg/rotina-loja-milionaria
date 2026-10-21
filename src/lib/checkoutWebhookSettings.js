export const WEBHOOK_EVENTS = {
  'order.created': 'Pedido criado',
  'order.paid': 'Pagamento aprovado',
  'order.failed': 'Pagamento recusado',
  'order.refunded': 'Reembolso',
  'order.chargedback': 'Contestação',
  'subscription.created': 'Assinatura criada',
  'subscription.renewed': 'Assinatura renovada',
  'subscription.past_due': 'Assinatura em atraso',
  'subscription.canceled': 'Assinatura cancelada',
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeWebhook(input) {
  const name = String(input.name || '').trim()
  if (!name || name.length > 120) throw new Error('Informe um nome com até 120 caracteres.')
  let url
  try { url = new URL(String(input.url || '').trim()) } catch { throw new Error('Informe uma URL HTTPS válida.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443' || url.href.length > 2048) throw new Error('Use uma URL HTTPS sem usuário, senha ou fragmento.')
  if (!url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(':')) throw new Error('Use o domínio público do destino.')
  const events = [...new Set(Array.isArray(input.events) ? input.events : [])]
  if (!events.length || events.some(event => !Object.hasOwn(WEBHOOK_EVENTS, event))) throw new Error('Selecione pelo menos um evento válido.')
  const products = input.product_ids === null ? null : [...new Set(Array.isArray(input.product_ids) ? input.product_ids : [])]
  if (products !== null && (!products.length || products.length > 100 || products.some(id => !UUID.test(id)))) throw new Error('Selecione os produtos ou marque Todos os produtos.')
  return { name, url: url.href, events, product_ids: products, active: input.active === true }
}
