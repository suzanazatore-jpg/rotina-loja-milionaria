// Valores em centavos. Guru (taxa única) aplica juros simples sobre o preço
// por quantidade de parcelas; as ofertas anteriores mantêm a Tabela Price.
export function totalParcelado(preco, parcelas, semJuros, jurosPct, modelo = 'price') {
  const taxa = Number(String(jurosPct || 0).replace(',', '.')) / 100
  if (parcelas <= semJuros || !taxa) return preco
  if (modelo === 'simple') return Math.round(preco * (1 + taxa * parcelas))
  const fator = (1 + taxa) ** parcelas
  return Math.ceil(preco * taxa * fator / (fator - 1)) * parcelas
}
