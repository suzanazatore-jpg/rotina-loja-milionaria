import {createClient} from '@supabase/supabase-js'
import {NextResponse} from 'next/server'
import {loadTrafficAccess} from '@/lib/trafficAccess'
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request){try{
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return json({error:'Entre na sua conta.'},401)
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)return json({error:'Sessão inválida.'},401)
 const id=data.user.id
 if(!await loadTrafficAccess(db,id))return json({error:'Relatórios de tráfego não incluídos no seu acesso ativo.'},403)
 const links=await db.from('traffic_client_users').select('client_id').eq('user_id',id);if(links.error)throw links.error
 const ids=(links.data||[]).map(x=>x.client_id)
 if(!ids.length)return json({pending:true,accounts:[],reports:[],metrics:[]})
 const [a,r,m]=await Promise.all([
  db.from('traffic_clients').select('id,name,meta_account_id,mcp_status').in('id',ids).eq('active',true),
  db.from('traffic_reports').select('id,client_id,period_type,period_start,period_end,summary,recommendations,published_at').in('client_id',ids).not('published_at','is',null).lte('published_at',new Date().toISOString()).order('period_end',{ascending:false}).limit(100),
  db.from('traffic_daily_metrics').select('client_id,metric_date,spend,impressions,clicks,leads,ctr,cpc,data_status').in('client_id',ids).order('metric_date',{ascending:false}).limit(1000),
 ])
 for(const v of [a,r,m])if(v.error)throw v.error
 const activeIds=new Set((a.data||[]).map(x=>x.id))
 return json({pending:!activeIds.size,accounts:a.data,reports:r.data.filter(x=>activeIds.has(x.client_id)),metrics:m.data.filter(x=>activeIds.has(x.client_id))})
}catch(e){console.error('traffic report',e);return json({error:'Não foi possível carregar seus relatórios.'},500)}}
