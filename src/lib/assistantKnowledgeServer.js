const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

export function splitKnowledgeText(rawText, maxLength = 1800, overlap = 180) {
  const normalized = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return []
  const paragraphs = normalized.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const chunks = []
  let current = ''

  function pushCurrent() {
    const value = current.trim()
    if (value.length >= 3) chunks.push(value)
    current = value.slice(Math.max(0, value.length - overlap))
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      if (current.trim()) pushCurrent()
      let start = 0
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + maxLength)
        chunks.push(paragraph.slice(start, end).trim())
        if (end === paragraph.length) break
        start = Math.max(start + 1, end - overlap)
      }
      current = ''
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > maxLength && current) pushCurrent()
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.filter((item, index) => item.length >= 3 && item !== chunks[index - 1]).slice(0, 200)
}

export async function createEmbeddings(texts) {
  if (!process.env.OPENAI_API_KEY) throw new Error('A chave da OpenAI ainda não está configurada na Vercel.')
  if (!Array.isArray(texts) || !texts.length) return []

  const embeddings = []
  for (let start = 0; start < texts.length; start += 50) {
    const input = texts.slice(start, start + 50)
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input, encoding_format: 'float', dimensions: 1536 }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Não foi possível preparar o conteúdo para a Assistente.')
    const ordered = [...(data.data || [])].sort((a, b) => a.index - b.index)
    embeddings.push(...ordered.map(item => item.embedding))
  }

  if (embeddings.length !== texts.length || embeddings.some(item => item.length !== 1536)) {
    throw new Error('A preparação inteligente do conteúdo ficou incompleta. Tente novamente.')
  }
  return embeddings
}

export function allowedKnowledgeCategories(contents) {
  const allowed = new Set(['general', 'app', 'sales', 'whatsapp', 'instagram', 'team'])
  for (const key of ['routine', 'campaigns', 'calendar', 'team_goals', 'pricing']) {
    if (contents.includes(key)) allowed.add(key)
  }
  return [...allowed]
}
