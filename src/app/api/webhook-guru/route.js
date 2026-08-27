import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'
import { enviarEmailRenovacao } from '@/lib/enviarEmailRenovacao'
import { gerarSenhaNumerica } from '@/lib/gerarSenha'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
      return { tipo_acesso: regra.tipo_acesso, acesso_expira_em: expira.toISOString(), dias: regra.dias }
    }
  }
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extrairIdsOferta(payload) {
  const valores = [
    payload?.offer_id,
    payload?.offer?.id,
    payload?.offer?.offer_id,
    payload?.product?.id,
    payload?.product?.offer_id,
    payload?.product?.marketplace_id,
    payload?.products?.[0]?.id,
    payload?.products?.[0]?.offer_id,
    payload?.current_invoice?.offer_id,
    payload?.current_invoice?.product_id,
    payload?.subscription?.offer_id,
    payload?.subscription?.product_id,
  ]
  return [...new Set(valores.filter(valor => valor !== null && valor !== undefined && String(valor).trim()).map(String))]
}

async function localizarPlano(payload, nomeProduto) {
  const idsOferta = extrairIdsOferta(payload)
  if (idsOferta.length) {
    const { data, error } = await supabaseAdmin
      .from('plans')
      .select('id,name,offer_id,period_days')
      .in('offer_id', idsOferta)
    if (error) throw new Error(`Erro ao localizar plano: ${error.message}`)
    if (data?.length === 1) return data[0]
    if (data?.length > 1) throw new Error(`Mais de um plano corresponde à oferta recebida (${idsOferta.join(', ')}).`)
  }

  const { data: planos, error } = await supabaseAdmin
    .from('plans')
    .select('id,name,offer_id,period_days')
    .not('offer_id', 'like', '__individual_%')
  if (error) throw new Error(`Erro ao localizar plano: ${error.message}`)
  const produto = normalizarTexto(nomeProduto)
  const correspondencias = (planos || []).filter(plano => {
    const nomePlano = normalizarTexto(plano.name)
    return produto && (produto === nomePlano || produto.includes(nomePlano) || nomePlano.includes(produto))
  })
  if (correspondencias.length === 1) return correspondencias[0]

  const identificador = idsOferta.length ? idsOferta.join(', ') : 'não enviado'
  throw new Error(`Plano não encontrado para a oferta ${identificador} e produto "${nomeProduto || 'não informado'}".`)
}

