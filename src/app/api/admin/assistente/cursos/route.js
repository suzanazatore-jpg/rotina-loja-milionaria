import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { syncCourseKnowledge } from '@/lib/assistantCourseKnowledgeServer'

export const runtime = 'nodejs'
export const maxDuration = 60

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

async function authorize(request, supabase) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) return false
  const { data, error } = await supabase.auth.getClaims(header.slice(7).trim())
  return !error && data?.claims?.email === ADMIN_EMAIL
}

export async function GET(request) {
  const supabase = serverClient()
  if (!await authorize(request, supabase)) return response({ error: 'Não autorizado.' }, 403)
  const [coursesResult, chunksResult] = await Promise.all([
    supabase.from('courses').select('id,title').eq('is_published', true).order('sort_order'),
    supabase.from('assistant_course_knowledge_chunks').select('course_id'),
  ])
  if (coursesResult.error || chunksResult.error) return response({ error: 'Não foi possível consultar as aulas.' }, 500)
  const counts = {}
  for (const row of chunksResult.data || []) counts[row.course_id] = (counts[row.course_id] || 0) + 1
  return response({ courses: (coursesResult.data || []).map(course => ({ ...course, chunks: counts[course.id] || 0 })) })
}

export async function POST(request) {
  const supabase = serverClient()
  if (!await authorize(request, supabase)) return response({ error: 'Não autorizado.' }, 403)
  try {
    const { course_id: courseId } = await request.json()
    if (!/^[0-9a-f-]{36}$/i.test(courseId || '')) return response({ error: 'Curso inválido.' }, 400)
    return response(await syncCourseKnowledge(supabase, courseId))
  } catch (error) {
    return response({ error: error.message || 'Não foi possível preparar as aulas e PDFs.' }, 500)
  }
}
