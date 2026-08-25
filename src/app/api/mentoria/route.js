import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verificarAcesso(supabase, user) {
  if (user.email === ADMIN_EMAIL) return ['evs', 'cvm']
  const [perfilNovo, perfilAntigo] = await Promise.all([
    supabase.from('profiles').select('status,mentoria_aplicada').eq('id', user.id).maybeSingle(),
    supabase.from('perfis').select('tipo_acesso,acesso_expira_em').eq('id', user.id).maybeSingle(),
  ])
  if (perfilNovo.data?.status === 'active' && perfilNovo.data?.mentoria_aplicada === true) {
    const { data: planos } = await supabase.from('profile_plans').select('plan_id').eq('profile_id', user.id)
    const planoIds = (planos || []).map(item => item.plan_id)
    if (planoIds.length) {
      const { data: tipos } = await supabase.from('plan_mentorships').select('mentorship_type').in('plan_id', planoIds)
      const permitidos = [...new Set((tipos || []).map(item => item.mentorship_type))]
      if (permitidos.length) return permitidos
    }
  }
  const legado = perfilAntigo.data
  if (!legado || !['mentoria', 'implementacao'].includes(legado.tipo_acesso)) return []
  return (!legado.acesso_expira_em || new Date(`${legado.acesso_expira_em}T23:59:59`) >= new Date()) ? ['evs', 'cvm'] : []
}

export async function GET(request) {
  try {
    const supabase = adminClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const programas = await verificarAcesso(supabase, user)
    if (!programas.length) return NextResponse.json({ liberado: false, programas: [], aulas: [] }, { status: 403 })

    const { data, error } = await supabase.from('aulas').select('*').in('mentorship_type', programas).order('ordem', { ascending: true })
    if (error) throw error
    const ids = (data || []).map(aula => aula.id)
    const { data: materiais } = ids.length ? await supabase.from('mentorship_materials').select('id,aula_id,title').in('aula_id', ids).order('sort_order') : { data: [] }
    return NextResponse.json({ liberado: true, programas, aulas: data || [], materiais: materiais || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