async function vincularPlanoAoPerfil({ perfilId, plano, nome, email, whatsapp }) {
  const agora = new Date().toISOString()
  const { error: perfilCursosError } = await supabaseAdmin.from('profiles').upsert({
    id: perfilId,
    name: nome,
    email,
    phone: whatsapp,
    role: 'student',
    status: 'active',
    updated_at: agora,
  })
  if (perfilCursosError) throw new Error(`Erro ao sincronizar perfil: ${perfilCursosError.message}`)

  const { error: planoError } = await supabaseAdmin.from('profile_plans').upsert(
    { profile_id: perfilId, plan_id: plano.id },
    { onConflict: 'profile_id,plan_id', ignoreDuplicates: true }
  )
  if (planoError) throw new Error(`Erro ao vincular plano: ${planoError.message}`)
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

function normalizarTelefone(telefone) {
  if (!telefone) return null
  let num = String(telefone).replace(/\D/g, '')
  if (num.length <= 11) num = '55' + num
  return num
}

async function dispararWhatsappAcesso({ nome, email, senha, whatsapp, tipo_acesso, nome_produto }) {
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
        email, senha, telefone, tipo_acesso,
        nome_produto: nome_produto || '',
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
      return NextResponse.json({ error: 'Token invalido.' }, { status: 401 })
    }

    const webhookType = payload?.webhook_type

    if (webhookType === 'subscription') {
      const statusAssinatura = payload?.last_status
      const statusFatura = payload?.current_invoice?.status
      if (statusAssinatura !== 'active' || statusFatura !== 'paid') {
        return NextResponse.json({ success: true, ignorado: true, motivo: 'Status nao aprovado.' }, { status: 200 })
      }

      const nome = payload?.subscriber?.name?.trim()
      const email = payload?.subscriber?.email?.trim().toLowerCase()
      const valorEmCentavos = payload?.current_invoice?.value
      const proximaCobrancaISO = payload?.dates?.next_cycle_at
      const whatsapp = payload?.subscriber?.phone_number || null
      const nomeProduto = payload?.product?.name || payload?.products?.[0]?.name || ''

      if (!nome || !email) {
        return NextResponse.json({ error: 'Payload sem nome ou e-mail.' }, { status: 400 })
      }

      const plano = await localizarPlano(payload, nomeProduto)

      const valorFormatado = formatarValorEmReais(valorEmCentavos)
      const proximaCobrancaFormatada = formatarDataBR(proximaCobrancaISO)
      const proximaCobrancaISOCompleta = proximaCobrancaISO ? new Date(proximaCobrancaISO).toISOString() : null

      const { data: perfilExistente, error: erroBusca } = await supabaseAdmin
        .from('perfis').select('id').eq('email', email).maybeSingle()
      if (erroBusca) {
        return NextResponse.json({ error: erroBusca.message }, { status: 500 })
      }

      if (perfilExistente) {
        const { tipo_acesso } = identificarAcessoPorProduto(nomeProduto)
        const { error: updateError } = await supabaseAdmin.from('perfis').update({
          tipo_acesso,
          status_assinatura: 'ativo',
          proxima_cobranca_em: proximaCobrancaISOCompleta,
        }).eq('id', perfilExistente.id)
        if (updateError) throw new Error(`Erro ao atualizar assinatura: ${updateError.message}`)
        await vincularPlanoAoPerfil({ perfilId: perfilExistente.id, plano, nome, email, whatsapp })
        try {
          await enviarEmailRenovacao({ nome, email, valor: valorFormatado, proximaCobranca: proximaCobrancaFormatada })
        } catch (e) { console.error('Erro e-mail renovacao:', e) }
        return NextResponse.json({ success: true, tipo: 'renovacao', email }, { status: 200 })
      }

      const senha = gerarSenhaNumerica()
      const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      })
      if (erroCriarAuth) {
        return NextResponse.json({ error: erroCriarAuth.message }, { status: 400 })
      }

      const novoUserId = novoUsuario.user.id
      const { tipo_acesso } = identificarAcessoPorProduto(nomeProduto)
      const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
        id: novoUserId, nome, email, whatsapp,
        tipo_acesso,
        status_assinatura: 'ativo',
        proxima_cobranca_em: proximaCobrancaISOCompleta,
      })
      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        return NextResponse.json({ error: erroPerfil.message }, { status: 400 })
      }

      try {
        await vincularPlanoAoPerfil({ perfilId: novoUserId, plano, nome, email, whatsapp })
      } catch (error) {
        await supabaseAdmin.from('perfis').delete().eq('id', novoUserId)
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        throw error
      }

      try { await enviarEmailBoasVindas({ nome, email, senha }) }
      catch (e) { console.error('Erro e-mail boas-vindas:', e) }

      await dispararWhatsappAcesso({ nome, email, senha, whatsapp, tipo_acesso, nome_produto: nomeProduto })

      return NextResponse.json({ success: true, tipo: 'nova_aluna_assinatura', email }, { status: 201 })
    }

    if (webhookType === 'transaction') {
      if (payload?.status !== 'approved') {
        return NextResponse.json({ success: true, ignorado: true, motivo: 'Venda nao aprovada.' }, { status: 200 })
      }

      const nome = payload?.contact?.name?.trim()
      const email = payload?.contact?.email?.trim().toLowerCase()
      const whatsapp = payload?.contact?.phone_number || null
      const nomeProduto = payload?.product?.name || ''

      if (!nome || !email) {
        return NextResponse.json({ error: 'Payload sem nome ou e-mail.' }, { status: 400 })
      }


      const plano = await localizarPlano(payload, nomeProduto)

      const { tipo_acesso, acesso_expira_em } = identificarAcessoPorProduto(nomeProduto)

      const { data: perfilExistente, error: erroBusca } = await supabaseAdmin
        .from('perfis').select('id, tipo_acesso').eq('email', email).maybeSingle()
      if (erroBusca) {
        return NextResponse.json({ error: erroBusca.message }, { status: 500 })
      }

      if (perfilExistente) {
        const { error: updateError } = await supabaseAdmin.from('perfis').update({
          tipo_acesso, acesso_expira_em, status_assinatura: 'ativo',
        }).eq('id', perfilExistente.id)
        if (updateError) throw new Error(`Erro ao atualizar acesso: ${updateError.message}`)
        await vincularPlanoAoPerfil({ perfilId: perfilExistente.id, plano, nome, email, whatsapp })
        return NextResponse.json({ success: true, tipo: 'acesso_atualizado', email, tipo_acesso, plano: plano.name }, { status: 200 })
      }

      const senha = gerarSenhaNumerica()
      const { data: novoUsuario, error: erroCriarAuth } = await supabaseAdmin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      })
      if (erroCriarAuth) {
        return NextResponse.json({ error: erroCriarAuth.message }, { status: 400 })
      }

      const novoUserId = novoUsuario.user.id
      const { error: erroPerfil } = await supabaseAdmin.from('perfis').insert({
        id: novoUserId, nome, email, whatsapp, tipo_acesso, acesso_expira_em, status_assinatura: 'ativo',
      })
      if (erroPerfil) {
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        return NextResponse.json({ error: erroPerfil.message }, { status: 400 })
      }


      try {
        await vincularPlanoAoPerfil({ perfilId: novoUserId, plano, nome, email, whatsapp })
      } catch (error) {
        await supabaseAdmin.from('perfis').delete().eq('id', novoUserId)
        await supabaseAdmin.auth.admin.deleteUser(novoUserId)
        throw error
      }

      try { await enviarEmailBoasVindas({ nome, email, senha }) }
      catch (e) { console.error('Erro e-mail boas-vindas:', e) }

      await dispararWhatsappAcesso({ nome, email, senha, whatsapp, tipo_acesso, nome_produto: nomeProduto })

      return NextResponse.json({ success: true, tipo: 'nova_aluna_venda', email, tipo_acesso, plano: plano.name }, { status: 201 })
    }

    return NextResponse.json({ success: true, ignorado: true, motivo: 'webhook_type desconhecido' }, { status: 200 })

  } catch (err) {
    return NextResponse.json({ error: 'Erro inesperado: ' + err.message }, { status: 500 })
  }
}
