import {trafficDb,trafficUser,TRAFFIC_ADMIN} from '@/lib/trafficReportServer'
import {runTrafficWeekly} from '@/lib/trafficWeeklyReports'
export const maxDuration=300
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'}
export async function POST(request){
 try{
  const db=trafficDb(),user=await trafficUser(request,db)
  if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
  const body=await request.json()
  if(Object.keys(body).some(k=>k!=='action')||!['prepare','send'].includes(body.action))return Response.json({error:'Ação inválida.'},{status:400,headers})
  // No free-form recipients or dates: recover only the last closed week and approved stored links.
  const result=await runTrafficWeekly(new Date(),{notify:body.action==='send',collectMissing:body.action==='prepare'})
  return Response.json(result,{headers})
 }catch{return Response.json({error:'Não foi possível concluir. Confira os dados e o histórico antes de tentar novamente.'},{status:500,headers})}
}
