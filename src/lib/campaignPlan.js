export const ICONES_CAMPANHA = ['content', 'goals', 'campaigns', 'users', 'routine', 'comments', 'assistant']

const ICONES = new Set(ICONES_CAMPANHA)

function texto(valor, limite) {
  return String(valor || '').trim().slice(0, limite)
}

function idSeguro(valor, fallback) {
  const limpo = String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return limpo || fallback
}

function normalizarEtapa(etapa, faseIndex, etapaIndex) {
  const fallback = `fase-${faseIndex + 1}-acao-${etapaIndex + 1}`
  return {
    id: idSeguro(etapa?.id, fallback),
    icone: ICONES.has(etapa?.icone) ? etapa.icone : 'campaigns',
    titulo: texto(etapa?.titulo, 120),
    descricao: texto(etapa?.descricao, 320),
  }
}

function normalizarFase(fase, indice) {
  const id = idSeguro(fase?.id, `fase-${indice + 1}`)
  const etapas = (Array.isArray(fase?.etapas) ? fase.etapas : [])
    .slice(0, 30)
    .map((etapa, etapaIndex) => normalizarEtapa(etapa, indice, etapaIndex))
    .filter(etapa => etapa.titulo)

  return {
    id,
    titulo: texto(fase?.titulo, 120) || `Fase ${indice + 1}`,
    periodo: texto(fase?.periodo, 80),
    descricao: texto(fase?.descricao, 360),
    orientacao: texto(fase?.orientacao, 360),
    etapas,
  }
}

function planoVazio() {
  return {
    versao: 2,
    objetivo: '',
    orientacao: '',
    fases: [],
    etapas: [],
  }
}

export function criarPlanoCampanhaPadrao() {
  return {
    versao: 2,
    objetivo: '',
    orientacao: '',
    fases: [{
      id: 'fase-1',
      titulo: 'Primeira fase',
      periodo: '',
      descricao: '',
      orientacao: '',
      etapas: [{
        id: 'fase-1-acao-1',
        icone: 'campaigns',
        titulo: '',
        descricao: '',
      }],
    }],
  }
}

export function normalizarPlanoCampanha(valor, { preencherPadrao = true } = {}) {
  const recebido = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}

  let fases = []
  if (Array.isArray(recebido.fases) && recebido.fases.length) {
    fases = recebido.fases
      .slice(0, 12)
      .map(normalizarFase)
      .filter(fase => fase.titulo || fase.etapas.length)
  } else if (Array.isArray(recebido.etapas) && recebido.etapas.length) {
    const etapasLegadas = recebido.etapas
      .slice(0, 60)
      .map((etapa, indice) => ({
        id: idSeguro(etapa?.id, `acao-${indice + 1}`),
        icone: ICONES.has(etapa?.icone) ? etapa.icone : 'campaigns',
        titulo: texto(etapa?.titulo, 120),
        descricao: texto(etapa?.descricao, 320),
      }))
      .filter(etapa => etapa.titulo)

    if (etapasLegadas.length) {
      fases = [{
        id: 'jornada-campanha',
        titulo: 'Jornada da campanha',
        periodo: '',
        descricao: '',
        orientacao: '',
        etapas: etapasLegadas,
      }]
    }
  }

  if (!fases.length && preencherPadrao) {
    fases = criarPlanoCampanhaPadrao().fases
  }

  const objetivo = texto(recebido.objetivo, 420)
  const orientacao = texto(recebido.orientacao, 420)
  const etapas = fases.flatMap(fase => fase.etapas.map(etapa => ({ ...etapa, fase_id: fase.id })))

  return {
    ...planoVazio(),
    versao: 2,
    objetivo,
    orientacao,
    fases,
    etapas,
  }
}
