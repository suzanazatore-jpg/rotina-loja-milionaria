import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizarPlanoCampanha } from '@/lib/campaignPlan'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'campanhas'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function autorizar(request, supabase) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
  const claimEmail = String(claimsData?.claims?.email || '').toLowerCase()
  if (!claimsError && claimEmail === ADMIN_EMAIL) return true

  const { data: { user } } = await supabase.auth.getUser(token)
  return String(user?.email || '').toLowerCase() === ADMIN_EMAIL
}
function tituloPadrao(mesAno) { const [ano, mes] = String(mesAno).split('-'); return `Campanha de ${MESES[Number(mes) - 1] || ''} ${ano}`.trim() }
async function comLinks(supabase, itens) { return Promise.all((itens || []).map(async item => { if (item.storage_bucket === BUCKET && item.arquivo_nome) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.arquivo_nome, 3600); return { ...item, arquivo_url: data?.signedUrl || null } } return item })) }

export async function GET(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('campanhas').select('*').order('mes_ano', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campanhas: await comLinks(supabase, data) })
}

export async function POST(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const form = await request.formData(); const arquivo = form.get('arquivo'); const mesAno = String(form.get('mes_ano') || ''); const titulo = String(form.get('titulo') || '').trim() || tituloPadrao(mesAno); const descricao = String(form.get('descricao') || '').trim() || null; const planoInterativo = normalizarPlanoCampanha(JSON.parse(String(form.get('plano_interativo') || '{}')))
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesAno)) throw new Error('Selecione um mês válido.')
    if (!planoInterativo.etapas?.length) throw new Error('Inclua pelo menos uma ação na jornada da campanha.')
    const temArquivo = arquivo && typeof arquivo.arrayBuffer === 'function' && arquivo.size > 0
    if (temArquivo && arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (temArquivo && arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')
    const { data: existente } = await supabase.from('campanhas').select('*').eq('mes_ano', mesAno).maybeSingle()
    let caminho = existente?.arquivo_nome || null
    if (temArquivo) {
      caminho = `${mesAno}/${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
      if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)
    }
    const registro = { ordem: 1, mes_ano: mesAno, titulo, descricao, plano_interativo: planoInterativo, arquivo_url: temArquivo ? null : (existente?.arquivo_url || null), arquivo_nome: caminho, storage_bucket: temArquivo ? BUCKET : (existente?.storage_bucket || BUCKET) }
    const resultado = existente ? await supabase.from('campanhas').update(registro).eq('id', existente.id).select().single() : await supabase.from('campanhas').insert(registro).select().single()
    if (resultado.error) { if (temArquivo) await supabase.storage.from(BUCKET).remove([caminho]); throw resultado.error }
    if (temArquivo && existente?.arquivo_nome) await supabase.storage.from(existente.storage_bucket || 'materiais').remove([existente.arquivo_nome])
    return NextResponse.json({ campanha: resultado.data, substituido: Boolean(existente) }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}


export async function PATCH(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const form = await request.formData()
    const mesAno = String(form.get('mes_ano') || '')
    const arquivo = form.get('arquivo')

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesAno)) throw new Error('Selecione um mês válido.')
    if (!arquivo || typeof arquivo.arrayBuffer !== 'function' || !arquivo.size) throw new Error('Selecione o PDF mensal da campanha.')
    if (arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')

    const { data: item, error: itemError } = await supabase.from('campanhas').select('*').eq('mes_ano', mesAno).maybeSingle()
    if (itemError) throw itemError
    if (!item) throw new Error('Crie ou importe a campanha deste mês antes de enviar o PDF.')

    const caminho = `mensais/${mesAno}/${crypto.randomUUID()}.pdf`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)

    const { error: updateError } = await supabase.from('campanhas').update({
      arquivo_url: null,
      arquivo_nome: caminho,
      storage_bucket: BUCKET,
    }).eq('id', item.id)
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([caminho])
      throw updateError
    }

    if (item.arquivo_nome && item.arquivo_nome !== caminho) {
      await supabase.storage.from(item.storage_bucket || 'materiais').remove([item.arquivo_nome])
    }

    return NextResponse.json({ success: true, mes_ano: mesAno })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar o PDF.' }, { status: 400 })
  }
}

export async function PUT(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { id, mes_ano: mesAno, titulo: tituloInformado, descricao: descricaoInformada, plano_interativo: planoInformado } = await request.json()
    const titulo = String(tituloInformado || '').trim() || tituloPadrao(mesAno)
    const descricao = String(descricaoInformada || '').trim() || null
    if (!id) throw new Error('Campanha não informada.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mesAno))) throw new Error('Selecione um mês válido.')

    const { data: conflito } = await supabase.from('campanhas').select('id').eq('mes_ano', mesAno).neq('id', id).maybeSingle()
    if (conflito) throw new Error('Já existe uma campanha publicada para esse mês.')

    const planoInterativo = normalizarPlanoCampanha(planoInformado)
    if (!planoInterativo.etapas?.length) throw new Error('Inclua pelo menos uma ação na jornada da campanha.')
    const { data, error } = await supabase.from('campanhas').update({ mes_ano: mesAno, titulo, descricao, plano_interativo: planoInterativo }).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ campanha: data })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { id } = await request.json(); const { data: item } = await supabase.from('campanhas').select('*').eq('id', id).maybeSingle()
  if (!item) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  const { error } = await supabase.from('campanhas').delete().eq('id', id); if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (item.arquivo_nome) await supabase.storage.from(item.storage_bucket || 'materiais').remove([item.arquivo_nome])
  return NextResponse.json({ success: true })
}
