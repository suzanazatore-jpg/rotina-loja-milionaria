import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET(request) {
  try {
    const supabase = client(), token = request.headers.get('authorization')?.replace('Bearer ', '')
    const id = new URL(request.url).searchParams.get('id')
    const { data: { user } } = await supabase.auth.getUser(token || '')
    if (!user || !id) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    const { data: material } = await supabase.from('mentorship_materials').select('id,aula_id,file_url').eq('id', id).maybeSingle()
    if (!material) return NextResponse.json({ error: 'Material não encontrado.' }, { status: 404 })
    const { data: aula } = await supabase.from('aulas').select('mentorship_type').eq('id', material.aula_id).maybeSingle()
    const { data: planos } = await supabase.from('profile_plans').select('plan_id').eq('profile_id', user.id)
    const ids = (planos || []).map(p => p.plan_id)
    const { data: acesso } = ids.length ? await supabase.from('plan_mentorships').select('mentorship_type').in('plan_id', ids).eq('mentorship_type', aula?.mentorship_type) : { data: [] }
    if (user.email !== ADMIN_EMAIL && !acesso?.length) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    if (/^https?:\/\//i.test(material.file_url)) return NextResponse.json({ url: material.file_url })
    const path = material.file_url.replace(/^storage:\/\/course-materials\//, '')
    const { data, error } = await supabase.storage.from('course-materials').createSignedUrl(path, 300)
    if (error) throw error
    return NextResponse.json({ url: data.signedUrl })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }) }
}
