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
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL
}

function idsUnicos(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))]
}

async function carregar(supabase) {
  const [shelvesRes, linksRes, cursosRes] = await Promise.all([
    supabase.from('course_shelves').select('id,title,subtitle,sort_order,is_published').order('sort_order').order('created_at'),
    supabase.from('shelf_courses').select('shelf_id,course_id,sort_order').order('sort_order'),
    supabase.from('courses').select('id,title,subtitle,cover_image_url,is_published,sort_order').order('sort_order').order('title'),
  ])
  const error = shelvesRes.error || linksRes.error || cursosRes.error
  if (error) throw error
  const cursos = cursosRes.data || []
  const porId = Object.fromEntries(cursos.map(curso => [curso.id, curso]))
  const carrosseis = (shelvesRes.data || []).map(shelf => ({
    ...shelf,
    courses: (linksRes.data || [])
      .filter(link => link.shelf_id === shelf.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(link => porId[link.course_id])
      .filter(Boolean),
  }))
  return { carrosseis, cursos }
}

async function validarCursos(supabase, courseIds) {
  const ids = idsUnicos(courseIds)
  if (!ids.length) return ids
  const { data, error } = await supabase.from('courses').select('id').in('id', ids)
  if (error) throw error
  if ((data || []).length !== ids.length) throw new Error('Um dos cursos selecionados não existe mais.')
  return ids
}

async function salvarVinculos(supabase, shelfId, courseIds) {
  const ids = await validarCursos(supabase, courseIds)
  const { data: antigos, error: oldError } = await supabase.from('shelf_courses').select('course_id,sort_order').eq('shelf_id', shelfId).order('sort_order')
  if (oldError) throw oldError
  const { error: deleteError } = await supabase.from('shelf_courses').delete().eq('shelf_id', shelfId)
  if (deleteError) throw deleteError
  if (!ids.length) return
  const { error: insertError } = await supabase.from('shelf_courses').insert(ids.map((courseId, index) => ({ shelf_id: shelfId, course_id: courseId, sort_order: index })))
  if (!insertError) return
  if (antigos?.length) await supabase.from('shelf_courses').insert(antigos.map(item => ({ shelf_id: shelfId, ...item })))
  throw insertError
}

export async function GET(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try { return NextResponse.json(await carregar(supabase)) }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }) }
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    if (!title) throw new Error('Informe o nome do carrossel.')
    const { data: ultima } = await supabase.from('course_shelves').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const { data: shelf, error } = await supabase.from('course_shelves').insert({
      title,
      subtitle: String(body.subtitle || '').trim() || null,
      is_published: body.is_published !== false,
      sort_order: (ultima?.sort_order ?? -1) + 1,
    }).select().single()
    if (error) throw error
    try { await salvarVinculos(supabase, shelf.id, body.course_ids) }
    catch (error) { await supabase.from('course_shelves').delete().eq('id', shelf.id); throw error }
    return NextResponse.json({ carrossel: shelf }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PUT(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    if (!body.id || !title) throw new Error('Informe o nome do carrossel.')
    const { error } = await supabase.from('course_shelves').update({
      title,
      subtitle: String(body.subtitle || '').trim() || null,
      is_published: body.is_published !== false,
      updated_at: new Date().toISOString(),
    }).eq('id', body.id)
    if (error) throw error
    await salvarVinculos(supabase, body.id, body.course_ids)
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PATCH(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const body = await request.json()
    if (body.action === 'publish') {
      const { error } = await supabase.from('course_shelves').update({ is_published: Boolean(body.is_published), updated_at: new Date().toISOString() }).eq('id', body.id)
      if (error) throw error
    } else if (body.action === 'reorder') {
      const ids = idsUnicos(body.ids)
      for (let index = 0; index < ids.length; index += 1) {
        const { error } = await supabase.from('course_shelves').update({ sort_order: index, updated_at: new Date().toISOString() }).eq('id', ids[index])
        if (error) throw error
      }
    } else throw new Error('Ação inválida.')
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { id } = await request.json()
    const { error } = await supabase.from('course_shelves').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
