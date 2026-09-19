import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushNotification } from '@/lib/pushNotifications'
import {
  NOTIFICATION_DEFAULTS,
  attachRoutineActions,
  dateInSaoPaulo,
  loadNotificationForDate,
  renderNotificationTemplate,
} from '@/lib/scheduledPushNotifications'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const TYPES = ['motivacional', 'rotina']
const SCHEDULE_TYPES = [...TYPES, 'personalizada']
const SMART_RULE_IDS = ['inactive_3_days', 'routine_pending', 'below_goal', 'calendar_today', 'campaign_upcoming']
const TARGET_SECTIONS = ['inicio', 'rotina', 'vendas', 'calendario', 'campanhas']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCHEDULE_TIME = /^(?:[01]\d|2[0-3]):(?:00|30)$/

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function authorize(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL ? user : null
}

function response(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function cleanSetting(value) {
  const id = String(value?.id || '')
  const title = String(value?.title_template || '').trim()
  const body = String(value?.body_template || '').trim()
  if (!TYPES.includes(id)) throw new Error('Tipo de notificação inválido.')
  if (!title || title.length > 80) throw new Error('O título deve ter entre 1 e 80 caracteres.')
  if (!body || body.length > 240) throw new Error('A mensagem deve ter entre 1 e 240 caracteres.')
  return { id, enabled: value.enabled !== false, title_template: title, body_template: body, updated_at: new Date().toISOString() }
}

function cleanMessage(value, index) {
  const body = String(value?.body_template || '').trim()
  if (!body || body.length > 240) throw new Error(`A mensagem ${index + 1} deve ter entre 1 e 240 caracteres.`)
  return {
    id: UUID.test(String(value?.id || '')) ? value.id : crypto.randomUUID(),
    type: 'motivacional',
    body_template: body,
    position: index + 1,
    enabled: value.enabled !== false,
    updated_at: new Date().toISOString(),
  }
}

function cleanPlanIds(value, validPlanIds, label) {
  const ids = [...new Set((Array.isArray(value) ? value : []).map(String))]
  if (ids.length > 50 || ids.some(id => !UUID.test(id) || !validPlanIds.has(id))) {
    throw new Error(`Existe um plano inválido em ${label}.`)
  }
  return ids
}

function cleanSchedule(value, index, validPlanIds) {
  const type = String(value?.notification_type || '')
  const label = String(value?.label || '').trim()
  const sendTime = String(value?.send_time || '').slice(0, 5)
  const weekdays = [...new Set((Array.isArray(value?.weekdays) ? value.weekdays : []).map(Number))].sort((a, b) => a - b)
  const title = String(value?.title_template || '').trim()
  const body = String(value?.body_template || '').trim()
  if (!SCHEDULE_TYPES.includes(type)) throw new Error(`O horário ${index + 1} possui um tipo inválido.`)
  if (!label || label.length > 80) throw new Error(`O nome do horário ${index + 1} deve ter entre 1 e 80 caracteres.`)
  if (!SCHEDULE_TIME.test(sendTime)) throw new Error(`Escolha um horário válido de 30 em 30 minutos no item ${index + 1}.`)
  if (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error(`Escolha pelo menos um dia da semana no horário ${index + 1}.`)
  }
  if (type === 'personalizada' && (!title || title.length > 80 || !body || body.length > 240)) {
    throw new Error(`Preencha o título e a mensagem personalizada do horário ${index + 1}.`)
  }
  return {
    id: UUID.test(String(value?.id || '')) ? value.id : crypto.randomUUID(),
    label,
    notification_type: type,
    send_time: `${sendTime}:00`,
    weekdays,
    title_template: type === 'personalizada' ? title : null,
    body_template: type === 'personalizada' ? body : null,
    plan_ids: cleanPlanIds(value?.plan_ids, validPlanIds, `horário ${index + 1}`),
    enabled: value.enabled !== false,
    position: index + 1,
    updated_at: new Date().toISOString(),
  }
}

function cleanSmartRule(value, index, validPlanIds) {
  const id = String(value?.id || '')
  const label = String(value?.label || '').trim()
  const description = String(value?.description || '').trim()
  const sendTime = String(value?.send_time || '').slice(0, 5)
  const weekdays = [...new Set((Array.isArray(value?.weekdays) ? value.weekdays : []).map(Number))].sort((a, b) => a - b)
  const title = String(value?.title_template || '').trim()
  const body = String(value?.body_template || '').trim()
  const targetSection = String(value?.target_section || '')
  const cooldownDays = Number(value?.cooldown_days || 1)
  if (!SMART_RULE_IDS.includes(id)) throw new Error(`O gatilho ${index + 1} é inválido.`)
  if (!label || label.length > 80 || !description || description.length > 240) throw new Error(`Revise o nome e a descrição do gatilho ${index + 1}.`)
  if (!SCHEDULE_TIME.test(sendTime)) throw new Error(`Escolha um horário válido no gatilho ${index + 1}.`)
  if (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error(`Escolha os dias do gatilho ${index + 1}.`)
  if (!title || title.length > 80 || !body || body.length > 240) throw new Error(`Revise o título e a mensagem do gatilho ${index + 1}.`)
  if (!TARGET_SECTIONS.includes(targetSection)) throw new Error(`O destino do gatilho ${index + 1} é inválido.`)
  if (!Number.isInteger(cooldownDays) || cooldownDays < 1 || cooldownDays > 90) throw new Error(`O intervalo do gatilho ${index + 1} é inválido.`)
  return {
    id,
    label,
    description,
    send_time: `${sendTime}:00`,
    weekdays,
    title_template: title,
    body_template: body,
    target_section: targetSection,
    cooldown_days: cooldownDays,
    plan_ids: cleanPlanIds(value?.plan_ids, validPlanIds, `gatilho ${index + 1}`),
    enabled: value.enabled === true,
    position: index + 1,
    updated_at: new Date().toISOString(),
  }
}

async function loadSettings(supabase) {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('id,enabled,title_template,body_template,updated_at')
    .order('id')
  if (error) throw error
  const saved = new Map((data || []).map(item => [item.id, item]))
  return TYPES.map(id => ({ id, ...NOTIFICATION_DEFAULTS[id], ...(saved.get(id) || {}) }))
}

async function loadMessages(supabase) {
  const { data, error } = await supabase
    .from('notification_messages')
    .select('id,body_template,position,enabled,updated_at')
    .eq('type', 'motivacional')
    .order('position')
    .order('id')
  if (error) throw error
  return data || []
}

async function loadSchedules(supabase) {
  const { data, error } = await supabase
    .from('notification_schedules')
    .select('id,label,notification_type,send_time,weekdays,title_template,body_template,plan_ids,enabled,position,updated_at')
    .order('position')
    .order('send_time')
  if (error) throw error
  return (data || []).map(item => ({ ...item, send_time: String(item.send_time || '').slice(0, 5) }))
}

async function loadSmartRules(supabase) {
  const { data, error } = await supabase
    .from('notification_smart_rules')
    .select('id,label,description,send_time,weekdays,title_template,body_template,target_section,cooldown_days,plan_ids,enabled,position,updated_at')
    .order('position')
  if (error) throw error
  return (data || []).map(item => ({ ...item, send_time: String(item.send_time || '').slice(0, 5) }))
}

async function loadPlans(supabase) {
  const { data, error } = await supabase.from('plans').select('id,name').not('offer_id', 'like', '__individual_%').order('name')
  if (error) throw error
  return data || []
}

async function saveMessages(supabase, messages) {
  const cleaned = messages.map(cleanMessage)
  if (new Set(cleaned.map(item => item.id)).size !== cleaned.length) throw new Error('Existem mensagens duplicadas.')

  const { data: existing, error: existingError } = await supabase
    .from('notification_messages')
    .select('id')
    .eq('type', 'motivacional')
  if (existingError) throw existingError

  if (cleaned.length) {
    const { error } = await supabase.from('notification_messages').upsert(cleaned, { onConflict: 'id' })
    if (error) throw error
  }
  const kept = new Set(cleaned.map(item => item.id))
  const removed = (existing || []).map(item => item.id).filter(id => !kept.has(id))
  if (removed.length) {
    const { error } = await supabase.from('notification_messages').delete().in('id', removed)
    if (error) throw error
  }
  return cleaned
}

async function saveSchedules(supabase, schedules, validPlanIds) {
  if (schedules.length > 20) throw new Error('Você pode cadastrar até 20 horários de notificação.')
  const cleaned = schedules.map((item, index) => cleanSchedule(item, index, validPlanIds))
  if (new Set(cleaned.map(item => item.id)).size !== cleaned.length) throw new Error('Existem horários duplicados.')

  const { data: existing, error: existingError } = await supabase.from('notification_schedules').select('id')
  if (existingError) throw existingError
  if (cleaned.length) {
    const { error } = await supabase.from('notification_schedules').upsert(cleaned, { onConflict: 'id' })
    if (error) throw error
  }
  const kept = new Set(cleaned.map(item => item.id))
  const removed = (existing || []).map(item => item.id).filter(id => !kept.has(id))
  if (removed.length) {
    const { error } = await supabase.from('notification_schedules').delete().in('id', removed)
    if (error) throw error
  }
  return cleaned
}

async function saveSmartRules(supabase, rules, validPlanIds) {
  if (rules.length !== SMART_RULE_IDS.length) throw new Error('Envie os cinco gatilhos inteligentes.')
  const cleaned = rules.map((item, index) => cleanSmartRule(item, index, validPlanIds))
  if (new Set(cleaned.map(item => item.id)).size !== SMART_RULE_IDS.length) throw new Error('Existem gatilhos duplicados.')
  const { error } = await supabase.from('notification_smart_rules').upsert(cleaned, { onConflict: 'id' })
  if (error) throw error
  return cleaned
}

async function loadAdminPayload(supabase, admin) {
  const today = dateInSaoPaulo()
  const [settings, messages, schedules, smartRules, plans, activeResult, mineResult] = await Promise.all([
    loadSettings(supabase),
    loadMessages(supabase),
    loadSchedules(supabase),
    loadSmartRules(supabase),
    loadPlans(supabase),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true).eq('user_id', admin.id),
  ])
  if (activeResult.error) throw activeResult.error
  if (mineResult.error) throw mineResult.error

  const motivational = await loadNotificationForDate(supabase, 'motivacional', today)
  const [routinePreview] = await attachRoutineActions(supabase, [{ user_id: admin.id }], today)
  return {
    settings,
    messages,
    schedules,
    smartRules,
    plans,
    activeDevices: activeResult.count || 0,
    myActiveDevices: mineResult.count || 0,
    todayMessageId: motivational.message_id || null,
    routineAction: routinePreview?.routineAction || 'começar pela primeira etapa da rotina',
    routineAvailable: routinePreview?.routineAvailable || false,
  }
}

export async function GET(request) {
  const supabase = adminClient()
  const admin = await authorize(request, supabase)
  if (!admin) return response({ error: 'Não autorizado.' }, 403)
  try {
    return response(await loadAdminPayload(supabase, admin))
  } catch (error) {
    return response({ error: error.message || 'Não foi possível carregar as notificações.' }, 500)
  }
}

export async function PUT(request) {
  const supabase = adminClient()
  const admin = await authorize(request, supabase)
  if (!admin) return response({ error: 'Não autorizado.' }, 403)
  try {
    const body = await request.json()
    if (!Array.isArray(body.settings) || body.settings.length !== TYPES.length) {
      throw new Error('Envie as duas configurações de notificação.')
    }
    if (!Array.isArray(body.messages)) throw new Error('Envie o banco de mensagens motivacionais.')
    if (!Array.isArray(body.schedules)) throw new Error('Envie os horários de notificação.')
    if (!Array.isArray(body.smartRules)) throw new Error('Envie os gatilhos inteligentes.')
    const settings = body.settings.map(cleanSetting)
    if (new Set(settings.map(item => item.id)).size !== TYPES.length) throw new Error('As configurações estão duplicadas.')
    const motivational = settings.find(item => item.id === 'motivacional')
    if (motivational?.enabled && !body.messages.some(item => item.enabled !== false && String(item.body_template || '').trim())) {
      throw new Error('Mantenha pelo menos uma mensagem motivacional ativa ou pause o envio das 8h.')
    }

    const plans = await loadPlans(supabase)
    const validPlanIds = new Set(plans.map(item => item.id))
    await Promise.all([
      saveMessages(supabase, body.messages),
      saveSchedules(supabase, body.schedules, validPlanIds),
      saveSmartRules(supabase, body.smartRules, validPlanIds),
    ])
    const { error } = await supabase.from('notification_settings').upsert(settings, { onConflict: 'id' })
    if (error) throw error
    return response({ success: true, ...(await loadAdminPayload(supabase, admin)) })
  } catch (error) {
    return response({ error: error.message || 'Não foi possível salvar as notificações.' }, 400)
  }
}

export async function POST(request) {
  const supabase = adminClient()
  const admin = await authorize(request, supabase)
  if (!admin) return response({ error: 'Não autorizado.' }, 403)
  try {
    const { type } = await request.json()
    if (!TYPES.includes(type)) throw new Error('Tipo de notificação inválido.')

    const today = dateInSaoPaulo()
    const notification = await loadNotificationForDate(supabase, type, today)
    const [profileResult, legacyResult, subscriptionsResult] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', admin.id).maybeSingle(),
      supabase.from('perfis').select('nome').eq('id', admin.id).maybeSingle(),
      supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('user_id', admin.id).eq('active', true),
    ])
    if (profileResult.error) throw profileResult.error
    if (legacyResult.error) throw legacyResult.error
    if (subscriptionsResult.error) throw subscriptionsResult.error

    let subscriptions = subscriptionsResult.data || []
    if (!subscriptions.length) throw new Error('Ative as notificações neste celular primeiro e tente novamente.')
    if (type === 'rotina') subscriptions = await attachRoutineActions(supabase, subscriptions, today)

    const name = profileResult.data?.name || legacyResult.data?.nome || 'lojista'
    const historyId = crypto.randomUUID()
    const values = { name, action: subscriptions[0]?.routineAction }
    const title = renderNotificationTemplate(notification.title_template, values).slice(0, 80)
    const body = renderNotificationTemplate(notification.body_template, values).slice(0, 240)
    const targetParams = new URLSearchParams()
    if (type === 'rotina') targetParams.set('secao', 'rotina')
    targetParams.set('notificacao', historyId)
    const targetUrl = `/painel?${targetParams.toString()}`
    const { error: historyError } = await supabase.from('user_notifications').insert({
      id: historyId,
      user_id: admin.id,
      notification_type: type,
      title,
      body,
      target_url: targetUrl,
      scheduled_for: today,
    })
    if (historyError) throw historyError

    let sent = 0
    let inactive = 0
    for (const item of subscriptions) {
      try {
        await sendPushNotification(
          { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
          {
            title,
            body,
            icon: '/pwa-icon-192.png',
            badge: '/pwa-icon-192.png',
            tag: `${notification.tag}-teste-${Date.now()}`,
            url: targetUrl,
          },
        )
        sent += 1
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', item.id)
          inactive += 1
        } else {
          throw error
        }
      }
    }
    if (!sent) {
      await supabase.from('user_notifications').delete().eq('id', historyId).eq('user_id', admin.id)
      throw new Error('Nenhum celular ativo recebeu o teste. Ative novamente as notificações no app.')
    }
    const { error: deliveryError } = await supabase.from('user_notifications').update({
      push_device_count: sent,
      push_sent_at: new Date().toISOString(),
      push_failed_count: 0,
    }).eq('id', historyId).eq('user_id', admin.id)
    if (deliveryError) throw deliveryError
    return response({ success: true, sent, inactive })
  } catch (error) {
    return response({ error: error.message || 'Não foi possível enviar o teste.' }, 400)
  }
}
