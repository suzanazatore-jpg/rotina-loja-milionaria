import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function serverClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function authenticatedUser(request, supabase) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const { data: { user } } = await supabase.auth.getUser(authorization.slice(7))
  return user || null
}

const noStore = { 'Cache-Control': 'private, no-store' }

export async function GET(request) {
  const supabase = serverClient()
  const user = await authenticatedUser(request, supabase)
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401, headers: noStore })

  const [historyResult, unreadResult] = await Promise.all([
    supabase
      .from('user_notifications')
      .select('id,notification_type,title,body,target_url,scheduled_for,sent_at,read_at,opened_at')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(50),
    supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
  ])

  if (historyResult.error || unreadResult.error) {
    return Response.json(
      { error: historyResult.error?.message || unreadResult.error?.message || 'Não foi possível carregar as notificações.' },
      { status: 500, headers: noStore },
    )
  }

  return Response.json(
    { notifications: historyResult.data || [], unread: unreadResult.count || 0 },
    { headers: noStore },
  )
}

export async function PATCH(request) {
  const supabase = serverClient()
  const user = await authenticatedUser(request, supabase)
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401, headers: noStore })

  const payload = await request.json().catch(() => ({}))
  const now = new Date().toISOString()

  if (payload.all === true) {
    const { error } = await supabase
      .from('user_notifications')
      .update({ read_at: now })
      .eq('user_id', user.id)
      .is('read_at', null)
    if (error) return Response.json({ error: error.message }, { status: 500, headers: noStore })
    return Response.json({ success: true }, { headers: noStore })
  }

  const id = String(payload.id || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: 'Notificação inválida.' }, { status: 400, headers: noStore })
  }

  const changes = payload.action === 'opened'
    ? { read_at: now, opened_at: now }
    : { read_at: now }
  const { error } = await supabase
    .from('user_notifications')
    .update(changes)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500, headers: noStore })

  return Response.json({ success: true }, { headers: noStore })
}
