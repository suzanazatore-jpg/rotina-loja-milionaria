import {normalizeEntity} from './trafficReportModel.js'
export function validateTrafficSnapshot(body){
 const date=/^\d{4}-\d{2}-\d{2}$/
 const validDate=s=>date.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
 if(!/^\d+$/.test(String(body.meta_account_id||''))||!validDate(body.period_start)||!validDate(body.period_end)||body.period_start>body.period_end)throw Error('Conta ou período inválido.')
 const payload=body.payload
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Coleta inválida.')
 for(const key of ['daily','campaigns','adsets','ads','daily_campaigns','daily_adsets','daily_ads']){
  if(payload[key]!=null&&!Array.isArray(payload[key]))throw Error('Lista inválida: '+key)
  if((payload[key]?.length||0)>10000)throw Error('Coleta excede o limite de registros.')
 }
 for(const row of [payload.daily||[],payload.daily_campaigns||[],payload.daily_adsets||[],payload.daily_ads||[]].flat()){
  const day=row.metric_date||row.date_start
  if(!validDate(day)||day<body.period_start||day>body.period_end||row.date_stop&&row.date_stop!==day)throw Error('Registros diários precisam corresponder a um único dia do período.')
 }
 const coverage=payload.entity_daily_dates||[]
 if(!Array.isArray(coverage)||coverage.length>366||coverage.some(day=>!validDate(day)||day<body.period_start||day>body.period_end))throw Error('Cobertura diária inválida.')
 if(coverage.length&&!['daily_campaigns','daily_adsets','daily_ads'].every(k=>Array.isArray(payload[k])))throw Error('Cobertura requer os três níveis de detalhamento.')
 // Keep only reporting fields: never persist connector credentials or arbitrary objects.
 const cleanEntity=row=>{const normalized=normalizeEntity(row);return {...normalized,amount_spent:{value:normalized.spend,unit:row.amount_spent?.unit||'BRL'},link_click:normalized.clicks,results:{value:normalized.results},result_label:normalized.result_label,cost_per_result:normalized.cost}}
 for(const day of coverage){
  const total=(payload.daily||[]).find(r=>(r.metric_date||r.date_start)===day)
  const expected=total?normalizeEntity(total).spend:null
  if(expected==null)throw Error('Cobertura requer total diário confirmado: '+day)
  for(const key of ['daily_campaigns','daily_adsets','daily_ads']){
   const rows=payload[key].filter(r=>(r.metric_date||r.date_start)===day).map(normalizeEntity)
   if(rows.some(r=>!r.id||r.spend==null)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Detalhamento diário inválido: '+key)
   if(Math.abs(rows.reduce((sum,r)=>sum+r.spend,0)-expected)>0.05)throw Error('Detalhamento não confere com o total diário: '+key+' '+day)
  }
 }
 const dailyDetails=Object.fromEntries(['daily_campaigns','daily_adsets','daily_ads'].filter(k=>Array.isArray(payload[k])).map(k=>[k,payload[k].map(r=>({...cleanEntity(r),metric_date:r.metric_date||r.date_start}))]))
 return {meta_account_id:String(body.meta_account_id),period_start:body.period_start,period_end:body.period_end,collected_at:new Date().toISOString(),payload:{totals:payload.totals?cleanEntity(payload.totals):null,daily:(payload.daily||[]).map(r=>({...cleanEntity(r),metric_date:r.metric_date||r.date_start})),campaigns:(payload.campaigns||[]).map(cleanEntity),adsets:(payload.adsets||[]).map(cleanEntity),ads:(payload.ads||[]).map(cleanEntity),...dailyDetails,...(coverage.length?{entity_daily_dates:[...new Set(coverage)].sort()}:{})}}
}
