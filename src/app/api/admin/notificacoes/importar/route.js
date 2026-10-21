import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CanvasFactory } from 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { extractNotificationCandidates } from '@/lib/notificationImport'

export const runtime = 'nodejs'
export const maxDuration = 60

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'docx']

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function authorize(request, supabase) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL
}

function response(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function extensionOf(file) {
  return String(file?.name || '').split('.').pop()?.toLowerCase() || ''
}

async function extractText(file, extension) {
  const buffer = Buffer.from(await file.arrayBuffer())
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  const parser = new PDFParse({ data: buffer, CanvasFactory })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await authorize(request, supabase)) return response({ error: 'Não autorizado.' }, 403)

  try {
    const form = await request.formData()
    const file = form.get('arquivo')
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new Error('Escolha um arquivo PDF ou Word.')
    if (file.size > MAX_FILE_SIZE) throw new Error('O arquivo deve ter no máximo 10 MB.')

    const extension = extensionOf(file)
    if (extension === 'doc') throw new Error('Este Word está no formato antigo .doc. Salve como .docx ou PDF e tente novamente.')
    if (!ALLOWED_EXTENSIONS.includes(extension)) throw new Error('Envie um arquivo PDF ou Word no formato .docx.')

    const text = String(await extractText(file, extension)).trim()
    if (text.length < 3) throw new Error('Não consegui encontrar texto nesse arquivo. Se for um PDF escaneado, exporte-o novamente com texto selecionável.')

    const candidates = extractNotificationCandidates(text)
    if (!candidates.length) throw new Error('Nenhuma mensagem foi encontrada no arquivo.')

    return response({
      filename: String(file.name).slice(0, 180),
      candidates,
      total: candidates.length,
      valid: candidates.filter(item => item.valid).length,
    })
  } catch (error) {
    return response({ error: error.message || 'Não foi possível ler o arquivo.' }, 400)
  }
}
