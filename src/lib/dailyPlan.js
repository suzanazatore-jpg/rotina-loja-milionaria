export const DIAS_PLANO = [
  { key: '1', curto: 'SEG', nome: 'Segunda-feira' },
  { key: '2', curto: 'TER', nome: 'Terça-feira' },
  { key: '3', curto: 'QUA', nome: 'Quarta-feira' },
  { key: '4', curto: 'QUI', nome: 'Quinta-feira' },
  { key: '5', curto: 'SEX', nome: 'Sexta-feira' },
  { key: '6', curto: 'SÁB', nome: 'Sábado' },
  { key: '0', curto: 'DOM', nome: 'Domingo' },
]

export const ICONES_TAREFA = [
  { value: 'goals', label: 'Meta' },
  { value: 'comments', label: 'WhatsApp' },
  { value: 'routine', label: 'Follow-up' },
  { value: 'users', label: 'Clientes' },
  { value: 'campaigns', label: 'Campanha' },
  { value: 'content', label: 'Conteúdo' },
]

const ICONES_PERMITIDOS = new Set(ICONES_TAREFA.map(item => item.value))

const FOCOS_PADRAO = {
  '1': ['Começar a semana com direção', 'Alinhe a meta, organize os contatos e escolha a oportunidade que merece mais atenção hoje.'],
  '2': ['Ativar clientes que já conhecem a loja', 'Volte às conversas abertas e crie movimento antes de buscar novos contatos.'],
  '3': ['Recuperar oportunidades abertas', 'Priorize clientes que pediram preço, receberam opções ou deixaram a compra para depois.'],
  '4': ['Acelerar a campanha da semana', 'Use a campanha ativa para gerar conversa, urgência e novos pedidos.'],
  '5': ['Fechar a semana com follow-up', 'Retome as melhores oportunidades e conduza cada conversa para o próximo passo.'],
  '6': ['Transformar movimento em venda', 'Aproveite o fluxo do sábado para atender rápido, oferecer combinações e registrar resultados.'],
  '0': ['Organizar a próxima semana', 'Faça uma revisão leve dos resultados e deixe as prioridades da próxima semana encaminhadas.'],
}

const TAREFAS_PADRAO = [
  { icone: 'goals', titulo: 'Conferir a meta com a equipe', descricao: 'Meta diária: {meta_diaria}' },
  { icone: 'comments', titulo: 'Responder o WhatsApp da loja', descricao: 'Não deixe nenhuma conversa pendente' },
  { icone: 'routine', titulo: 'Retomar orçamentos quentes', descricao: 'Comece pelos contatos das últimas 48 horas' },
  { icone: 'users', titulo: 'Chamar 10 clientes no WhatsApp', descricao: 'Use o roteiro sugerido para hoje' },
  { icone: 'campaigns', titulo: 'Publicar a campanha do dia', descricao: 'Stories + Status do WhatsApp' },
]

function texto(valor, limite) {
  return String(valor || '').trim().slice(0, limite)
}

function planoPadraoDoDia(chave) {
  const foco = FOCOS_PADRAO[chave] || FOCOS_PADRAO['1']
  return {
    foco_titulo: foco[0],
    foco_descricao: foco[1],
    orientacao: 'Depois dos contatos, registre quantas clientes responderam e quantas vendas foram recuperadas.',
    tarefas: TAREFAS_PADRAO.map((tarefa, indice) => ({
      id: `${chave}-${indice + 1}`,
      ...tarefa,
    })),
  }
}

export function criarPlanoDiarioPadrao() {
  return Object.fromEntries(DIAS_PLANO.map(dia => [dia.key, planoPadraoDoDia(dia.key)]))
}

export function normalizarPlanoDias(valor, { preencherPadrao = true } = {}) {
  const recebido = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  const base = preencherPadrao ? criarPlanoDiarioPadrao() : {}

  for (const dia of DIAS_PLANO) {
    const atual = recebido[dia.key]
    if (!atual || typeof atual !== 'object' || Array.isArray(atual)) continue

    const padrao = planoPadraoDoDia(dia.key)
    const tarefasRecebidas = Array.isArray(atual.tarefas) ? atual.tarefas.slice(0, 5) : []
    const tarefas = Array.from({ length: 5 }, (_, indice) => {
      const tarefa = tarefasRecebidas[indice] || {}
      const fallback = padrao.tarefas[indice]
      const icone = ICONES_PERMITIDOS.has(tarefa.icone) ? tarefa.icone : fallback.icone
      return {
        id: `${dia.key}-${indice + 1}`,
        icone,
        titulo: texto(tarefa.titulo, 100) || (preencherPadrao ? fallback.titulo : ''),
        descricao: texto(tarefa.descricao, 160) || (preencherPadrao ? fallback.descricao : ''),
      }
    })

    base[dia.key] = {
      foco_titulo: texto(atual.foco_titulo, 120) || (preencherPadrao ? padrao.foco_titulo : ''),
      foco_descricao: texto(atual.foco_descricao, 280) || (preencherPadrao ? padrao.foco_descricao : ''),
      orientacao: texto(atual.orientacao, 280) || (preencherPadrao ? padrao.orientacao : ''),
      tarefas,
    }
  }

  return base
}

export function planoDoDia(valor, data = new Date()) {
  const chave = String(data.getDay())
  return normalizarPlanoDias(valor)[chave] || planoPadraoDoDia(chave)
}
