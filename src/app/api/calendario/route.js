import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request) {
  const supabase = serverClient()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('calendario').select('*').order('mes_ano', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const calendarios = await Promise.all((data || []).map(async item => {
    if (item.storage_bucket === 'calendarios' && item.arquivo_nome) {
      const { data: link } = await supabase.storage.from('calendarios').createSignedUrl(item.arquivo_nome, 3600)
      return { ...item, arquivo_url: link?.signedUrl || null }
    }
    return item
  }))
  return NextResponse.json({ calendarios })
}
