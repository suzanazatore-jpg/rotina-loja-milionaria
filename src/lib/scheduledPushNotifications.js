import { createClient } from '@supabase/supabase-js'
import { getVapidPublicKey, sendPushNotification } from '@/lib/pushNotifications'
import { planoDoDia } from '@/lib/dailyPlan'

const PAGE_SIZE = 500
const BATCH_SIZE = 20
const SAO_PAULO_OFFSET = '-03:00'

export const NOTIFICATION_DEFAULTS = {
  motivacional: {
    hour: 8,
    enabled: true,
    title_template: 'Bom dia, {{nome}}! 💛',
    body_template: 'Respire, organize o foco e comece com confiança. Hoje é mais uma oportunidade de movimentar sua loja. Toque para entrar no app.',
    tag: 'rotina-motivacional',
  },
  rotina: {
    hour: 9,
    enabled: true,
    title_template: 'Vamos começar a rotina de hoje? ✨',
    body_template: '{{nome}}, sua primeira ação de hoje é: {{acao}}. Abra o app e avance um passo de cada vez.',
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

export function dateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateTimeInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function dispatcherContext(request) {
  const current = dateTimeInSaoPaulo()
  const expression = request.headers.get('x-vercel-cron-schedule') || ''
  const match = expression.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
  if (!match) return { ...current, weekday: new Date(`${current.date}T12:00:00Z`).getUTCDay() }

  const utcMinutes = Number(match[2]) * 60 + Number(match[1])
  const localMinutes = (utcMinutes - 180 + 1440) % 1440
  const currentMinutes = Number(current.time.slice(0, 2)) * 60 + Number(current.time.slice(3, 5))
  const date = localMinutes > currentMinutes + 720 ? previousDate(current.date) : current.date
  const time = `${String(Math.floor(localMinutes / 60)).padStart(2, '0')}:${String(localMinutes % 60).padStart(2, '0')}`
  return { date, time, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() }
}

function slotStart(today, hour) {
  return new Date(`${today}T${String(hour).padStart(2, '0')}:00:00${SAO_PAULO_OFFSET}`).toISOString()
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0].slice(0, 30)
}

export function renderNotificationTemplate(template, values = {}) {
  const input = typeof values === 'string' ? { name: values } : values
  const replacements = {
    nome: firstName(input.name) || 'lojista',
    acao: String(input.action || 'começar pela primeira etapa da rotina').trim().slice(0, 120),
    percentual: String(input.percentage || '').trim().slice(0, 20),
  }
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    String(template || ''),
  )
}

async function loadNotificationSettings(supabase, type) {
  const fallback = NOTIFICATION_DEFAULTS[type]
  const { data, error } = await supabase
    .from('notification_settings')
    .select('id,enabled,title_template,body_template')
    .eq('id', type)
    .maybeSingle()
  if (error) throw error
  return { ...fallback, ...(data || {}) }
}

async function loadMotivationalMessage(supabase, today) {
  const { data, error } = await supabase
    .from('notification_messages')
    .select('id,body_template,position')
    .eq('type', 'motivacional')
    .eq('enabled', true)
    .order('position')
    .order('id')
  if (error) throw error
  if (!data?.length) return null
  const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000)
  return data[dayNumber % data.length]
}

export async function loadNotificationForDate(supabase, type, today = dateInSaoPaulo()) {
  const notification = await loadNotificationSettings(supabase, type)
  if (type !== 'motivacional') return notification
  const message = await loadMotivationalMessage(supabase, today)
  return message
    ? { ...notification, body_template: message.body_template, message_id: message.id, message_position: message.position }
    : notification
}

function routineDateContext(today) {
  const date = new Date(`${today}T12:00:00Z`)
  const day = date.getUTCDay()
  if (day === 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const monday = date.toISOString().slice(0, 10)
    return { monday, dayKey: '1', taskDate: monday }
  }
  date.setUTCDate(date.getUTCDate() - (day - 1))
  return { monday: date.toISOString().slice(0, 10), dayKey: String(day), taskDate: today }
}

async function loadTodayRoutine(supabase, today) {
  const context = routineDateContext(today)
  const { data, error } = await supabase
    .from('rotinas')
    .select('id,titulo,plano_dias')
    .eq('semana_inicio', context.monday)
    .maybeSingle()
  if (error) throw error
  const plan = data?.plano_dias ? planoDoDia(data.plano_dias, new Date(`${context.taskDate}T12:00:00Z`)) : null
  const tasks = Array.isArray(plan?.tarefas)
    ? plan.tarefas.filter(task => task?.id && String(task.titulo || '').trim())
    : []
  return { routine: data || null, tasks, taskDate: context.taskDate }
}

