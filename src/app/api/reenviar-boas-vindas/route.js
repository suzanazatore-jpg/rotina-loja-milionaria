// src/app/api/reenviar-boas-vindas/route.js
import { createClient } from '@supabase/supabase-js'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function gerarSenhaTemporaria() {
  return Math.random().toString(36).slice(-8)
}

export async function POST(request) {
  try {
    const { alunaId } = await request.json()

    if (!alunaId) {
      return Response.json({ erro: 'alunaId é obrigatório' }, { status: 400 })
    }

    const { data: perfil, error: erroPerfil } = await supabaseAdmin
      .from('perfis')
      .select('id, nome, email')
      .eq('id', alunaId)
      .single()

    if (erroPerfil || !perfil) {
      return Response.json({ erro: 'Aluna não encontrada' }, { status: 404 })
    }

    const novaSenha = gerarSenhaTemporaria()

    const { error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(
      alunaId,
      { password: novaSenha }
    )

    if (erroSenha) {
      console.error('Erro ao atualizar senha:', erroSenha)
      return Response.json({ erro: 'Falha ao gerar nova senha' }, { status: 500 })
    }

    await enviarEmailBoasVindas({
      nome: perfil.nome,
      email: perfil.email,
      senha: novaSenha,
    })

    return Response.json({ sucesso: true })
  } catch (erro) {
    console.error('Erro em /api/reenviar-boas-vindas:', erro)
    return Response.json({ erro: 'Erro interno ao reenviar e-mail' }, { status: 500 })
  }
}