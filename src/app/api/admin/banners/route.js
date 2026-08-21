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

function payload(body) {
  return {
    tag: String(body.tag || '📣 Aviso').trim() || '📣 Aviso',
    title: String(body.title || '').trim(),
    body: String(body.body || '').trim() || null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    is_active: body.is_active !== false,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    updated_at: new Date().toISOString(),
  }
}

export async function GET(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('panel_banners').select('*').order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ banners: data || [] })
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const dados = payload(await request.json())
  if (!dados.title) return NextResponse.json({ error: 'Informe o título do banner.' }, { status: 400 })
  const { data, error } = await supabase.from('panel_banners').insert(dados).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ banner: data }, { status: 201 })
}

export async function PATCH(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'Banner inválido.' }, { status: 400 })
  const dados = payload(body)
  if (!dados.title) return NextResponse.json({ error: 'Informe o título do banner.' }, { status: 400 })
  const { data, error } = await supabase.from('panel_banners').update(dados).eq('id', body.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ banner: data })
}

export async function DELETE(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Banner inválido.' }, { status: 400 })
  const { error } = await supabase.from('panel_banners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
