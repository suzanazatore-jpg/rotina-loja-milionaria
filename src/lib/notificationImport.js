const LIST_MARKER = /^\s*(?:\d{1,3}[.)-]|[-–—•●▪◦])\s+/

function clean(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function unique(values) {
  const seen = new Set()
  return values.filter(value => {
    const key = value.toLocaleLowerCase('pt-BR')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractNotificationCandidates(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n').replace(/\f/g, '\n\n')
  const lines = text.split('\n').map(clean).filter(Boolean)
  const markedLines = lines.filter(line => LIST_MARKER.test(line)).length
  let phrases = []

  if (markedLines >= 2) {
    let current = ''
    for (const line of lines) {
      if (LIST_MARKER.test(line)) {
        if (current) phrases.push(current)
        current = clean(line.replace(LIST_MARKER, ''))
      } else if (current) {
        current = clean(`${current} ${line}`)
      }
    }
    if (current) phrases.push(current)
  } else {
    const paragraphs = text
      .split(/\n\s*\n+/)
      .map(paragraph => clean(paragraph.replace(/\n+/g, ' ')).replace(LIST_MARKER, '').trim())
      .filter(Boolean)
    phrases = paragraphs.length >= 2 ? paragraphs : lines.map(line => clean(line.replace(LIST_MARKER, '')))
  }

  return unique(phrases)
    .filter(phrase => phrase.length >= 3)
    .slice(0, 500)
    .map((textValue, index) => ({
      id: `import-${index + 1}`,
      text: textValue,
      selected: textValue.length <= 240,
      valid: textValue.length <= 240,
      reason: textValue.length > 240 ? 'Encurte para no máximo 240 caracteres.' : null,
    }))
}
