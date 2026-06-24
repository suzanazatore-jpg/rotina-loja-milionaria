import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'

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
      return NextResponse.json({ error: 'Apenas o admin pode cadastrar novas alunas.' }, { status: 403 })
    }

    // 2. Validar dados recebidos
    const body = await request.json()
    const { nome, email, senha, whatsapp } = body

    if (!nome?.trim() || !email?.trim() || !senha) {
      return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios.' }, { status: 400 })
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha precisa ter no mínimo 6 caracteres.' }, { status: 400 })
    }

    // 3. Criar o login no Supabase Auth
    const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: senha,
      email_confirm: true, // já confirma o e-mail automaticamente
    })

    if (erroCriarAuth) {
      return NextResponse.json({ error: `Erro ao criar login: ${erroCriarAuth.message}` }, { status: 400 })
    }

    const novoUserId = novoUsuario.user.id

    // 4. Criar o perfil correspondente na tabela "perfis"
    const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
      id: novoUserId,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      whatsapp: whatsapp?.trim() || null,
    })

    // 5. Rollback: se o perfil falhar, deleta o login criado no Auth
    if (erroPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(novoUserId)
      return NextResponse.json(
        { error: `Erro ao criar perfil: ${erroPerfil.message}. Login revertido.` },
        { status: 400 }
      )
    }

    // 5.5. Enviar e-mail de boas-vindas com os dados de acesso
    // Importante: se o e-mail falhar, NÃO desfazemos o cadastro da aluna —
    // ela já foi criada com sucesso, e o admin pode reenviar o e-mail
    // manualmente depois pelo botão em /admin/alunas.
    try {
      await enviarEmailBoasVindas({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
      })
    } catch (erroEmail) {
      console.error('Aluna criada, mas falhou o envio do e-mail de boas-vindas:', erroEmail)
      // Segue o fluxo normalmente — não bloqueia o cadastro por causa do e-mail
    }

    // 6. Sucesso
    return NextResponse.json(
      {
        success: true,
        aluna: {
          id: novoUserId,
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          whatsapp: whatsapp?.trim() || null,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json({ error: `Erro inesperado: ${err.message}` }, { status: 500 })
  }
}