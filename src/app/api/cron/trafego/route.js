import {runTrafficWeekly} from '@/lib/trafficWeeklyReports'
export const runtime='nodejs'
export const maxDuration=300
export async function GET(request){
 const secret=process.env.CRON_SECRET
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Não autorizado.'},{status:401})
 try{return Response.json(await runTrafficWeekly(),{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('traffic weekly',error);return Response.json({error:'Não foi possível concluir os relatórios semanais.'},{status:500})}
}
