import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const A4 = [595.28, 841.89]
const MARGIN = 56
const FOOTER = 58
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

// Helvetica padrão só codifica WinAnsi; troca o resto por equivalentes seguros.
export function pdfSafe(text) {
  return String(text ?? '')
    .replace(/[‐-‒]/g, '-').replace(/−/g, '-').replace(/[   ]/g, ' ')
    .replace(/\t/g, '    ')
    .split('').filter(ch => ch === '\n' || (ch >= ' ' && ch <= '~') || (ch >= '¡' && ch <= 'ÿ') || WIN_ANSI_EXTRA.includes(ch)).join('')
}

function wrap(text, font, size, width) {
  const lines = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue }
      if (line) lines.push(line)
      // Palavra maior que a linha (hash, URL): quebra por caractere.
      let rest = word
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

/**
 * Gera o PDF do contrato com rodapé de autenticidade em todas as páginas
 * e página final de auditoria (assinantes + histórico de eventos).
 */
export async function buildContractPdf({ body, title, originalSha256, validationUrl, signature, events = [] }) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(pdfSafe(title)); pdf.setAuthor('Suzana Zatorre Educacional'); pdf.setCreator('Rotina da Loja Milionária — Contratos')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = A4[0] - MARGIN * 2
  let page, y
  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - MARGIN }
  const ensure = h => { if (y - h < MARGIN + FOOTER) newPage() }
  const write = (text, { font = regular, size = 10.5, gap = 4, color = rgb(0.1, 0.1, 0.1) } = {}) => {
    for (const line of wrap(pdfSafe(text), font, size, width)) {
      ensure(size + gap)
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color })
      y -= size + gap
    }
  }
  newPage()
  for (const raw of String(body).split('\n')) {
    if (raw.startsWith('# ')) { y -= 4; write(raw.slice(2), { font: bold, size: 14, gap: 6 }); y -= 6 }
    else if (raw.startsWith('## ')) { y -= 8; write(raw.slice(3), { font: bold, size: 11.5, gap: 5 }); y -= 2 }
    else write(raw.replace(/\*\*/g, ''), { size: 10.5, gap: 4.5 })
  }

  // Página de auditoria
  newPage()
  write('Página de assinaturas e auditoria', { font: bold, size: 14, gap: 8 })
  write(title, { size: 10 })
  y -= 10
  if (signature) {
    write('Assinante', { font: bold, size: 11.5 })
    write(`Nome: ${signature.name}`)
    write(`Documento: ${signature.document}`)
    write(`E-mail: ${signature.email || '-'}   Telefone: ${signature.phone || '-'}`)
    write(`Assinou em ${signature.signedAtText} pelo IP ${signature.ip || '-'}`)
    write(`Verificação: código de uso único enviado por ${signature.channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}`)
    write(`Navegador: ${signature.userAgent || '-'}`, { size: 8.5 })
    if (signature.png) {
      try {
        const image = await pdf.embedPng(Buffer.from(signature.png.replace(/^data:image\/png;base64,/, ''), 'base64'))
        const scale = Math.min(220 / image.width, 80 / image.height, 1)
        ensure(image.height * scale + 16)
        page.drawImage(image, { x: MARGIN, y: y - image.height * scale - 6, width: image.width * scale, height: image.height * scale })
        y -= image.height * scale + 10
        page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 240, y }, thickness: 0.6, color: rgb(0.4, 0.4, 0.4) })
        y -= 14
      } catch { /* Assinatura sem imagem válida continua registrada pelos dados acima. */ }
    }
    y -= 8
    write('Contratada', { font: bold, size: 11.5 })
    write('Suzana Zatorre Educacional — aceite registrado pela emissão automática do contrato no pedido.')
  }
  y -= 10
  write('Histórico do documento', { font: bold, size: 11.5 })
  for (const e of events) write(`${e.when} — ${e.label}${e.detail ? ` — ${e.detail}` : ''}`, { size: 9, gap: 3.5 })

  const pages = pdf.getPages()
  pages.forEach((p, index) => {
    const lines = [
      'Assinado com assinatura eletrônica (Lei 14.063/2020, art. 4º, e MP 2.200-2/2001, art. 10, § 2º).',
      `Hash SHA-256 do documento original: ${originalSha256}`,
      `Validação: ${validationUrl}   •   Página ${index + 1} de ${pages.length}`,
    ]
    p.drawLine({ start: { x: MARGIN, y: FOOTER + 4 }, end: { x: A4[0] - MARGIN, y: FOOTER + 4 }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) })
    lines.forEach((line, i) => p.drawText(pdfSafe(line), { x: MARGIN, y: FOOTER - 8 - i * 9.5, size: 7, font: regular, color: rgb(0.35, 0.35, 0.35) }))
  })
  return Buffer.from(await pdf.save())
}
