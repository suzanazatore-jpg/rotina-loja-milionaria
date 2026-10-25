import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {dashboardData} from '@/lib/centralDashboard'
import {dashboardPdf} from '@/lib/centralPdf'
export const runtime='nodejs'
export const maxDuration=60
export async function GET(request){try{const db=checkoutAdminClient();if(!await autorizarAdmin(request,db))return Response.json({error:'Acesso restrito.'},{status:401});const data=await dashboardData(db,new URL(request.url).searchParams);return new Response(await dashboardPdf(data),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="dashboard-${data.start}-${data.end}.pdf"`,'Cache-Control':'no-store'}})}catch{return Response.json({error:'Não foi possível gerar o PDF. Confira os filtros.'},{status:400})}}
