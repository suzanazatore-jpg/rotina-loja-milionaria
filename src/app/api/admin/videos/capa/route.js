import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TUTORIAL_VIDEO_KEYS } from '@/lib/tutorialVideos'
import { TUTORIAL_COVER_BUCKET, TUTORIAL_COVER_MAX_BYTES, withTutorialCoverUrl } from '@/lib/tutorialVideoCovers'
import { prepareTutorialCover } from '@/lib/tutorialVideoCoverImage'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

function privateJson(body, init = {}) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

export async function POST(request) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) return privateJson({ error: 'Não autorizado.' }, { status: 403 })
  const { data, error } = await supabase.auth.getClaims(authorization.slice(7).trim())
  if (error || data?.claims?.email !== ADMIN_EMAIL) return privateJson({ error: 'Não autorizado.' }, { status: 403 })

  try {
    // A separate request per cover keeps uploads below Vercel's body limit.
    const length = Number(request.headers.get('content-length'))
    if (length > TUTORIAL_COVER_MAX_BYTES + 64 * 1024) return privateJson({ error: 'A capa deve ter no máximo 3 MB.' }, { status: 413 })
    const form = await request.formData()
    const moduleKey = String(form.get('module_key') || '')
    if (!TUTORIAL_VIDEO_KEYS.has(moduleKey)) throw new Error('Módulo inválido.')
    if (form.getAll('image').length !== 1) throw new Error('Envie uma capa por vez.')
    const image = await prepareTutorialCover(form.get('image'))
    const path = `tutorial-videos/${moduleKey}/${crypto.randomUUID()}.${image.extension}`
    const { error: uploadError } = await supabase.storage.from(TUTORIAL_COVER_BUCKET).upload(path, image.buffer, {
      contentType: image.contentType, cacheControl: '31536000', upsert: false,
    })
    if (uploadError) throw new Error('Não foi possível enviar a capa. Tente novamente.')

    const cover = withTutorialCoverUrl(supabase, { module_key: moduleKey, cover_image_path: path })
    return privateJson({ cover_image_path: cover.cover_image_path, cover_image_url: cover.cover_image_url }, { status: 201 })
  } catch (error) {
    return privateJson({ error: error.message || 'Não foi possível enviar a capa.' }, { status: 400 })
  }
}
