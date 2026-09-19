import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushNotification } from '@/lib/pushNotifications'
import { NOTIFICATION_DEFAULTS, renderNotificationTemplate } from '@/lib/scheduledPushNotifications'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const TYPES = ['motivacional', 'rotina']

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
  return {
    id,
    enabled: value.enabled !== false,
    title_template: title,
    body_template: body,
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

export async function GET(request) {
  const supabase = adminClient()
  if (!await authorize(request, supabase)) return response({ error: 'Não autorizado.' }, 403)

  try {
    const [settings, activeResult] = await Promise.all([
      loadSettings(supabase),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
    ])
    if (activeResult.error) throw activeResult.error
    return response({ settings, activeDevices: activeResult.count || 0 })
  } catch (error) {
    return response({ error: error.message || 'Não foi possível carregar as notificações.' }, 500)
  }
}

export async function PUT(request) {
  const supabase = adminClient()
  if (!await authorize(request, supabase)) return response({ error: 'Não autorizado.' }, 403)

  try {
    const body = await request.json()
    if (!Array.isArray(body.settings) || body.settings.length !== TYPES.length) {
      throw new Error('Envie as duas configurações de notificação.')
    }
    const settings = body.settings.map(cleanSetting)
    if (new Set(settings.map(item => item.id)).size !== TYPES.length) {
      throw new Error('As configurações estão duplicadas.')
    }
    const { error } = await supabase.from('notification_settings').upsert(settings, { onConflict: 'id' })
    if (error) throw error
    return response({ success: true, settings: await loadSettings(supabase) })
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

    const settings = await loadSettings(supabase)
    const setting = settings.find(item => item.id === type)
    const [profileResult, legacyResult, subscriptionsResult] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', admin.id).maybeSingle(),
      supabase.from('perfis').select('nome').eq('id', admin.id).maybeSingle(),
      supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', admin.id).eq('active', true),
    ])
    if (profileResult.error) throw profileResult.error
    if (legacyResult.error) throw legacyResult.error
    if (subscriptionsResult.error) throw subscriptionsResult.error

    const subscriptions = subscriptionsResult.data || []
    if (!subscriptions.length) {
      throw new Error('Ative as notificações neste celular primeiro e tente novamente.')
    }

    const name = profileResult.data?.name || legacyResult.data?.nome || 'lojista'
    let sent = 0
    let inactive = 0
    for (const item of subscriptions) {
      try {
        await sendPushNotification(
          { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
          {
            title: renderNotificationTemplate(setting.title_template, name),
            body: renderNotificationTemplate(setting.body_template, name),
            icon: '/pwa-icon-192.png',
            badge: '/pwa-icon-192.png',
            tag: `${setting.tag}-teste-${Date.now()}`,
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
