import { randomUUID } from 'node:crypto'
import { installationReport } from './appInstallationReportServer.js'
import { installationMessage, whatsappNumber } from './commerceNotices.js'
import { validId } from './centralRecords.js'

async function checked(query) { const { data, error } = await query; if (error) throw error; return data }
export async function sendInstallationWhatsappBatch(db, admin, ids, send = fetch) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !validId(id))) throw Error('Selecione de 1 a 100 alunos válidos.')
  const hook = process.env.PABBLY_CAMPANHA_WEBHOOK_URL
  if (!hook) throw Error('O envio em massa por WhatsApp ainda não está configurado. Você pode usar os links individuais ou o envio em massa por e-mail.')
  const requested = new Set(ids)
  const people = (await installationReport(db)).filter(row => requested.has(row.id) && !row.confirmed_at && whatsappNumber(row.phone))
  const prepared = []
  for (const person of people) {
    await checked(db.from('app_install_reminders').update({ status: 'unknown' }).eq('user_id', person.id).eq('channel', 'whatsapp').eq('status', 'sending').lt('created_at', new Date(Date.now() - 5 * 60000).toISOString()))
    const recent = await checked(db.from('app_install_reminders').select('id').eq('user_id', person.id).eq('channel', 'whatsapp').in('status', ['sending','accepted','unknown']).gte('created_at', new Date(Date.now() - 86400000).toISOString()).limit(1))
    if (recent.length) continue
    const saved = await db.from('app_install_reminders').insert({ user_id: person.id, sent_by: admin.id, channel: 'whatsapp', status: 'sending' }).select('id').single()
    if (saved.error?.code === '23505') continue
    if (saved.error) throw saved.error
    prepared.push({ person, id: saved.data.id })
  }
  if (!prepared.length) return { accepted: 0, skipped: requested.size, message: 'Nenhum aluno elegível: confira instalação, telefone e lembretes nas últimas 24 horas.' }
  const deliveryIds = prepared.map(row => row.id)
  let response
  try {
    response = await send(hook, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evento: 'campanha_em_massa', campanha_id: randomUUID(), titulo: 'Lembrete de instalação do app', mensagem: installationMessage('aluno').replace('Olá, aluno!', 'Olá!'), destinatarios: prepared.map(({ person, id }) => ({ id: person.id, delivery_id: id, nome: person.name, primeiro_nome: String(person.name || '').split(' ')[0], email: person.email, telefone: whatsappNumber(person.phone) })) }) })
  } catch {
    await checked(db.from('app_install_reminders').update({ status: 'unknown' }).in('id', deliveryIds))
    return { accepted: 0, unknown: prepared.length, skipped: requested.size - prepared.length, message: 'O fluxo não confirmou a resposta. Verifique o histórico antes de repetir.' }
  }
  await checked(db.from('app_install_reminders').update({ status: response.ok ? 'accepted' : 'failed' }).in('id', deliveryIds))
  return { accepted: response.ok ? prepared.length : 0, failed: response.ok ? 0 : prepared.length, skipped: requested.size - prepared.length, message: response.ok ? 'Lembretes encaminhados ao fluxo de WhatsApp; a entrega depende do resultado desse fluxo.' : 'O fluxo de WhatsApp recusou o lote.' }
}
