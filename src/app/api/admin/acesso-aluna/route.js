import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function autorizar(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL ? user : null
}

export async function GET(request) {
  try {
    const supabase = adminClient()
    if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const alunaId = new URL(request.url).searchParams.get('id')
    if (!alunaId) return NextResponse.json({ error: 'Aluna não informada.' }, { status: 400 })

    const [aluna, cursos, planos, vinculos, matriculas] = await Promise.all([
      supabase.from('perfis').select('id,nome,email,whatsapp').eq('id', alunaId).maybeSingle(),
      supabase.from('courses').select('id,title,slug').order('title'),
      supabase.from('plans').select('id,name,period_days').order('name'),
      supabase.from('plan_courses').select('plan_id,course_id'),
      supabase.from('enrollments').select('course_id,status,purchased_at,expires_at').eq('profile_id', alunaId),
    ])
    if (aluna.error || !aluna.data) return NextResponse.json({ error: 'Aluna não encontrada.' }, { status: 404 })
    return NextResponse.json({
      aluna: aluna.data, cursos: cursos.data || [], planos: planos.data || [],
      vinculos: vinculos.data || [], matriculas: matriculas.data || [],
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = adminClient()
    if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const { alunaId, cursoIds = [], planoIds = [], dataCompra, dataExpiracao } = await request.json()
    if (!alunaId) return NextResponse.json({ error: 'Aluna não informada.' }, { status: 400 })

    const [aluna, planos, vinculos, cursos, conteudos] = await Promise.all([
      supabase.from('perfis').select('id,nome,email,whatsapp').eq('id', alunaId).maybeSingle(),
      planoIds.length ? supabase.from('plans').select('id,period_days').in('id', planoIds) : Promise.resolve({ data: [] }),
      planoIds.length ? supabase.from('plan_courses').select('plan_id,course_id').in('plan_id', planoIds) : Promise.resolve({ data: [] }),
      supabase.from('courses').select('id'),
      planoIds.length ? supabase.from('plan_app_contents').select('content_key').in('plan_id', planoIds) : Promise.resolve({ data: [] }),
    ])
    if (aluna.error || !aluna.data) return NextResponse.json({ error: 'Aluna não encontrada.' }, { status: 404 })

    const idsValidos = new Set((cursos.data || []).map(c => c.id))
    const todosIds = [...new Set([...cursoIds, ...(vinculos.data || []).map(v => v.course_id)])].filter(id => idsValidos.has(id))
    let expiresAt = dataExpiracao ? new Date(`${dataExpiracao}T23:59:59`).toISOString() : null
    if (!expiresAt && planos.data?.length) {
      const dias = Math.max(...planos.data.map(p => Number(p.period_days) || 0))
      if (dias > 0) { const data = new Date(); data.setDate(data.getDate() + dias); expiresAt = data.toISOString() }
    }

    const perfil = aluna.data
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: perfil.id, name: perfil.nome, email: perfil.email, phone: perfil.whatsapp,
      role: 'student', status: 'active', mentoria_aplicada: (conteudos.data || []).some(item => item.content_key === 'mentorship'), updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })

    const { error: deleteError } = await supabase.from('enrollments').delete().eq('profile_id', alunaId)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })
    if (todosIds.length) {
      const purchasedAt = dataCompra ? new Date(`${dataCompra}T12:00:00`).toISOString() : null
      const { error } = await supabase.from('enrollments').insert(todosIds.map(courseId => ({
        profile_id: alunaId, course_id: courseId, status: 'active', source: 'admin-app',
        purchased_at: purchasedAt, expires_at: expiresAt,
      })))
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, cursosLiberados: todosIds.length, expiresAt })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
