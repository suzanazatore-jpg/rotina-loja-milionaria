import { createClient } from '@supabase/supabase-js'
import { getVapidPublicKey, sendPushNotification } from '@/lib/pushNotifications'

const PAGE_SIZE = 500
const BATCH_SIZE = 20
const SAO_PAULO_OFFSET = '-03:00'

const NOTIFICATIONS = {
  motivacional: {
    hour: 8,
    title: firstName => firstName ? `Bom dia, ${firstName}! 💛` : 'Bom dia! 💛',
    body: 'Respire, organize o foco e comece com confiança. Hoje é mais uma oportunidade de movimentar sua loja. Toque para entrar no app.',
    tag: 'rotina-motivacional',
  },
  rotina: {
    hour: 9,
    title: () => 'Vamos começar a rotina de hoje? ✨',
    body: firstName => firstName
      ? `${firstName}, sua primeira ação já está te esperando. Abra o app e avance um passo de cada vez.`
      : 'Sua primeira ação já está te esperando. Abra o app e avance um passo de cada vez.',
    tag: 'rotina-pratica',
  },
}

function serverClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function dateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function slotStart(today, hour) {
  return new Date(`${today}T${String(hour).padStart(2, '0')}:00:00${SAO_PAULO_OFFSET}`).toISOString()
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0].slice(0, 30)
}

async function loadPendingSubscriptions(supabase, sentBefore) {
  const subscriptions = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,last_sent_at')
      .eq('active', true)
      .or(`last_sent_at.is.null,last_sent_at.lt.${sentBefore}`)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    subscriptions.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return subscriptions
}

async function filterEligibleSubscriptions(supabase, subscriptions) {
  const userIds = [...new Set(subscriptions.map(item => item.user_id))]
  if (!userIds.length) return []

  const [profilesResult, legacyResult] = await Promise.all([
    supabase.from('profiles').select('id,name,status').in('id', userIds),
    supabase.from('perfis').select('id,nome,tipo_acesso,acesso_expira_em,status_assinatura').in('id', userIds),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (legacyResult.error) throw legacyResult.error

  const profiles = new Map((profilesResult.data || []).map(item => [item.id, item]))
  const legacyProfiles = new Map((legacyResult.data || []).map(item => [item.id, item]))

  return subscriptions.flatMap(subscription => {
    const profile = profiles.get(subscription.user_id)
    const legacy = legacyProfiles.get(subscription.user_id)

    if (profile && profile.status !== 'active') return []
    if (legacy?.status_assinatura === 'atrasado' || legacy?.status_assinatura === 'cancelado') return []

    if (legacy && ['teste', 'avista'].includes(legacy.tipo_acesso) && legacy.acesso_expira_em) {
      const expiresAt = new Date(`${legacy.acesso_expira_em}T23:59:59-03:00`)
      if (expiresAt < new Date()) return []
    }

    return [{ ...subscription, firstName: firstName(profile?.name || legacy?.nome) }]
  })
}

async function markInactive(supabase, id) {
  await supabase
    .from('push_subscriptions')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
}

async function sendOne(supabase, row, today, notification) {
  try {
    await sendPushNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      {
        title: notification.title(row.firstName),
        body: typeof notification.body === 'function' ? notification.body(row.firstName) : notification.body,
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: `${notification.tag}-${today}`,
        url: '/painel',
      },
    )

    const { error } = await supabase
      .from('push_subscriptions')
      .update({
        last_sent_on: today,
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('active', true)
    if (error) throw error

    return 'sent'
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await markInactive(supabase, row.id)
      return 'inactive'
    }

    return 'failed'
  }
}

export async function handleScheduledPush(request, type) {
  const notification = NOTIFICATIONS[type]
  if (!notification) return Response.json({ error: 'Notificação inválida.' }, { status: 400 })

  const authorization = request.headers.get('authorization') || ''
  const cronSecrets = [process.env.CRON_SECRET, process.env.PUSH_CRON_SECRET].filter(Boolean)
  const authorized = cronSecrets.some(secret => authorization === `Bearer ${secret}`)
  if (!authorized) return Response.json({ error: 'Não autorizado.' }, { status: 401 })

  try {
    if (!getVapidPublicKey() || !(process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY)) {
      return Response.json({ error: 'Chaves de notificação não configuradas.' }, { status: 503 })
    }

    const supabase = serverClient()
    const today = dateInSaoPaulo()
    const pendingSubscriptions = await loadPendingSubscriptions(supabase, slotStart(today, notification.hour))
    const subscriptions = await filterEligibleSubscriptions(supabase, pendingSubscriptions)
    const totals = { sent: 0, inactive: 0, failed: 0 }

    for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
      const batch = subscriptions.slice(index, index + BATCH_SIZE)
      const results = await Promise.all(batch.map(row => sendOne(supabase, row, today, notification)))
      results.forEach(result => { totals[result] += 1 })
    }

    return Response.json(
      { success: true, type, date: today, total: subscriptions.length, ...totals },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
