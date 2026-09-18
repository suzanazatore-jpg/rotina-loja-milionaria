import { getVapidPublicKey } from '@/lib/pushNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const publicKey = getVapidPublicKey()

  if (!publicKey) {
    return Response.json(
      { error: 'Notificações ainda não configuradas.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(
    { publicKey },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
