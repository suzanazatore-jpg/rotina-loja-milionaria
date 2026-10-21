import {trafficDb,trafficUser,TRAFFIC_ADMIN} from '@/lib/trafficReportServer'
import {trafficChannels} from '@/lib/trafficWeeklyReports'
const headers={'Cache-Control':'private, no-store'}
export async function GET(request){try{
 const db=trafficDb(),user=await trafficUser(request,db)
 if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
 const settings=await db.from('traffic_report_settings').select('*').eq('id',true).single()
 if(settings.error)throw settings.error
 const deliveries=await db.from('traffic_report_deliveries').select('id,channel,status,error_message,created_at').order('created_at',{ascending:false}).limit(100)
 if(deliveries.error)throw deliveries.error
 return Response.json({settings:settings.data,channels:trafficChannels(),deliveries:deliveries.data},{headers})
}catch{return Response.json({error:'Configuração semanal ainda não disponível.'},{status:503,headers})}}
export async function PATCH(request){try{
 const db=trafficDb(),user=await trafficUser(request,db)
 if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
 const body=await request.json(),update={updated_at:new Date().toISOString()}
 for(const key of ['weekly_enabled','push_enabled','email_enabled','whatsapp_enabled'])if(typeof body[key]==='boolean')update[key]=body[key]
 const current=await db.from('traffic_report_settings').select('*').eq('id',true).single();if(current.error)throw current.error
 const next={...current.data,...update},channels=trafficChannels()
 if(next.weekly_enabled&&((next.email_enabled&&!channels.email)||(next.whatsapp_enabled&&!channels.whatsapp)||(next.push_enabled&&!channels.push)))return Response.json({error:'Conclua a configuração dos canais selecionados antes de ativar.'},{status:409,headers})
 const result=await db.from('traffic_report_settings').update(update).eq('id',true);if(result.error)throw result.error
 return Response.json({success:true},{headers})
}catch{return Response.json({error:'Não foi possível salvar a configuração.'},{status:500,headers})}}
