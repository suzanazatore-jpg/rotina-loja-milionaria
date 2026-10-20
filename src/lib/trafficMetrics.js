export function summarizeTraffic(rows){
 const sum=k=>rows.reduce((t,r)=>t+Number(r[k]??0),0)
 const complete=k=>rows.length>0&&rows.every(r=>r[k]!=null)
 const spend=sum('spend'),impressions=sum('impressions'),clicks=sum('clicks')
 return {spend:complete('spend')?spend:null,impressions:complete('impressions')?impressions:null,clicks:complete('clicks')?clicks:null,leads:complete('leads')?sum('leads'):null,ctr:complete('clicks')&&complete('impressions')&&impressions>0?clicks/impressions*100:null,cpc:complete('spend')&&complete('clicks')&&clicks>0?spend/clicks:null,knownClicks:rows.some(r=>r.clicks!=null)?clicks:null}
}
export function selectedMetricSummary(rows,key){
 const valid=rows.filter(r=>r[key]!=null),total=valid.length?valid.reduce((n,r)=>n+Number(r[key]),0):null
 const partial=valid.length>0&&valid.length<rows.length
 const spendKey=key==='messages'?'message_spend':'spend'
 const knownSpend=rows.length>0&&rows.every(r=>r[spendKey]!=null)
 const spend=knownSpend?rows.reduce((n,r)=>n+Number(r[spendKey]),0):null
 return {total,partial,cost:total>0&&!partial&&spend!=null?spend/total:null}
}
