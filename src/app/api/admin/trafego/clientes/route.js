import {createClient} from '@supabase/supabase-js'
import {NextResponse} from 'next/server'
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}})
export async function GET(request){try{
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')
 if(!token)return reply({error:'Entre na sua conta.'},401)
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await db.auth.getUser(token)
 if(error||!data.user)return reply({error:'Sessão inválida.'},401)
 if(data.user.email!=='suporte@suzanazatorre.com.br')return reply({error:'Acesso restrito ao escritório.'},403)
 const links=await db.from('traffic_client_users').select('user_id,client_id')
 if(links.error)throw links.error
 const ids=[...new Set((links.data||[]).map(l=>l.user_id))]
 if(!ids.length)return reply({clients:[]})
 const accountIds=[...new Set(links.data.map(l=>l.client_id))]
 const [profiles,accounts]=await Promise.all([
  db.from('profiles').select('id,name,status').in('id',ids).eq('role','student'),
  db.from('traffic_clients').select('id,name,meta_account_id').in('id',accountIds).eq('active',true),
 ])
 if(profiles.error||accounts.error)throw profiles.error||accounts.error
 const byId=new Map((accounts.data||[]).map(a=>[a.id,a]))
 const clients=(profiles.data||[]).map(p=>({...p,accounts:links.data.filter(l=>l.user_id===p.id).map(l=>byId.get(l.client_id)).filter(Boolean)})).filter(p=>p.accounts.length).sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'))
 return reply({clients})
}catch(e){console.error('traffic approved clients',e);return reply({error:'Não foi possível carregar os clientes aprovados.'},500)}}
