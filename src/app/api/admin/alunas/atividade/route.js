import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function GET(request) {
  const supabase = serverClient()
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return response({ error: 'Não autorizado.' }, 401)
  const { data, error } = await supabase.auth.getClaims(authorization.slice(7).trim())
  if (error || data?.claims?.email !== ADMIN_EMAIL) return response({ error: 'Não autorizado.' }, 403)

  const userId = new URL(request.url).searchParams.get('user_id')
  if (!/^[0-9a-f-]{36}$/i.test(userId || '')) return response({ error: 'Aluna inválida.' }, 400)

  const result = await supabase
    .from('app_content_access_events')
    .select('id,event_type,content_type,content_id,content_title,metadata,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (result.error) return response({ error: 'Não foi possível carregar o histórico.' }, 500)

  const contents = new Map()
  for (const event of result.data || []) {
    if (!['course_open', 'lesson_open', 'material_open'].includes(event.event_type)) continue
    const key = `${event.content_type}:${event.content_id || event.content_title}`
    const current = contents.get(key)
    contents.set(key, {
      content_type: event.content_type,
      content_id: event.content_id,
      content_title: event.content_title || 'Conteúdo sem título',
      access_count: (current?.access_count || 0) + 1,
      last_accessed_at: current?.last_accessed_at || event.created_at,
    })
  }

  return response({ events: result.data || [], contents: [...contents.values()] })
}
