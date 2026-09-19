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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

async function loadAdminPayload(supabase, admin) {
  const today = dateInSaoPaulo()
  const [settings, messages, activeResult, mineResult] = await Promise.all([
    loadSettings(supabase),
    loadMessages(supabase),
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
    const settings = body.settings.map(cleanSetting)
    if (new Set(settings.map(item => item.id)).size !== TYPES.length) throw new Error('As configurações estão duplicadas.')
    const motivational = settings.find(item => item.id === 'motivacional')
    if (motivational?.enabled && !body.messages.some(item => item.enabled !== false && String(item.body_template || '').trim())) {
      throw new Error('Mantenha pelo menos uma mensagem motivacional ativa ou pause o envio das 8h.')
    }

    await saveMessages(supabase, body.messages)
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
    let sent = 0
    let inactive = 0
    for (const item of subscriptions) {
      try {
        const values = { name, action: item.routineAction }
        await sendPushNotification(
          { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
          {
            title: renderNotificationTemplate(notification.title_template, values),
            body: renderNotificationTemplate(notification.body_template, values),
            icon: '/pwa-icon-192.png',
            badge: '/pwa-icon-192.png',
            tag: `${notification.tag}-teste-${Date.now()}`,
            url: '/painel',
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
    if (!sent) throw new Error('Nenhum celular ativo recebeu o teste. Ative novamente as notificações no app.')
    return response({ success: true, sent, inactive })
  } catch (error) {
    return response({ error: error.message || 'Não foi possível enviar o teste.' }, 400)
  }
}
