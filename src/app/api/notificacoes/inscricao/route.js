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

  const token = authorization.slice(7).trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null

  return { id: data.claims.sub }
}

function privateJson(body, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  return Response.json(body, { ...init, headers })
}

function validSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return false
  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) return false

  try {
    const endpoint = new URL(subscription.endpoint)
    if (endpoint.protocol !== 'https:') return false
  } catch {
    return false
  }

  const p256dh = subscription.keys?.p256dh
  const auth = subscription.keys?.auth
  return typeof p256dh === 'string' && p256dh.length >= 16 && p256dh.length <= 512
    && typeof auth === 'string' && auth.length >= 8 && auth.length <= 256
}

async function hasActiveAccess(supabase, userId) {
  const [profileResult, legacyResult] = await Promise.all([
    supabase.from('profiles').select('status').eq('id', userId).maybeSingle(),
    supabase
      .from('perfis')
      .select('tipo_acesso,acesso_expira_em,status_assinatura')
      .eq('id', userId)
      .maybeSingle(),
  ])

  if (profileResult.error) throw profileResult.error
  if (legacyResult.error) throw legacyResult.error

  const profile = profileResult.data
  const legacy = legacyResult.data
  if (profile && profile.status !== 'active') return false
  if (legacy?.status_assinatura === 'atrasado' || legacy?.status_assinatura === 'cancelado') return false

  if (legacy && ['teste', 'avista'].includes(legacy.tipo_acesso) && legacy.acesso_expira_em) {
    const expiresAt = new Date(`${legacy.acesso_expira_em}T23:59:59-03:00`)
    if (expiresAt < new Date()) return false
  }

  return true
}

export async function POST(request) {
  try {
    const supabase = serverClient()
    const user = await authenticatedUser(request, supabase)
    if (!user) return privateJson({ error: 'Não autorizado.' }, { status: 401 })
    if (!(await hasActiveAccess(supabase, user.id))) {
      return privateJson({ error: 'Seu acesso precisa estar ativo para receber lembretes.' }, { status: 403 })
    }

    const body = await request.json()
    const subscription = body?.subscription
    if (!validSubscription(subscription)) {
      return privateJson({ error: 'Inscrição de notificação inválida.' }, { status: 400 })
    }

    const { data: existing, error: lookupError } = await supabase
      .from('push_subscriptions')
      .select('id,user_id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (existing && existing.user_id !== user.id) {
      return privateJson({ error: 'Esta inscrição já pertence a outra conta.' }, { status: 409 })
    }

    const row = {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      active: true,
      timezone: 'America/Sao_Paulo',
      updated_at: new Date().toISOString(),
    }

    const query = existing
      ? supabase.from('push_subscriptions').update(row).eq('id', existing.id).eq('user_id', user.id)
      : supabase.from('push_subscriptions').insert(row)
    const { error } = await query
    if (error) throw error

    return privateJson({ success: true, schedule: '08:00', timezone: 'America/Sao_Paulo' })
  } catch {
    return privateJson({ error: 'Não foi possível salvar o lembrete agora.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const supabase = serverClient()
    const user = await authenticatedUser(request, supabase)
    if (!user) return privateJson({ error: 'Não autorizado.' }, { status: 401 })

    const body = await request.json()
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint || endpoint.length > 2048) {
      return privateJson({ error: 'Inscrição inválida.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint)
      .eq('user_id', user.id)
    if (error) throw error

    return privateJson({ success: true })
  } catch {
    return privateJson({ error: 'Não foi possível desativar o lembrete agora.' }, { status: 500 })
  }
}
