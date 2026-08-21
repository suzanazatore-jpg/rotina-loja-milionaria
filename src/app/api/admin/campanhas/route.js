import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'campanhas'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function autorizar(request, supabase) { const token = request.headers.get('authorization')?.replace('Bearer ', ''); if (!token) return false; const { data: { user } } = await supabase.auth.getUser(token); return user?.email === ADMIN_EMAIL }
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
    const form = await request.formData(); const arquivo = form.get('arquivo'); const mesAno = String(form.get('mes_ano') || ''); const titulo = String(form.get('titulo') || '').trim() || tituloPadrao(mesAno); const descricao = String(form.get('descricao') || '').trim() || null
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesAno)) throw new Error('Selecione um mês válido.')
    if (!arquivo || typeof arquivo.arrayBuffer !== 'function' || arquivo.size === 0) throw new Error('Escolha o arquivo PDF.')
    if (arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')
    const { data: existente } = await supabase.from('campanhas').select('*').eq('mes_ano', mesAno).maybeSingle()
    const caminho = `${mesAno}/${crypto.randomUUID()}.pdf`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
    if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)
    const registro = { ordem: 1, mes_ano: mesAno, titulo, descricao, arquivo_url: null, arquivo_nome: caminho, storage_bucket: BUCKET }
    const resultado = existente ? await supabase.from('campanhas').update(registro).eq('id', existente.id).select().single() : await supabase.from('campanhas').insert(registro).select().single()
    if (resultado.error) { await supabase.storage.from(BUCKET).remove([caminho]); throw resultado.error }
    if (existente?.arquivo_nome) await supabase.storage.from(existente.storage_bucket || 'materiais').remove([existente.arquivo_nome])
    return NextResponse.json({ campanha: resultado.data, substituido: Boolean(existente) }, { status: 201 })
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
