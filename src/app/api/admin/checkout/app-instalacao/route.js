import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { installationReport, installationReportUser } from '@/lib/appInstallationReportServer'
import { installationMessage } from '@/lib/commerceNotices'
import { validId } from '@/lib/centralRecords'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request) {
  const db = checkoutAdminClient()
  if (!await installationReportUser(request, db)) return Response.json({ error: 'Acesso restrito.' }, { status: 401, headers })
  try {
    const rows = await installationReport(db)
    return Response.json({ rows, email_enabled: Boolean(process.env.BREVO_API_KEY) }, { headers })
  } catch { return Response.json({ error: 'Não foi possível carregar o relatório.' }, { status: 503, headers }) }
}

export async function POST(request) {
  const db = checkoutAdminClient()
  if (!await installationReportUser(request, db)) return Response.json({ error: 'Acesso restrito.' }, { status: 401, headers })
  let delivery
  try {
    const { user_id } = await request.json()
    if (!validId(user_id)) return Response.json({ error: 'Aluno inválido.' }, { status: 400, headers })
    if (!process.env.BREVO_API_KEY) return Response.json({ error: 'Envio de e-mail não configurado.' }, { status: 409, headers })
    const { data: profile, error } = await db.from('profiles').select('id,name,email').eq('id', user_id).eq('role', 'student').eq('status', 'active').single()
    if (error || !profile?.email) return Response.json({ error: 'Aluno ativo com e-mail não encontrado.' }, { status: 404, headers })
    const { data: installation, error: installError } = await db.from('app_installations').select('user_id').eq('user_id', user_id).maybeSingle()
    if (installError) throw installError
    if (installation) return Response.json({ error: 'Este aluno já confirmou a instalação.' }, { status: 409, headers })
    const recovered = await db.from('app_install_reminders').update({ status: 'unknown' }).eq('user_id', user_id).eq('status', 'sending').lt('created_at', new Date(Date.now() - 5 * 60000).toISOString())
    if (recovered.error) throw recovered.error
    const { data: recent, error: recentError } = await db.from('app_install_reminders').select('id').eq('user_id', user_id).in('status', ['sending','accepted','unknown']).gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString()).limit(1)
    if (recentError) throw recentError
    if (recent.length) return Response.json({ error: 'Já existe um lembrete enviado ou em verificação nas últimas 24 horas.' }, { status: 409, headers })
    const { data: { user } } = await db.auth.getUser(request.headers.get('authorization').replace(/^Bearer /, ''))
    // Reserva única impede cliques simultâneos de enviar duas mensagens.
    const saved = await db.from('app_install_reminders').insert({ user_id, sent_by: user.id, status: 'sending' }).select('id').single()
    if (saved.error) throw saved.error
    delivery = saved.data
    let response
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY }, body: JSON.stringify({ sender: { name: 'Suzana Zatorre', email: 'suporte@suzanazatorre.com.br' }, to: [{ email: profile.email, name: profile.name || undefined }], subject: 'Seu app Rotina: veja como instalar no celular', textContent: installationMessage(profile.name) }) })
    } catch {
      await db.from('app_install_reminders').update({ status: 'unknown' }).eq('id', delivery.id)
      return Response.json({ error: 'O provedor não confirmou a resposta. Verifique o envio antes de repetir.' }, { status: 503, headers })
    }
    if (!response.ok) {
      await db.from('app_install_reminders').update({ status: 'failed' }).eq('id', delivery.id)
      return Response.json({ error: 'O provedor recusou o envio do e-mail.' }, { status: 502, headers })
    }
    const receipt = await response.json().catch(() => ({}))
    const updated = await db.from('app_install_reminders').update({ status: 'accepted', provider_id: receipt.messageId || null }).eq('id', delivery.id)
    if (updated.error) throw updated.error
    return Response.json({ success: true, message: 'Lembrete aceito pelo provedor de e-mail.' }, { headers })
  } catch { return Response.json({ error: delivery ? 'Verifique o histórico do provedor antes de reenviar.' : 'Não foi possível preparar o lembrete.' }, { status: 503, headers }) }
}
