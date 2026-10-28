import {lastClosedWeek,rangeTotals} from './trafficReportModel.js'
import {groupWeeklyReports,weeklyDigestNotice,weeklyDeliveryKey} from './trafficReportDigest.js'
import {allRows,trafficDb} from './trafficReportServer'
import {loadTrafficAccess} from './trafficAccess'
import {trafficChannels,sendTrafficChannel} from './trafficNotificationChannels'
export {trafficChannels} from './trafficNotificationChannels'
const brl=n=>n==null?'Não informado':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const number=n=>n==null?'Não informado':n.toLocaleString('pt-BR')
export function weeklySummary(account,rows,range){
 const totals=rangeTotals(rows,range.from,range.to)
 const summary=`${account.name} — ${range.from.split('-').reverse().join('/')} a ${range.to.split('-').reverse().join('/')}\nInvestimento: ${brl(totals.spend)}\nImpressões: ${number(totals.impressions)}\nCliques no link: ${number(totals.clicks)}\nCTR do link: ${totals.ctr==null?'Não informado':number(totals.ctr)+'%'}\nCPC do link: ${brl(totals.cpc)}\nLeads: ${number(totals.leads)}\nConversas iniciadas: ${number(totals.messages)}\nCompras: ${number(totals.purchases)}`
 return {totals,summary,recommendations:'Resultados devem ser avaliados de acordo com o objetivo e evento de cada campanha. As recomendações específicas da gestão serão acrescentadas pela equipe.'}
}
async function checked(result){if(result.error)throw result.error;return result.data}
export async function deliverTraffic(db,report,user,channel,send){
 const key={...(report.test_id?{test_id:report.test_id}:report.batch_key?{batch_key:report.batch_key}:{report_id:report.id}),user_id:user.id,channel}
 const inserted=await db.from('traffic_report_deliveries').insert({...key,...(report.batch_key?{report_ids:report.report_ids}: {})})
 if(inserted.error&&inserted.error.code!=='23505')throw inserted.error
 // A processing/unknown delivery is never retried automatically: the provider may have received it.
 const claimed=await checked(await db.from('traffic_report_deliveries').update({status:'processing',attempted_at:new Date().toISOString()}).match(key).eq('status','pending').select('id'))
 if(!claimed?.length){const existing=await checked(await db.from('traffic_report_deliveries').select('id,channel,status,error_message').match(key).single());return {...existing,reused:true}}
 try{const result=await send(claimed[0].id);await checked(await db.from('traffic_report_deliveries').update({status:result?.status||'sent',provider_id:result?.id||null,sent_at:['skipped','failed'].includes(result?.status)?null:new Date().toISOString(),error_message:result?.reason||null}).eq('id',claimed[0].id));return {id:claimed[0].id,channel,status:result?.status||'sent',reason:result?.reason}}
 catch(error){await checked(await db.from('traffic_report_deliveries').update({status:'unknown',error_message:String(error.message||'Falha de entrega').slice(0,240)}).eq('id',claimed[0].id));return {id:claimed[0].id,channel,status:'unknown',reason:String(error.message||'Falha de entrega')}}
}
export async function runTrafficWeekly(now=new Date(),{notify=true}={}){
 const db=trafficDb(),configuration=await db.from('traffic_report_settings').select('*').eq('id',true).single()
 if(['PGRST205','42P01'].includes(configuration.error?.code))return {enabled:false,reason:'Atualização do banco pendente.'}
 const settings=await checked(configuration)
 if(!settings.weekly_enabled)return {enabled:false,reason:'Avisos semanais aguardam ativação.'}
 const range=lastClosedWeek(now),links=await allRows(()=>db.from('traffic_client_users').select('client_id,user_id').order('client_id').order('user_id'))
 const accounts=await allRows(()=>db.from('traffic_clients').select('id,name,active,mcp_status').eq('active',true).order('id'))
 const prepared=[]
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
  prepared.push({...report, client_id:account.id, account_name:account.name})
 }
 if(notify)for(const group of groupWeeklyReports(prepared,links)){
   if(!await loadTrafficAccess(db,group.user_id)){skipped++;continue}
   const profile=await checked(await db.from('profiles').select('id,name,email,phone').eq('id',group.user_id).single())
   const legacy=await checked(await db.from('perfis').select('whatsapp').eq('id',group.user_id).maybeSingle())
   const recipient={...profile,phone:profile.phone||legacy?.whatsapp}
   const notice=weeklyDigestNotice(range,group.reports)
   const batch={batch_key:weeklyDeliveryKey(range),report_ids:group.reports.map(r=>r.id)}
   for(const channel of ['app','push','email','whatsapp']){
    if(channel!=='app'&&!settings[channel+'_enabled'])continue
    await deliverTraffic(db,batch,recipient,channel,id=>sendTrafficChannel(db,recipient,channel,notice,id))
   }
 }

 return {enabled:true,published,skipped,period:range,notifications:notify}
}
