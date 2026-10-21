import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function autorizar(request, supabase) { const token = request.headers.get('authorization')?.replace('Bearer ', ''); if (!token) return null; const { data: { user } } = await supabase.auth.getUser(token); return user?.email === ADMIN_EMAIL ? user : null }

export async function GET(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const tab = new URL(request.url).searchParams.get('tab') || 'novas'
  let query = supabase.from('lesson_comments').select('id,body,created_at,profile_id,lesson_id,archived').is('parent_id', null).eq('is_admin_reply', false).order('created_at', { ascending: false }).limit(300)
  if (tab === 'arquivadas') query = query.eq('archived', true); else query = query.eq('archived', false)
  const { data: roots, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rootIds = (roots || []).map(item => item.id)
  const profileIds = [...new Set((roots || []).map(item => item.profile_id))]
  const lessonIds = [...new Set((roots || []).map(item => item.lesson_id))]
  const [{ data: replies }, { data: profiles }, { data: lessons }] = await Promise.all([
    rootIds.length ? supabase.from('lesson_comments').select('id,body,created_at,parent_id').in('parent_id', rootIds).order('created_at') : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from('profiles').select('id,name,email').in('id', profileIds) : Promise.resolve({ data: [] }),
    lessonIds.length ? supabase.from('lessons').select('id,title,course_id,module_id').in('id', lessonIds) : Promise.resolve({ data: [] }),
  ])
  const courseIds = [...new Set((lessons || []).map(item => item.course_id))]
  const moduleIds = [...new Set((lessons || []).map(item => item.module_id).filter(Boolean))]
  const [{ data: courses }, { data: modules }] = await Promise.all([
    courseIds.length ? supabase.from('courses').select('id,title').in('id', courseIds) : Promise.resolve({ data: [] }),
    moduleIds.length ? supabase.from('modules').select('id,title').in('id', moduleIds) : Promise.resolve({ data: [] }),
  ])
  const byId = lista => new Map((lista || []).map(item => [item.id, item]))
  const p = byId(profiles), l = byId(lessons), c = byId(courses), m = byId(modules)
  let comentarios = (roots || []).map(item => { const aula = l.get(item.lesson_id); return { ...item, source: 'course', aluna: p.get(item.profile_id)?.name || p.get(item.profile_id)?.email || 'Aluna', aula: aula?.title || 'Aula', modulo: m.get(aula?.module_id)?.title || '', curso: c.get(aula?.course_id)?.title || 'Curso', respostas: (replies || []).filter(reply => reply.parent_id === item.id) } })
  let mq = supabase.from('mentorship_comments').select('id,body,created_at,profile_id,aula_id,archived').is('parent_id', null).eq('is_admin_reply', false).order('created_at', { ascending: false }).limit(300)
  mq = tab === 'arquivadas' ? mq.eq('archived', true) : mq.eq('archived', false)
  const { data: mroots } = await mq
  const mids=(mroots||[]).map(x=>x.id), mpids=[...new Set((mroots||[]).map(x=>x.profile_id))], maids=[...new Set((mroots||[]).map(x=>x.aula_id))]
  const [{data:mreplies},{data:mprofiles},{data:maulas}] = await Promise.all([mids.length?supabase.from('mentorship_comments').select('id,body,created_at,parent_id').in('parent_id',mids).order('created_at'):Promise.resolve({data:[]}),mpids.length?supabase.from('profiles').select('id,name,email').in('id',mpids):Promise.resolve({data:[]}),maids.length?supabase.from('aulas').select('id,titulo,mentorship_type').in('id',maids):Promise.resolve({data:[]})])
  const mp=byId(mprofiles), ma=byId(maulas)
  comentarios.push(...(mroots||[]).map(item=>({ ...item, source:'mentorship', aluna:mp.get(item.profile_id)?.name||mp.get(item.profile_id)?.email||'Aluna', aula:ma.get(item.aula_id)?.titulo||'Aula', modulo:'', curso:`Mentoria ${(ma.get(item.aula_id)?.mentorship_type||'').toUpperCase()}`, respostas:(mreplies||[]).filter(r=>r.parent_id===item.id)})))
  if (tab === 'novas') comentarios = comentarios.filter(item => item.respostas.length === 0)
  return NextResponse.json({ comentarios })
}

export async function POST(request) {
  const supabase = adminClient(); const admin = await autorizar(request, supabase); if (!admin) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try { const { parent_id, body, source } = await request.json(); const texto = String(body || '').trim(); if (!parent_id || !texto || texto.length > 1000) throw new Error('Resposta inválida.')
    const table=source==='mentorship'?'mentorship_comments':'lesson_comments', key=source==='mentorship'?'aula_id':'lesson_id'; const { data: parent } = await supabase.from(table).select(key).eq('id', parent_id).maybeSingle(); if (!parent) throw new Error('Comentário não encontrado.')
    const { error } = await supabase.from(table).insert({ [key]:parent[key], profile_id:admin.id, parent_id, is_admin_reply:true, body:texto }); if(error)throw error
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PATCH(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try { const { id, archived, source } = await request.json(); const table=source==='mentorship'?'mentorship_comments':'lesson_comments'; const { error } = await supabase.from(table).update({ archived: Boolean(archived) }).eq('id', id); if (error) throw error; return NextResponse.json({ success: true }) } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try { const { id, source } = await request.json(); const table=source==='mentorship'?'mentorship_comments':'lesson_comments'; await supabase.from(table).delete().eq('parent_id', id); const { error } = await supabase.from(table).delete().eq('id', id); if (error) throw error; return NextResponse.json({ success: true }) } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
