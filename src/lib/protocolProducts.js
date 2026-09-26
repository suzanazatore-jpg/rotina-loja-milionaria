export const MAX_PROTOCOL_PRODUCTS = 200

export function normalizeProtocolProducts(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_PROTOCOL_PRODUCTS) throw new Error('Cadastre pelo menos um produto (até 200 por campanha).')
  const products = value.map((item, index) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = typeof item?.quantity === 'number' || typeof item?.quantity === 'string' ? Number(item.quantity) : NaN
    if (!name || name.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error(`Confira o produto ${index + 1}: informe o nome e uma quantidade inteira maior que zero.`)
    return { name, quantity }
  })
  const total = products.reduce((sum, item) => sum + item.quantity, 0)
  if (total > 100000) throw new Error('A campanha pode ter até 100.000 peças no total.')
  return { products, total }
}
