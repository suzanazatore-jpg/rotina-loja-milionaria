import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadGlobalTracking } from '@/lib/checkoutTracking'
import { integrationStatus } from '@/lib/integrationStatusServer'

const reply = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request,db)) return reply({error:'Acesso restrito ao administrador.'},401)
    const tracking = await loadGlobalTracking(db)
    return reply({statuses:integrationStatus(process.env,tracking)})
  } catch {
    return reply({error:'Não foi possível consultar as integrações. Tente novamente.'},500)
  }
}
