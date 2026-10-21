import {createClient} from '@supabase/supabase-js'
import {NextResponse} from 'next/server'
import {loadTrafficAccess} from '@/lib/trafficAccess'
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}})
export async function GET(request){
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'')
  if(!token)return reply({error:'Entre na sua conta.'},401)
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await db.auth.getUser(token)
  if(error||!data.user)return reply({error:'Sessão inválida.'},401)
  const metaId=new URL(request.url).searchParams.get('conta')
  if(!metaId||!/^\d+$/.test(metaId))return reply({error:'Selecione uma conta válida.'},400)
  const admin=data.user.email==='suporte@suzanazatorre.com.br'
  if(!admin&&!await loadTrafficAccess(db,data.user.id))return reply({error:'Tráfego não incluído no seu acesso ativo.'},403)
  const account=await db.from('traffic_clients').select('id,meta_account_id').eq('meta_account_id',metaId).eq('active',true).maybeSingle()
  if(account.error)throw account.error
  if(!account.data)return reply({error:'Conta indisponível.'},404)
  if(!admin){const link=await db.from('traffic_client_users').select('client_id').eq('client_id',account.data.id).eq('user_id',data.user.id).maybeSingle();if(link.error)throw link.error;if(!link.data)return reply({error:'Conta indisponível.'},404)}
  const collection=await db.from('traffic_metric_snapshots').select('period_start,period_end,collected_at,payload').eq('meta_account_id',metaId).maybeSingle()
  if(collection.error)throw collection.error
  const selected=collection.data
  // Never serialize the full collection: a student receives only their linked account.
  return reply({since:selected?.period_start||null,until:selected?.period_end||null,collectedAt:selected?.collected_at||null,available:!!selected,account:selected?.payload||null})
 }catch(e){console.error('expanded traffic',e);return reply({error:'Não foi possível carregar as métricas ampliadas.'},500)}
}
