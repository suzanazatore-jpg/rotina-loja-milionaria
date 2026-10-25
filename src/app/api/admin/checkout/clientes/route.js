import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { normalizeContact, contactFilters, filterContacts } from '@/lib/checkoutContacts'
const json = (body,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(request) {
  try {
    const db=checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return json({error:'Acesso restrito.'},401)
    const params=new URL(request.url).searchParams
    const page=Math.max(1,Math.min(100000,parseInt(params.get('page') || '1',10) || 1))
    const query=filterContacts(db.from('customers').select('id,name,email,phone,document,created_at,billing_address',{count:'exact'}),contactFilters(params))
    const {data,count,error}=await query.order('name').order('id').range((page-1)*30,page*30-1)
    if(error) throw error
    return json({contacts:data || [],total:count || 0,page})
  } catch { return json({error:'Não foi possível carregar os contatos.'},500) }
}
export async function POST(request) {
  try {
    const db=checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return json({error:'Acesso restrito.'},401)
    if(request.headers.get('origin')!==new URL(request.url).origin) return json({error:'Origem inválida.'},403)
    if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Formato inválido.'},415)
    const text=await request.text()
    if(Buffer.byteLength(text)>4096)return json({error:'Dados excedem o limite.'},413)
    let contact
    try {contact=normalizeContact(JSON.parse(text))} catch(error){return json({error:error.message},400)}
    const {error}=await db.from('customers').insert(contact)
    if(error?.code==='23505') return json({error:'Já existe um contato com esse email.'},409)
    if(error) throw error
    return json({ok:true},201)
  } catch { return json({error:'Não foi possível cadastrar o contato.'},500) }
}
