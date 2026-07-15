import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'
import { enviarEmailRenovacao } from '@/lib/enviarEmailRenovacao'
import { gerarSenhaNumerica } from '@/lib/gerarSenha'

// ⚠️ Esta rota roda SOMENTE no servidor.
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

// ════════════════════════════════════════════════════
// MAPEAMENTO DE PRODUTOS → NÍVEL DE ACESSO E PRAZO
// Atualize aqui quando adicionar novos produtos no Guru.
// O texto é comparado em minúsculas, sem acentos exatos —
// use parte do nome que seja única o suficiente.
// ════════════════════════════════════════════════════
const MAPEAMENTO_PRODUTOS = [
  // Nível 3 — Mentoria (180 dias)
  { contem: 'mentoria impulso',     tipo_acesso: 'mentoria',       dias: 180 },
  { contem: 'mentoria impulso [6m]',tipo_acesso: 'mentoria',       dias: 180 },

  // Nível 2 — Implementação (90 dias)
  { contem: 'tráfego pago [3m]',    tipo_acesso: 'implementacao',  dias: 90  },
  { contem: 'trafego pago [3m]',    tipo_acesso: 'implementacao',  dias: 90  },

  // Nível 1 — Rotina (prazos variados)
  { contem: '[anual]',              tipo_acesso: 'rotina',         dias: 365 },
  { contem: '[6m]',                 tipo_acesso: 'rotina',         dias: 180 },
  { contem: 'tráfego pago 1x',      tipo_acesso: 'rotina',         dias: 30  },
  { contem: 'trafego pago 1x',      tipo_acesso: 'rotina',         dias: 30  },

  // Fallback genérico para qualquer produto de venda não mapeado acima
  { contem: '',                     tipo_acesso: 'rotina',         dias: 30  },
]

function identificarAcessoPorProduto(nomeProduto) {
  const nome = (nomeProduto || '').toLowerCase()
  for (const regra of MAPEAMENTO_PRODUTOS) {
    if (regra.contem === '' || nome.includes(regra.contem)) {
      const expira = new Date()
      expira.setDate(expira.getDate() + regra.dias)
      return {
        tipo_acesso: regra.tipo_acesso,
        acesso_expira_em: expira.toISOString(),
        dias: regra.dias,
      }
    }
  }
}

