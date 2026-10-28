import {sendPushNotification,getVapidPublicKey} from './pushNotifications'
export function trafficChannels(env=process.env){return {email:!!env.BREVO_API_KEY,whatsapp:!!env.TRAFFIC_REPORT_WHATSAPP_WEBHOOK_URL,push:!!getVapidPublicKey()&&!!(env.PUSH_VAPID_PRIVATE_KEY||env.VAPID_PRIVATE_KEY)}}
export function trafficPhone(value){const n=String(value||'').replace(/\D/g,'');const result=n.length===10||n.length===11?'55'+n:n;return /^55\d{10,11}$/.test(result)?result:null}
export async function sendTrafficChannel(db,profile,channel,notice,deliveryId){
 const {title,body,path,period='',details=''}=notice,url='https://rotina.suzanazatorre.com.br'+path
 if(!/^\/trafego(?:\?|$)/.test(path))throw Error('Destino de relatório inválido.')
 if(channel==='app'){
  const key=notice.ruleId
  const existing=await db.from('user_notifications').select('id').eq('user_id',profile.id).eq('rule_id',key).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {id:existing.data.id}
  const row=await db.from('user_notifications').insert({user_id:profile.id,notification_type:'personalizada',title,body,target_url:path,rule_id:key,scheduled_for:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),sent_at:new Date().toISOString()}).select('id').single();if(row.error)throw row.error;return {id:row.data.id}
 }
 if(channel==='push'){
  if(!trafficChannels().push)return {status:'skipped',reason:'Notificações push não configuradas.'}
  const result=await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id',profile.id).eq('active',true);if(result.error)throw result.error
  if(!result.data.length)return {status:'skipped',reason:'Sem dispositivo inscrito.'}
  const outcomes=await Promise.allSettled(result.data.map(sub=>sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title,body,url:path,tag:notice.ruleId,icon:'/pwa-icon-192.png',badge:'/notification-badge.png'})))
  if(outcomes.some(r=>r.status==='rejected'))throw Error('Verificar entrega nos dispositivos antes de reenviar.')
  return {status:'sent'}
 }
 if(channel==='email'){
  if(!trafficChannels().email||!profile.email)return {status:'skipped',reason:'E-mail ou configuração ausente.'}
  const greeting=profile.name?.trim()?`Olá, ${profile.name.trim()}!`:'Olá!'
  const message=body+(details?'\n\n'+details:'')
  const textContent=`${greeting}\n\n${message}\n\n${url}\n\nObservação: acesse com o seu login e senha.`
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':process.env.BREVO_API_KEY},signal:AbortSignal.timeout(15000),body:JSON.stringify({sender:{name:'Suzana Zatorre',email:'suporte@suzanazatorre.com.br'},to:[{email:profile.email,name:profile.name||undefined}],subject:title,textContent,headers:{'X-Mailin-custom':'traffic-delivery:'+deliveryId}})})
  if(!response.ok)throw Error('Brevo retornou HTTP '+response.status)
  return {status:'accepted',id:(await response.json()).messageId}
 }
 if(channel==='whatsapp'){
  const phone=trafficPhone(profile.phone)
  if(!trafficChannels().whatsapp||!phone)return {status:'skipped',reason:'WhatsApp ou fluxo específico não configurado.'}
  const response=await fetch(process.env.TRAFFIC_REPORT_WHATSAPP_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({evento:'relatorio_trafego_pronto',delivery_id:deliveryId,name:profile.name||'Cliente',phone,semana:period,message:`${body}${details?'\n\n'+details:''}\n${url}`,report_url:url})})
  if(!response.ok)throw Error('Fluxo de WhatsApp retornou HTTP '+response.status)
  return {status:'accepted',id:deliveryId}
 }
 throw Error('Canal inválido.')
}
