const labels = {
  accepted: 'Recebida pela Meta', test: 'Evento de teste', retry: 'Aguardando nova tentativa',
  processing: 'Envio em andamento', review_required: 'Requer revisão', unconfirmed: 'Envio sem confirmação',
}

export const conversionLabel = conversion => labels[conversion?.state] || 'Sem envio registrado'
