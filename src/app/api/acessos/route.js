import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const EVENT_TYPES = new Set(['app_open', 'section_open', 'course_open', 'lesson_open', 'material_open'])

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

async function authenticatedUser(request, supabase) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getClaims(authorization.slice(7).trim())
  return !error && data?.claims?.sub ? { id: data.claims.sub } : null
}

function clean(value, max) {
  const text = String(value || '').trim()
  return text ? text.slice(0, max) : null
}

export async function POST(request) {
  const supabase = serverClient()
  const user = await authenticatedUser(request, supabase)
  if (!user) return response({ error: 'Sessão não encontrada.' }, 401)

  try {
    const body = await request.json()
    if (!EVENT_TYPES.has(body.event_type)) return response({ error: 'Tipo de acesso inválido.' }, 400)

    const contentType = clean(body.content_type, 40) || 'app'
    const contentId = clean(body.content_id, 180)
    const contentTitle = clean(body.content_title, 240)
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {}
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    let duplicateQuery = supabase
      .from('app_content_access_events')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_type', body.event_type)
      .eq('content_type', contentType)
      .gte('created_at', since)
      .limit(1)
    duplicateQuery = contentId ? duplicateQuery.eq('content_id', contentId) : duplicateQuery.is('content_id', null)
    const { data: duplicate } = await duplicateQuery.maybeSingle()
    if (duplicate) return response({ success: true, duplicate: true })

    const { error } = await supabase.from('app_content_access_events').insert({
      user_id: user.id,
      event_type: body.event_type,
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle,
      metadata,
    })
    if (error) throw error
    return response({ success: true }, 201)
  } catch (error) {
    console.error('content_access_error', error)
    return response({ error: 'Não foi possível registrar o acesso.' }, 500)
  }
}
