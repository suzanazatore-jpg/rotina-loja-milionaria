import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { normalizeSimulatorRates } from '@/lib/salesSimulator'

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request) {
  if (!request.headers.get('authorization')) return json({ error: 'Acesso restrito.' }, 401)

  try {
    const db = checkoutAdminClient()
    if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 401)

    const { data, error } = await db.from('sales_simulator_settings')
      .select('rates').eq('id', 'pagarme').maybeSingle()

    if (error) throw error
    return json({ rates: data ? normalizeSimulatorRates(data.rates) : null })
  } catch {
    return json({ error: 'Não foi possível carregar as taxas do simulador.' }, 503)
  }
}
