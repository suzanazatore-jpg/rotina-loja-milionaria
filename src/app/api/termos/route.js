import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function usuario(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user || null
}

export async function GET(request) {
  const supabase = serverClient()
  const user = await usuario(request, supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data: termos, error } = await supabase.from('terms_of_use').select('id,version,content,is_required,published_at').eq('is_current', true).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!termos) return NextResponse.json({ termos: null, aceito: true })
  const { data: aceite } = await supabase.from('term_acceptances').select('accepted_at').eq('terms_id', termos.id).eq('user_id', user.id).maybeSingle()
  return NextResponse.json({ termos, aceito: Boolean(aceite), accepted_at: aceite?.accepted_at || null })
}

export async function POST(request) {
  const supabase = serverClient()
  const user = await usuario(request, supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { terms_id } = await request.json()
  const { data: termos } = await supabase.from('terms_of_use').select('id').eq('id', terms_id).eq('is_current', true).maybeSingle()
  if (!termos) return NextResponse.json({ error: 'Estes termos não estão mais vigentes. Atualize a página.' }, { status: 409 })
  const { data, error } = await supabase.from('term_acceptances').upsert({ terms_id: termos.id, user_id: user.id }, { onConflict: 'terms_id,user_id', ignoreDuplicates: true }).select('accepted_at').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, accepted_at: data?.accepted_at || new Date().toISOString() })
}
