import { createHash } from 'node:crypto'

export function protocolNotificationId(ownerId, lessonId) {
  const hex = createHash('md5').update(`protocol:${ownerId}:${lessonId}`).digest('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

export async function ensureProtocolHistory(supabase, run, course, lesson, index, today) {
  const id = protocolNotificationId(run.owner_id, lesson.id)
  const row = {
    id, user_id: run.owner_id, notification_type: 'personalizada',
    title: `Dia ${index+1} do seu Protocolo`,
    body: (lesson.protocol_notification || `Sua missão de hoje é: ${lesson.title}. Toque para abrir a aula.`).slice(0,240),
    target_url: `/protocolo/${course.slug}?aula=${lesson.id}`,
    scheduled_for: today,
  }
  const { error } = await supabase.from('user_notifications').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  return row
}
