import { allRows } from './centralRecords.js'
import { installationMessage, whatsappNumber, SALES_RECIPIENTS } from './commerceNotices.js'

export async function installationReportUser(request, db) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return null
  return user.email === 'suporte@suzanazatorre.com.br' || SALES_RECIPIENTS.includes(user.id) ? user : null
}

export async function installationReport(db) {
  const [profiles, installations, subscriptions, reminders] = await Promise.all([
    allRows(() => db.from('profiles').select('id,name,email,phone,status').eq('role', 'student').eq('status', 'active').order('id')),
    allRows(() => db.from('app_installations').select('user_id,confirmed_at').order('user_id')),
    allRows(() => db.from('push_subscriptions').select('user_id').eq('active', true).order('id')),
    allRows(() => db.from('app_install_reminders').select('user_id,created_at,status').order('created_at', { ascending: false }).order('id')),
  ])
  const installed = new Map(installations.map(row => [row.user_id, row.confirmed_at]))
  const push = new Set(subscriptions.map(row => row.user_id))
  const latest = new Map()
  for (const reminder of reminders) if (!latest.has(reminder.user_id)) latest.set(reminder.user_id, reminder)
  return profiles.map(profile => ({ ...profile, confirmed_at: installed.get(profile.id) || null, push_enabled: push.has(profile.id), last_reminder: latest.get(profile.id) || null,
    whatsapp_url: whatsappNumber(profile.phone) ? `https://wa.me/${whatsappNumber(profile.phone)}?text=${encodeURIComponent(installationMessage(profile.name))}` : null,
  }))
}
