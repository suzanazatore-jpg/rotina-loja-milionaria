import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TUTORIAL_VIDEO_KEYS, TUTORIAL_VIDEO_MODULES, toEmbedUrl } from '@/lib/tutorialVideos'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function serverClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function privateJson(body, init = {}) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

async function isAdmin(request, supabase) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return false
  const token = authorization.slice(7).trim()
  if (!token) return false
  const { data, error } = await supabase.auth.getClaims(token)
  return !error && data?.claims?.email === ADMIN_EMAIL
}

function normalizarVideos(videos) {
  if (!Array.isArray(videos)) throw new Error('A lista de vídeos é inválida.')

  return videos.map(item => {
    const moduleKey = String(item?.module_key || '')
    if (!TUTORIAL_VIDEO_KEYS.has(moduleKey)) throw new Error('Um dos módulos informados é inválido.')

    const modulo = TUTORIAL_VIDEO_MODULES.find(option => option.key === moduleKey)
    const title = String(item?.title || '').trim() || modulo.defaultTitle
    const videoUrl = String(item?.video_url || '').trim()
    if (title.length > 120) throw new Error(`O título de ${modulo.label} deve ter no máximo 120 caracteres.`)
    if (videoUrl.length > 1000) throw new Error(`O link de ${modulo.label} está muito longo.`)
    if (videoUrl && !toEmbedUrl(videoUrl)) throw new Error(`O link de ${modulo.label} não é válido. Use YouTube, Vimeo ou Loom com HTTPS.`)

    return {
      module_key: moduleKey,
      title,
      video_url: videoUrl || null,
      is_active: item?.is_active !== false,
      updated_at: new Date().toISOString(),
    }
  })
}

export async function GET(request) {
  const supabase = serverClient()
  if (!await isAdmin(request, supabase)) return privateJson({ error: 'Não autorizado.' }, { status: 403 })

  const { data, error } = await supabase.from('tutorial_videos').select('module_key,title,video_url,is_active,updated_at')
  if (error) return privateJson({ error: error.message }, { status: 500 })

  const byKey = Object.fromEntries((data || []).map(item => [item.module_key, item]))
  const videos = TUTORIAL_VIDEO_MODULES.map(module => byKey[module.key] || {
    module_key: module.key,
    title: module.defaultTitle,
    video_url: null,
    is_active: true,
  })
  return privateJson({ videos })
}

export async function PUT(request) {
  const supabase = serverClient()
  if (!await isAdmin(request, supabase)) return privateJson({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const body = await request.json()
    const videos = normalizarVideos(body?.videos)
    const { data, error } = await supabase
      .from('tutorial_videos')
      .upsert(videos, { onConflict: 'module_key' })
      .select('module_key,title,video_url,is_active,updated_at')
    if (error) throw error
    return privateJson({ videos: data || [] })
  } catch (error) {
    return privateJson({ error: error.message || 'Não foi possível salvar os vídeos.' }, { status: 400 })
  }
}
