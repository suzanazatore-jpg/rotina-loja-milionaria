import { checkoutAdminClient } from '@/lib/checkoutAdminServer'

export async function POST(request) {
  const db = checkoutAdminClient()
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  const input = await request.json().catch(() => ({}))
  if (!['standalone', 'appinstalled', 'legacy_browser'].includes(input.evidence)) return Response.json({ error: 'Confirmação inválida.' }, { status: 400 })
  // O usuário autenticado só pode confirmar a própria instalação. A data é do servidor.
  const saved = await db.from('app_installations').upsert({ user_id: user.id, evidence: input.evidence }, { onConflict: 'user_id', ignoreDuplicates: true })
  return Response.json(saved.error ? { error: 'Não foi possível registrar a instalação.' } : { success: true }, { status: saved.error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}
