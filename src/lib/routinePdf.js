import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { DIAS_PLANO, modeloDaRotina, normalizarPlanoDias } from './dailyPlan.js'

export function mesDaRotina(item) {
  return modeloDaRotina(item?.plano_dias)?.mes_ano || String(item?.semana_publicacao || item?.semana_inicio || '').slice(0, 7)
}

export function rotuloMesRotina(mes) {
  const [ano, numero] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(ano, numero - 1, 1)))
}

export function selecionarRotinasDoMes(itens, mes) {
  return itens.filter(item => mesDaRotina(item) === mes).sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
}

// Semanas importadas compartilham o mesmo plano. Imprima-o uma vez, mas
// preserve todas as versões quando uma semana tiver sido editada.
export function agruparPlanosRotina(itens) {
  const grupos = new Map()
  for (const item of itens) {
    const plano = normalizarPlanoDias(item.plano_dias, { preencherPadrao: false })
    const chave = JSON.stringify([item.titulo, item.descricao, plano])
    if (!grupos.has(chave)) grupos.set(chave, { item, plano, semanas: [] })
    grupos.get(chave).semanas.push(item.semana_inicio)
  }
  return [...grupos.values()]
}

export async function criarPdfRotina(itens, mes) {
  if (!itens.length) throw new Error('Nenhuma rotina disponível para este mês.')
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold)
  const caracteres = new Set(regular.getCharacterSet())
  const limpar = valor => [...String(valor || '').normalize('NFC').replace(/\{meta_diaria\}/g, 'consulte sua meta de hoje').replace(/[\u2010-\u2015]/g, '-').replace(/\t/g, ' ')].filter(c => c === '\n' || caracteres.has(c.codePointAt(0))).join('')
  const largura = 595.28, altura = 841.89, margem = 44
  const preto = rgb(.12, .12, .12), cinza = rgb(.37, .37, .37), ouro = rgb(.56, .42, .12)
  const mesRotulo = rotuloMesRotina(mes)
  doc.setTitle(`Rotina de ${mesRotulo}`)
  doc.setAuthor('Suzana Zatorre')
  let pagina, y

  function novaPagina() {
    pagina = doc.addPage([largura, altura])
    pagina.drawText('SUZANA ZATORRE | ROTINA DA LOJA MILIONÁRIA', { x: margem, y: altura - 36, font: negrito, size: 9, color: ouro })
    pagina.drawLine({ start: { x: margem, y: altura - 47 }, end: { x: largura - margem, y: altura - 47 }, color: ouro, thickness: 1 })
    y = altura - 73
  }
  function espaco(necessario) { if (y - necessario < 60) novaPagina() }
  function linhas(texto, fonte, tamanho, maximo) {
    const resultado = []
    for (const paragrafo of limpar(texto).split('\n')) {
      let linha = ''
      // Também divide palavras/URLs longas para não ultrapassar a margem.
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        if (linha && fonte.widthOfTextAtSize(linha + palavra, tamanho) > maximo) { resultado.push(linha.trimEnd()); linha = '' }
        for (const letra of palavra) {
          if (fonte.widthOfTextAtSize(linha + letra, tamanho) > maximo) { resultado.push(linha); linha = '' }
          linha += letra
        }
        linha += ' '
      }
      resultado.push(linha.trimEnd())
    }
    return resultado
  }
  function texto(valor, { tamanho = 10.5, fonte = regular, cor = preto, recuo = 0 } = {}) {
    if (!valor) return
    for (const linha of linhas(valor, fonte, tamanho, largura - margem * 2 - recuo)) {
      espaco(tamanho * 1.45)
      pagina.drawText(linha, { x: margem + recuo, y, font: fonte, size: tamanho, color: cor })
      y -= tamanho * 1.45
    }
    y -= 5
  }
  function secao(titulo) {
    espaco(66)
    y -= 11
    texto(titulo, { tamanho: 13, fonte: negrito, cor: ouro })
  }
  function alturaTexto(valor, tamanho = 10.5, fonte = regular, recuo = 0) {
    return valor ? linhas(valor, fonte, tamanho, largura - margem * 2 - recuo).length * tamanho * 1.45 + 5 : 0
  }
  function alturaTarefas(lista) {
    return (lista || []).filter(t => t.titulo).reduce((total, tarefa) => total + alturaTexto(tarefa.titulo, 10.5, negrito, 17) + alturaTexto(tarefa.descricao, 10, regular, 17) + 3, 0)
  }
  function tarefas(lista, checkbox = true) {
    for (const tarefa of lista || []) {
      if (!tarefa.titulo) continue
      espaco(Math.max(48, alturaTexto(tarefa.titulo, 10.5, negrito, 17) + alturaTexto(tarefa.descricao, 10, regular, 17)))
      if (checkbox) pagina.drawRectangle({ x: margem, y: y - 1, width: 8, height: 8, borderColor: cinza, borderWidth: .6 })
      texto(tarefa.titulo, { fonte: negrito, recuo: checkbox ? 17 : 0 })
      texto(tarefa.descricao, { cor: cinza, tamanho: 10, recuo: checkbox ? 17 : 0 })
      y -= 3
    }
  }

  const grupos = agruparPlanosRotina(itens)
  for (const [indice, grupo] of grupos.entries()) {
    novaPagina()
    texto(`Rotina de ${mesRotulo}`, { tamanho: 22, fonte: negrito })
    texto(grupo.item.titulo, { tamanho: 14, fonte: negrito })
    texto(grupo.item.descricao, { cor: cinza })
    if (grupos.length > 1) texto(`Plano ${indice + 1} de ${grupos.length}`, { fonte: negrito })
    texto(`Semanas com início em: ${grupo.semanas.map(data => data.split('-').reverse().join('/')).join(', ')}`, { tamanho: 9, cor: cinza })
    const modelo = modeloDaRotina(grupo.plano)
    if (modelo?.tarefas_diarias.length) { secao('Todos os dias'); tarefas(modelo.tarefas_diarias) }
    if (modelo?.padrao_atendimento.length) { secao('A cada atendimento'); tarefas(modelo.padrao_atendimento, false) }
    for (const dia of DIAS_PLANO) {
      if (modelo && !modelo.dias_ativos.includes(dia.key)) continue
      const plano = grupo.plano[dia.key]
      const semanais = modelo?.tarefas_semanais.filter(tarefa => tarefa.dia === dia.key) || []
      if (!plano && !semanais.length) continue
      const alturaDia = 40 + alturaTexto(plano?.foco_titulo, 12, negrito) + alturaTexto(plano?.foco_descricao) + alturaTarefas(semanais) + (semanais.length ? 25 : 0) + alturaTarefas(plano?.tarefas) + (plano?.destaque ? 25 + alturaTarefas([plano.destaque]) : 0) + (plano?.orientacao ? 25 + alturaTexto(plano.orientacao) : 0)
      // Mantém um dia completo na mesma página sempre que ele cabe nela.
      espaco(Math.min(alturaDia, altura - 140))
      secao(dia.nome)
      texto(plano?.foco_titulo, { fonte: negrito, tamanho: 12 })
      texto(plano?.foco_descricao, { cor: cinza })
      if (semanais.length) { texto('Ação da semana', { fonte: negrito }); tarefas(semanais) }
      tarefas(plano?.tarefas)
      if (plano?.destaque) { texto('Missão especial da Suzana', { fonte: negrito }); tarefas([plano.destaque]) }
      if (plano?.orientacao) { texto('Orientação da Suzana', { fonte: negrito }); texto(plano.orientacao, { cor: cinza }) }
    }
  }
  const paginas = doc.getPages()
  for (const [indice, atual] of paginas.entries()) {
    atual.drawText(limpar(mesRotulo), { x: margem, y: 31, size: 8, font: regular, color: cinza })
    atual.drawText(`${indice + 1} / ${paginas.length}`, { x: largura - margem - 34, y: 31, size: 8, font: regular, color: cinza })
  }
  return doc.save()
}
