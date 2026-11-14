// Calendar arithmetic uses UTC dates so daylight-saving changes cannot move a day.
export const calendarISO=date=>date.toISOString().slice(0,10)
export const calendarDate=value=>new Date(`${value}T12:00:00Z`)
export function monthStart(value,offset=0){const date=calendarDate(value);return calendarISO(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+offset,1,12)))}
export function monthDays(value){const start=calendarDate(monthStart(value)),padding=(start.getUTCDay()+6)%7,total=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();return [...Array(padding).fill(null),...Array.from({length:total},(_,i)=>`${monthStart(value).slice(0,8)}${String(i+1).padStart(2,'0')}`)]}
export function shortcutRange(today,months=0){const end=calendarDate(today),start=new Date(end);if(months){const target=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-months,1,12)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(end.getUTCDate(),last));return {inicio:calendarISO(target),fim:today}}start.setUTCDate(start.getUTCDate()-27);return {inicio:calendarISO(start),fim:today}}
export const orderedRange=(a,b)=>a<=b?{inicio:a,fim:b}:{inicio:b,fim:a}
