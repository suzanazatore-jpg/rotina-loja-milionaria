export const SALES_RECIPIENTS = [
  // Contas verificadas pelo nome, telefone e e-mail, não apenas pelo telefone compartilhado.
  '93be1df8-f68a-4218-af61-e909395c24dc', // Mariano Zatorre
  '776e86c1-73d7-4b12-b52f-02786d7d654f', // Suzana A Oliveira
]
export function commerceNotice(order, customer, product, renewal = false) {
  const first = String(customer.name || 'Aluno').trim().split(/\s+/)[0].slice(0, 40)
  const name = String(product || 'Produto').slice(0, 110)
  const value = (Number(order.total_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return renewal
    ? { title: 'Plano renovado com sucesso! ✅', body: `${first}, sua assinatura de ${name} foi renovada. Pagamento de ${value} confirmado.`, target_url: '/painel' }
    : { title: order.parent_order_id ? 'Renovação aprovada! ✅' : 'Venda aprovada! ✅', body: `${first} • ${name} • ${value}. Pagamento confirmado.`, target_url: '/painel' }
}
export function installationMessage(name) {
  const first = String(name || 'aluno').trim().split(/\s+/)[0]
  return `Olá, ${first}! Coloque o app Rotina da Loja Milionária na tela do seu celular e tenha seu conteúdo sempre à mão.\n\n1. Abra https://rotina.suzanazatorre.com.br/login e entre com seu e-mail e senha.\n2. Android: abra no Chrome, toque no menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.\n3. iPhone: abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.\n4. Abra o app pelo ícone criado para concluir.\n\nSe o link abriu dentro do WhatsApp ou Instagram, escolha abrir no navegador. Precisa de ajuda? Responda esta mensagem!`
}
export function whatsappNumber(value) {
  let phone = String(value || '').replace(/\D/g, '')
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone
  return /^55\d{10,11}$/.test(phone) ? phone : null
}
