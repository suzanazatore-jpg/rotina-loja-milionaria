import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!token) return reply({ error: 'Entre no aplicativo para ver seus bônus.' }, 401)
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user) return reply({ error: 'Sessão inválida.' }, 401)
    const [profile, legacy] = await Promise.all([
      db.from('profiles').select('role,status').eq('id', user.id).maybeSingle(),
      db.from('perfis').select('tipo_acesso,status_assinatura,acesso_expira_em').eq('id', user.id).maybeSingle(),
    ])
    if (profile.error || legacy.error) throw new Error('Não foi possível conferir o acesso.')
    const admin = user.email === 'suporte@suzanazatorre.com.br' || (profile.data?.role === 'admin' && profile.data?.status === 'active')
    const old = legacy.data
    if (!admin && (profile.data?.status !== 'active' || ['atrasado', 'cancelado', 'reembolsado', 'reembolsada', 'refunded'].includes(old?.status_assinatura) || (['teste', 'avista'].includes(old?.tipo_acesso) && old.acesso_expira_em && new Date(`${old.acesso_expira_em}T23:59:59-03:00`) < new Date()))) return reply({ error: 'Acesso indisponível para esta conta.' }, 403)
    let courseIds = []
    if (!admin) {
      const enrollments = await db.from('enrollments').select('course_id,courses!inner(is_published)').eq('profile_id', user.id).eq('status', 'active').eq('courses.is_published', true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      if (enrollments.error) throw new Error('Não foi possível conferir seus cursos.')
      courseIds = [...new Set((enrollments.data || []).map(row => row.course_id))]
    }
    const id = new URL(request.url).searchParams.get('id')
    if (!admin && !courseIds.length) return id ? reply({ error: 'Bônus não disponível.' }, 404) : reply({ materials: [] })
    let query = db.from('materials').select('id,title,course_id,file_url,courses(title)').eq('is_bonus', true).eq('is_published', true).is('lesson_id', null).order('sort_order')
    if (!admin) query = query.in('course_id', courseIds)
    if (id) query = query.eq('id', id)
    const result = await query
    if (result.error) throw new Error('Não foi possível carregar os bônus.')
    if (!id) return reply({ materials: result.data.map(({ id, title, courses }) => ({ id, title, course_title: courses?.title })) })
    const material = result.data[0]
    if (!material?.file_url?.startsWith('storage://course-materials/')) return reply({ error: 'PDF não disponível.' }, 404)
    const { data, error } = await db.storage.from('course-materials').createSignedUrl(material.file_url.replace('storage://course-materials/', ''), 300)
    if (error) throw new Error('Não foi possível abrir o PDF.')
    return reply({ url: data.signedUrl })
  } catch (error) { return reply({ error: error.message }, 500) }
}
