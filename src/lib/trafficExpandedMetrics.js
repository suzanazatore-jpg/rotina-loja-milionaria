export const metricValue=v=>{const n=v&&typeof v==='object'?v.value:v;return n===null||n===undefined||n===''||!Number.isFinite(Number(n))?null:Number(n)}
export const metricRatio=(a,b,m=1)=>a===null||b===null||b<=0?null:a/b*m
export function selectExpandedMetrics(snapshot,from,to){
 const start=from||snapshot.since,end=to||snapshot.until,source=snapshot.account
 const within=start>=snapshot.since&&end<=snapshot.until&&start<=end
 const daily=within?(source?.daily||[]).filter(x=>x.date_start>=start&&x.date_start<=end):[]
 const full=within&&start===snapshot.since&&end===snapshot.until
 const count=key=>{if(!daily.length)return null;if(full)return metricValue(source?.totals?.[key]);const ns=daily.map(x=>metricValue(x[key]));return ns.every(n=>n!==null)?ns.reduce((a,b)=>a+b,0):null}
 const period=key=>full?metricValue(source?.totals?.[key]):daily.length===1?metricValue(daily[0][key]):null
 return {start,end,full,daily,count,period,campaigns:full?source?.campaigns||[]:[]}
}
export function campaignResultValue(c){return c.results?.values?.length===1?metricValue(c.results.values[0].value):metricValue(c.results)}
export function campaignResultName(c){const names={reach:'Alcance','actions:link_click':'Cliques no link','actions:offsite_conversion.fb_pixel_purchase':'Compras no site','actions:omni_purchase':'Compras','actions:lead':'Leads','actions:onsite_conversion.messaging_conversation_started_7d':'Conversas por mensagem iniciadas'};return names[c.results?.indicator]||c.cost_per_result?.conversion_type||c.results?.indicator||'Não informado'}

export function recordedMessageSummary(rows){
 const known=rows.filter(x=>metricValue(x.messages)!==null)
 const total=known.length?known.reduce((n,x)=>n+metricValue(x.messages),0):null
 return {total,partial:known.length>0&&known.length<rows.length,knownDays:known.length,days:rows.length}
}
