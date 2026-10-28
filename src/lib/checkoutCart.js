import { PaymentError, calculatePayment } from './pagarme.js'

export function normalizeBumpSelection(value = []) {
  if (!Array.isArray(value) || value.length > 20 || value.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new PaymentError('Seleção de adicionais inválida.')
  if (new Set(value).size !== value.length) throw new PaymentError('Um adicional não pode ser cobrado duas vezes.')
  return value
}

async function checked(query) {
  const { data, error } = await query
  if (error) throw new PaymentError('Não foi possível consultar os adicionais.', 503)
  return data || []
}

export async function loadOrderBumps(db, mainOfferId) {
  const links = await checked(db.from('order_bumps').select('bump_offer_id,headline,description,position').eq('offer_id', mainOfferId).eq('active', true).order('position'))
  const ids = [...new Set(links.map(link => link.bump_offer_id).filter(id => id !== mainOfferId))]
  if (!ids.length) return []
  const offers = await checked(db.from('offers').select('*').in('id', ids).eq('active', true))
  const productIds = [...new Set(offers.map(offer => offer.product_id))]
  if (!productIds.length) return []
  const products = await checked(db.from('products').select('id,name,type,active,plan_id,marketplace_id').in('id', productIds).eq('active', true).eq('type', 'one_time'))
  const seen = new Set()
  return links.flatMap(link => {
    const offer = offers.find(item => item.id === link.bump_offer_id)
    const product = products.find(item => item.id === offer?.product_id)
    if (!offer || !product?.plan_id || (product.marketplace_id || 'pagarme') !== 'pagarme' || seen.has(offer.id)) return []
    seen.add(offer.id)
    return [{ offer, product, headline: link.headline || 'Adicione também', description: link.description || '', position: link.position }]
  })
}

// O parcelamento vem da oferta principal; cada adicional mantém seu preço e desconto Pix.
export function quoteBump(mainOffer, bump, method, installments) {
  return calculatePayment({ ...bump.offer, max_installments: mainOffer.max_installments, free_installments: mainOffer.free_installments, monthly_interest_pct: mainOffer.monthly_interest_pct, interest_model: mainOffer.interest_model }, bump.product, method, installments)
}

export function buildCheckoutCart(offer, product, available, selection, method, installments = 1) {
  const ids = normalizeBumpSelection(selection)
  if (product.type === 'subscription' && ids.length) throw new PaymentError('Assinaturas não permitem adicionais nesta compra.')
  const wanted = new Set(ids)
  const selected = available.filter(bump => wanted.has(bump.offer.id))
  if (selected.length !== ids.length) throw new PaymentError('Um adicional selecionado não está disponível nesta oferta.')
  const line = (itemOffer, itemProduct, kind, amounts) => ({ offer_id: itemOffer.id, product_id: itemProduct.id, plan_id: itemProduct.plan_id, name: itemProduct.name, kind, ...amounts })
  const items = [line(offer, product, 'main', calculatePayment(offer, product, method, installments)), ...selected.map(bump => line(bump.offer, bump.product, 'bump', quoteBump(offer, bump, method, installments)))]
  if (items.some(item => !item.plan_id)) throw new PaymentError('Vincule um plano do app a todos os produtos da compra.')
  const amount = items.reduce((totals, item) => {
    for (const key of Object.keys(totals)) totals[key] += item[key]
    return totals
  }, { subtotal_cents: 0, discount_cents: 0, interest_cents: 0, total_cents: 0 })
  if (amount.total_cents > 2147483647) throw new PaymentError('Total da compra inválido.')
  return { items, amount }
}
