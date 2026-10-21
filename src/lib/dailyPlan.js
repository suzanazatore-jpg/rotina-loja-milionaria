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
  { icone: 'goals', titulo: 'Conferir a meta do dia', descricao: 'Meta diária: {meta_diaria}' },
  { icone: 'users', titulo: 'Executar atendimento ativo', descricao: 'Aborde, sonde e conduza cada cliente para o próximo passo' },
  { icone: 'comments', titulo: 'Movimentar o WhatsApp', descricao: 'Responda as conversas e faça os contatos planejados' },
  { icone: 'routine', titulo: 'Fazer pós-venda', descricao: 'Retome clientes recentes e fortaleça o relacionamento' },
  { icone: 'routine', titulo: 'Recuperar oportunidades', descricao: 'Volte aos orçamentos e atendimentos que não fecharam' },
  { icone: 'users', titulo: 'Prospectar novas clientes', descricao: 'Gere novos contatos para abastecer a carteira da loja' },
  { icone: 'campaigns', titulo: 'Oferecer produtos adicionais', descricao: 'Aumente o valor da venda com combinações úteis' },
]

function texto(valor, limite) {
  return String(valor || '').trim().slice(0, limite)
}

function normalizarTarefa(tarefa, id, fallback = {}) {
  const recebida = tarefa && typeof tarefa === 'object' ? tarefa : {}
  return {
    id: texto(recebida.id, 80) || id,
    icone: ICONES_PERMITIDOS.has(recebida.icone) ? recebida.icone : (fallback.icone || 'routine'),
    titulo: texto(recebida.titulo, 120) || fallback.titulo || '',
    descricao: texto(recebida.descricao, 220) || fallback.descricao || '',
  }
}

function normalizarLista(lista, prefixo, limite = 20) {
  if (!Array.isArray(lista)) return []
  return lista.slice(0, limite).map((tarefa, indice) => normalizarTarefa(tarefa, `${prefixo}-${indice + 1}`)).filter(tarefa => tarefa.titulo)
}

export function modeloDaRotina(valor) {
  const recebido = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  const modelo = recebido._modelo
  if (!modelo || typeof modelo !== 'object' || Number(modelo.versao || 0) < 2) return null
  const diasAtivos = Array.isArray(modelo.dias_ativos)
    ? modelo.dias_ativos.map(String).filter(chave => DIAS_PLANO.some(dia => dia.key === chave))
    : ['1', '2', '3', '4', '5']
  return {
    versao: 2,
    mes_ano: /^\d{4}-\d{2}$/.test(String(modelo.mes_ano || '')) ? modelo.mes_ano : '',
    dias_ativos: diasAtivos.length ? [...new Set(diasAtivos)] : ['1', '2', '3', '4', '5'],
    tarefas_diarias: normalizarLista(modelo.tarefas_diarias, 'diaria', 20),
    padrao_atendimento: normalizarLista(modelo.padrao_atendimento, 'atendimento', 20),
    tarefas_semanais: normalizarLista(modelo.tarefas_semanais, 'semanal', 12).map((tarefa, indice) => ({
      ...tarefa,
      dia: DIAS_PLANO.some(dia => dia.key === String(modelo.tarefas_semanais?.[indice]?.dia)) ? String(modelo.tarefas_semanais[indice].dia) : '1',
    })),
  }
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
  const modelo = modeloDaRotina(recebido)
  const base = preencherPadrao ? criarPlanoDiarioPadrao() : {}

  if (modelo) base._modelo = modelo

  for (const dia of DIAS_PLANO) {
    const atual = recebido[dia.key]
    if (!atual || typeof atual !== 'object' || Array.isArray(atual)) continue

    const padrao = planoPadraoDoDia(dia.key)
    const tarefasRecebidas = Array.isArray(atual.tarefas) ? atual.tarefas.slice(0, modelo ? 20 : 7) : []
    const quantidade = modelo ? tarefasRecebidas.length : 7
    const tarefas = Array.from({ length: quantidade }, (_, indice) => {
      const tarefa = tarefasRecebidas[indice] || {}
      const fallback = padrao.tarefas[indice] || {}
      return normalizarTarefa(tarefa, `${dia.key}-${indice + 1}`, preencherPadrao && !modelo ? fallback : {})
    })

    const destaqueRecebido = atual.destaque && typeof atual.destaque === 'object' ? atual.destaque : null
    const destaque = destaqueRecebido && texto(destaqueRecebido.titulo, 120) ? {
      id: texto(destaqueRecebido.id, 80) || `especial-${dia.key}`,
      icone: ICONES_PERMITIDOS.has(destaqueRecebido.icone) ? destaqueRecebido.icone : 'campaigns',
      titulo: texto(destaqueRecebido.titulo, 120),
      descricao: texto(destaqueRecebido.descricao, 320),
    } : null

    base[dia.key] = {
      foco_titulo: texto(atual.foco_titulo, 120) || (preencherPadrao && !modelo ? padrao.foco_titulo : ''),
      foco_descricao: texto(atual.foco_descricao, 280) || (preencherPadrao && !modelo ? padrao.foco_descricao : ''),
      orientacao: texto(atual.orientacao, 280) || (preencherPadrao && !modelo ? padrao.orientacao : ''),
      tarefas,
      destaque,
    }
  }

  return base
}

export function planoDoDia(valor, data = new Date()) {
  const chave = String(data.getDay())
  const plano = normalizarPlanoDias(valor)
  const dia = plano[chave] || planoPadraoDoDia(chave)
  const modelo = plano._modelo
  if (!modelo) return dia
  return {
    ...dia,
    tarefas: [
      ...modelo.tarefas_diarias,
      ...modelo.tarefas_semanais.filter(tarefa => tarefa.dia === chave),
      ...(dia.tarefas || []),
      ...(dia.destaque ? [dia.destaque] : []),
    ],
  }
}
