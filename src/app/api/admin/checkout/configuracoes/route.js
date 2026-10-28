import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { loadGlobalTracking, normalizeTracking } from '@/lib/checkoutTracking'
import { normalizeCheckoutSettings } from '@/lib/checkoutSettings'
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return json({ error: 'Acesso restrito.' }, 401)
    return json({ tracking: await loadGlobalTracking(db) })
  } catch { return json({ error: 'Não foi possível carregar as configurações.' }, 500) }
}
export async function POST(request) {
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return json({ error: 'Acesso restrito.' }, 401)
    const text = await request.text()
    if (Buffer.byteLength(text) > 32768) return json({ error: 'Configuração inválida.' }, 413)
    let tracking, checkoutConfig
    try { const input = JSON.parse(text); tracking = normalizeTracking(input); if (input.checkout_config) checkoutConfig = normalizeCheckoutSettings(input.checkout_config) } catch (error) { return json({ error: error.message }, 400) }
    const { error } = await db.from('checkout_settings').upsert({ id: 'global', ...tracking, ...(checkoutConfig ? {checkout_config: checkoutConfig} : {}), updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw error
    return json({ ok: true, tracking: await loadGlobalTracking(db) })
  } catch { return json({ error: 'Não foi possível salvar as configurações.' }, 500) }
}
