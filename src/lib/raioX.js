export const PERGUNTAS_RAIO_X = [
  {
    id: 'faturamento_faixa',
    titulo: 'Quanto sua loja fatura por mês?',
    apoio: 'Essa informação serve apenas para personalizar o diagnóstico.',
    opcoes: [
      ['ate-10', 'Até R$ 10 mil'],
      ['10-30', 'De R$ 10 mil a R$ 30 mil'],
      ['30-50', 'De R$ 30 mil a R$ 50 mil'],
      ['50-100', 'De R$ 50 mil a R$ 100 mil'],
      ['mais-100', 'Mais de R$ 100 mil'],
    ],
  },
  {
    id: 'numero_vendedoras',
    titulo: 'Quantas pessoas vendem na loja?',
    apoio: 'Inclua você, caso também participe diretamente das vendas.',
    opcoes: [['1', 'Somente eu'], ['2', '2 pessoas'], ['3-5', 'De 3 a 5 pessoas'], ['mais-5', 'Mais de 5 pessoas']],
  },
  {
    id: 'acompanhamento_meta',
    titulo: 'Como vocês acompanham a meta?',
    apoio: 'Pense no que realmente acontece na rotina da equipe.',
    opcoes: [['diaria', 'Todos os dias'], ['semanal', 'Uma vez por semana'], ['fim-mes', 'Só perto do fim do mês'], ['sem-meta', 'Não temos uma meta clara']],
  },
  {
    id: 'estoque_parado',
    titulo: 'Como está o estoque parado?',
    apoio: 'Considere peças com pouca saída ou há mais de 30 dias sem girar.',
    opcoes: [['baixo', 'Pouco estoque parado'], ['medio', 'Tem algumas peças preocupando'], ['alto', 'Tem muita mercadoria parada'], ['nao-sei', 'Não sei identificar']],
  },
  {
    id: 'autonomia_equipe',
    titulo: 'Sua equipe vende sem depender de você?',
    apoio: 'Marque a opção que mais representa o dia a dia da loja.',
    opcoes: [['autonoma', 'Sim, a equipe tem iniciativa'], ['oscila', 'Às vezes, mas oscila muito'], ['depende', 'Quase tudo depende de mim'], ['sem-equipe', 'Ainda não tenho equipe']],
  },
  {
    id: 'rotina_whatsapp',
    titulo: 'Como a loja usa o WhatsApp para vender?',
    apoio: 'Não vale contar apenas respostas para quem chama primeiro.',
    opcoes: [['diaria', 'Faz vendas ativas todos os dias'], ['alguns-dias', 'Usa alguns dias da semana'], ['responde', 'Só responde quem chama'], ['quase-nao', 'Quase não usa para vender']],
  },
  {
    id: 'frequencia_campanhas',
    titulo: 'Com que frequência vocês fazem campanhas?',
    apoio: 'Campanha é uma ação planejada com objetivo, produtos e prazo.',
    opcoes: [['mensal', 'Todo mês, com planejamento'], ['ocasional', 'Quando surge uma ideia'], ['datas', 'Somente em datas comemorativas'], ['nao-faz', 'Não fazemos campanhas']],
  },
  {
    id: 'maior_dificuldade',
    titulo: 'Qual é hoje o maior desafio da sua loja?',
    apoio: 'Seu plano de sete dias será montado a partir dessa resposta.',
    opcoes: [['vendas', 'Vender mais todos os dias'], ['equipe', 'Fazer a equipe ter iniciativa'], ['estoque', 'Girar o estoque parado'], ['gestao', 'Organizar metas e rotina']],
  },
]

const FATURAMENTO_REFERENCIA = {
  'ate-10': 8000,
  '10-30': 20000,
  '30-50': 40000,
  '50-100': 75000,
  'mais-100': 120000,
}

const PONTOS = {
  acompanhamento_meta: { diaria: 100, semanal: 70, 'fim-mes': 38, 'sem-meta': 15 },
  estoque_parado: { baixo: 90, medio: 62, alto: 25, 'nao-sei': 20 },
  autonomia_equipe: { autonoma: 95, oscila: 62, depende: 25, 'sem-equipe': 58 },
  rotina_whatsapp: { diaria: 100, 'alguns-dias': 70, responde: 38, 'quase-nao': 15 },
  frequencia_campanhas: { mensal: 100, ocasional: 62, datas: 42, 'nao-faz': 15 },
}

export const EIXOS_RAIO_X = {
  vendas: { nome: 'Vendas', descricao: 'ritmo comercial e aproveitamento de oportunidades' },
  equipe: { nome: 'Equipe', descricao: 'autonomia, iniciativa e execução diária' },
  estoque: { nome: 'Estoque', descricao: 'giro, leitura e ativação dos produtos' },
  gestao: { nome: 'Gestão', descricao: 'metas, campanhas e consistência da rotina' },
}

