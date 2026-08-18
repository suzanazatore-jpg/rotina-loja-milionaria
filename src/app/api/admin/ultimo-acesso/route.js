import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ⚠️ Esta rota roda SOMENTE no servidor.
// A service_role key NUNCA deve ser exposta ao navegador.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// ════════ E-MAIL DO ADMIN ════════
const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export async function POST(request) {
  try {
    // 1. Verificar se quem está chamando é o admin autenticado
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 })
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Não autorizado. Sessão inválida.' }, { status: 401 })
    }

    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Apenas o admin pode consultar os acessos.' }, { status: 403 })
    }

    // 2. Percorrer TODAS as páginas do Auth (1000 por página) e montar
    //    um mapa { id_da_aluna: data_do_ultimo_login }. O id do Auth é o
    //    mesmo id da tabela "perfis", então dá pra casar direto na tela.
    const acessos = {}
    let pagina = 1
    const porPagina = 1000

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: pagina, perPage: porPagina })
      if (error) {
        return NextResponse.json({ error: `Erro ao listar acessos: ${error.message}` }, { status: 500 })
      }
      const usuarios = data?.users || []
      for (const u of usuarios) {
        acessos[u.id] = u.last_sign_in_at || null
      }
      if (usuarios.length < porPagina) break
      pagina += 1
      if (pagina > 20) break // rede de segurança contra loop infinito
    }

    return NextResponse.json({ acessos })
  } catch (err) {
    return NextResponse.json({ error: `Erro inesperado: ${err.message}` }, { status: 500 })
  }
}
