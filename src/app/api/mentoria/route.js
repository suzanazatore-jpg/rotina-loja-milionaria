import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verificarAcesso(supabase, user) {
  if (user.email === ADMIN_EMAIL) return true
  const [perfilNovo, perfilAntigo] = await Promise.all([
    supabase.from('profiles').select('status,mentoria_aplicada').eq('id', user.id).maybeSingle(),
    supabase.from('perfis').select('tipo_acesso,acesso_expira_em').eq('id', user.id).maybeSingle(),
  ])
  if (perfilNovo.data?.status === 'active' && perfilNovo.data?.mentoria_aplicada === true) return true
  const legado = perfilAntigo.data
  if (!legado || !['mentoria', 'implementacao'].includes(legado.tipo_acesso)) return false
  return !legado.acesso_expira_em || new Date(`${legado.acesso_expira_em}T23:59:59`) >= new Date()
}

export async function GET(request) {
  try {
    const supabase = adminClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const liberado = await verificarAcesso(supabase, user)
    if (!liberado) return NextResponse.json({ liberado: false, aulas: [] }, { status: 403 })

    const { data, error } = await supabase.from('aulas').select('*').order('ordem', { ascending: true })
    if (error) throw error
    return NextResponse.json({ liberado: true, aulas: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
