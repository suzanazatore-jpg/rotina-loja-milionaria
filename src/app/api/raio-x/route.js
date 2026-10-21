import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { calcularRaioX, respostasValidas } from '@/lib/raioX'

const emailValido = valor => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
const somenteDigitos = valor => String(valor || '').replace(/\D/g, '')
const texto = (valor, limite) => String(valor || '').trim().slice(0, limite)

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request) {
  try {
    const origem = request.headers.get('origin')
    if (origem && origem !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
    }

    const corpo = await request.json()
    if (corpo.website) return NextResponse.json({ success: true })

    const nome = texto(corpo.nome, 100)
    const email = texto(corpo.email, 180).toLowerCase()
    const whatsapp = somenteDigitos(corpo.whatsapp).slice(0, 20)
    const respostas = corpo.respostas || {}
    const consentimento = corpo.consentimento === true

    if (nome.length < 2) throw new Error('Informe seu nome.')
    if (!emailValido(email)) throw new Error('Informe um e-mail válido.')
    if (whatsapp.length < 10) throw new Error('Informe um WhatsApp válido com DDD.')
    if (!consentimento) throw new Error('Confirme a autorização para receber o diagnóstico.')
    if (!respostasValidas(respostas)) throw new Error('Responda todas as perguntas do diagnóstico.')

    const diagnostico = calcularRaioX(respostas)
    const utmRecebida = corpo.utm && typeof corpo.utm === 'object' && !Array.isArray(corpo.utm) ? corpo.utm : {}
    const utm = Object.fromEntries(
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
        .map(chave => [chave, texto(utmRecebida[chave], 180)])
        .filter(([, valor]) => valor),
    )

    const { data, error } = await adminClient().from('raio_x_leads').insert({
      nome,
      email,
      whatsapp,
      faturamento_faixa: respostas.faturamento_faixa,
      numero_vendedoras: respostas.numero_vendedoras,
      acompanhamento_meta: respostas.acompanhamento_meta,
      estoque_parado: respostas.estoque_parado,
      autonomia_equipe: respostas.autonomia_equipe,
      rotina_whatsapp: respostas.rotina_whatsapp,
      frequencia_campanhas: respostas.frequencia_campanhas,
      maior_dificuldade: respostas.maior_dificuldade,
      pontuacoes: diagnostico.pontuacoes,
      gargalo: diagnostico.gargalo,
      perda_estimada: diagnostico.perdaEstimada,
      consentimento,
      utm,
    }).select('id').single()

    if (error) throw error
    return NextResponse.json({ success: true, leadId: data.id, diagnostico }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível gerar o diagnóstico.' }, { status: 400 })
  }
}

