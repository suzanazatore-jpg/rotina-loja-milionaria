import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {dashboardData} from '@/lib/centralDashboard'
export async function GET(request){try{const db=checkoutAdminClient();if(!await autorizarAdmin(request,db))return Response.json({error:'Acesso restrito.'},{status:401});return Response.json(await dashboardData(db,new URL(request.url).searchParams),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Não foi possível carregar o resumo. Confira o período e os filtros.'},{status:400})}}
