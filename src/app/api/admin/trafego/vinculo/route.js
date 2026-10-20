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
 return json({eligible,accounts:accounts.data,clientId:links.data?.[0]?.client_id||''})
}catch(e){console.error('traffic binding read',e);return json({error:'Não foi possível carregar a vinculação.'},500)}}
export async function POST(request){try{
 const db=await authorize(request);if(!db)return json({error:'Não autorizado.'},403)
 const {userId,clientId}=await request.json()
 if(!UUID.test(userId||'')||(clientId&&!UUID.test(clientId)))return json({error:'Cadastro ou conta inválidos.'},400)
 if(clientId&&!await loadTrafficAccess(db,userId))return json({error:'A aluna precisa de uma das duas ofertas de tráfego ativas.'},403)
 const previous=await db.from('traffic_client_users').select('client_id').eq('user_id',userId)
 if(previous.error)throw previous.error
 if(previous.data.length>1)return json({error:'Este cadastro possui várias contas. Revise os vínculos antes de substituir.'},409)
 const old=previous.data[0]?.client_id
 if(clientId){
  const account=await db.from('traffic_clients').select('id').eq('id',clientId).eq('active',true).maybeSingle()
  if(account.error)throw account.error
  if(!account.data)return json({error:'Conta indisponível. Atualize a lista.'},400)
 }
 if(old!==clientId){
  if(old&&clientId){
   const result=await db.from('traffic_client_users').update({client_id:clientId}).eq('user_id',userId).eq('client_id',old).select('client_id')
   if(result.error)throw result.error
   if(result.data.length!==1)return json({error:'O vínculo mudou em outra sessão. Recarregue a página.'},409)
  }else if(old){
   const result=await db.from('traffic_client_users').delete().eq('user_id',userId).eq('client_id',old)
   if(result.error)throw result.error
  }else if(clientId){
   const result=await db.from('traffic_client_users').insert({user_id:userId,client_id:clientId})
   if(result.error)throw result.error
  }
 }
 return json({success:true})
}catch(e){console.error('traffic binding write',e);return json({error:'Não foi possível salvar o vínculo. Tente novamente.'},500)}}
