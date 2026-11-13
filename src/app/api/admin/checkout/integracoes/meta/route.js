import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {loadGlobalTracking} from '@/lib/checkoutTracking'
import {readCentralMeta} from '@/lib/centralMetaIntegration'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(request){
 try{
  const db=checkoutAdminClient()
  if(!await autorizarAdmin(request,db))return reply({error:'Acesso restrito ao administrador.'},401)
  const tab=new URL(request.url).searchParams.get('tab') || 'users'
  if(!['users','adaccounts','pixels','ads','audit'].includes(tab))return reply({error:'Aba inválida.'},400)
  if(tab==='pixels'){
   const tracking=await loadGlobalTracking(db)
   return reply({rows:tracking.meta_pixel_id?[{id:tracking.meta_pixel_id,name:'Pixel padrão da Central',token_configured:Boolean(process.env.META_CAPI_ACCESS_TOKEN),updated_at:tracking.updated_at}]:[],message:null})
  }
  if(tab==='audit')return reply({rows:[],message:'O histórico de conexões desta integração ainda não está disponível.'})
  if(tab==='ads')return reply({rows:[],message:'Vincule uma conta de anúncio à integração para consultar seus anúncios.'})
  return reply(await readCentralMeta({token:process.env.META_ADS_ACCESS_TOKEN,version:process.env.TRAFFIC_META_GRAPH_VERSION || 'v25.0',tab}))
 }catch(error){return reply({error:error.message || 'Não foi possível consultar a integração Meta.'},502)}
}
