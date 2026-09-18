export const ETAPAS_CAMPANHA = [
  { id: 'escolher-produtos', icone: 'content', titulo: 'Escolher os produtos', descricao: 'Selecione os itens que serão o centro da campanha.' },
  { id: 'validar-margem', icone: 'goals', titulo: 'Validar preço e margem', descricao: 'Confirme custo, margem e limite seguro de desconto.' },
  { id: 'definir-oferta', icone: 'campaigns', titulo: 'Definir a oferta', descricao: 'Monte uma condição clara, atrativa e fácil de explicar.' },
  { id: 'lista-vip', icone: 'users', titulo: 'Preparar a lista VIP', descricao: 'Separe as clientes com maior chance de comprar.' },
  { id: 'preparar-equipe', icone: 'routine', titulo: 'Preparar a equipe', descricao: 'Alinhe argumento, meta e forma de atendimento.' },
  { id: 'criar-artes', icone: 'content', titulo: 'Preparar artes e textos', descricao: 'Deixe imagens, chamadas e respostas prontas.' },
  { id: 'publicar-campanha', icone: 'campaigns', titulo: 'Publicar a campanha', descricao: 'Divulgue nos canais escolhidos no horário planejado.' },
  { id: 'contatar-clientes', icone: 'comments', titulo: 'Chamar as clientes', descricao: 'Envie convites pessoais e conduza cada conversa.' },
  { id: 'registrar-resultados', icone: 'goals', titulo: 'Registrar os resultados', descricao: 'Anote contatos, respostas, pedidos e valor vendido.' },
  { id: 'avaliar-campanha', icone: 'assistant', titulo: 'Avaliar e melhorar', descricao: 'Identifique o que funcionou e o próximo ajuste.' },
]

const ICONES = new Set(['content', 'goals', 'campaigns', 'users', 'routine', 'comments', 'assistant'])

function texto(valor, limite) {
  return String(valor || '').trim().slice(0, limite)
}

export function criarPlanoCampanhaPadrao() {
  return {
    objetivo: 'Executar a campanha do início ao fim, sem pular as etapas que protegem a margem e aumentam as vendas.',
    orientacao: 'Comece pela primeira etapa pendente. Marque cada ação concluída para acompanhar o avanço da campanha.',
    etapas: ETAPAS_CAMPANHA.map(etapa => ({ ...etapa })),
  }
}

export function normalizarPlanoCampanha(valor) {
  const recebido = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  const padrao = criarPlanoCampanhaPadrao()
  const recebidas = Array.isArray(recebido.etapas) ? recebido.etapas : []
  const porId = new Map(recebidas.map(etapa => [String(etapa?.id || ''), etapa]))

  return {
    objetivo: texto(recebido.objetivo, 280) || padrao.objetivo,
    orientacao: texto(recebido.orientacao, 280) || padrao.orientacao,
    etapas: ETAPAS_CAMPANHA.map((etapa, indice) => {
      const atual = porId.get(etapa.id) || recebidas[indice] || {}
      return {
        id: etapa.id,
        icone: ICONES.has(atual.icone) ? atual.icone : etapa.icone,
        titulo: texto(atual.titulo, 100) || etapa.titulo,
        descricao: texto(atual.descricao, 180) || etapa.descricao,
      }
    }),
  }
}
