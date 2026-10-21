import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request) {
  const supabase = adminClient()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const [shelvesRes, linksRes] = await Promise.all([
    supabase.from('course_shelves').select('id,title,subtitle,sort_order').eq('is_published', true).order('sort_order').order('created_at'),
    supabase.from('shelf_courses').select('shelf_id,course_id,sort_order').order('sort_order'),
  ])
  const error = shelvesRes.error || linksRes.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const carrosseis = (shelvesRes.data || []).map(shelf => ({
    ...shelf,
    course_ids: (linksRes.data || []).filter(link => link.shelf_id === shelf.id).sort((a, b) => a.sort_order - b.sort_order).map(link => link.course_id),
  }))
  return NextResponse.json({ carrosseis })
}
