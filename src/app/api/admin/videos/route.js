import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TUTORIAL_VIDEO_KEYS, TUTORIAL_VIDEO_MODULES, TUTORIAL_VIDEO_PROVIDERS, toEmbedUrl } from '@/lib/tutorialVideos'
import { isTutorialCoverPath, withTutorialCoverUrl } from '@/lib/tutorialVideoCovers'

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
  if (videos.length > TUTORIAL_VIDEO_MODULES.length) throw new Error('A lista de vídeos é inválida.')
  const coversProvided = videos.filter(item => item && Object.prototype.hasOwnProperty.call(item, 'cover_image_path')).length
  if (coversProvided > 0 && coversProvided !== videos.length) throw new Error('Envie a configuração de capa de todos os módulos da lista.')
  const seen = new Set()

  return videos.map(item => {
    const moduleKey = String(item?.module_key || '')
    if (!TUTORIAL_VIDEO_KEYS.has(moduleKey)) throw new Error('Um dos módulos informados é inválido.')
    if (seen.has(moduleKey)) throw new Error('Um dos módulos está repetido.')
    seen.add(moduleKey)

    const modulo = TUTORIAL_VIDEO_MODULES.find(option => option.key === moduleKey)
    const title = String(item?.title || '').trim() || modulo.defaultTitle
    const videoUrl = String(item?.video_url || '').trim()
    if (title.length > 120) throw new Error(`O título de ${modulo.label} deve ter no máximo 120 caracteres.`)
    if (videoUrl.length > 1000) throw new Error(`O link de ${modulo.label} está muito longo.`)
    if (videoUrl && !toEmbedUrl(videoUrl)) throw new Error(`O link de ${modulo.label} não é válido. Use ${TUTORIAL_VIDEO_PROVIDERS} com HTTPS. Para Panda Video e ScaleUp, use o link de incorporação (embed).`)
    const hasCover = Object.prototype.hasOwnProperty.call(item, 'cover_image_path')
    const coverPath = item?.cover_image_path === '' || item?.cover_image_path === null ? null : item?.cover_image_path
    if (hasCover && coverPath !== null && !isTutorialCoverPath(coverPath, moduleKey)) throw new Error(`A capa de ${modulo.label} não é válida. Envie a imagem novamente.`)

    return {
      module_key: moduleKey,
      title,
      video_url: videoUrl || null,
      ...(hasCover ? { cover_image_path: coverPath } : {}),
      is_active: item?.is_active !== false,
      updated_at: new Date().toISOString(),
    }
  })
}

export async function GET(request) {
  const supabase = serverClient()
  if (!await isAdmin(request, supabase)) return privateJson({ error: 'Não autorizado.' }, { status: 403 })

  const { data, error } = await supabase.from('tutorial_videos').select('module_key,title,video_url,cover_image_path,is_active,updated_at')
  if (error) return privateJson({ error: error.message }, { status: 500 })

  const byKey = Object.fromEntries((data || []).map(item => [item.module_key, item]))
  const videos = TUTORIAL_VIDEO_MODULES.map(module => byKey[module.key] || {
    module_key: module.key,
    title: module.defaultTitle,
    video_url: null,
    is_active: true,
  })
  return privateJson({ videos: videos.map(video => withTutorialCoverUrl(supabase, video)) })
}

export async function PUT(request) {
  const supabase = serverClient()
  if (!await isAdmin(request, supabase)) return privateJson({ error: 'Não autorizado.' }, { status: 403 })

  try {
    const body = await request.json()
    const videos = normalizarVideos(body?.videos)
    // Legacy batches omit the cover column entirely, so PostgREST does not
    // include it in ON CONFLICT UPDATE. Never read-then-copy the existing value:
    // that could overwrite a cover saved concurrently. Mixed batches are rejected.
    const { data, error } = await supabase
      .from('tutorial_videos')
      .upsert(videos, { onConflict: 'module_key' })
      .select('module_key,title,video_url,cover_image_path,is_active,updated_at')
    if (error) throw error
    return privateJson({ videos: (data || []).map(video => withTutorialCoverUrl(supabase, video)) })
  } catch (error) {
    return privateJson({ error: error.message || 'Não foi possível salvar os vídeos.' }, { status: 400 })
  }
}
