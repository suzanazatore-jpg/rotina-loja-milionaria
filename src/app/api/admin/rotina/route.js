import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizarPlanoDias } from '@/lib/dailyPlan'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'rotinas'
const MAX_FILE_SIZE = 20 * 1024 * 1024

function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function autorizar(request, supabase) { const token = request.headers.get('authorization')?.replace('Bearer ', ''); if (!token) return false; const { data: { user } } = await supabase.auth.getUser(token); return user?.email === ADMIN_EMAIL }
function semanaValida(valor) { return /^\d{4}-\d{2}-\d{2}$/.test(valor) && new Date(`${valor}T12:00:00Z`).getUTCDay() === 1 }
function mesValido(valor) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) }
function intervaloMes(mes) {
  const [ano, numeroMes] = mes.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}
async function comLinks(supabase, itens) { return Promise.all((itens || []).map(async item => { if (item.storage_bucket === BUCKET && item.arquivo_nome) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.arquivo_nome, 3600); return { ...item, arquivo_url: data?.signedUrl || null } } return item })) }
async function removerArquivoSemReferencia(supabase, bucket, caminho) {
  if (!caminho || !bucket) return
  const { count } = await supabase.from('rotinas').select('id', { count: 'exact', head: true }).eq('storage_bucket', bucket).eq('arquivo_nome', caminho)
  if (count === 0) await supabase.storage.from(bucket).remove([caminho])
}
function lerPlanoDias(valor) {
  if (!valor) return normalizarPlanoDias({}, { preencherPadrao: true })
  const plano = typeof valor === 'string' ? JSON.parse(valor) : valor
  return normalizarPlanoDias(plano, { preencherPadrao: true })
}

export async function GET(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('rotinas').select('*').order('semana_inicio', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rotinas: await comLinks(supabase, data) })
}

