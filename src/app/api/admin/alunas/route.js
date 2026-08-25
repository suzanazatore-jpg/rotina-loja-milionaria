import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enviarEmailBoasVindas } from '@/lib/enviarEmailBoasVindas'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const EMAIL = /^\S+@\S+\.\S+$/

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function autorizar(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL ? user : null
}

function senhaProvisoria() {
  return String(100000 + Math.floor(Math.random() * 900000))
}

function dataIso(valor, fimDoDia = false) {
  const texto = String(valor || '').trim()
  if (!texto) return null
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const data = br
    ? new Date(`${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}T${fimDoDia ? '23:59:59' : '12:00:00'}`)
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T${fimDoDia ? '23:59:59' : '12:00:00'}` : texto)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

async function prepararAcessos(supabase, cursoIds = [], planoIds = []) {
  const cursosAvulsos = [...new Set(cursoIds.filter(Boolean))]
  const planosUnicos = [...new Set(planoIds.filter(Boolean))]
  const [cursos, planos, vinculos, conteudos] = await Promise.all([
    cursosAvulsos.length ? supabase.from('courses').select('id,title').in('id', cursosAvulsos) : Promise.resolve({ data: [] }),
    planosUnicos.length ? supabase.from('plans').select('id,name,period_days').in('id', planosUnicos) : Promise.resolve({ data: [] }),
    planosUnicos.length ? supabase.from('plan_courses').select('plan_id,course_id').in('plan_id', planosUnicos) : Promise.resolve({ data: [] }),
    planosUnicos.length ? supabase.from('plan_app_contents').select('plan_id,content_key').in('plan_id', planosUnicos) : Promise.resolve({ data: [] }),
  ])
  if (cursos.error || planos.error || vinculos.error || conteudos.error) throw new Error('Não foi possível confirmar os cursos e planos selecionados.')
  const ids = [...new Set([...(cursos.data || []).map(c => c.id), ...(vinculos.data || []).map(v => v.course_id)])]
  const dias = Math.max(0, ...(planos.data || []).map(p => Number(p.period_days) || 0))
  return {
    ids,
    dias,
    mentoria: (conteudos.data || []).some(item => item.content_key === 'mentorship'),
    assistente: (conteudos.data || []).some(item => item.content_key === 'assistant'),
    planoIds: planosUnicos,
    titulo: cursos.data?.[0]?.title || planos.data?.[0]?.name || null,
  }
}

async function criarUma(supabase, aluna, opcoes) {
  const nome = String(aluna.nome || '').trim()
  const email = String(aluna.email || '').trim().toLowerCase()
  const telefone = String(aluna.telefone || aluna.whatsapp || '').trim()
  if (!nome || !EMAIL.test(email)) throw new Error(`${nome || email || 'Linha sem nome'}: nome ou e-mail inválido.`)

  const { data: existente } = await supabase.from('perfis').select('id').eq('email', email).maybeSingle()
  if (existente) throw new Error(`${email}: já cadastrada.`)

  const senha = opcoes.enviarBoasVindas ? senhaProvisoria() : null
  const { data: auth, error: authError } = await supabase.auth.admin.createUser({
    email, email_confirm: true, ...(senha ? { password: senha } : {}),
    user_metadata: { name: nome, phone: telefone || null, source: opcoes.origem },
  })
  if (authError || !auth.user) throw new Error(`${email}: ${authError?.message || 'não foi possível criar o login'}.`)

  const id = auth.user.id
  let expiracao = dataIso(aluna.dataExpiracao, true)
  if (!expiracao && opcoes.acessos.dias) {
    const data = new Date(); data.setDate(data.getDate() + opcoes.acessos.dias); expiracao = data.toISOString()
  }
  const compra = dataIso(aluna.dataCompra) || new Date().toISOString()

  try {
    const [perfilAntigo, perfilCursos] = await Promise.all([
      supabase.from('perfis').insert({ id, nome, email, whatsapp: telefone || null, tipo_acesso: expiracao ? 'avista' : 'rotina', acesso_expira_em: expiracao?.slice(0, 10) || null }),
      supabase.from('profiles').upsert({ id, name: nome, email, phone: telefone || null, role: 'student', status: 'active', mentoria_aplicada: opcoes.acessos.mentoria, assistant_enabled: opcoes.acessos.assistente, updated_at: new Date().toISOString() }),
    ])
    if (perfilAntigo.error || perfilCursos.error) throw perfilAntigo.error || perfilCursos.error
    if (opcoes.acessos.ids.length) {
      const { error } = await supabase.from('enrollments').insert(opcoes.acessos.ids.map(courseId => ({ profile_id: id, course_id: courseId, status: 'active', source: opcoes.origem, purchased_at: compra, expires_at: expiracao })))
      if (error) throw error
    }
    if (opcoes.acessos.planoIds.length) {
      const { error } = await supabase.from('profile_plans').insert(opcoes.acessos.planoIds.map(planId => ({ profile_id: id, plan_id: planId })))
      if (error) throw error
    }
  } catch (error) {
    await supabase.from('perfis').delete().eq('id', id)
    await supabase.auth.admin.deleteUser(id)
    throw new Error(`${email}: ${error.message}`)
  }

  let emailFalhou = false
  if (senha) {
    try { await enviarEmailBoasVindas({ nome, email, senha }) } catch { emailFalhou = true }
  }
  return { id, nome, email, emailFalhou }
}

export async function GET(request) {
  try {
    const supabase = adminClient()
    if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const [cursos, planos, matriculas, vinculos, planosAlunas, perfisAcesso] = await Promise.all([
      supabase.from('courses').select('id,title,slug').order('title'),
      supabase.from('plans').select('id,name,offer_id,period_days').order('name'),
      supabase.from('enrollments').select('profile_id,course_id,status,created_at,purchased_at,expires_at'),
      supabase.from('plan_courses').select('plan_id,course_id'),
      supabase.from('profile_plans').select('profile_id,plan_id,created_at'),
      supabase.from('profiles').select('id,status'),
    ])
    const erro = cursos.error || planos.error || matriculas.error || vinculos.error || planosAlunas.error || perfisAcesso.error
    if (erro) throw erro
    return NextResponse.json({
      cursos: cursos.data || [], planos: planos.data || [], matriculas: matriculas.data || [],
      vinculos: vinculos.data || [], planosAlunas: planosAlunas.data || [], perfisAcesso: perfisAcesso.data || [],
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = adminClient()
    if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const body = await request.json()
    const lista = body.modo === 'massa' ? body.alunas : [body.aluna]
    if (!Array.isArray(lista) || !lista.length) return NextResponse.json({ error: 'Nenhuma aluna informada.' }, { status: 400 })
    const enviarBoasVindas = body.enviarBoasVindas !== false
    const limite = enviarBoasVindas ? 100 : 500
    if (lista.length > limite) return NextResponse.json({ error: `Importe no máximo ${limite} alunas por vez.` }, { status: 400 })

    const acessos = await prepararAcessos(supabase, body.cursoIds || [], body.planoIds || [])
    const criadas = []; const falhas = []
    for (const aluna of lista) {
      try { criadas.push(await criarUma(supabase, aluna, { enviarBoasVindas, acessos, origem: body.modo === 'massa' ? 'admin-csv' : 'admin-manual' })) }
      catch (error) { falhas.push(error.message) }
    }
    if (!criadas.length) return NextResponse.json({ error: falhas.join('\n') || 'Nenhuma aluna foi criada.' }, { status: 400 })
    return NextResponse.json({ success: true, criadas: criadas.length, falhas, emailsFalhos: criadas.filter(a => a.emailFalhou).length }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const supabase = adminClient()
    const admin = await autorizar(request, supabase)
    if (!admin) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const { id, nome, email, whatsapp, acao } = await request.json()
    if (!id || id === admin.id) return NextResponse.json({ error: 'Aluna inválida.' }, { status: 400 })

    if (acao === 'desativar' || acao === 'reativar') {
      const expiracao = new Date(); expiracao.setDate(expiracao.getDate() + (acao === 'desativar' ? -1 : 30))
      await Promise.all([
        supabase.from('perfis').update({ acesso_expira_em: expiracao.toISOString().slice(0, 10) }).eq('id', id),
        supabase.from('profiles').update({ status: acao === 'desativar' ? 'blocked' : 'active', updated_at: new Date().toISOString() }).eq('id', id),
        supabase.from('enrollments').update({ status: acao === 'desativar' ? 'blocked' : 'active', updated_at: new Date().toISOString() }).eq('profile_id', id),
      ])
      return NextResponse.json({ success: true })
    }

    if (!nome?.trim() || !EMAIL.test(String(email || ''))) return NextResponse.json({ error: 'Nome e e-mail válidos são obrigatórios.' }, { status: 400 })
    const emailLimpo = email.trim().toLowerCase()
    const { error: authError } = await supabase.auth.admin.updateUserById(id, { email: emailLimpo, user_metadata: { name: nome.trim(), phone: whatsapp?.trim() || null } })
    if (authError) throw authError
    const { data: perfilAtual } = await supabase.from('profiles').select('status').eq('id', id).maybeSingle()
    const [a, b] = await Promise.all([
      supabase.from('perfis').update({ nome: nome.trim(), email: emailLimpo, whatsapp: whatsapp?.trim() || null }).eq('id', id),
      supabase.from('profiles').upsert({ id, name: nome.trim(), email: emailLimpo, phone: whatsapp?.trim() || null, role: 'student', status: perfilAtual?.status || 'active', updated_at: new Date().toISOString() }),
    ])
    if (a.error || b.error) throw a.error || b.error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const supabase = adminClient()
    const admin = await autorizar(request, supabase)
    if (!admin) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    const { id, confirmacao } = await request.json()
    if (!id || id === admin.id || confirmacao !== 'EXCLUIR') return NextResponse.json({ error: 'Confirmação inválida.' }, { status: 400 })
    const { data: backup } = await supabase.from('perfis').select('*').eq('id', id).maybeSingle()
    await supabase.from('perfis').delete().eq('id', id)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) {
      if (backup) await supabase.from('perfis').insert(backup)
      throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
