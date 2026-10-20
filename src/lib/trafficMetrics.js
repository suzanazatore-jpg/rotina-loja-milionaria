export function summarizeTraffic(rows){
 const sum=k=>rows.reduce((t,r)=>t+Number(r[k]??0),0)
 const complete=k=>rows.length>0&&rows.every(r=>r[k]!=null)
 const spend=sum('spend'),impressions=sum('impressions'),clicks=sum('clicks')
 return {spend:complete('spend')?spend:null,impressions:complete('impressions')?impressions:null,clicks:complete('clicks')?clicks:null,leads:complete('leads')?sum('leads'):null,ctr:complete('clicks')&&complete('impressions')&&impressions>0?clicks/impressions*100:null,cpc:complete('spend')&&complete('clicks')&&clicks>0?spend/clicks:null,knownClicks:rows.some(r=>r.clicks!=null)?clicks:null}
}
