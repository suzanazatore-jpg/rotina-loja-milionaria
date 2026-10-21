import { createClient } from '@supabase/supabase-js'
import { loadTrafficAccess } from './trafficAccess'
import { normalizeEntity } from './trafficReportModel.js'
export const TRAFFIC_ADMIN = 'suporte@suzanazatorre.com.br'
export const trafficDb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
export async function trafficUser(request,db) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /,'')
  if(!token)return null
  const {data,error}=await db.auth.getUser(token)
  return error ? null : data.user
}
export async function allRows(query) {
  const rows=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await query().range(offset,offset+499)
    if(error)throw error
    rows.push(...data)
    if(data.length<500)return rows
  }
}
export async function reportData(db,user) {
  const admin=user.email===TRAFFIC_ADMIN
  if(!admin&&!await loadTrafficAccess(db,user.id))return null
  const links=await allRows(()=>{let q=db.from('traffic_client_users').select('client_id,user_id'); if(!admin)q=q.eq('user_id',user.id); return q.order('client_id').order('user_id')})
  const ids=[...new Set(links.filter(l=>admin||l.user_id===user.id).map(l=>l.client_id))]
  if(!admin&&!ids.length)return {pending:true,accounts:[],metrics:[],reports:[],snapshots:[],clients:[]}
  const accounts=await allRows(()=>{let q=db.from('traffic_clients').select('id,name,meta_account_id,mcp_status,business_id').eq('active',true);if(!admin)q=q.in('id',ids);return q.order('id')})
  const activeIds=accounts.map(a=>a.id)
  if(!activeIds.length)return {pending:true,accounts:[],metrics:[],reports:[],snapshots:[],clients:[]}
  const [metrics,reports,snapshots]=await Promise.all([
    allRows(()=>db.from('traffic_daily_metrics').select('*').in('client_id',activeIds).order('metric_date',{ascending:false}).order('client_id')),
    allRows(()=>db.from('traffic_reports').select('id,client_id,period_type,period_start,period_end,summary,recommendations,published_at').in('client_id',activeIds).not('published_at','is',null).lte('published_at',new Date().toISOString()).order('period_end',{ascending:false}).order('id')),
    allRows(()=>db.from('traffic_metric_snapshots').select('meta_account_id,period_start,period_end,collected_at,payload').in('meta_account_id',accounts.map(a=>a.meta_account_id)).order('meta_account_id')),
  ])
  let clients=[]
  if(admin){
    const users=[...new Set(links.filter(l=>activeIds.includes(l.client_id)).map(l=>l.user_id))]
    const profiles=await allRows(()=>db.from('profiles').select('id,name,status').in('id',users).order('id'))
    for(const profile of profiles){if(await loadTrafficAccess(db,profile.id))clients.push({...profile,account_ids:links.filter(l=>l.user_id===profile.id&&activeIds.includes(l.client_id)).map(l=>l.client_id)})}
  }
  const combined=new Map(metrics.map(r=>[r.client_id+':'+r.metric_date,r]))
  for(const snapshot of snapshots){
    const account=accounts.find(a=>a.meta_account_id===snapshot.meta_account_id)
    if(!account)continue
    for(const raw of snapshot.payload?.daily||[]){
      const date=raw.metric_date||raw.date_start
      if(!date||raw.date_stop&&raw.date_stop!==date||date<snapshot.period_start||date>snapshot.period_end)continue
      const key=account.id+':'+date,existing=combined.get(key)
      if(existing?.pulled_at&&new Date(existing.pulled_at)>new Date(snapshot.collected_at))continue
      const normalized=normalizeEntity(raw),values={}
      for(const key of ['spend','impressions','clicks','leads','messages','purchases','revenue','reach','frequency'])if(normalized[key]!=null)values[key]=normalized[key]
      combined.set(key,{...existing,...values,client_id:account.id,metric_date:date,data_status:'ok',pulled_at:snapshot.collected_at})
    }
  }
  return {pending:false,accounts,metrics:[...combined.values()],reports,snapshots,clients}
}
