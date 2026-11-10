import {randomUUID} from 'node:crypto'
import {checkoutAdminClient,autorizarAdmin} from '@/lib/checkoutAdminServer'
import {UUID} from '@/lib/checkoutWebhookSettings'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})

export async function POST(request){
 try{
  const db=checkoutAdminClient()
  if(!(await autorizarAdmin(request,db)))return reply({error:'Acesso restrito.'},403)
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origem inválida.'},403)
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Formato inválido.'},415)
  const raw=await request.text()
  if(Buffer.byteLength(raw)>4096)return reply({error:'Dados muito extensos.'},413)
  let input
  try{input=JSON.parse(raw)}catch{return reply({error:'Dados inválidos.'},400)}
  if(!UUID.test(input?.order_id))return reply({error:'Venda inválida.'},400)
  const invoiceNumber=String(input?.invoice_number||'').trim()
  const invoiceUrl=String(input?.invoice_url||'').trim()
  if(!invoiceNumber||invoiceNumber.length>120||!/^[\p{L}\p{N}\s./_-]+$/u.test(invoiceNumber))return reply({error:'Número da nota fiscal inválido.'},400)
  let url
  try{url=new URL(invoiceUrl)}catch{return reply({error:'Informe um link HTTPS válido da nota fiscal já emitida.'},400)}
  if(url.protocol!=='https:'||url.username||url.password||invoiceUrl.length>2048)return reply({error:'Link da nota fiscal inválido.'},400)
  const order=await db.from('orders').select('id,status').eq('id',input.order_id).maybeSingle()
  if(order.error||!order.data)return reply({error:'Venda não encontrada.'},404)
  const event=await db.from('webhook_events').insert({
   pagarme_event_id:`admin-invoice:${input.order_id}:${randomUUID()}`,
   type:'checkout.admin.invoice_registered',
   payload:{order_id:input.order_id,number:invoiceNumber,document_url:invoiceUrl,source:'manual_existing_document'},
   processed_at:new Date().toISOString()
  })
  if(event.error)return reply({error:'Não foi possível registrar a nota fiscal.'},503)
  return reply({ok:true,message:'Nota fiscal existente registrada no histórico. Nenhum documento foi emitido ou enviado automaticamente.'})
 }catch{return reply({error:'Falha ao registrar a nota fiscal.'},500)}
}
