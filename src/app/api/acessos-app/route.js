import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request) {
  const supabase = db()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  if (user.email === ADMIN_EMAIL) return NextResponse.json({ assistant: true })

  const [{ data: perfil, error: perfilError }, { data: planos, error: planosError }] = await Promise.all([
    supabase.from('profiles').select('status,assistant_enabled').eq('id', user.id).maybeSingle(),
    supabase.from('profile_plans').select('plan_id').eq('profile_id', user.id),
  ])
  if (perfilError || planosError) return NextResponse.json({ error: (perfilError || planosError).message }, { status: 500 })
  const planoIds = (planos || []).map(item => item.plan_id)
  const { data: liberacoes, error } = planoIds.length
    ? await supabase.from('plan_app_contents').select('content_key').in('plan_id', planoIds).eq('content_key', 'assistant')
    : { data: [], error: null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const assistant = perfil?.status === 'active' && (perfil?.assistant_enabled === true || Boolean(liberacoes?.length))
  return NextResponse.json({ assistant })
}
