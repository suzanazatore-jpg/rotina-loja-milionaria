import { trafficDb, trafficUser, reportData } from '@/lib/trafficReportServer'
export async function GET(request) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const db=trafficDb(), user=await trafficUser(request,db)
    if(!user)return Response.json({error:'Entre na sua conta.'},{status:401,headers})
    const data=await reportData(db,user)
    if(!data)return Response.json({error:'Relatórios de tráfego não incluídos no seu acesso ativo.'},{status:403,headers})
    return Response.json(data,{headers})
  } catch(error) { console.error('traffic reports',error); return Response.json({error:'Não foi possível carregar os relatórios. Tente novamente.'},{status:500,headers}) }
}
