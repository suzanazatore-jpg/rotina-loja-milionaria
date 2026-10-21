import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const PAGE_SIZE = 1000
const TYPE_LABELS = {
  motivacional: 'Motivacional',
  rotina: 'Lembrete da rotina',
  personalizada: 'Personalizada',
  inteligente: 'Inteligente',
}

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function authorize(request, supabase) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL ? user : null
}

async function pagedQuery(builder) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await builder.range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

async function authActivity(supabase) {
  const map = new Map()
  let page = 1
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const users = data?.users || []
    for (const user of users) map.set(user.id, user.last_sign_in_at || user.created_at || null)
    if (users.length < 1000) break
    page += 1
  }
  return map
}

function startDate(days) {
  const value = new Date()
  value.setDate(value.getDate() - days + 1)
  value.setHours(0, 0, 0, 0)
  return value.toISOString()
}

function roundRate(value, total) {
  return total ? Math.round(value / total * 1000) / 10 : 0
}

function aggregateRows(rows, keyFor, labelFor) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    if (!groups.has(key)) groups.set(key, { key, label: labelFor(row), total: 0, pushed: 0, read: 0, opened: 0, last_sent_at: null })
    const group = groups.get(key)
    group.total += 1
    if (row.push_device_count > 0) group.pushed += 1
    if (row.read_at) group.read += 1
    if (row.opened_at) group.opened += 1
    if (!group.last_sent_at || row.sent_at > group.last_sent_at) group.last_sent_at = row.sent_at
  }
  return [...groups.values()].map(group => ({ ...group, open_rate: roundRate(group.opened, group.total) }))
}

export async function GET(request) {
  const supabase = serverClient()
  const admin = await authorize(request, supabase)
  if (!admin) return Response.json({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30)
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
    const since = startDate(days)

    const [notifications, profilesResult, legacyResult, plansResult, linksResult, schedulesResult, rulesResult, activityResult, authMap] = await Promise.all([
      pagedQuery(supabase
        .from('user_notifications')
        .select('id,user_id,schedule_id,rule_id,notification_type,title,scheduled_for,sent_at,push_sent_at,push_device_count,push_failed_count,read_at,opened_at,opened_source')
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })),
      supabase.from('profiles').select('id,name,email,status'),
      supabase.from('perfis').select('id,nome,email,status_assinatura,tipo_acesso,acesso_expira_em'),
      supabase.from('plans').select('id,name').not('offer_id', 'like', '__individual_%'),
      supabase.from('profile_plans').select('profile_id,plan_id'),
      supabase.from('notification_schedules').select('id,label'),
      supabase.from('notification_smart_rules').select('id,label'),
      supabase.from('app_user_activity').select('user_id,last_seen_at'),
      authActivity(supabase),
    ])

    for (const result of [profilesResult, legacyResult, plansResult, linksResult, schedulesResult, rulesResult, activityResult]) {
      if (result.error) throw result.error
    }

    const schedules = new Map((schedulesResult.data || []).map(item => [item.id, item.label]))
    const rules = new Map((rulesResult.data || []).map(item => [item.id, item.label]))
    const profiles = new Map((profilesResult.data || []).map(item => [item.id, item]))
    const legacy = new Map((legacyResult.data || []).map(item => [item.id, item]))
    const planNames = new Map((plansResult.data || []).map(item => [item.id, item.name]))
    const userPlans = new Map()
    for (const link of linksResult.data || []) {
      if (!planNames.has(link.plan_id)) continue
      if (!userPlans.has(link.profile_id)) userPlans.set(link.profile_id, [])
      userPlans.get(link.profile_id).push(planNames.get(link.plan_id))
    }
    const appActivity = new Map((activityResult.data || []).map(item => [item.user_id, item.last_seen_at]))

    const total = notifications.length
    const pushed = notifications.filter(item => item.push_device_count > 0).length
    const read = notifications.filter(item => item.read_at).length
    const opened = notifications.filter(item => item.opened_at).length
    const pushOpened = notifications.filter(item => item.opened_source === 'push').length
    const routineOpened = notifications.filter(item => item.notification_type === 'rotina' && item.opened_at).length
    const recipients = new Set(notifications.map(item => item.user_id)).size

    const byType = aggregateRows(
      notifications,
      item => item.notification_type,
      item => TYPE_LABELS[item.notification_type] || item.notification_type,
    ).sort((a, b) => b.total - a.total)

    const byMessage = aggregateRows(
      notifications,
      item => item.schedule_id ? `schedule:${item.schedule_id}` : item.rule_id ? `rule:${item.rule_id}` : `manual:${item.title}`,
      item => item.schedule_id ? schedules.get(item.schedule_id) || item.title : item.rule_id ? rules.get(item.rule_id) || item.title : `Teste: ${item.title}`,
    ).sort((a, b) => b.last_sent_at.localeCompare(a.last_sent_at))

    const daysMap = new Map()
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - index)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      daysMap.set(key, { date: key, total: 0, opened: 0 })
    }
    for (const item of notifications) {
      const current = daysMap.get(item.scheduled_for)
      if (!current) continue
      current.total += 1
      if (item.opened_at) current.opened += 1
    }

    const userIds = new Set([...profiles.keys(), ...legacy.keys(), ...notifications.map(item => item.user_id)])
    const individualsById = new Map()
    for (const userId of userIds) {
      const profile = profiles.get(userId)
      const oldProfile = legacy.get(userId)
      if (profile && profile.status !== 'active') continue
      individualsById.set(userId, {
        user_id: userId,
        name: profile?.name || oldProfile?.nome || 'Lojista',
        email: profile?.email || oldProfile?.email || '',
        plans: userPlans.get(userId) || [],
        last_seen_at: appActivity.get(userId) || authMap.get(userId) || null,
        total: 0,
        pushed: 0,
        read: 0,
        opened: 0,
        last_notification_at: null,
        last_opened_at: null,
      })
    }
    for (const item of notifications) {
      const person = individualsById.get(item.user_id)
      if (!person) continue
      person.total += 1
      if (item.push_device_count > 0) person.pushed += 1
      if (item.read_at) person.read += 1
      if (item.opened_at) person.opened += 1
      if (!person.last_notification_at || item.sent_at > person.last_notification_at) person.last_notification_at = item.sent_at
      if (item.opened_at && (!person.last_opened_at || item.opened_at > person.last_opened_at)) person.last_opened_at = item.opened_at
    }
    const individuals = [...individualsById.values()]
      .map(item => ({ ...item, open_rate: roundRate(item.opened, item.total) }))
      .sort((a, b) => (b.last_seen_at || '').localeCompare(a.last_seen_at || ''))

    return Response.json({
      days,
      summary: {
        total,
        pushed,
        in_app_only: total - pushed,
        read,
        opened,
        recipients,
        open_rate: roundRate(opened, total),
        push_opened: pushOpened,
        routine_opened: routineOpened,
      },
      byType,
      byMessage,
      timeline: [...daysMap.values()],
      individuals,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return Response.json({ error: error.message || 'Não foi possível montar o relatório.' }, { status: 500 })
  }
}
