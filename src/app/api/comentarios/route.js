import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function usuarioDaRequisicao(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user || null
}

async function podeAcessarAula(supabase, user, lessonId) {
  const { data: aula } = await supabase.from('lessons').select('id,course_id').eq('id', lessonId).eq('is_published', true).maybeSingle()
  if (!aula) return null
  const { data: curso } = await supabase.from('courses').select('id,comments_enabled').eq('id', aula.course_id).eq('is_published', true).maybeSingle()
  if (!curso?.comments_enabled) return null
  const { data: perfil } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle()
  if (perfil?.role === 'admin' && perfil.status === 'active') return aula
  const { data: matricula } = await supabase.from('enrollments').select('id').eq('profile_id', user.id).eq('course_id', aula.course_id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle()
  return matricula ? aula : null
}

export async function GET(request) {
  const supabase = adminClient()
  const user = await usuarioDaRequisicao(request, supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const lessonId = new URL(request.url).searchParams.get('lesson_id')
  if (!lessonId || !await podeAcessarAula(supabase, user, lessonId)) return NextResponse.json({ error: 'Aula não liberada para comentários.' }, { status: 403 })

  const { data: roots, error } = await supabase.from('lesson_comments').select('id,body,created_at').eq('lesson_id', lessonId).eq('profile_id', user.id).is('parent_id', null).eq('archived', false).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (roots || []).map(item => item.id)
  const { data: replies } = ids.length ? await supabase.from('lesson_comments').select('id,body,created_at,parent_id').in('parent_id', ids).order('created_at') : { data: [] }
  return NextResponse.json({ comentarios: (roots || []).map(item => ({ ...item, respostas: (replies || []).filter(reply => reply.parent_id === item.id) })) })
}

export async function POST(request) {
  const supabase = adminClient()
  const user = await usuarioDaRequisicao(request, supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  try {
    const { lesson_id, body } = await request.json()
    const texto = String(body || '').trim()
    if (!lesson_id || !texto || texto.length > 1000) throw new Error('Escreva um comentário de até 1.000 caracteres.')
    if (!await podeAcessarAula(supabase, user, lesson_id)) return NextResponse.json({ error: 'Aula não liberada para comentários.' }, { status: 403 })
    const { data, error } = await supabase.from('lesson_comments').insert({ lesson_id, profile_id: user.id, body: texto, parent_id: null, is_admin_reply: false }).select('id,body,created_at').single()
    if (error) throw error
    return NextResponse.json({ comentario: { ...data, respostas: [] } }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