export async function POST(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const form = await request.formData(); const arquivo = form.get('arquivo'); const semanaInicio = String(form.get('semana_inicio') || ''); const titulo = String(form.get('titulo') || '').trim() || 'Rotina da semana'; const descricao = String(form.get('descricao') || '').trim() || null; const planoDias = lerPlanoDias(form.get('plano_dias'))
    if (!semanaValida(semanaInicio)) throw new Error('Escolha uma segunda-feira válida.')
    const temArquivo = Boolean(arquivo && typeof arquivo.arrayBuffer === 'function' && arquivo.size > 0)
    if (temArquivo && arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (temArquivo && arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')
    const { data: existente } = await supabase.from('rotinas').select('*').eq('semana_inicio', semanaInicio).maybeSingle()
    const mes = semanaInicio.slice(0, 7)
    const { inicio, fim } = intervaloMes(mes)
    let referenciaMensal = null
    if (!temArquivo && !existente?.arquivo_nome) {
      const { data } = await supabase.from('rotinas').select('arquivo_nome,storage_bucket').gte('semana_inicio', inicio).lte('semana_inicio', fim).not('arquivo_nome', 'is', null).limit(1).maybeSingle()
      referenciaMensal = data || null
    }
    let caminho = existente?.arquivo_nome || referenciaMensal?.arquivo_nome || null
    let bucket = existente?.storage_bucket || referenciaMensal?.storage_bucket || BUCKET
    if (temArquivo) {
      caminho = `${semanaInicio}/${crypto.randomUUID()}.pdf`
      bucket = BUCKET
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
      if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)
    }
    const registro = { ordem: 1, semana_inicio: semanaInicio, titulo, descricao, plano_dias: planoDias, arquivo_url: null, arquivo_nome: caminho, storage_bucket: bucket }
    const resultado = existente ? await supabase.from('rotinas').update(registro).eq('id', existente.id).select().single() : await supabase.from('rotinas').insert(registro).select().single()
    if (resultado.error) { if (temArquivo && caminho) await supabase.storage.from(BUCKET).remove([caminho]); throw resultado.error }
    if (temArquivo && existente?.arquivo_nome && existente.arquivo_nome !== caminho) await removerArquivoSemReferencia(supabase, existente.storage_bucket || 'materiais', existente.arquivo_nome)
    return NextResponse.json({ rotina: resultado.data, substituido: Boolean(existente) }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PATCH(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const form = await request.formData()
    const mes = String(form.get('mes_ano') || '')
    const arquivo = form.get('arquivo')
    if (!mesValido(mes)) throw new Error('Escolha um mês válido.')
    if (!arquivo || typeof arquivo.arrayBuffer !== 'function' || arquivo.size === 0) throw new Error('Selecione o PDF mensal da rotina.')
    if (arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')

    const { inicio, fim } = intervaloMes(mes)
    const { data: rotinas, error: buscaError } = await supabase.from('rotinas').select('id,arquivo_nome,storage_bucket').gte('semana_inicio', inicio).lte('semana_inicio', fim)
    if (buscaError) throw buscaError
    if (!rotinas?.length) throw new Error('Crie pelo menos uma rotina semanal neste mês antes de enviar o PDF mensal.')

    const caminho = `mensais/${mes}/${crypto.randomUUID()}.pdf`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
    if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)

    const { data: atualizadas, error: atualizacaoError } = await supabase.from('rotinas').update({ arquivo_url: null, arquivo_nome: caminho, storage_bucket: BUCKET }).gte('semana_inicio', inicio).lte('semana_inicio', fim).select('id')
    if (atualizacaoError) {
      await supabase.storage.from(BUCKET).remove([caminho])
      throw atualizacaoError
    }

    const arquivosAnteriores = new Map(rotinas.filter(item => item.arquivo_nome && item.arquivo_nome !== caminho).map(item => [item.arquivo_nome, item.storage_bucket || 'materiais']))
    await Promise.all([...arquivosAnteriores].map(([arquivoNome, bucket]) => removerArquivoSemReferencia(supabase, bucket, arquivoNome)))
    return NextResponse.json({ success: true, mes_ano: mes, rotinas_atualizadas: atualizadas?.length || 0 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PUT(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { id, semana_inicio: semanaInicio, titulo: tituloInformado, descricao: descricaoInformada, plano_dias: planoDiasInformado } = await request.json()
    const titulo = String(tituloInformado || '').trim() || 'Rotina da semana'
    const descricao = String(descricaoInformada || '').trim() || null
    if (!id) throw new Error('Rotina não informada.')
    if (!semanaValida(String(semanaInicio || ''))) throw new Error('Escolha uma segunda-feira válida.')

    const { data: itemAtual, error: itemError } = await supabase.from('rotinas').select('*').eq('id', id).maybeSingle()
    if (itemError) throw itemError
    if (!itemAtual) throw new Error('Rotina não encontrada.')
    const { data: conflito } = await supabase.from('rotinas').select('id').eq('semana_inicio', semanaInicio).neq('id', id).maybeSingle()
    if (conflito) throw new Error('Já existe uma rotina publicada para essa semana.')

    const atualizacao = { semana_inicio: semanaInicio, titulo, descricao }
    if (itemAtual.semana_inicio?.slice(0, 7) !== semanaInicio.slice(0, 7)) {
      const { inicio, fim } = intervaloMes(semanaInicio.slice(0, 7))
      const { data: referenciaMensal } = await supabase.from('rotinas').select('arquivo_nome,storage_bucket').neq('id', id).gte('semana_inicio', inicio).lte('semana_inicio', fim).not('arquivo_nome', 'is', null).limit(1).maybeSingle()
      atualizacao.arquivo_url = null
      atualizacao.arquivo_nome = referenciaMensal?.arquivo_nome || null
      atualizacao.storage_bucket = referenciaMensal?.storage_bucket || BUCKET
    }
    if (planoDiasInformado !== undefined) atualizacao.plano_dias = lerPlanoDias(planoDiasInformado)
    const { data, error } = await supabase.from('rotinas').update(atualizacao).eq('id', id).select().single()
    if (error) throw error
    if (itemAtual.arquivo_nome && itemAtual.arquivo_nome !== data.arquivo_nome) await removerArquivoSemReferencia(supabase, itemAtual.storage_bucket || 'materiais', itemAtual.arquivo_nome)
    return NextResponse.json({ rotina: data })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { id } = await request.json(); const { data: item } = await supabase.from('rotinas').select('*').eq('id', id).maybeSingle()
    if (!item) return NextResponse.json({ error: 'Rotina não encontrada.' }, { status: 404 })
    const { error } = await supabase.from('rotinas').delete().eq('id', id); if (error) throw error
    if (item.arquivo_nome) await removerArquivoSemReferencia(supabase, item.storage_bucket || 'materiais', item.arquivo_nome)
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
