import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '@/lib/pushNotifications'
import { protocolNotificationId } from '@/lib/protocolNotificationHistory'

export const runtime = 'nodejs'
export const maxDuration = 30
const headers = { 'Cache-Control': 'private, no-store' }
const json = (body, status = 200) => Response.json(body, { status, headers })

export async function POST(request) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const authorization = request.headers.get('authorization') || ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Não autorizado.' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authorization.slice(7))
    if (authError || !user) return json({ error: 'Não autorizado.' }, 401)
    const body = await request.json().catch(() => ({}))
    // The client can only select an already registered device belonging to this account.
    const { data: sub, error } = await supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', user.id).eq('endpoint', String(body.endpoint || '')).eq('active', true).maybeSingle()
    if (error) throw error
    if (!sub) return json({ error: 'Ative as notificações neste aparelho antes de testar.' }, 409)
    const now = new Date()
    const id = protocolNotificationId(user.id, `test:${Math.floor(now.getTime()/60000)}`)
    const row = { id, user_id: user.id, notification_type: 'personalizada', title: 'Teste de notificação', body: 'Se este aviso apareceu, o aparelho recebeu a notificação de teste.', target_url: '/painel', scheduled_for: now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
    const { error: claimError } = await supabase.from('user_notifications').insert(row)
    if (claimError?.code === '23505') return json({ error: 'Aguarde um minuto antes de testar novamente.' }, 429)
    if (claimError) throw claimError
    // Keep the request alive while the user returns to the phone's home screen.
    await new Promise(resolve => setTimeout(resolve, 5000))
    try {
      await sendPushNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title: row.title, body: row.body, tag: `teste-${id}`, url: '/painel', icon: '/pwa-icon-192.png', badge: '/notification-badge.png' })
    } catch (sendError) {
      await supabase.from('user_notifications').update({ push_failed_count: 1 }).eq('id', id)
      if ([404,410].includes(sendError?.statusCode)) {
        await supabase.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', sub.id)
        return json({ error: 'O cadastro deste aparelho expirou. Desative e ative as notificações para cadastrar novamente.' }, 410)
      }
      return json({ error: 'O serviço recusou o envio de teste. Tente novamente em um minuto.' }, 502)
    }
    const { error: historyError } = await supabase.from('user_notifications').update({ push_sent_at: new Date().toISOString(), push_device_count: 1 }).eq('id', id)
    if (historyError) return json({ error: 'Teste enviado, mas não foi possível atualizar o histórico.' }, 500)
    return json({ success: true, message: 'Teste enviado ao serviço. Confira se o alerta apareceu neste aparelho.' })
  } catch { return json({ error: 'Não foi possível testar a notificação agora.' }, 500) }
}
