import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const cliente = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function telefoneWhatsapp(valor) {
  let numero = String(valor || '').replace(/\D/g, '')
  if (numero && numero.length <= 11) numero = `55${numero}`
  return numero
}

export async function POST(request) {
  try {
    const supabase = cliente()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (user?.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

    const { alunaId, senha, acao = 'definir' } = await request.json()
    if (!alunaId || !/^\d{6}$/.test(String(senha || ''))) return NextResponse.json({ error: 'Informe uma senha numérica de 6 dígitos.' }, { status: 400 })
    const { data: perfil } = await supabase.from('perfis').select('id,nome,email,whatsapp').eq('id', alunaId).maybeSingle()
    if (!perfil) return NextResponse.json({ error: 'Aluna não encontrada.' }, { status: 404 })

    if (acao === 'definir') {
      const { error } = await supabase.auth.admin.updateUserById(alunaId, { password: String(senha) })
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (acao === 'email') {
      await enviarEmailBoasVindas({ nome: perfil.nome, email: perfil.email, senha: String(senha) })
      return NextResponse.json({ success: true, destino: perfil.email })
    }
    if (acao === 'whatsapp') {
      const telefone = telefoneWhatsapp(perfil.whatsapp)
      if (!telefone) return NextResponse.json({ error: 'Cadastre o WhatsApp da aluna antes de enviar.' }, { status: 400 })
      const texto = `Olá, ${String(perfil.nome || '').split(' ')[0] || 'aluna'}! Seu acesso à Rotina da Loja Milionária foi redefinido. Login: ${perfil.email} | Senha temporária: ${senha} | Acesse: https://rotina.suzanazatorre.com.br/login`
      const url = process.env.PABBLY_WEBHOOK_ACESSO_URL
      if (url) {
        const resposta = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evento: 'redefinicao_acesso', nome: perfil.nome, email: perfil.email, senha: String(senha), telefone, mensagem: texto, link_app: 'https://rotina.suzanazatorre.com.br/login' }) })
        if (!resposta.ok) throw new Error('O serviço de WhatsApp não confirmou o envio.')
        return NextResponse.json({ success: true, enviado: true })
      }
      return NextResponse.json({ success: true, enviado: false, whatsappUrl: `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}` })
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível concluir.' }, { status: 500 })
  }
}
