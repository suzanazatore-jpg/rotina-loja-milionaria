import { createClient } from '@supabase/supabase-js'
import { getVapidPublicKey, sendPushNotification } from '@/lib/pushNotifications'

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
  const name = firstName(input.name) || 'lojista'
  const action = String(input.action || 'começar pela primeira etapa da rotina').trim().slice(0, 120)
  return String(template || '').replaceAll('{{nome}}', name).replaceAll('{{acao}}', action)
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
  const plan = data?.plano_dias?.[context.dayKey]
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
    await sendPushNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      {
        title: renderNotificationTemplate(notification.title_template, values),
        body: renderNotificationTemplate(notification.body_template, values),
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: `${notification.tag}-${schedule.id}-${today}`,
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

async function loadDueSchedules(supabase, context) {
  const { data, error } = await supabase
    .from('notification_schedules')
    .select('id,label,notification_type,send_time,weekdays,title_template,body_template,enabled,position')
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

  const totals = { sent: 0, inactive: 0, failed: 0 }
  try {
    const notification = await notificationForSchedule(supabase, schedule, context.date)
    if (!notification.enabled) {
      await finishScheduleRun(supabase, schedule.id, context.date, 'completed', totals)
      return { id: schedule.id, label: schedule.label, skipped: true, reason: 'Conteúdo pausado no Escritório.', ...totals }
    }
    const activeSubscriptions = await loadAllActiveSubscriptions(supabase)
    let subscriptions = await filterEligibleSubscriptions(supabase, activeSubscriptions)
    if (schedule.notification_type === 'rotina') subscriptions = await attachRoutineActions(supabase, subscriptions, context.date)
    for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
      const results = await Promise.all(subscriptions.slice(index, index + BATCH_SIZE).map(row => (
        sendOneForSchedule(supabase, row, context.date, notification, schedule)
      )))
      results.forEach(result => { totals[result] += 1 })
    }
    await finishScheduleRun(supabase, schedule.id, context.date, 'completed', totals)
    return { id: schedule.id, label: schedule.label, total: subscriptions.length, ...totals }
  } catch (error) {
    await finishScheduleRun(supabase, schedule.id, context.date, 'failed', totals, String(error.message || error).slice(0, 500))
    return { id: schedule.id, label: schedule.label, error: error.message || 'Falha no envio.', ...totals }
  }
}

export async function handleNotificationDispatcher(request) {
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
    const context = dispatcherContext(request)
    const schedules = await loadDueSchedules(supabase, context)
    const results = []
    for (const schedule of schedules) results.push(await runSchedule(supabase, schedule, context))
    return Response.json(
      { success: true, date: context.date, time: context.time, schedules: schedules.length, results },
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
