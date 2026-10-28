import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return Response.json({error:'Acesso restrito.'},{status:401})
    const url = new URL(request.url)
    const product = url.searchParams.get('produto')
    const offer = url.searchParams.get('oferta')
    if ((!product && !offer) || (product && !uuid.test(product)) || (offer && !uuid.test(offer))) return Response.json({error:'Cadastro inválido.'},{status:400})
    const page = Math.max(1,Math.min(10000,parseInt(url.searchParams.get('page') || '1',10) || 1))
    const start=url.searchParams.get('inicio') || ''
    const end=url.searchParams.get('fim') || ''
    const validDate=value=>!value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value
    if (!validDate(start) || !validDate(end) || start && end && start>end) return Response.json({error:'Período inválido.'},{status:400})
    let query = db.from('webhook_events').select('id,payload,received_at,processed_at,error',{count:'exact'}).eq('type','checkout.catalog.admin')
    if(product) query = query.eq('payload->>product_id',product)
    if(offer) query = query.eq('payload->>target_id',offer).eq('payload->>entity','oferta')
    if(start) query=query.gte('received_at',`${start}T00:00:00-03:00`)
    if(end) {const next=new Date(`${end}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);query=query.lt('received_at',`${next.toISOString().slice(0,10)}T00:00:00-03:00`)}
    const {data,error,count} = await query.order('received_at',{ascending:false}).range((page-1)*25,page*25-1)
    if(error) throw error
    return Response.json({rows:data,count,page},{headers:{'Cache-Control':'no-store'}})
  } catch {return Response.json({error:'Não foi possível consultar a auditoria.'},{status:500})}
}
