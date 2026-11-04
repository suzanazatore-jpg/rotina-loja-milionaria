import {readLiveTraffic,TrafficLiveError} from './trafficLiveMeta.js'
import {normalizeEntity} from './trafficReportModel.js'

const checked=result=>{if(result.error)throw result.error;return result.data}
export async function collectWeeklyAccount(db,account,range,{reader=readLiveTraffic,env=process.env}={}){
 const run=checked(await db.from('traffic_collection_runs').insert({source:'meta_api_weekly',status:'running',accounts_expected:1,accounts_saved:0,details:{meta_account_id:account.meta_account_id,period_start:range.from,period_end:range.to}}).select('id').single())
 try{
  const {snapshot}=await reader({accountId:account.meta_account_id,from:range.from,to:range.to,details:true,token:env.META_ADS_ACCESS_TOKEN,version:env.TRAFFIC_META_GRAPH_VERSION||'v25.0'})
  const dates=new Set(snapshot.payload.daily.map(r=>r.metric_date))
  const total=normalizeEntity(snapshot.payload.totals)
  if(snapshot.meta_account_id!==account.meta_account_id||snapshot.period_start!==range.from||snapshot.period_end!==range.to||dates.size!==7||snapshot.payload.daily.length!==7||[...dates].some(d=>d<range.from||d>range.to)||total.spend==null||total.impressions==null||snapshot.payload.daily.some(r=>r.spend==null||r.impressions==null)||Math.abs(snapshot.payload.daily.reduce((n,r)=>n+Number(r.spend),0)-total.spend)>.05)throw Error('A semana não tem sete dias confirmados.')
  if(snapshot.payload.totals?.amount_spent?.unit!=='BRL')throw Error('Moeda da conta requer revisão da gestão.')
  const current=checked(await db.from('traffic_clients').select('id,meta_account_id').eq('id',account.id).eq('active',true).single())
  if(current.meta_account_id!==account.meta_account_id)throw Error('O vínculo da conta mudou durante a consulta.')
  checked(await db.from('traffic_metric_snapshots').upsert(snapshot,{onConflict:'meta_account_id,period_start,period_end'}))
  const rows=snapshot.payload.daily.map(raw=>{const row=normalizeEntity(raw);return {client_id:account.id,metric_date:raw.metric_date,spend:row.spend,impressions:row.impressions,clicks:row.clicks,ctr:row.ctr,cpc:row.cpc,leads:row.leads,messages:row.messages,purchases:row.purchases,frequency:row.frequency,data_status:'ok',pulled_at:snapshot.collected_at}})
  checked(await db.from('traffic_daily_metrics').upsert(rows,{onConflict:'client_id,metric_date'}))
  const saved=checked(await db.from('traffic_daily_metrics').select('metric_date,spend,impressions,data_status').eq('client_id',account.id).gte('metric_date',range.from).lte('metric_date',range.to))
  if(saved.length!==7||saved.some(r=>r.data_status!=='ok'||r.spend==null||r.impressions==null)||Math.abs(saved.reduce((n,r)=>n+Number(r.spend),0)-total.spend)>.05)throw Error('A gravação da semana precisa ser conferida.')
  checked(await db.from('traffic_collection_runs').update({status:'success',accounts_saved:1,finished_at:new Date().toISOString(),details:{meta_account_id:account.meta_account_id,period_start:range.from,period_end:range.to,days:7,source:'meta_api',verified:true}}).eq('id',run.id))
  return {status:'saved',client_id:account.id}
 }catch(error){
  // Never expose raw provider/SQL errors or credentials to the operator.
  const reason=error instanceof TrafficLiveError?error.message:'Não foi possível coletar e confirmar esta semana.'
  checked(await db.from('traffic_collection_runs').update({status:'failed',finished_at:new Date().toISOString(),details:{meta_account_id:account.meta_account_id,period_start:range.from,period_end:range.to,reason}}).eq('id',run.id))
  return {status:'failed',client_id:account.id,reason}
 }
}
