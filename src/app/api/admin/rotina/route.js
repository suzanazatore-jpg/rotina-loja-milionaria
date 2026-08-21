import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'rotinas'
const MAX_FILE_SIZE = 20 * 1024 * 1024

function adminClient() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function autorizar(request, supabase) { const token = request.headers.get('authorization')?.replace('Bearer ', ''); if (!token) return false; const { data: { user } } = await supabase.auth.getUser(token); return user?.email === ADMIN_EMAIL }
function semanaValida(valor) { return /^\d{4}-\d{2}-\d{2}$/.test(valor) && new Date(`${valor}T12:00:00Z`).getUTCDay() === 1 }
async function comLinks(supabase, itens) { return Promise.all((itens || []).map(async item => { if (item.storage_bucket === BUCKET && item.arquivo_nome) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(item.arquivo_nome, 3600); return { ...item, arquivo_url: data?.signedUrl || null } } return item })) }

export async function GET(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('rotinas').select('*').order('semana_inicio', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rotinas: await comLinks(supabase, data) })
}

export async function POST(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const form = await request.formData(); const arquivo = form.get('arquivo'); const semanaInicio = String(form.get('semana_inicio') || ''); const titulo = String(form.get('titulo') || '').trim() || 'Rotina da semana'; const descricao = String(form.get('descricao') || '').trim() || null
    if (!semanaValida(semanaInicio)) throw new Error('Escolha uma segunda-feira válida.')
    if (!arquivo || typeof arquivo.arrayBuffer !== 'function' || arquivo.size === 0) throw new Error('Escolha o arquivo PDF.')
    if (arquivo.type !== 'application/pdf') throw new Error('Envie somente arquivo PDF.')
    if (arquivo.size > MAX_FILE_SIZE) throw new Error('O PDF deve ter no máximo 20 MB.')
    const { data: existente } = await supabase.from('rotinas').select('*').eq('semana_inicio', semanaInicio).maybeSingle()
    const caminho = `${semanaInicio}/${crypto.randomUUID()}.pdf`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
    if (uploadError) throw new Error(`Não foi possível subir o PDF: ${uploadError.message}`)
    const registro = { ordem: 1, semana_inicio: semanaInicio, titulo, descricao, arquivo_url: null, arquivo_nome: caminho, storage_bucket: BUCKET }
    const resultado = existente ? await supabase.from('rotinas').update(registro).eq('id', existente.id).select().single() : await supabase.from('rotinas').insert(registro).select().single()
    if (resultado.error) { await supabase.storage.from(BUCKET).remove([caminho]); throw resultado.error }
    if (existente?.arquivo_nome) await supabase.storage.from(existente.storage_bucket || 'materiais').remove([existente.arquivo_nome])
    return NextResponse.json({ rotina: resultado.data, substituido: Boolean(existente) }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient(); if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { id } = await request.json(); const { data: item } = await supabase.from('rotinas').select('*').eq('id', id).maybeSingle()
    if (!item) return NextResponse.json({ error: 'Rotina não encontrada.' }, { status: 404 })
    const { error } = await supabase.from('rotinas').delete().eq('id', id); if (error) throw error
    if (item.arquivo_nome) await supabase.storage.from(item.storage_bucket || 'materiais').remove([item.arquivo_nome])
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
