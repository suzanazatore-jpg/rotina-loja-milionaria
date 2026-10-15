// Payloads de analytics não recebem email, telefone, documento nem dados de cartão.
export function trackingDestination(config = {}) {
  if (config.tracking_mode === 'off') return { channel: 'off', id: '' }
  if (/^GTM-[A-Z0-9]{4,20}$/.test(config.gtm_id || '')) return { channel: 'gtm', id: config.gtm_id }
  if (/^\d{5,30}$/.test(config.meta_pixel_id || '')) return { channel: 'meta', id: config.meta_pixel_id }
  return { channel: 'off', id: '' }
}
export function purchaseAnalytics(order, snapshot) {
  if (order.status !== 'paid' || !order.paid_at || !order.id || !Number.isSafeInteger(order.total_cents) || order.total_cents <= 0 || !Array.isArray(snapshot) || !snapshot.length) return null
  if (snapshot.some(item => !item.product_id || !item.name || !Number.isSafeInteger(item.total_cents) || item.total_cents <= 0)) return null
  if (snapshot.reduce((sum, item) => sum + item.total_cents, 0) !== order.total_cents) return null
  return { transaction_id: order.id, event_id: `purchase:${order.id}`, total_cents: order.total_cents, items: snapshot.map(item => ({ item_id: item.product_id, item_name: item.name, price_cents: item.total_cents })) }
}
export function ecommercePayload(cart) {
  if (!cart || !Number.isSafeInteger(cart.total_cents) || cart.total_cents <= 0 || !Array.isArray(cart.items) || !cart.items.length) return null
  const items = cart.items.map(item => ({ item_id: String(item.item_id || ''), item_name: String(item.item_name || '').slice(0,256), price: item.price_cents / 100, quantity: 1 }))
  if (items.some(item => !item.item_id || !Number.isFinite(item.price) || item.price <= 0)) return null
  return { currency: 'BRL', value: cart.total_cents / 100, items, ...(cart.transaction_id ? { transaction_id: cart.transaction_id } : {}) }
}
export function dispatchAnalytics(target, config, event, cart, key) {
  try {
  const destination = trackingDestination(config)
  if (destination.channel === 'off' || !['page_view','view_item','begin_checkout','purchase'].includes(event)) return false
  const ecommerce = event === 'page_view' ? null : ecommercePayload(cart)
  if (event !== 'page_view' && !ecommerce) return false
  if (event === 'purchase' && (!cart?.transaction_id || !cart?.event_id)) return false
  const marker = event === 'purchase' ? `sz-checkout-purchase:${cart.transaction_id}` : key
  target.__szCheckoutEvents ||= new Set()
  if (target.__szCheckoutEvents.has(marker)) return false
  if (event === 'purchase') {
    try { if (target.localStorage?.getItem(marker) === 'sent') return false } catch { /* Memória continua protegendo contra polls repetidos. */ }
  }
  if (destination.channel === 'gtm') {
    target.dataLayer ||= []
    if (ecommerce) target.dataLayer.push({ ecommerce: null })
    target.dataLayer.push({ event, ...(ecommerce ? { ecommerce } : {}), ...(cart?.event_id ? { event_id: cart.event_id } : {}) })
  } else {
    if (typeof target.fbq !== 'function') return false
    const name = { page_view:'PageView',view_item:'ViewContent',begin_checkout:'InitiateCheckout',purchase:'Purchase' }[event]
    const params = ecommerce ? { currency:'BRL',value:ecommerce.value,content_type:'product',content_ids:ecommerce.items.map(item=>item.item_id),contents:ecommerce.items.map(item=>({id:item.item_id,quantity:1,item_price:item.price})),num_items:ecommerce.items.length } : {}
    target.fbq('trackSingle', destination.id, name, params, ...(cart?.event_id ? [{ eventID: cart.event_id }] : []))
  }
  target.__szCheckoutEvents.add(marker)
  if (event === 'purchase') { try { target.localStorage?.setItem(marker,'sent') } catch { /* Não bloqueia compra nem acompanhamento. */ } }
  return true
  } catch { return false }
}
