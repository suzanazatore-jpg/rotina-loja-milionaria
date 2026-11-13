import { allRows } from './centralRecords.js'
import { installationMessage, whatsappNumber, SALES_RECIPIENTS } from './commerceNotices.js'
import { installationAccountStatus } from './appInstallationStatus.js'

export async function installationReportUser(request, db) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return null
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return null
  return user.email === 'suporte@suzanazatorre.com.br' || SALES_RECIPIENTS.includes(user.id) ? user : null
}

export async function installationReport(db) {
  const [profiles, installations, subscriptions, reminders, legacy, activity] = await Promise.all([
    allRows(() => db.from('profiles').select('id,name,email,phone,status').eq('role', 'student').eq('status', 'active').order('id')),
    allRows(() => db.from('app_installations').select('user_id,confirmed_at,evidence').order('user_id')),
    allRows(() => db.from('push_subscriptions').select('user_id').eq('active', true).order('id')),
    allRows(() => db.from('app_install_reminders').select('user_id,created_at,status').order('created_at', { ascending: false }).order('id')),
    allRows(() => db.from('perfis').select('id,status_assinatura,acesso_expira_em').order('id')),
    allRows(() => db.from('app_user_activity').select('user_id,last_seen_at').order('user_id')),
  ])
  const installed = new Map(installations.map(row => [row.user_id, row]))
  const legacyById = new Map(legacy.map(row => [row.id, row]))
  const lastAccess = new Map(activity.map(row => [row.user_id, row.last_seen_at]))
  const push = new Set(subscriptions.map(row => row.user_id))
  const latest = new Map()
  for (const reminder of reminders) if (!latest.has(reminder.user_id)) latest.set(reminder.user_id, reminder)
  return profiles.map(profile => ({ ...profile, ...installationAccountStatus(profile, legacyById.get(profile.id)), confirmed_at: installed.get(profile.id)?.confirmed_at || null, installation_evidence: installed.get(profile.id)?.evidence || null, last_access_at: lastAccess.get(profile.id) || null, push_enabled: push.has(profile.id), last_reminder: latest.get(profile.id) || null,
    whatsapp_url: whatsappNumber(profile.phone) ? `https://wa.me/${whatsappNumber(profile.phone)}?text=${encodeURIComponent(installationMessage(profile.name))}` : null,
  })).filter(profile => profile.active).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}
