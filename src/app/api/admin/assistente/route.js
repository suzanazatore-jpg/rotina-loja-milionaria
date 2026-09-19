import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CanvasFactory } from 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { ASSISTANT_KNOWLEDGE_CATEGORY_KEYS } from '@/lib/assistantKnowledge'
import { createEmbeddings, splitKnowledgeText } from '@/lib/assistantKnowledgeServer'

export const runtime = 'nodejs'
export const maxDuration = 60

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'assistant-knowledge'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 300000
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt'])

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function privateJson(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

async function authorize(request, supabase) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  const { data, error } = await supabase.auth.getClaims(token)
  const claims = data?.claims
  return !error && claims?.email === ADMIN_EMAIL ? { id: claims.sub, email: claims.email } : null
}

function extensionOf(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || ''
}

function safeFileName(value) {
  return String(value || 'material')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120)
}

async function extractFileText(file, extension) {
  const buffer = Buffer.from(await file.arrayBuffer())
  if (extension === 'txt') return buffer.toString('utf8')
  if (extension === 'docx') return (await mammoth.extractRawText({ buffer })).value

  const parser = new PDFParse({ data: buffer, CanvasFactory })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

function validCategory(value) {
  const category = String(value || '')
  if (!ASSISTANT_KNOWLEDGE_CATEGORY_KEYS.has(category)) throw new Error('Escolha uma categoria válida.')
  return category
}

export async function GET(request) {
  const supabase = serverClient()
  if (!await authorize(request, supabase)) return privateJson({ error: 'Não autorizado.' }, 403)

  const [documentsResult, unansweredResult] = await Promise.all([
    supabase
      .from('assistant_knowledge_documents')
      .select('id,title,category,source_type,file_name,is_active,created_at,updated_at,assistant_knowledge_chunks(count)')
      .order('updated_at', { ascending: false }),
    supabase
      .from('assistant_chat_history')
      .select('id,question,created_at')
      .eq('used_knowledge', false)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (documentsResult.error) return privateJson({ error: documentsResult.error.message }, 500)
  if (unansweredResult.error) return privateJson({ error: unansweredResult.error.message }, 500)
  return privateJson({ documents: documentsResult.data || [], unanswered: unansweredResult.data || [] })
}

export async function POST(request) {
  const supabase = serverClient()
  const admin = await authorize(request, supabase)
  if (!admin) return privateJson({ error: 'Não autorizado.' }, 403)

  let uploadedPath = null
  let documentId = null
  try {
    const form = await request.formData()
    const file = form.get('file')
    const manualText = String(form.get('content') || '').trim()
    const category = validCategory(form.get('category'))
    const hasFile = file && typeof file.arrayBuffer === 'function' && file.size > 0

    if (!hasFile && !manualText) throw new Error('Envie um PDF ou Word, ou cole um texto.')
    if (hasFile && file.size > MAX_FILE_SIZE) throw new Error('O arquivo deve ter no máximo 10 MB.')

    let extension = 'manual'
    let sourceText = manualText
    let fileName = null
    if (hasFile) {
      extension = extensionOf(file.name)
      if (extension === 'doc') throw new Error('Este Word está no formato antigo .doc. Salve como .docx ou PDF.')
      if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Envie um arquivo PDF, Word .docx ou TXT.')
      fileName = String(file.name).slice(0, 180)
      sourceText = String(await extractFileText(file, extension)).trim()
    }

    sourceText = sourceText.replace(/\u0000/g, '').trim()
    if (sourceText.length < 3) throw new Error('Não encontrei texto suficiente nesse material.')
    if (sourceText.length > MAX_TEXT_LENGTH) throw new Error('O material é muito extenso. Divida-o em dois arquivos menores.')

    const title = String(form.get('title') || '').trim() || fileName?.replace(/\.[^.]+$/, '') || 'Material da Suzana'
    if (title.length > 180) throw new Error('O título deve ter no máximo 180 caracteres.')

    const chunks = splitKnowledgeText(sourceText)
    if (!chunks.length) throw new Error('Não consegui dividir o conteúdo para leitura da Assistente.')
    const embeddings = await createEmbeddings(chunks)

    if (hasFile) {
      uploadedPath = `documents/${crypto.randomUUID()}-${safeFileName(fileName)}`
      const upload = await supabase.storage.from(BUCKET).upload(uploadedPath, await file.arrayBuffer(), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (upload.error) throw new Error(`Não foi possível guardar o arquivo: ${upload.error.message}`)
    }

    const documentResult = await supabase
      .from('assistant_knowledge_documents')
      .insert({
        title,
        category,
        source_type: hasFile ? extension : 'manual',
        file_name: fileName,
        file_path: uploadedPath,
        content: sourceText,
        created_by: admin.id,
      })
      .select('id,title,category,source_type,file_name,is_active,created_at,updated_at')
      .single()
    if (documentResult.error) throw documentResult.error
    documentId = documentResult.data.id

    const chunkRows = chunks.map((content, index) => ({
      document_id: documentId,
      chunk_index: index,
      content,
      embedding: embeddings[index],
    }))
    const chunksResult = await supabase.from('assistant_knowledge_chunks').insert(chunkRows)
    if (chunksResult.error) throw chunksResult.error

    return privateJson({ document: { ...documentResult.data, assistant_knowledge_chunks: [{ count: chunks.length }] } }, 201)
  } catch (error) {
    if (documentId) await supabase.from('assistant_knowledge_documents').delete().eq('id', documentId)
    if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath])
    return privateJson({ error: error.message || 'Não foi possível preparar este material.' }, 400)
  }
}

export async function PATCH(request) {
  const supabase = serverClient()
  if (!await authorize(request, supabase)) return privateJson({ error: 'Não autorizado.' }, 403)

  try {
    const body = await request.json()
    if (!body.id) throw new Error('Material inválido.')
    const update = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) {
      update.title = String(body.title || '').trim()
      if (!update.title || update.title.length > 180) throw new Error('Informe um título válido.')
    }
    if (body.category !== undefined) update.category = validCategory(body.category)
    if (body.is_active !== undefined) update.is_active = body.is_active === true

    const { data, error } = await supabase
      .from('assistant_knowledge_documents')
      .update(update)
      .eq('id', body.id)
      .select('id,title,category,source_type,file_name,is_active,created_at,updated_at,assistant_knowledge_chunks(count)')
      .single()
    if (error) throw error
    return privateJson({ document: data })
  } catch (error) {
    return privateJson({ error: error.message || 'Não foi possível alterar o material.' }, 400)
  }
}

export async function DELETE(request) {
  const supabase = serverClient()
  if (!await authorize(request, supabase)) return privateJson({ error: 'Não autorizado.' }, 403)

  try {
    const { id } = await request.json()
    if (!id) throw new Error('Material inválido.')
    const { data: document } = await supabase
      .from('assistant_knowledge_documents')
      .select('file_path')
      .eq('id', id)
      .maybeSingle()
    const { error } = await supabase.from('assistant_knowledge_documents').delete().eq('id', id)
    if (error) throw error
    if (document?.file_path) await supabase.storage.from(BUCKET).remove([document.file_path])
    return privateJson({ success: true })
  } catch (error) {
    return privateJson({ error: error.message || 'Não foi possível excluir o material.' }, 400)
  }
}
