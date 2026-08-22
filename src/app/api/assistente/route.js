import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `Você é a Assistente da Rotina da Loja Milionária. Atenda alunas brasileiras, donas de lojas de moda.
Responda em português do Brasil, como uma pessoa atenciosa, com frases curtas e instruções práticas.
Ajude somente com navegação no aplicativo, acesso a cursos e aulas, download de PDFs, campanhas, calendário, rotina, precificação e dúvidas técnicas simples.
Nunca invente aulas, links, pagamentos ou dados da aluna. Se não tiver certeza ou se o problema exigir acesso à conta, diga isso claramente e recomende abrir um chamado no Suporte.
Use no máximo 120 palavras por resposta.`

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 })
    const { data: { user }, error } = await adminClient().auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

    const body = await request.json()
    const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : []
    if (!messages.length) return NextResponse.json({ error: 'Escreva uma pergunta.' }, { status: 400 })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'A Assistente ainda não foi configurada. Abra um chamado no Suporte.' }, { status: 503 })

    const resposta = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1-mini',
        instructions: SYSTEM_PROMPT,
        input: messages.map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '').slice(0, 1200) })),
        max_output_tokens: 300,
      }),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error?.message || 'Falha ao consultar a Assistente.')
    const answer = dados.output_text || dados.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text
    if (!answer) throw new Error('A Assistente não retornou uma resposta.')
    return NextResponse.json({ answer })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível responder agora.' }, { status: 500 })
  }
}
