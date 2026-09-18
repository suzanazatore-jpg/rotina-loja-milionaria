import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request) {
  const supabase = adminClient()
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (user?.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  const { data, error } = await supabase
    .from('raio_x_leads')
    .select('id,created_at,nome,email,whatsapp,faturamento_faixa,numero_vendedoras,pontuacoes,gargalo,perda_estimada,utm')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

