import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { conversionConfiguration } from '@/lib/checkoutConversionsServer'
import { loadGlobalTracking } from '@/lib/checkoutTracking'

const reply = (body,status = 200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}})

export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return reply({error:'Acesso restrito.'},401)
    const tracking = await loadGlobalTracking(db)
    const live = process.env.VERCEL_ENV === 'production'
    const config = conversionConfiguration(tracking.meta_pixel_id)
    const checks = [
      ['Pixel padrão',tracking.meta_pixel_id || 'Pendente'],
      ['Pixel autorizado no servidor',tracking.meta_pixel_id && tracking.meta_pixel_id === process.env.META_CAPI_PIXEL_ID ? 'Corresponde ao Pixel padrão' : 'Pendente ou diferente'],
      ['Token da API de Conversões',process.env.META_CAPI_ACCESS_TOKEN ? 'Cadastrado' : 'Pendente'],
      ['Envio pelo servidor',config ? (config.testCode ? 'Habilitado para testes' : 'Habilitado em produção') : 'Desativado neste ambiente'],
      ['Rastreamento pelo navegador',process.env.CHECKOUT_TRACKING_ENABLED === 'true' && live ? 'Habilitado para ofertas liberadas' : 'Desativado neste ambiente'],
    ]
    const {data: rows,error} = await db.from('webhook_events').select('type,payload,received_at,processed_at,error')
      .in('type',['checkout.capi','checkout.meta.funnel']).eq('payload->>mode',live?'live':'test')
      .order('received_at',{ascending:false}).limit(40)
    if (error) throw error
    return reply({ environment:live?'Produção':'Prévia', checks, deliveries:rows.map(row=>({
      event:row.type==='checkout.capi'?'Purchase':row.payload?.event_name,
      date:row.processed_at || row.received_at,
      order:row.payload?.order_id || null,
      status:row.processed_at?'Recebido pela Meta':({retry:'Aguardando nova tentativa',processing:'Em processamento',ineligible:'Fora dos critérios de envio'})[row.error] || 'Requer revisão',
    })) })
  } catch { return reply({error:'Falha ao consultar os eventos da Meta.'},503) }
}
