import {lastClosedWeek,rangeTotals} from './trafficReportModel.js'
import {allRows,trafficDb} from './trafficReportServer'
import {loadTrafficAccess} from './trafficAccess'
import {sendPushNotification,getVapidPublicKey} from './pushNotifications'
export function trafficChannels(env=process.env){return {email:!!env.BREVO_API_KEY,whatsapp:!!env.TRAFFIC_REPORT_WHATSAPP_WEBHOOK_URL,push:!!getVapidPublicKey()&&!!(env.PUSH_VAPID_PRIVATE_KEY||env.VAPID_PRIVATE_KEY)}}
const brl=n=>n==null?'Não informado':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const number=n=>n==null?'Não informado':n.toLocaleString('pt-BR')
export function weeklySummary(account,rows,range){
 const totals=rangeTotals(rows,range.from,range.to)
 const summary=`${account.name} — ${range.from.split('-').reverse().join('/')} a ${range.to.split('-').reverse().join('/')}\nInvestimento: ${brl(totals.spend)}\nImpressões: ${number(totals.impressions)}\nCliques no link: ${number(totals.clicks)}\nCTR do link: ${totals.ctr==null?'Não informado':number(totals.ctr)+'%'}\nCPC do link: ${brl(totals.cpc)}\nLeads: ${number(totals.leads)}\nConversas iniciadas: ${number(totals.messages)}\nCompras: ${number(totals.purchases)}`
 return {totals,summary,recommendations:'Resultados devem ser avaliados de acordo com o objetivo e evento de cada campanha. As recomendações específicas da gestão serão acrescentadas pela equipe.'}
}
async function checked(result){if(result.error)throw result.error;return result.data}
async function deliver(db,report,user,channel,send){
 const key={report_id:report.id,user_id:user.id,channel}
 const inserted=await db.from('traffic_report_deliveries').insert(key)
 if(inserted.error&&inserted.error.code!=='23505')throw inserted.error
 // A processing/unknown delivery is never retried automatically: the provider may have received it.
 const claimed=await checked(await db.from('traffic_report_deliveries').update({status:'processing',attempted_at:new Date().toISOString()}).match(key).eq('status','pending').select('id'))
 if(!claimed?.length)return
 try{const result=await send(claimed[0].id);await checked(await db.from('traffic_report_deliveries').update({status:result?.status||'sent',provider_id:result?.id||null,sent_at:new Date().toISOString()}).eq('id',claimed[0].id))}
 catch(error){await checked(await db.from('traffic_report_deliveries').update({status:'unknown',error_message:String(error.message||'Falha de entrega').slice(0,240)}).eq('id',claimed[0].id))}
}
export async function runTrafficWeekly(now=new Date()){
 const db=trafficDb(),configuration=await db.from('traffic_report_settings').select('*').eq('id',true).single()
 if(['PGRST205','42P01'].includes(configuration.error?.code))return {enabled:false,reason:'Atualização do banco pendente.'}
 const settings=await checked(configuration)
 if(!settings.weekly_enabled)return {enabled:false,reason:'Avisos semanais aguardam ativação.'}
 const range=lastClosedWeek(now),links=await allRows(()=>db.from('traffic_client_users').select('client_id,user_id').order('client_id').order('user_id'))
 const accounts=await allRows(()=>db.from('traffic_clients').select('id,name,active,mcp_status').eq('active',true).order('id'))
 let published=0,skipped=0
 for(const account of accounts){
  const members=links.filter(l=>l.client_id===account.id);if(!members.length){skipped++;continue}
  const rows=await allRows(()=>db.from('traffic_daily_metrics').select('*').eq('client_id',account.id).gte('metric_date',range.from).lte('metric_date',range.to).order('metric_date'))
  const content=weeklySummary(account,rows,range)
  // Never announce a complete weekly report while any day is missing or collection failed.
  if(content.totals.days!==7||content.totals.spend==null||content.totals.impressions==null){skipped++;continue}
  let report=await checked(await db.from('traffic_reports').select('id,published_at').eq('client_id',account.id).eq('period_type','weekly').eq('period_start',range.from).eq('period_end',range.to).maybeSingle())
  if(report&&!report.published_at){skipped++;continue} // Preserve drafts under editorial review.
  if(!report){const result=await db.from('traffic_reports').insert({client_id:account.id,period_type:'weekly',period_start:range.from,period_end:range.to,summary:content.summary,recommendations:content.recommendations,published_at:now.toISOString()}).select('id,published_at').single();if(result.error?.code==='23505')report=await checked(await db.from('traffic_reports').select('id,published_at').eq('client_id',account.id).eq('period_type','weekly').eq('period_start',range.from).eq('period_end',range.to).single());else report=await checked(result);published++}
  if(!report?.published_at||new Date(report.published_at)>now)continue
  for(const membership of members){
   if(!await loadTrafficAccess(db,membership.user_id)){skipped++;continue}
   const profile=await checked(await db.from('profiles').select('id,name,email,phone').eq('id',membership.user_id).single())
   const legacy=await checked(await db.from('perfis').select('whatsapp').eq('id',membership.user_id).maybeSingle())
   const url=`https://rotina.suzanazatorre.com.br/trafego?report=${report.id}`
   const body=`Seu relatório de campanhas de ${account.name} está pronto. Acesse a plataforma para consultar os resultados.`.slice(0,240)
   await deliver(db,report,profile,'app',async()=>{
    const existing=await checked(await db.from('user_notifications').select('id').eq('user_id',profile.id).eq('rule_id',`traffic-${report.id}`).maybeSingle())
    if(existing)return {id:existing.id}
    const row=await checked(await db.from('user_notifications').insert({user_id:profile.id,notification_type:'personalizada',title:'Seu relatório de campanhas está pronto',body,target_url:'/trafego?report='+report.id,rule_id:`traffic-${report.id}`,scheduled_for:range.to,sent_at:now.toISOString()}).select('id').single())
    return {id:row.id}
   })
   if(settings.push_enabled&&trafficChannels().push)await deliver(db,report,profile,'push',async()=>{
    const subscriptions=await checked(await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id',profile.id).eq('active',true))
    if(!subscriptions.length)return {status:'skipped'}
    const outcomes=await Promise.allSettled(subscriptions.map(sub=>sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title:'Seu relatório está pronto',body,url:'/trafego?report='+report.id,tag:'traffic-'+report.id,icon:'/pwa-icon-192.png',badge:'/notification-badge.png'})))
    if(outcomes.some(r=>r.status==='rejected'))throw Error('Verificar entrega nos dispositivos antes de reenviar.')
   })
   if(settings.email_enabled&&trafficChannels().email&&profile.email)await deliver(db,report,profile,'email',async id=>{
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':process.env.BREVO_API_KEY},signal:AbortSignal.timeout(15000),body:JSON.stringify({sender:{name:'Suzana Zatorre',email:'suporte@suzanazatorre.com.br'},to:[{email:profile.email}],subject:'Seu relatório de campanhas está pronto',textContent:`Olá!\n\n${body}\n\n${url}`,headers:{'X-Mailin-custom':'traffic-delivery:'+id}})})
    if(!response.ok)throw Error('Brevo retornou HTTP '+response.status)
    return {status:'accepted',id:(await response.json()).messageId}
   })
   const phone=String(profile.phone||legacy?.whatsapp||'').replace(/\D/g,'');const recipient=phone.length===10||phone.length===11?'55'+phone:phone
   if(settings.whatsapp_enabled&&trafficChannels().whatsapp&&recipient)await deliver(db,report,profile,'whatsapp',async id=>{
    const response=await fetch(process.env.TRAFFIC_REPORT_WHATSAPP_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({evento:'campanha_em_massa',tipo:'relatorio_trafego_pronto',campanha_id:id,titulo:'Seu relatório de campanhas está pronto',mensagem:`${body}\n${url}`,destinatarios:[{id:profile.id,nome:profile.name||'',primeiro_nome:(profile.name||'Cliente').split(' ')[0],email:profile.email||'',telefone:recipient}]})})
    if(!response.ok)throw Error('Pabbly retornou HTTP '+response.status)
    return {status:'accepted',id}
   })
  }
 }
 return {enabled:true,published,skipped,period:range}
}
