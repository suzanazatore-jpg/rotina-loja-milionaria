import {trafficDb,trafficUser,TRAFFIC_ADMIN} from '@/lib/trafficReportServer'
import {validateTrafficSnapshot} from '@/lib/trafficImport'
export async function POST(request){
 const headers={'Cache-Control':'private, no-store'}
 try{
  const db=trafficDb(),user=await trafficUser(request,db)
  if(user?.email!==TRAFFIC_ADMIN)return Response.json({error:'Não autorizado.'},{status:403,headers})
  const raw=await request.text();if(raw.length>5_000_000)return Response.json({error:'Coleta muito grande.'},{status:413,headers})
  let snapshot;try{snapshot=validateTrafficSnapshot(JSON.parse(raw))}catch(e){return Response.json({error:e.message},{status:400,headers})}
  const account=await db.from('traffic_clients').select('id').eq('meta_account_id',snapshot.meta_account_id).eq('active',true).maybeSingle()
  if(account.error)throw account.error
  if(!account.data)return Response.json({error:'Cadastre esta conta antes de importar.'},{status:400,headers})
  // The snapshot is atomic. Daily metrics already in the application are never overwritten by an incomplete import.
  const result=await db.from('traffic_metric_snapshots').upsert(snapshot,{onConflict:'meta_account_id'})
  if(result.error)throw result.error
  return Response.json({success:true,ads:snapshot.payload.ads.length,campaigns:snapshot.payload.campaigns.length},{headers})
 }catch(error){console.error('traffic import',error);return Response.json({error:'Não foi possível salvar a coleta.'},{status:500,headers})}
}
