import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { normalizarPlanoCampanha } from './campaignPlan.js'

export function secoesCampanha(item) {
  const plano = normalizarPlanoCampanha(item.plano_interativo, { preencherPadrao: false })
  return [
    ...plano.fases.map(fase => ({
      titulo: [fase.periodo, fase.titulo].filter(Boolean).join(' — '),
      textos: [fase.descricao, ...fase.etapas.flatMap((etapa, i) => [`${i + 1}. ${etapa.titulo}`, etapa.descricao]), fase.orientacao && `Orientação da Suzana: ${fase.orientacao}`].filter(Boolean),
    })),
    ...(plano.orientacao ? [{ titulo: 'Orientação geral da Suzana', textos: [plano.orientacao] }] : []),
  ]
}

export function secoesCalendario(acoes) {
  return [...acoes].sort((a, b) => a.action_date.localeCompare(b.action_date) || (a.sort_order || 0) - (b.sort_order || 0)).map(acao => ({
    titulo: `${acao.action_date.split('-').reverse().join('/')} — ${acao.title}`,
    textos: [
      [acao.channel, acao.content_format].filter(Boolean).join(' • '),
      acao.description,
      acao.product_cta && `Produto e chamada: ${acao.product_cta}`,
      acao.content_text,
      acao.material_url && `Material: ${acao.material_url}`,
    ].filter(Boolean),
  }))
}

export async function criarPdfMensal({ titulo, descricao, mes, secoes }) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const caracteres = new Set(regular.getCharacterSet())
  const limpar = valor => [...String(valor || '').normalize('NFC').replace(/[\u2010-\u2015]/g, '-').replace(/\t/g, ' ')].filter(c => c === '\n' || caracteres.has(c.codePointAt(0))).join('')
  const largura = 595.28, altura = 841.89, margem = 44
  const ouro = rgb(.56, .42, .12), preto = rgb(.12, .12, .12)
  let pagina, y
  const novaPagina = () => {
    pagina = doc.addPage([largura, altura])
    pagina.drawText('SUZANA ZATORRE | ROTINA DA LOJA MILIONÁRIA', { x: margem, y: altura - 36, font: bold, size: 9, color: ouro })
    pagina.drawLine({ start: { x: margem, y: altura - 47 }, end: { x: largura - margem, y: altura - 47 }, color: ouro, thickness: 1 })
    y = altura - 75
  }
  function texto(valor, fonte = regular, size = 10.5, color = preto) {
    if (!valor) return
    for (const paragrafo of limpar(valor).split('\n')) {
      let linha = ''
      const escrever = () => {
        if (y < 65) novaPagina()
        pagina.drawText(linha.trimEnd(), { x: margem, y, font: fonte, size, color })
        y -= size * 1.5
        linha = ''
      }
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        if (linha && fonte.widthOfTextAtSize(linha + palavra, size) > largura - 2 * margem) escrever()
        for (const letra of palavra) {
          if (fonte.widthOfTextAtSize(linha + letra, size) > largura - 2 * margem) escrever()
          linha += letra
        }
        linha += ' '
      }
      escrever()
    }
    y -= 6
  }
  doc.setTitle(limpar(titulo))
  doc.setAuthor('Suzana Zatorre')
  novaPagina()
  texto(titulo, bold, 21)
  texto(descricao)
  for (const secao of secoes) {
    if (y < 135) novaPagina()
    y -= 10
    texto(secao.titulo, bold, 13, ouro)
    for (const valor of secao.textos) texto(valor)
  }
  const paginas = doc.getPages()
  paginas.forEach((page, i) => {
    page.drawText(mes, { x: margem, y: 31, font: regular, size: 8 })
    page.drawText(`${i + 1} / ${paginas.length}`, { x: largura - margem - 34, y: 31, font: regular, size: 8 })
  })
  return doc.save()
}