// Formata valor em centavos para "R$ XX,XX"
function formatarValorEmReais(valorEmCentavos) {
  const valorEmReais = (valorEmCentavos || 0) / 100
  return valorEmReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Formata "YYYY-MM-DD" para "DD/MM/AAAA"
function formatarDataBR(dataISO) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

export async function POST(request) {
  try {
    const payload = await request.json()

    // 1. Verificar token de autenticidade
    const tokenEsperado = process.env.GURU_ACCOUNT_TOKEN
    const tokenRecebido = payload?.api_token
    if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
    }

    const webhookType = payload?.webhook_type

    // ════════════════════════════════════════════════════
    // FLUXO 1: ASSINATURA (webhook_type === "subscription")
    // ════════════════════════════════════════════════════
    if (webhookType === 'subscription') {
      const statusAssinatura = payload?.last_status
      const statusFatura = payload?.current_invoice?.status

      if (statusAssinatura !== 'active' || statusFatura !== 'paid') {
        return NextResponse.json(
          { success: true, ignorado: true, motivo: 'Status não é pagamento aprovado.' },
          { status: 200 }
        )
      }

      const nome = payload?.subscriber?.name?.trim()
      const email = payload?.subscriber?.email?.trim().toLowerCase()
      const valorEmCentavos = payload?.current_invoice?.value
      const proximaCobrancaISO = payload?.dates?.next_cycle_at
      const whatsapp = payload?.subscriber?.phone_number || null

      if (!nome || !email) {
        return NextResponse.json({ error: 'Payload sem nome ou e-mail.' }, { status: 400 })
      }

      const valorFormatado = formatarValorEmReais(valorEmCentavos)
      const proximaCobrancaFormatada = formatarDataBR(proximaCobrancaISO)
      const proximaCobrancaISOCompleta = proximaCobrancaISO
        ? new Date(proximaCobrancaISO).toISOString()
        : null

      const { data: perfilExistente, error: erroBusca } = await supabaseAdmin
        .from('perfis').select('id').eq('email', email).maybeSingle()

      if (erroBusca) {
        return NextResponse.json({ error: erroBusca.message }, { status: 500 })
      }

      // Renovação
      if (perfilExistente) {
        await supabaseAdmin.from('perfis').update({
          tipo_acesso: 'rotina',
          status_assinatura: 'ativo',
          proxima_cobranca_em: proximaCobrancaISOCompleta,
        }).eq('id', perfilExistente.id)

        try {
          await enviarEmailRenovacao({ nome, email, valor: valorFormatado, proximaCobranca: proximaCobrancaFormatada })
        } catch (e) { console.error('Erro e-mail renovação:', e) }

        return NextResponse.json({ success: true, tipo: 'renovacao', email }, { status: 200 })
      }

      // Nova aluna via assinatura
      const senha = gerarSenhaNumerica()
      const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      })
      if (erroCriarAuth) {
        return NextResponse.json({ error: erroCriarAuth.message }, { status: 400 })
      }

      const novoUserId = novoUsuario.user.id
      const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
        id: novoUserId, nome, email, whatsapp,
        tipo_acesso: 'rotina',
        status_assinatura: 'ativo',
        proxima_cobranca_em: proximaCobrancaISOCompleta,
      })

      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        return NextResponse.json({ error: erroPerfil.message }, { status: 400 })
      }

      try { await enviarEmailBoasVindas({ nome, email, senha }) }
      catch (e) { console.error('Erro e-mail boas-vindas:', e) }

      return NextResponse.json({ success: true, tipo: 'nova_aluna_assinatura', email }, { status: 201 })
    }

    // ════════════════════════════════════════════════════
    // FLUXO 2: VENDA ÚNICA (webhook_type === "transaction")
    // ════════════════════════════════════════════════════
    if (webhookType === 'transaction') {
      if (payload?.status !== 'approved') {
        return NextResponse.json(
          { success: true, ignorado: true, motivo: 'Venda não aprovada.' },
          { status: 200 }
        )
      }

      const nome = payload?.contact?.name?.trim()
      const email = payload?.contact?.email?.trim().toLowerCase()
      const whatsapp = payload?.contact?.phone_number || null
      const nomeProduto = payload?.product?.name || ''

      if (!nome || !email) {
        return NextResponse.json({ error: 'Payload sem nome ou e-mail.' }, { status: 400 })
      }

      const { tipo_acesso, acesso_expira_em } = identificarAcessoPorProduto(nomeProduto)

      const { data: perfilExistente, error: erroBusca } = await supabaseAdmin
        .from('perfis').select('id, tipo_acesso').eq('email', email).maybeSingle()

      if (erroBusca) {
        return NextResponse.json({ error: erroBusca.message }, { status: 500 })
      }

      // Aluna já existe → atualiza acesso se o novo for maior
      if (perfilExistente) {
        await supabaseAdmin.from('perfis').update({
          tipo_acesso,
          acesso_expira_em,
          status_assinatura: 'ativo',
        }).eq('id', perfilExistente.id)

        return NextResponse.json({ success: true, tipo: 'acesso_atualizado', email, tipo_acesso }, { status: 200 })
      }

      // Aluna nova via venda única
      const senha = gerarSenhaNumerica()
      const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      })
      if (erroCriarAuth) {
        return NextResponse.json({ error: erroCriarAuth.message }, { status: 400 })
      }

      const novoUserId = novoUsuario.user.id
      const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
        id: novoUserId, nome, email, whatsapp,
        tipo_acesso,
        acesso_expira_em,
        status_assinatura: 'ativo',
      })

      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        return NextResponse.json({ error: erroPerfil.message }, { status: 400 })
      }

      try { await enviarEmailBoasVindas({ nome, email, senha }) }
      catch (e) { console.error('Erro e-mail boas-vindas:', e) }

      return NextResponse.json({ success: true, tipo: 'nova_aluna_venda', email, tipo_acesso }, { status: 201 })
    }

    // Tipo de webhook desconhecido
    return NextResponse.json(
      { success: true, ignorado: true, motivo: `webhook_type desconhecido: ${webhookType}` },
      { status: 200 }
    )

  } catch (err) {
    return NextResponse.json({ error: `Erro inesperado: ${err.message}` }, { status: 500 })
  }
}