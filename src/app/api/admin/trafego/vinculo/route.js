import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadTrafficAccess } from '@/lib/trafficAccess'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
async function authorize(request){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')
 if(!token)return null
 const {data,error}=await db.auth.getUser(token)
 return !error&&data.user?.email==='suporte@suzanazatorre.com.br'?db:null
}
export async function GET(request){try{
 const db=await authorize(request);if(!db)return json({error:'Não autorizado.'},403)
 const id=new URL(request.url).searchParams.get('id');if(!UUID.test(id||''))return json({error:'Cadastro inválido.'},400)
 const eligible=await loadTrafficAccess(db,id)
 const [accounts,links]=await Promise.all([
  db.from('traffic_clients').select('id,name,meta_account_id,mcp_status').eq('active',true).order('name'),
  db.from('traffic_client_users').select('client_id').eq('user_id',id),
 ])
 if(accounts.error||links.error)throw accounts.error||links.error
 const schema=await db.from('traffic_report_settings').select('id').eq('id',true).maybeSingle()
 return json({eligible,supportsMultiple:!schema.error,accounts:accounts.data,clientIds:(links.data||[]).map(x=>x.client_id)})
}catch(e){console.error('traffic binding read',e);return json({error:'Não foi possível carregar a vinculação.'},500)}}
export async function POST(request){try{
 const db=await authorize(request);if(!db)return json({error:'Não autorizado.'},403)
 const {userId,clientIds,expectedIds}=await request.json()
 if(!UUID.test(userId||'')||!Array.isArray(clientIds)||!Array.isArray(expectedIds)||clientIds.length>100||expectedIds.length>100||[...clientIds,...expectedIds].some(x=>!UUID.test(x))||new Set(clientIds).size!==clientIds.length)return json({error:'Cadastro ou contas inválidos.'},400)
 if(clientIds.length&&!await loadTrafficAccess(db,userId))return json({error:'A cliente precisa de um plano de tráfego ativo.'},403)
 const result=await db.rpc('replace_traffic_memberships',{p_user_id:userId,p_client_ids:clientIds,p_expected_ids:expectedIds})
 if(result.error?.code==='40001')return json({error:'Os vínculos mudaram em outra sessão. Recarregue antes de salvar.'},409)
 if(result.error?.code==='PGRST202'){
  // Backward-compatible single-account writes until the additive migration is installed.
  const previous=await db.from('traffic_client_users').select('client_id').eq('user_id',userId)
  if(previous.error)throw previous.error
  const currentIds=(previous.data||[]).map(x=>x.client_id).sort()
  if(JSON.stringify(currentIds)!==JSON.stringify([...expectedIds].sort()))return json({error:'Os vínculos mudaram. Recarregue antes de salvar.'},409)
  if(currentIds.length>1||clientIds.length>1)return json({error:'A liberação de várias contas aguarda a atualização do banco. O acesso individual existente continua disponível.'},503)
  const old=currentIds[0],next=clientIds[0]
  if(old===next)return json({success:true})
  if(next){const active=await db.from('traffic_clients').select('id').eq('id',next).eq('active',true).maybeSingle();if(active.error)throw active.error;if(!active.data)return json({error:'Conta indisponível.'},400)}
  const write=old&&next?await db.from('traffic_client_users').update({client_id:next}).eq('user_id',userId).eq('client_id',old):old?await db.from('traffic_client_users').delete().eq('user_id',userId).eq('client_id',old):await db.from('traffic_client_users').insert({user_id:userId,client_id:next})
  if(write.error)throw write.error
 }else if(result.error)throw result.error
 return json({success:true})
}catch(e){console.error('traffic binding write',e);return json({error:'Não foi possível salvar o vínculo. Tente novamente.'},500)}}
