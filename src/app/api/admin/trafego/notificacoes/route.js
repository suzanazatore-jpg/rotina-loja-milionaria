import {loadTrafficAccess} from '@/lib/trafficAccess'
import {trafficDb,trafficUser,TRAFFIC_ADMIN,allRows} from '@/lib/trafficReportServer'
import {trafficChannels,deliverTraffic} from '@/lib/trafficWeeklyReports'
import {sendTrafficChannel} from '@/lib/trafficNotificationChannels'
const headers={'Cache-Control':'private, no-store'}
export async function GET(request){try{
 const db=trafficDb(),user=await trafficUser(request,db)
 if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
 const settings=await db.from('traffic_report_settings').select('*').eq('id',true).single()
 if(settings.error)throw settings.error
 const deliveries=await db.from('traffic_report_deliveries').select('id,channel,status,error_message,created_at,test_id').order('created_at',{ascending:false}).limit(100)
 if(deliveries.error)throw deliveries.error
 const profile=await db.from('profiles').select('name,email,phone').eq('id',user.id).single();if(profile.error)throw profile.error
 const links=await allRows(()=>db.from('traffic_client_users').select('user_id,client_id').order('user_id').order('client_id'))
 const ids=[...new Set(links.map(l=>l.user_id))],recipients=[]
 if(ids.length){const profiles=await db.from('profiles').select('id,name,email,phone').in('id',ids).order('name');if(profiles.error)throw profiles.error;for(const p of profiles.data)if(await loadTrafficAccess(db,p.id))recipients.push({...p,phone:p.phone?'••••'+p.phone.replace(/\D/g,'').slice(-4):null})}
 return Response.json({recipients,settings:settings.data,channels:trafficChannels(),deliveries:deliveries.data,testRecipient:{name:profile.data.name,email:profile.data.email,phone:profile.data.phone?'••••'+profile.data.phone.replace(/\D/g,'').slice(-4):null}},{headers})
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
export const maxDuration=120
export async function POST(request){try{
 const db=trafficDb(),user=await trafficUser(request,db)
 if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
 const body=await request.json()
 if(body.action!=='test'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.testId||''))return Response.json({error:'Teste inválido.'},{status:400,headers})
 // Only approved stored profiles may be selected; never accept an address or phone from the browser.
 if(Object.keys(body).some(k=>!['action','testId','recipientId'].includes(k)))return Response.json({error:'O teste usa somente o cadastro administrativo autenticado.'},{status:400,headers})
 const recipientId=body.recipientId||user.id
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(recipientId))return Response.json({error:'Cadastro inválido.'},{status:400,headers})
 if(recipientId!==user.id){
  const links=await db.from('traffic_client_users').select('client_id').eq('user_id',recipientId).limit(1);if(links.error)throw links.error
  if(!links.data.length||!await loadTrafficAccess(db,recipientId))return Response.json({error:'Selecione uma cliente aprovada com plano de tráfego ativo.'},{status:403,headers})
 }
 const result=await db.from('profiles').select('id,name,email,phone').eq('id',recipientId).single();if(result.error)throw result.error
 const profile=result.data
 const recent=await db.from('traffic_report_deliveries').select('id,test_id').eq('user_id',profile.id).not('test_id','is',null).gte('created_at',new Date(Date.now()-60000).toISOString()).limit(20);if(recent.error)throw recent.error
 if(recent.data.some(r=>r.test_id!==body.testId))return Response.json({error:'Aguarde um minuto antes de iniciar outro teste.'},{status:429,headers})
 const notice={title:'[TESTE] Aviso de relatório de campanhas',body:'Este é um teste dos avisos de relatório de campanhas. Acesse a plataforma para conferir o seu acesso.',path:'/trafego',ruleId:'traffic-test-'+body.testId,period:'Teste interno'}
 const deliveries=[]
 for(const channel of ['app','push','email','whatsapp'])deliveries.push(await deliverTraffic(db,{test_id:body.testId},profile,channel,id=>sendTrafficChannel(db,profile,channel,notice,id)))
 return Response.json({deliveries},{headers})
}catch{return Response.json({error:'Não foi possível concluir o teste. Confira o histórico antes de tentar novamente.'},{status:500,headers})}}
