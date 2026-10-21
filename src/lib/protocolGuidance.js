export function protocolGuidance({ checks = [], pieces = null, invites = null, conversations = null }) {
  const done = checks.filter(Boolean).length
  const actions = []
  if (checks.length && done < checks.length) actions.push(`Você marcou ${done} de ${checks.length} ações. Faça a primeira que ainda está pendente.`)
  if (pieces === 0) actions.push('Comece mostrando algumas peças do lote com foto, tamanho, preço e forma de comprar.')
  if (pieces > 0 && invites === 0) actions.push('As peças já apareceram. Convide clientes que têm interesse nesse perfil.')
  if (invites > 0 && conversations === 0) actions.push('Você convidou clientes, mas não registrou conversas. Confira se a mensagem deixa claro o que está à venda e como responder.')
  if (conversations > 0) actions.push(`Acompanhe ${conversations === 1 ? 'a conversa' : 'as conversas'} e esclareça dúvidas sobre tamanho, uso e pagamento.`)
  if (!actions.length) actions.push('Revise os atendimentos e registre as vendas do lote. Use as dúvidas recebidas para preparar a próxima missão.')
  return { title: done === checks.length && checks.length ? 'Boa execução!' : 'Seu próximo passo', actions }
}

export function protocolDay(startedOn, today) {
  const from = Date.parse(`${startedOn}T12:00:00Z`)
  const to = Date.parse(`${today}T12:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.min(7, Math.round((to - from) / 86400000) + 1))
}
