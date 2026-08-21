import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const BUCKET = 'rotinas'
function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }

export async function GET(request) {
  const supabase = adminClient(); const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token); if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  const semanaInicio = new URL(request.url).searchParams.get('semana_inicio')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaInicio || '')) return NextResponse.json({ error: 'Semana inválida.' }, { status: 400 })
  const { data: item, error } = await supabase.from('rotinas').select('*').eq('semana_inicio', semanaInicio).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); if (!item) return NextResponse.json({ rotina: null })
  if (item.storage_bucket === BUCKET && item.arquivo_nome) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.arquivo_nome, 3600); item.arquivo_url = data?.signedUrl || null }
  return NextResponse.json({ rotina: item })
}