const PLANOS = {
  vendas: [
    ['Dia 1', 'Liste 20 oportunidades abertas', 'Separe clientes que pediram preço, receberam opções ou pararam de responder.'],
    ['Dia 2', 'Retome os 10 contatos mais quentes', 'Use o nome da cliente e uma pergunta que facilite a decisão.'],
    ['Dia 3', 'Faça uma oferta com contexto', 'Apresente uma combinação, benefício ou condição com prazo verdadeiro.'],
    ['Dia 4', 'Prospete 10 novas clientes', 'Inicie conversas ativas no WhatsApp sem depender apenas de quem chama.'],
    ['Dia 5', 'Convide para visitar ou experimentar', 'Dê um próximo passo simples e claro para cada cliente interessada.'],
    ['Dia 6', 'Feche as melhores oportunidades', 'Retome indecisas e conduza para reservar, pagar ou visitar.'],
    ['Dia 7', 'Meça e repita o que funcionou', 'Registre contatos, respostas e vendas recuperadas.'],
  ],
  equipe: [
    ['Dia 1', 'Alinhe a meta com a equipe', 'Mostre quanto falta e transforme o número em uma meta diária.'],
    ['Dia 2', 'Defina três tarefas inegociáveis', 'Atendimento rápido, contato registrado e fechamento do dia.'],
    ['Dia 3', 'Crie um desafio de contatos', 'Cada vendedora chama 10 clientes e registra o resultado.'],
    ['Dia 4', 'Treine uma situação real', 'Pratique abordagem, objeção e condução para o fechamento.'],
    ['Dia 5', 'Acompanhe sem fazer pela equipe', 'Faça perguntas, corrija e cobre o combinado.'],
    ['Dia 6', 'Reconheça execução e resultado', 'Valorize quem cumpriu a rotina e gerou oportunidades.'],
    ['Dia 7', 'Revise o placar da semana', 'Compare meta, ações executadas e pontos que precisam de ajuste.'],
  ],
  estoque: [
    ['Dia 1', 'Separe os produtos parados', 'Liste peças com mais de 30 dias ou baixa saída.'],
    ['Dia 2', 'Escolha 10 produtos protagonistas', 'Priorize margem, quantidade e potencial de combinação.'],
    ['Dia 3', 'Monte combinações prontas', 'Crie looks, kits ou soluções que aumentem o valor percebido.'],
    ['Dia 4', 'Produza demonstrações reais', 'Mostre caimento, uso e detalhes nos Stories e no Status.'],
    ['Dia 5', 'Ative clientes com perfil certo', 'Envie os produtos para quem já compra aquele estilo.'],
    ['Dia 6', 'Faça uma ação com prazo', 'Use bônus, combo ou condição planejada sem destruir a margem.'],
    ['Dia 7', 'Confira o giro conquistado', 'Registre o que vendeu e mantenha em destaque o que respondeu bem.'],
  ],
  gestao: [
    ['Dia 1', 'Defina a meta mensal', 'Transforme o objetivo do mês em meta semanal e diária.'],
    ['Dia 2', 'Monte o placar da equipe', 'Deixe vendido, falta e ritmo visíveis para todas.'],
    ['Dia 3', 'Organize a carteira de clientes', 'Distribua contatos e defina quando cada pessoa será retomada.'],
    ['Dia 4', 'Planeje a campanha principal', 'Escolha objetivo, produtos, comunicação e prazo.'],
    ['Dia 5', 'Crie o checklist diário', 'Defina as cinco ações que não podem depender da memória.'],
    ['Dia 6', 'Registre vendas e atividades', 'Use números reais para corrigir o rumo ainda durante a semana.'],
    ['Dia 7', 'Faça uma revisão de 20 minutos', 'Veja o que funcionou, o que travou e a prioridade da próxima semana.'],
  ],
}

const valor = (grupo, resposta) => PONTOS[grupo]?.[resposta] ?? 50
const media = (...numeros) => Math.round(numeros.reduce((soma, numero) => soma + numero, 0) / numeros.length)

export function calcularRaioX(respostas = {}) {
  const meta = valor('acompanhamento_meta', respostas.acompanhamento_meta)
  const estoque = valor('estoque_parado', respostas.estoque_parado)
  const equipe = valor('autonomia_equipe', respostas.autonomia_equipe)
  const whatsapp = valor('rotina_whatsapp', respostas.rotina_whatsapp)
  const campanhas = valor('frequencia_campanhas', respostas.frequencia_campanhas)
  const pontuacoes = {
    vendas: media(meta, whatsapp, campanhas),
    equipe,
    estoque,
    gestao: media(meta, campanhas, equipe),
  }

  const menorPontuacao = Math.min(...Object.values(pontuacoes))
  const candidatos = Object.keys(pontuacoes).filter(eixo => pontuacoes[eixo] === menorPontuacao)
  const gargalo = candidatos.includes(respostas.maior_dificuldade) ? respostas.maior_dificuldade : candidatos[0]
  const faturamento = FATURAMENTO_REFERENCIA[respostas.faturamento_faixa] || 20000
  const fatorPerda = Math.min(.28, Math.max(.08, (100 - menorPontuacao) / 300))
  const perdaEstimada = Math.round(faturamento * fatorPerda / 50) * 50

  return {
    pontuacoes,
    gargalo,
    perdaEstimada,
    plano: PLANOS[gargalo],
  }
}

export function respostasValidas(respostas = {}) {
  return PERGUNTAS_RAIO_X.every(pergunta => pergunta.opcoes.some(([id]) => id === respostas[pergunta.id]))
}

