import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const BUCKET = 'panel-banners'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

function urlValida(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return null
  try {
    const url = new URL(texto)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch { return null }
}

function payload(body) {
  return {
    tag: null,
    title: String(body.title || '').trim() || null,
    body: null,
    link_url: urlValida(body.link_url),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    is_active: body.is_active === true || body.is_active === 'true',
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    updated_at: new Date().toISOString(),
  }
}

async function lerBody(request) {
  const tipo = request.headers.get('content-type') || ''
  if (tipo.includes('multipart/form-data')) {
    const form = await request.formData()
    return {
      dados: Object.fromEntries([...form.entries()].filter(([, valor]) => typeof valor === 'string')),
      arquivo: form.get('image'),
    }
  }
  return { dados: await request.json(), arquivo: null }
}

async function subirImagem(supabase, arquivo) {
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function' || arquivo.size === 0) return null
  if (!TIPOS.has(arquivo.type)) throw new Error('Envie uma imagem JPG, PNG ou WEBP.')
  if (arquivo.size > MAX_FILE_SIZE) throw new Error('A imagem deve ter no máximo 5 MB.')
  const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extensao}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, await arquivo.arrayBuffer(), {
    contentType: arquivo.type, cacheControl: '3600', upsert: false,
  })
  if (error) throw new Error(`Não foi possível subir a imagem: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
  return { image_path: caminho, image_url: data.publicUrl }
}

export async function GET(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.from('panel_banners').select('*').order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ banners: data || [] })
}

export async function POST(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { dados: body, arquivo } = await lerBody(request)
    const imagem = await subirImagem(supabase, arquivo)
    if (!imagem) return NextResponse.json({ error: 'Escolha a imagem do banner.' }, { status: 400 })
    const { data, error } = await supabase.from('panel_banners').insert({ ...payload(body), ...imagem }).select().single()
    if (error) { await supabase.storage.from(BUCKET).remove([imagem.image_path]); throw error }
    return NextResponse.json({ banner: data }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function PATCH(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  try {
    const { dados: body, arquivo } = await lerBody(request)
    if (!body.id) return NextResponse.json({ error: 'Banner inválido.' }, { status: 400 })
    const { data: atual } = await supabase.from('panel_banners').select('image_path').eq('id', body.id).maybeSingle()
    const imagem = await subirImagem(supabase, arquivo)
    const { data, error } = await supabase.from('panel_banners').update({ ...payload(body), ...(imagem || {}) }).eq('id', body.id).select().single()
    if (error) { if (imagem) await supabase.storage.from(BUCKET).remove([imagem.image_path]); throw error }
    if (imagem && atual?.image_path) await supabase.storage.from(BUCKET).remove([atual.image_path])
    return NextResponse.json({ banner: data })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(request) {
  const supabase = adminClient()
  if (!await autorizar(request, supabase)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Banner inválido.' }, { status: 400 })
  const { data: atual } = await supabase.from('panel_banners').select('image_path').eq('id', id).maybeSingle()
  const { error } = await supabase.from('panel_banners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (atual?.image_path) await supabase.storage.from(BUCKET).remove([atual.image_path])
  return NextResponse.json({ success: true })
}
