export const ASSISTANT_KNOWLEDGE_CATEGORIES = [
  { key: 'general', label: 'Método Suzana / Geral' },
  { key: 'app', label: 'Como usar o aplicativo' },
  { key: 'routine', label: 'Rotina da Loja' },
  { key: 'campaigns', label: 'Campanhas de Vendas' },
  { key: 'calendar', label: 'Calendário de Postagens' },
  { key: 'team_goals', label: 'Metas e vendas' },
  { key: 'pricing', label: 'Precificação e lucro' },
  { key: 'sales', label: 'Vendas e atendimento' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'team', label: 'Equipe e gestão' },
]

export const ASSISTANT_KNOWLEDGE_CATEGORY_KEYS = new Set(ASSISTANT_KNOWLEDGE_CATEGORIES.map(item => item.key))

export function assistantCategoryLabel(key) {
  return ASSISTANT_KNOWLEDGE_CATEGORIES.find(item => item.key === key)?.label || key
}
