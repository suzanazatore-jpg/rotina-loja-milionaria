import {NextResponse} from 'next/server'
import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {checkoutTestConfiguration} from '@/lib/checkoutPublicServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const noStore = { 'Cache-Control': 'private, no-store' }
  try {
    const db = checkoutAdminClient()
    if (!(await autorizarAdmin(request, db))) return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers:noStore})
    const env = process.env
    const expected = 'https://api.pagar.me/core/v5'
    const secret = env.PAGARME_SECRET_KEY || ''
    const publicKey = env.PAGARME_PUBLIC_KEY || ''
    const checks = {
      production_url: env.PAGARME_BASE_URL === expected,
      live_enabled: env.CHECKOUT_LIVE_ENABLED === 'true',
      secret_key_present: secret.length > 0,
      secret_key_format: /^sk_live_[a-zA-Z0-9_]+$/.test(secret),
      public_key_present: publicKey.length > 0,
      public_key_format: /^pk_(?!test_)[a-zA-Z0-9_]+$/.test(publicKey),
      session_secret_present: Boolean(env.CHECKOUT_SESSION_SECRET),
      session_secret_length: (env.CHECKOUT_SESSION_SECRET?.length || 0) >= 32,
    }
    return NextResponse.json({ready:checkoutTestConfiguration(env).ready,checks},{headers:noStore})
  } catch {
    return NextResponse.json({error:'Não foi possível diagnosticar o checkout.'},{status:503,headers:noStore})
  }
}