async function loadCompletedTasks(supabase, userIds, today) {
  const completed = new Set()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  for (let index = 0; index < uniqueIds.length; index += 200) {
    const { data, error } = await supabase
      .from('daily_task_progress')
      .select('owner_id,task_id')
      .eq('task_date', today)
      .in('owner_id', uniqueIds.slice(index, index + 200))
    if (error) throw error
    for (const item of data || []) completed.add(`${item.owner_id}:${item.task_id}`)
  }
  return completed
}

export async function attachRoutineActions(supabase, rows, today = dateInSaoPaulo()) {
  if (!rows.length) return rows
  const context = await loadTodayRoutine(supabase, today)
  if (!context.tasks.length) {
    return rows.map(row => ({ ...row, routineAction: 'começar pela primeira etapa da rotina', routineAvailable: false }))
  }
  const completed = await loadCompletedTasks(supabase, rows.map(row => row.user_id), context.taskDate)
  return rows.map(row => {
    const pending = context.tasks.find(task => !completed.has(`${row.user_id}:${task.id}`))
    return {
      ...row,
      routineAction: pending?.titulo || 'revisar o progresso da rotina de hoje',
      routineAvailable: true,
      routinePending: Boolean(pending),
      routineTitle: context.routine?.titulo || null,
    }
  })
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

async function loadAllActiveSubscriptions(supabase) {
  const subscriptions = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,last_sent_at')
      .eq('active', true)
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

async function loadAllEligibleUsers(supabase, planIds = []) {
  const [profilesResult, legacyResult] = await Promise.all([
    supabase.from('profiles').select('id,name,email,status').order('id'),
    supabase.from('perfis').select('id,nome,email,tipo_acesso,acesso_expira_em,status_assinatura').order('id'),
  ])
  if (profilesResult.error) throw profilesResult.error
  if (legacyResult.error) throw legacyResult.error

  let allowedByPlan = null
  if (planIds.length) {
    const { data, error } = await supabase.from('profile_plans').select('profile_id').in('plan_id', planIds)
    if (error) throw error
    allowedByPlan = new Set((data || []).map(item => item.profile_id))
  }

  const profiles = new Map((profilesResult.data || []).map(item => [item.id, item]))
  const legacyProfiles = new Map((legacyResult.data || []).map(item => [item.id, item]))
  const userIds = new Set([...profiles.keys(), ...legacyProfiles.keys()])
  const now = new Date()
  const users = []

  for (const userId of userIds) {
    if (allowedByPlan && !allowedByPlan.has(userId)) continue
    const profile = profiles.get(userId)
    const legacy = legacyProfiles.get(userId)
    if (profile && profile.status !== 'active') continue
    if (legacy?.status_assinatura === 'atrasado' || legacy?.status_assinatura === 'cancelado') continue
    if (legacy && ['teste', 'avista'].includes(legacy.tipo_acesso) && legacy.acesso_expira_em) {
      const expiresAt = new Date(`${legacy.acesso_expira_em}T23:59:59-03:00`)
      if (expiresAt < now) continue
    }
    users.push({
      user_id: userId,
      firstName: firstName(profile?.name || legacy?.nome),
      email: profile?.email || legacy?.email || '',
    })
  }
  return users
}

async function markInactive(supabase, id) {
  await supabase.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
}

async function sendOne(supabase, row, today, notification) {
  try {
    const values = { name: row.firstName, action: row.routineAction }
    await sendPushNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      {
        title: renderNotificationTemplate(notification.title_template, values),
        body: renderNotificationTemplate(notification.body_template, values),
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: `${notification.tag}-${today}`,
        url: '/painel',
      },
    )
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ last_sent_on: today, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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

async function sendOneForSchedule(supabase, row, today, notification, schedule) {
  try {
    const values = { name: row.firstName, action: row.routineAction }
    const title = row.notificationRecord?.title || renderNotificationTemplate(notification.title_template, values)
    const body = row.notificationRecord?.body || renderNotificationTemplate(notification.body_template, values)
    const targetUrl = row.notificationRecord?.target_url || '/painel'
    await sendPushNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      {
        title,
        body,
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: `${notification.tag}-${schedule.id}-${today}`,
        url: targetUrl,
      },
    )
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ last_sent_on: today, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('active', true)
    if (error) throw error
    return { status: 'sent', userId: row.user_id }
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await markInactive(supabase, row.id)
      return { status: 'inactive', userId: row.user_id }
    }
    return { status: 'failed', userId: row.user_id }
  }
}

function notificationTarget(type, id, targetSection = null) {
  const params = new URLSearchParams()
  const section = targetSection || (type === 'rotina' ? 'rotina' : null)
  if (section && section !== 'inicio') params.set('secao', section)
  params.set('notificacao', id)
  return `/painel?${params.toString()}`
}

async function attachNotificationHistory(supabase, users, today, notification, schedule) {
  if (!users.length) return []
  const entries = users.map(row => {
    const id = crypto.randomUUID()
    const values = { name: row.firstName, action: row.routineAction }
    return {
      id,
      user_id: row.user_id,
      schedule_id: schedule.id,
      notification_type: schedule.notification_type,
      title: renderNotificationTemplate(notification.title_template, values).slice(0, 80),
      body: renderNotificationTemplate(notification.body_template, values).slice(0, 240),
      target_url: notificationTarget(schedule.notification_type, id),
      scheduled_for: today,
    }
  })

  const { error: insertError } = await supabase
    .from('user_notifications')
    .upsert(entries, { onConflict: 'schedule_id,user_id,scheduled_for', ignoreDuplicates: true })
  if (insertError) throw insertError

  const records = []
  const userIds = users.map(item => item.user_id)
  for (let index = 0; index < userIds.length; index += 200) {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('id,user_id,title,body,target_url')
      .eq('schedule_id', schedule.id)
      .eq('scheduled_for', today)
      .in('user_id', userIds.slice(index, index + 200))
    if (error) throw error
    records.push(...(data || []))
  }
  const byUser = new Map(records.map(record => [record.user_id, record]))
  return users.map(row => ({ ...row, notificationRecord: byUser.get(row.user_id) || null }))
}

async function recordDeliveryResults(supabase, audience, results) {
  const byUser = new Map(audience.map(item => [item.user_id, { sent: 0, failed: 0, record: item.notificationRecord }]))
  for (const result of results) {
    const current = byUser.get(result.userId)
    if (!current) continue
    if (result.status === 'sent') current.sent += 1
    if (result.status === 'failed') current.failed += 1
  }
  const now = new Date().toISOString()
  await Promise.all([...byUser.values()].map(async item => {
    if (!item.record?.id || (!item.sent && !item.failed)) return
    const { error } = await supabase.from('user_notifications').update({
      push_device_count: item.sent,
      push_failed_count: item.failed,
      push_sent_at: item.sent ? now : null,
    }).eq('id', item.record.id)
    if (error) throw error
  }))
  return [...byUser.values()].filter(item => item.sent > 0).length
}

async function loadDueSchedules(supabase, context) {
  const { data, error } = await supabase
    .from('notification_schedules')
    .select('id,label,notification_type,send_time,weekdays,title_template,body_template,enabled,position,plan_ids')
    .eq('enabled', true)
    .eq('send_time', `${context.time}:00`)
    .order('position')
    .order('id')
  if (error) throw error
  return (data || []).filter(item => Array.isArray(item.weekdays) && item.weekdays.includes(context.weekday))
}

async function claimScheduleRun(supabase, scheduleId, date) {
  const { error } = await supabase.from('notification_schedule_runs').insert({ schedule_id: scheduleId, run_date: date })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

async function finishScheduleRun(supabase, scheduleId, date, status, totals, errorMessage = null) {
  const { error } = await supabase
    .from('notification_schedule_runs')
    .update({ status, ...totals, error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq('schedule_id', scheduleId)
    .eq('run_date', date)
  if (error) throw error
}

async function notificationForSchedule(supabase, schedule, date) {
  if (schedule.notification_type === 'personalizada') {
    return {
      enabled: true,
      title_template: schedule.title_template,
      body_template: schedule.body_template,
      tag: 'rotina-personalizada',
    }
  }
  return loadNotificationForDate(supabase, schedule.notification_type, date)
}

async function runSchedule(supabase, schedule, context) {
  if (!await claimScheduleRun(supabase, schedule.id, context.date)) {
    return { id: schedule.id, label: schedule.label, skipped: true, reason: 'Horário já processado.' }
  }

  const totals = { audience: 0, sent: 0, in_app_only: 0, inactive: 0, failed: 0 }
  try {
    const notification = await notificationForSchedule(supabase, schedule, context.date)
    if (!notification.enabled) {
      await finishScheduleRun(supabase, schedule.id, context.date, 'completed', totals)
      return { id: schedule.id, label: schedule.label, skipped: true, reason: 'Conteúdo pausado no Escritório.', ...totals }
    }
    let audience = await loadAllEligibleUsers(supabase, schedule.plan_ids || [])
    if (schedule.notification_type === 'rotina') audience = await attachRoutineActions(supabase, audience, context.date)
    audience = await attachNotificationHistory(supabase, audience, context.date, notification, schedule)
    totals.audience = audience.length

    const audienceByUser = new Map(audience.map(item => [item.user_id, item]))
    const activeSubscriptions = context.pushConfigured ? await loadAllActiveSubscriptions(supabase) : []
    const subscriptions = activeSubscriptions.flatMap(subscription => {
      const user = audienceByUser.get(subscription.user_id)
      return user ? [{ ...subscription, ...user }] : []
    })
    const deliveryResults = []
    for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
      const results = await Promise.all(subscriptions.slice(index, index + BATCH_SIZE).map(row => (
        sendOneForSchedule(supabase, row, context.date, notification, schedule)
      )))
      deliveryResults.push(...results)
      results.forEach(result => { totals[result.status] += 1 })
    }
    const usersWithPush = await recordDeliveryResults(supabase, audience, deliveryResults)
    totals.in_app_only = Math.max(0, audience.length - usersWithPush)
    await finishScheduleRun(supabase, schedule.id, context.date, 'completed', totals)
    return { id: schedule.id, label: schedule.label, devices: subscriptions.length, ...totals }
  } catch (error) {
    await finishScheduleRun(supabase, schedule.id, context.date, 'failed', totals, String(error.message || error).slice(0, 500))
    return { id: schedule.id, label: schedule.label, error: error.message || 'Falha no envio.', ...totals }
  }
}

function subtractDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function monthKey(date) {
  return date.slice(0, 7)
}

function nextMonthKey(date) {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + 1)
  return value.toISOString().slice(0, 7)
}

async function loadDueSmartRules(supabase, context) {
  const { data, error } = await supabase
    .from('notification_smart_rules')
    .select('id,label,description,send_time,weekdays,title_template,body_template,target_section,cooldown_days,plan_ids,enabled,position')
    .eq('enabled', true)
    .eq('send_time', `${context.time}:00`)
    .order('position')
    .order('id')
  if (error) throw error
  return (data || []).filter(item => Array.isArray(item.weekdays) && item.weekdays.includes(context.weekday))
}

async function claimSmartRuleRun(supabase, ruleId, date) {
  const { error } = await supabase.from('notification_smart_rule_runs').insert({ rule_id: ruleId, run_date: date })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

async function finishSmartRuleRun(supabase, ruleId, date, status, totals, errorMessage = null) {
  const { error } = await supabase
    .from('notification_smart_rule_runs')
    .update({ status, ...totals, error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq('rule_id', ruleId)
    .eq('run_date', date)
  if (error) throw error
}

async function excludeSmartCooldown(supabase, users, rule, today) {
  if (!users.length) return users
  const cutoff = subtractDays(today, Math.max(0, Number(rule.cooldown_days || 1) - 1))
  const recentlySent = new Set()
  const userIds = users.map(item => item.user_id)
  for (let index = 0; index < userIds.length; index += 200) {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('user_id')
      .eq('rule_id', rule.id)
      .gte('scheduled_for', cutoff)
      .in('user_id', userIds.slice(index, index + 200))
    if (error) throw error
    for (const item of data || []) recentlySent.add(item.user_id)
  }
  return users.filter(item => !recentlySent.has(item.user_id))
}

async function loadAuthActivity(supabase) {
  const activity = new Map()
  let page = 1
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const users = data?.users || []
    for (const user of users) activity.set(user.id, user.last_sign_in_at || user.created_at || null)
    if (users.length < 1000) break
    page += 1
  }
  return activity
}

async function smartAudienceForRule(supabase, rule, today) {
  let users = await loadAllEligibleUsers(supabase, rule.plan_ids || [])
  if (!users.length) return users

  if (rule.id === 'inactive_3_days') {
    const [activityResult, authActivity] = await Promise.all([
      supabase.from('app_user_activity').select('user_id,last_seen_at').in('user_id', users.map(item => item.user_id)),
      loadAuthActivity(supabase),
    ])
    if (activityResult.error) throw activityResult.error
    const appActivity = new Map((activityResult.data || []).map(item => [item.user_id, item.last_seen_at]))
    const threshold = Date.parse(`${subtractDays(today, 3)}T23:59:59-03:00`)
    return users.filter(user => {
      const lastSeen = appActivity.get(user.user_id) || authActivity.get(user.user_id)
      return lastSeen && Date.parse(lastSeen) <= threshold
    })
  }

  if (rule.id === 'routine_pending') {
    users = await attachRoutineActions(supabase, users, today)
    return users.filter(item => item.routineAvailable && item.routinePending)
  }

  if (rule.id === 'below_goal') {
    const monthStart = `${monthKey(today)}-01`
    const userIds = users.map(item => item.user_id)
    const [goalsResult, salesResult] = await Promise.all([
      supabase.from('sales_goals').select('owner_id,monthly_target').eq('month_start', monthStart).in('owner_id', userIds),
      supabase.from('daily_sales').select('owner_id,amount').gte('sale_date', monthStart).lte('sale_date', today).in('owner_id', userIds),
    ])
    if (goalsResult.error) throw goalsResult.error
    if (salesResult.error) throw salesResult.error
    const goals = new Map((goalsResult.data || []).map(item => [item.owner_id, Number(item.monthly_target || 0)]))
    const sales = new Map()
    for (const item of salesResult.data || []) sales.set(item.owner_id, (sales.get(item.owner_id) || 0) + Number(item.amount || 0))
    const [year, month, day] = today.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return users.flatMap(user => {
      const target = goals.get(user.user_id) || 0
      if (!target) return []
      const expected = target * day / daysInMonth
      const actual = sales.get(user.user_id) || 0
      if (actual >= expected * 0.85) return []
      const pace = expected ? Math.round(actual / expected * 100) : 0
      return [{ ...user, percentage: `${pace}%`, routineAction: `${pace}% do ritmo esperado` }]
    })
  }

  if (rule.id === 'calendar_today') {
    const { data, error } = await supabase
      .from('calendar_actions')
      .select('title')
      .eq('action_date', today)
      .eq('is_published', true)
      .order('sort_order')
      .limit(1)
    if (error) throw error
    if (!data?.length) return []
    return users.map(user => ({ ...user, routineAction: data[0].title }))
  }

  if (rule.id === 'campaign_upcoming') {
    const day = Number(today.slice(8, 10))
    const campaignMonth = day >= 25 ? nextMonthKey(today) : (day <= 3 ? monthKey(today) : null)
    if (!campaignMonth) return []
    const { data, error } = await supabase
      .from('campanhas')
      .select('titulo')
      .eq('mes_ano', campaignMonth)
      .order('ordem')
      .limit(1)
    if (error) throw error
    if (!data?.length) return []
    return users.map(user => ({ ...user, routineAction: data[0].titulo || 'campanha do mês' }))
  }

  return []
}

async function attachSmartHistory(supabase, users, today, rule) {
  if (!users.length) return []
  const entries = users.map(user => {
    const id = crypto.randomUUID()
    const values = { name: user.firstName, action: user.routineAction, percentage: user.percentage }
    return {
      id,
      user_id: user.user_id,
      rule_id: rule.id,
      notification_type: 'inteligente',
      title: renderNotificationTemplate(rule.title_template, values).slice(0, 80),
      body: renderNotificationTemplate(rule.body_template, values).slice(0, 240),
      target_url: notificationTarget('inteligente', id, rule.target_section),
      scheduled_for: today,
    }
  })
  const { error: insertError } = await supabase.from('user_notifications').insert(entries)
  if (insertError) throw insertError
  const records = new Map(entries.map(item => [item.user_id, item]))
  return users.map(user => ({ ...user, notificationRecord: records.get(user.user_id) }))
}

async function runSmartRule(supabase, rule, context) {
  if (!await claimSmartRuleRun(supabase, rule.id, context.date)) {
    return { id: rule.id, label: rule.label, skipped: true, reason: 'Regra já processada.' }
  }
  const totals = { audience: 0, sent: 0, in_app_only: 0, inactive: 0, failed: 0 }
  try {
    let audience = await smartAudienceForRule(supabase, rule, context.date)
    audience = await excludeSmartCooldown(supabase, audience, rule, context.date)
    audience = await attachSmartHistory(supabase, audience, context.date, rule)
    totals.audience = audience.length

    const audienceByUser = new Map(audience.map(item => [item.user_id, item]))
    const activeSubscriptions = context.pushConfigured ? await loadAllActiveSubscriptions(supabase) : []
    const subscriptions = activeSubscriptions.flatMap(subscription => {
      const user = audienceByUser.get(subscription.user_id)
      return user ? [{ ...subscription, ...user }] : []
    })
    const notification = { tag: `rotina-inteligente-${rule.id}`, title_template: rule.title_template, body_template: rule.body_template }
    const deliveryResults = []
    for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
      const results = await Promise.all(subscriptions.slice(index, index + BATCH_SIZE).map(row => (
        sendOneForSchedule(supabase, row, context.date, notification, rule)
      )))
      deliveryResults.push(...results)
      results.forEach(result => { totals[result.status] += 1 })
    }
    const usersWithPush = await recordDeliveryResults(supabase, audience, deliveryResults)
    totals.in_app_only = Math.max(0, audience.length - usersWithPush)
    await finishSmartRuleRun(supabase, rule.id, context.date, 'completed', totals)
    return { id: rule.id, label: rule.label, devices: subscriptions.length, ...totals }
  } catch (error) {
    await finishSmartRuleRun(supabase, rule.id, context.date, 'failed', totals, String(error.message || error).slice(0, 500))
    return { id: rule.id, label: rule.label, error: error.message || 'Falha no gatilho inteligente.', ...totals }
  }
}

export async function handleNotificationDispatcher(request) {
  const authorization = request.headers.get('authorization') || ''
  const cronSecrets = [process.env.CRON_SECRET, process.env.PUSH_CRON_SECRET].filter(Boolean)
  if (!cronSecrets.some(secret => authorization === `Bearer ${secret}`)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const supabase = serverClient()
    const context = {
      ...dispatcherContext(request),
      pushConfigured: Boolean(getVapidPublicKey() && (process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY)),
    }
    const [schedules, smartRules] = await Promise.all([
      loadDueSchedules(supabase, context),
      loadDueSmartRules(supabase, context),
    ])
    const results = []
    for (const schedule of schedules) results.push(await runSchedule(supabase, schedule, context))
    for (const rule of smartRules) results.push(await runSmartRule(supabase, rule, context))
    return Response.json(
      { success: true, date: context.date, time: context.time, schedules: schedules.length, smartRules: smartRules.length, results },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function handleScheduledPush(request, type) {
  const fallback = NOTIFICATION_DEFAULTS[type]
  if (!fallback) return Response.json({ error: 'Notificação inválida.' }, { status: 400 })
  const authorization = request.headers.get('authorization') || ''
  const cronSecrets = [process.env.CRON_SECRET, process.env.PUSH_CRON_SECRET].filter(Boolean)
  if (!cronSecrets.some(secret => authorization === `Bearer ${secret}`)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    if (!getVapidPublicKey() || !(process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY)) {
      return Response.json({ error: 'Chaves de notificação não configuradas.' }, { status: 503 })
    }
    const supabase = serverClient()
    const today = dateInSaoPaulo()
    const notification = await loadNotificationForDate(supabase, type, today)
    if (!notification.enabled) {
      return Response.json(
        { success: true, type, skipped: true, reason: 'Notificação pausada no Escritório.' },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const pendingSubscriptions = await loadPendingSubscriptions(supabase, slotStart(today, notification.hour))
    let subscriptions = await filterEligibleSubscriptions(supabase, pendingSubscriptions)
    if (type === 'rotina') subscriptions = await attachRoutineActions(supabase, subscriptions, today)
    const totals = { sent: 0, inactive: 0, failed: 0 }
    for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
      const results = await Promise.all(subscriptions.slice(index, index + BATCH_SIZE).map(row => sendOne(supabase, row, today, notification)))
      results.forEach(result => { totals[result] += 1 })
    }
    return Response.json(
      { success: true, type, date: today, total: subscriptions.length, message_position: notification.message_position || null, ...totals },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
