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

export async function GET(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('terms_of_use').select('*').eq('is_current', true).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let aceites = 0
  if (data) {
    const resultado = await supabase.from('term_acceptances').select('*', { count: 'exact', head: true }).eq('terms_id', data.id)
    aceites = resultado.count || 0
  }
  return NextResponse.json({ termos: data, aceites })
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const body = await request.json()
  const content = String(body.content || '').trim()
  if (content.length < 50) return NextResponse.json({ error: 'O texto dos termos está muito curto.' }, { status: 400 })

  const { data: atual, error: atualError } = await supabase.from('terms_of_use').select('version').eq('is_current', true).maybeSingle()
  if (atualError) return NextResponse.json({ error: atualError.message }, { status: 500 })
  if (atual) {
    const { error } = await supabase.from('terms_of_use').update({ is_current: false }).eq('is_current', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { data, error } = await supabase.from('terms_of_use').insert({
    version: (atual?.version || 0) + 1,
    content,
    is_required: body.is_required !== false,
    is_current: true,
  }).select().single()
  if (error) {
    if (atual) await supabase.from('terms_of_use').update({ is_current: true }).eq('version', atual.version)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ termos: data }, { status: 201 })
}
