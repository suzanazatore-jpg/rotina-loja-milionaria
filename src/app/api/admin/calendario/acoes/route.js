import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ACTION_FIELDS = 'id,action_date,title,description,channel,content_format,product_cta,content_text,material_url,sort_order,is_published,created_at,updated_at'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function autorizar(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL
}

function texto(valor, limite) {
  const limpo = String(valor || '').trim()
  return limpo ? limpo.slice(0, limite) : null
}

function urlSegura(valor) {
  const limpo = texto(valor, 2000)
  if (!limpo) return null
  try {
    const url = new URL(limpo)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return url.toString()
  } catch {
    throw new Error('O link do material precisa começar com http:// ou https://.')
  }
}

function validarData(valor) {
  const data = String(valor || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe uma data válida.')
  const [ano, mes, dia] = data.split('-').map(Number)
  const conferida = new Date(Date.UTC(ano, mes - 1, dia))
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) {
    throw new Error(`A data ${data} não existe.`)
  }
  return data
}

function normalizarAcao(acao, indice = 0, batchId = crypto.randomUUID()) {
  const actionDate = validarData(acao.action_date)
  const title = texto(acao.title, 160)
  if (!title || title.length < 2) throw new Error(`Preencha o tema da ação ${indice + 1}.`)

  return {
    action_date: actionDate,
    title,
    description: texto(acao.description, 1000),
    channel: texto(acao.channel, 120),
    content_format: texto(acao.content_format, 120),
    product_cta: texto(acao.product_cta, 500),
    content_text: texto(acao.content_text, 5000),
    material_url: urlSegura(acao.material_url),
    sort_order: Number.isInteger(Number(acao.sort_order)) ? Math.max(0, Number(acao.sort_order)) : indice,
    is_published: acao.is_published !== false,
    batch_id: batchId,
    updated_at: new Date().toISOString(),
  }
}

function intervaloDoMes(mesAno) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mesAno || ''))) throw new Error('Selecione um mês válido.')
  const [ano, mes] = mesAno.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return { inicio: `${mesAno}-01`, fim: `${mesAno}-${String(ultimoDia).padStart(2, '0')}` }
}

function intervaloDaImportacao(mesAno) {
  const { inicio } = intervaloDoMes(mesAno)
  const [ano, mes] = mesAno.split('-').map(Number)
  const limite = new Date(Date.UTC(ano, mes, 7))
  const fim = `${limite.getUTCFullYear()}-${String(limite.getUTCMonth() + 1).padStart(2, '0')}-${String(limite.getUTCDate()).padStart(2, '0')}`
  return { inicio, fim }
}

export async function GET(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  const mesAno = new URL(request.url).searchParams.get('mes_ano')
  let consulta = supabase.from('calendar_actions').select(ACTION_FIELDS).order('action_date').order('sort_order')
  if (mesAno) {
    try {
      const { inicio, fim } = intervaloDoMes(mesAno)
      consulta = consulta.gte('action_date', inicio).lte('action_date', fim)
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  const { data, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acoes: data || [] })
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const corpo = await request.json()
    const modo = corpo.modo === 'lote' ? 'lote' : 'individual'
    const batchId = crypto.randomUUID()

    if (modo === 'individual') {
      const registro = normalizarAcao(corpo.acao || corpo, 0, batchId)
      const { data, error } = await supabase.from('calendar_actions').insert(registro).select(ACTION_FIELDS).single()
      if (error) throw error
      return NextResponse.json({ acao: data }, { status: 201 })
    }

    const mesAno = String(corpo.mes_ano || '')
    const { inicio, fim } = intervaloDaImportacao(mesAno)
    const recebidas = Array.isArray(corpo.acoes) ? corpo.acoes : []
    if (!recebidas.length) throw new Error('Inclua pelo menos uma ação para importar.')
    if (recebidas.length > 100) throw new Error('Importe no máximo 100 ações por vez.')

    const registros = recebidas.map((acao, indice) => normalizarAcao(acao, indice, batchId))
    if (registros.some(acao => acao.action_date < inicio || acao.action_date > fim)) {
      throw new Error('As ações devem estar no mês selecionado ou, quando constarem no arquivo, nos primeiros 7 dias do mês seguinte.')
    }

    const { data, error } = await supabase.from('calendar_actions').insert(registros).select(ACTION_FIELDS)
    if (error) throw error

    if (corpo.substituir !== false) {
      const exclusao = await supabase.from('calendar_actions').delete().gte('action_date', inicio).lte('action_date', fim).neq('batch_id', batchId)
      if (exclusao.error) {
        await supabase.from('calendar_actions').delete().eq('batch_id', batchId)
        throw new Error(`A importação foi desfeita: ${exclusao.error.message}`)
      }
    }

    return NextResponse.json({ acoes: data || [], total: data?.length || 0 }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível salvar as ações.' }, { status: 400 })
  }
}

export async function PUT(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const corpo = await request.json()
    if (!corpo.id) throw new Error('Ação não informada.')
    const registro = normalizarAcao(corpo.acao || corpo)
    delete registro.batch_id
    const { data, error } = await supabase.from('calendar_actions').update(registro).eq('id', corpo.id).select(ACTION_FIELDS).single()
    if (error) throw error
    return NextResponse.json({ acao: data })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar a ação.' }, { status: 400 })
  }
}

export async function DELETE(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Ação não informada.' }, { status: 400 })
  const { error } = await supabase.from('calendar_actions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
