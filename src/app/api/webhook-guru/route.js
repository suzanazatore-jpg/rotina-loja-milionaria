import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'
import { enviarEmailRenovacao } from '@/lib/enviarEmailRenovacao'
import { gerarSenhaNumerica } from '@/lib/gerarSenha'

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

// Formata um valor em centavos (ex: 1600) para texto em reais (ex: "R$ 16,00")
function formatarValorEmReais(valorEmCentavos) {
  const valorEmReais = (valorEmCentavos || 0) / 100
  return valorEmReais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

// Formata uma data "YYYY-MM-DD" para "DD/MM/AAAA"
function formatarDataBR(dataISO) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

export async function POST(request) {
  try {
    // 1. Ler o payload enviado pelo Guru
    const payload = await request.json()

    // 2. Verificar autenticidade: o token enviado pelo Guru precisa bater
    //    com o Account Token guardado nas variáveis de ambiente.
    const tokenEsperado = process.env.GURU_ACCOUNT_TOKEN
    const tokenRecebido = payload?.api_token

    if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
    }

    // 3. Confirmar que é realmente um pagamento aprovado
    const statusAssinatura = payload?.last_status
    const statusFatura = payload?.current_invoice?.status

    if (statusAssinatura !== 'active' || statusFatura !== 'paid') {
      // Não é um evento de pagamento aprovado (pode ser cancelamento, atraso, etc).
      // Por enquanto apenas confirmamos o recebimento sem processar.
      return NextResponse.json(
        { success: true, ignorado: true, motivo: 'Status não é pagamento aprovado.' },
        { status: 200 }
      )
    }

    // 4. Extrair os dados da aluna a partir do payload
    const nome = payload?.subscriber?.name?.trim()
    const email = payload?.subscriber?.email?.trim().toLowerCase()
    const valorEmCentavos = payload?.current_invoice?.value
    const proximaCobrancaISO = payload?.dates?.next_cycle_at
    const whatsapp = payload?.subscriber?.phone_number || null

    if (!nome || !email) {
      return NextResponse.json(
        { error: 'Payload sem nome ou e-mail da assinante.' },
        { status: 400 }
      )
    }

    const valorFormatado = formatarValorEmReais(valorEmCentavos)
    const proximaCobrancaFormatada = formatarDataBR(proximaCobrancaISO)
    const proximaCobrancaISOCompleta = proximaCobrancaISO
      ? new Date(proximaCobrancaISO).toISOString()
      : null

    // 5. Verificar se já existe um perfil com esse e-mail
    const { data: perfilExistente, error: erroBusca } = await supabaseAdmin
      .from('perfis')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (erroBusca) {
      return NextResponse.json(
        { error: `Erro ao buscar perfil existente: ${erroBusca.message}` },
        { status: 500 }
      )
    }

    // ════════════════════════════════════════════════════
    // CASO A: Aluna já existe → é uma RENOVAÇÃO
    // ════════════════════════════════════════════════════
    if (perfilExistente) {
      const { error: erroUpdate } = await supabaseAdmin
        .from('perfis')
        .update({
          tipo_acesso: 'assinatura',
          status_assinatura: 'ativo',
          proxima_cobranca_em: proximaCobrancaISOCompleta,
        })
        .eq('id', perfilExistente.id)

      if (erroUpdate) {
        return NextResponse.json(
          { error: `Erro ao atualizar perfil na renovação: ${erroUpdate.message}` },
          { status: 500 }
        )
      }

      try {
        await enviarEmailRenovacao({
          nome,
          email,
          valor: valorFormatado,
          proximaCobranca: proximaCobrancaFormatada,
        })
      } catch (erroEmail) {
        console.error('Renovação processada, mas falhou o envio do e-mail:', erroEmail)
      }

      return NextResponse.json(
        { success: true, tipo: 'renovacao', email },
        { status: 200 }
      )
    }

    // ════════════════════════════════════════════════════
    // CASO B: Aluna não existe → é uma CONTA NOVA
    // ════════════════════════════════════════════════════
    const senha = gerarSenhaNumerica()

    const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (erroCriarAuth) {
      return NextResponse.json(
        { error: `Erro ao criar login: ${erroCriarAuth.message}` },
        { status: 400 }
      )
    }

    const novoUserId = novoUsuario.user.id

    const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
      id: novoUserId,
      nome,
      email,
      whatsapp,
      tipo_acesso: 'assinatura',
      status_assinatura: 'ativo',
      proxima_cobranca_em: proximaCobrancaISOCompleta,
    })

    // Rollback: se o perfil falhar, deleta o login criado no Auth
    if (erroPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(novoUserId)
      return NextResponse.json(
        { error: `Erro ao criar perfil: ${erroPerfil.message}. Login revertido.` },
        { status: 400 }
      )
    }

    try {
      await enviarEmailBoasVindas({ nome, email, senha })
    } catch (erroEmail) {
      console.error('Aluna criada, mas falhou o envio do e-mail de boas-vindas:', erroEmail)
    }

    return NextResponse.json(
      { success: true, tipo: 'nova_aluna', email },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json({ error: `Erro inesperado: ${err.message}` }, { status: 500 })
  }
}