import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '@/lib/pushNotifications'
import { dateInSaoPaulo } from '@/lib/scheduledPushNotifications'
import { protocolDay } from '@/lib/protocolGuidance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
export async function GET(request) {
  const secrets = [process.env.CRON_SECRET, process.env.PUSH_CRON_SECRET].filter(Boolean)
  if (!secrets.some(value => request.headers.get('authorization') === `Bearer ${value}`)) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  try {
    const supabase = client(), today = dateInSaoPaulo()
    const start = new Date(`${today}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-6)
    const earliest = start.toISOString().slice(0,10)
    const runs = []
    for (let offset=0;offset<5000;offset+=500) {
      const {data,error} = await supabase.from('protocol_runs').select('owner_id,course_id,started_on')
        .gte('started_on',earliest).lte('started_on',today).range(offset,offset+499)
      if(error)throw error
      runs.push(...(data||[]))
      if(!data||data.length<500)break
    }
    let sent=0,skipped=0,failed=0
    for (const run of runs) {
      const index=protocolDay(run.started_on,today)-1
      if(index<0||index>6)continue
      const [courseResult,enrollmentResult,profileResult,legacyResult,subscriptionResult] = await Promise.all([
        supabase.from('courses').select('slug,title,is_published,protocol_enabled').eq('id',run.course_id).maybeSingle(),
        supabase.from('enrollments').select('id').eq('profile_id',run.owner_id).eq('course_id',run.course_id).eq('status','active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle(),
        supabase.from('profiles').select('status').eq('id',run.owner_id).maybeSingle(),
        supabase.from('perfis').select('status_assinatura,tipo_acesso,acesso_expira_em').eq('id',run.owner_id).maybeSingle(),
        supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',run.owner_id).eq('active',true),
      ])
      if([courseResult,enrollmentResult,profileResult,legacyResult,subscriptionResult].some(result=>result.error)) {failed++;continue}
      const course=courseResult.data,legacy=legacyResult.data
      const expired=legacy&&['teste','avista'].includes(legacy.tipo_acesso)&&legacy.acesso_expira_em&&new Date(`${legacy.acesso_expira_em}T23:59:59-03:00`)<new Date()
      if(!course?.protocol_enabled||!course.is_published||!enrollmentResult.data||(profileResult.data&&profileResult.data.status!=='active')||expired||['atrasado','cancelado','reembolsado','reembolsada','refunded'].includes(legacy?.status_assinatura)){skipped++;continue}
      const {data:lessons,error:lessonError}=await supabase.from('lessons').select('id,title,protocol_notification').eq('course_id',run.course_id).eq('is_published',true).order('sort_order').order('created_at')
      if(lessonError||lessons?.length!==7||!lessons[index]){skipped++;continue}
      const lesson=lessons[index]
      const {data:entry}=await supabase.from('protocol_entries').select('completed_at').eq('owner_id',run.owner_id).eq('lesson_id',lesson.id).maybeSingle()
      if(entry?.completed_at){skipped++;continue}
      for (const sub of subscriptionResult.data||[]) {
        const key={owner_id:run.owner_id,course_id:run.course_id,lesson_id:lesson.id,subscription_id:sub.id}
        const {error:claim}=await supabase.from('protocol_notification_deliveries').insert(key)
        if(claim?.code==='23505')continue
        if(claim){failed++;continue}
        try {
          await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}}, {
            title:`Dia ${index+1} do seu Protocolo`,body:lesson.protocol_notification||`Sua missão de hoje é: ${lesson.title}. Toque para abrir a aula.`,
            icon:'/pwa-icon-192.png',badge:'/notification-badge.png',tag:`protocolo-${run.course_id}-${index+1}`,
            url:`/protocolo/${course.slug}?aula=${lesson.id}`,
          })
          sent++
        } catch (error) {
          await supabase.from('protocol_notification_deliveries').delete().match(key)
          if(error?.statusCode===404||error?.statusCode===410)await supabase.from('push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('id',sub.id)
          failed++
        }
      }
    }
    return Response.json({success:true,date:today,runs:runs.length,sent,skipped,failed},{headers:{'Cache-Control':'no-store'}})
  } catch { return Response.json({error:'Não foi possível processar os lembretes.'},{status:500}) }
}
