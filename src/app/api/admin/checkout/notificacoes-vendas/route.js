import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { sendSaleNotification, saleDeliveryReady } from '@/lib/checkoutSaleNotificationsServer'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const respond=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const normalize=(channel,value)=>{
 const raw=String(value||'').trim()
 if(channel==='email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)&&raw.length<=254?raw.toLowerCase():null
 if(channel==='whatsapp'){
   const digits=raw.replace(/\D/g,'')
   const phone=digits.length===10||digits.length===11?'55'+digits:digits
   return /^55\d{10,11}$/.test(phone)?phone:null
 }
 return null
}
async function checked(query){const {data,error}=await query;if(error)throw error;return data}
export async function GET(request){
 try{
  const db=checkoutAdminClient()
  if(!await autorizarAdmin(request,db))return respond({error:'Acesso restrito.'},401)
  const [recipients,events,deliveries]=await Promise.all([
   checked(db.from('checkout_notification_recipients').select('id,name,channel,destination,enabled,updated_at').order('created_at')),
   checked(db.from('checkout_notification_event_settings').select('event_type,enabled')),
   checked(db.from('checkout_notification_deliveries').select('id,order_id,recipient_id,event_type,status,attempts,error_message,created_at,sent_at').order('created_at',{ascending:false}).limit(100))
  ])
  return respond({recipients,events,deliveries,channels:saleDeliveryReady(),production_enabled:process.env.CHECKOUT_SALES_NOTIFICATIONS_ENABLED==='true'})
 }catch{return respond({error:'Falha ao carregar notificações.'},500)}
}
export async function POST(request){
 try{
  const db=checkoutAdminClient()
  if(!await autorizarAdmin(request,db))return respond({error:'Acesso restrito.'},401)
  const raw=await request.text()
  if(Buffer.byteLength(raw)>8192)return respond({error:'Dados extensos demais.'},413)
  const input=JSON.parse(raw)
  if(!input||typeof input!=='object')return respond({error:'Dados inválidos.'},400)
  if(input.action==='recipient'){
   const channel=input.channel
   const destination=normalize(channel,input.destination)
   const name=String(input.name||'').trim().slice(0,80)
   if(!destination||!name)return respond({error:'Nome ou destinatário inválido.'},400)
   const record={channel,destination,name,enabled:false,updated_at:new Date().toISOString()}
   // Cadastro e edição nunca ativam um envio automaticamente.
   if(input.id){
    if(!uuid.test(input.id))return respond({error:'ID inválido.'},400)
    await checked(db.from('checkout_notification_recipients').update(record).eq('id',input.id))
   }else await checked(db.from('checkout_notification_recipients').insert(record))
   return respond({ok:true})
  }
  if(input.action==='recipient_toggle'){
   if(!uuid.test(input.id)||typeof input.enabled!=='boolean')return respond({error:'Dados inválidos.'},400)
   // A ativação de um destinatário não ativa os eventos nem o processador.
   await checked(db.from('checkout_notification_recipients').update({enabled:input.enabled,updated_at:new Date().toISOString()}).eq('id',input.id))
   return respond({ok:true})
  }
  if(input.action==='event_toggle'){
   if(!['order_created','order_paid'].includes(input.event_type)||typeof input.enabled!=='boolean')return respond({error:'Evento inválido.'},400)
   if(input.enabled && process.env.CHECKOUT_SALES_NOTIFICATIONS_ENABLED!=='true')return respond({error:'O envio automático está bloqueado no servidor até a homologação.'},409)
   await checked(db.from('checkout_notification_event_settings').update({enabled:input.enabled,updated_at:new Date().toISOString()}).eq('event_type',input.event_type))
   return respond({ok:true})
  }
  if(input.action==='test'){
   if(!uuid.test(input.id))return respond({error:'Destinatário inválido.'},400)
   const recipient=await checked(db.from('checkout_notification_recipients').select('id,name,channel,destination').eq('id',input.id).single())
   const preview={event_type:'test',name:'Compra de teste',amount_cents:2700,customer:'Cliente de demonstração',order_id:'TESTE',method:'pix',link:null}
   if(input.dry_run!==false)return respond({ok:true,dry_run:true,preview})
   if(process.env.CHECKOUT_SALES_TEST_ENABLED!=='true')return respond({error:'O teste real ainda está bloqueado no servidor.'},409)
   if(!saleDeliveryReady()[recipient.channel])return respond({error:'Canal sem configuração de envio.'},409)
   const {data:entry,error:insertError}=await db.from('checkout_notification_deliveries').insert({recipient_id:recipient.id,order_id:null,event_type:'test',status:'sending',attempts:1}).select('id').single()
   if(insertError)throw insertError
   try{
    const result=await sendSaleNotification(recipient,{...preview,delivery_id:entry.id})
    const saved=await db.from('checkout_notification_deliveries').update({status:'sent',provider_message_id:result.provider_message_id||null,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',entry.id)
    if(saved.error)throw saved.error
    return respond({ok:true,result})
   }catch(error){
    await db.from('checkout_notification_deliveries').update({status:'failed',error_message:String(error.message||'send_failed').slice(0,120),updated_at:new Date().toISOString()}).eq('id',entry.id)
    return respond({error:'O serviço não confirmou o envio. Consulte o histórico.'},502)
   }
  }
  return respond({error:'Ação desconhecida.'},400)
 }catch(error){
  if(error?.code==='23505')return respond({error:'Este destinatário já está cadastrado.'},409)
  return respond({error:'Não foi possível concluir a ação.'},500)
 }
}
