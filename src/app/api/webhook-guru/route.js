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
// ════════════════════════════════════════════════════
const MAPEAMENTO_PRODUTOS = [
  { contem: 'mentoria impulso',     tipo_acesso: 'mentoria',       dias: 180 },
  { contem: 'mentoria impulso [6m]',tipo_acesso: 'mentoria',       dias: 180 },
  { contem: 'tráfego pago [3m]',    tipo_acesso: 'implementacao',  dias: 90  },
  { contem: 'trafego pago [3m]',    tipo_acesso: 'implementacao',  dias: 90  },
  { contem: '[anual]',              tipo_acesso: 'rotina',         dias: 365 },
  { contem: '[6m]',                 tipo_acesso: 'rotina',         dias: 180 },
  { contem: 'tráfego pago 1x',      tipo_acesso: 'rotina',         dias: 30  },
  { contem: 'trafego pago 1x',      tipo_acesso: 'rotina',         dias: 30  },
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

function formatarValorEmReais(valorEmCentavos) {
  const valorEmReais = (valorEmCentavos || 0) / 100
  return valorEmReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDataBR(dataISO) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

// ════════════════════════════════════════════════════
// Dispara os dados de acesso pro WhatsApp via Pabbly → BotConversa
// ════════════════════════════════════════════════════
function normalizarTelefone(telefone) {
  if (!telefone) return null
  let num = String(telefone).replace(/\D/g, '')
  if (num.length <= 11) num = '55' + num
  return num
}

async function dispararWhatsappAcesso({ nome, email, senha, whatsapp, tipo_acesso }) {
  const url = process.env.PABBLY_WEBHOOK_ACESSO_URL
  if (!url) { console.error('PABBLY_WEBHOOK_ACESSO_URL nao configurada'); return }

  const telefone = normalizarTelefone(whatsapp)
  if (!telefone) { console.error('Aluna sem telefone, WhatsApp nao enviado:', email); return }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento: 'boas_vindas',
        nome,
        primeiro_nome: (nome || '').split(' ')[0],
        email,
        senha,
        telefone,
        tipo_acesso,
        link_app: 'https://rotina.suzanazatorre.com.br/login',
      }),
    })
    console.log('WhatsApp Pabbly disparado:', email, 'status', resp.status)
  } catch (e) {
    console.error('Erro ao disparar WhatsApp (Pabbly):', e)
  }
}

export async function POST(request) {
  try {
    const payload = await request.json()

    const tokenEsperado = process.env.GURU_ACCOUNT_TOKEN
    const tokenRecebido = payload?.api_token
    if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
    }

    const webhookType = payload?.webhook_type

    // ════════════════════════════════════════════════════
    // FLUXO 1: ASSINATURA
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

      await dispararWhatsappAcesso({ nome, email, senha, whatsapp, tipo_acesso: 'rotina' })

      return NextResponse.json({ success: true, tipo: 'nova_aluna_assinatura', email }, { status: 201 })
    }

    // ════════════════════════════════════════════════════
    // FLUXO 2: VENDA ÚNICA
    // ════════════════════════════════════════════════════
    if (webhookType === 'transaction') {
      if (payload?.status !== 'approved') {
        return NextResponse.json(
          { success: true, ignorado: true, motivo: 'Venda não aprovada.' },
          { status: 200 }
        )
      }

      const nome = payload?.contact?.name?.trim()