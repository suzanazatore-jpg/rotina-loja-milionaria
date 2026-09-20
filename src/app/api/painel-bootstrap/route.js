import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadStudentAccount } from '@/lib/studentAccountServer'

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

async function authenticatedUser(request, supabase) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null

  const token = authorization.slice(7).trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims?.sub) return null

  return { id: claims.sub, email: claims.email || '' }
}

async function loadCritical(supabase, user) {
  const isAdmin = user.email === ADMIN_EMAIL
  const accessedAt = new Date().toISOString()
  const [legacyProfileResult, profileResult, plansResult, termsResult] = await Promise.all([
    supabase
      .from('perfis')
      .select('nome,whatsapp,tipo_acesso,acesso_expira_em,status_assinatura')
      .eq('id', user.id)
      .maybeSingle(),
    isAdmin
      ? Promise.resolve({ data: { status: 'active', assistant_enabled: true, mentoria_aplicada: true }, error: null })
      : supabase.from('profiles').select('status,assistant_enabled,mentoria_aplicada').eq('id', user.id).maybeSingle(),
    isAdmin
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('profile_plans').select('plan_id').eq('profile_id', user.id),
    isAdmin
      ? Promise.resolve({ data: null, error: null })
      : supabase.from('terms_of_use').select('id,version,content,is_required,published_at').eq('is_current', true).maybeSingle(),
    supabase.from('app_user_activity').upsert({ user_id: user.id, last_seen_at: accessedAt, updated_at: accessedAt }),
  ])

  const legacyProfile = legacyProfileResult.data || null
  const profile = profileResult.data || null
  const planIds = (plansResult.data || []).map(item => item.plan_id)

  const [termAcceptanceResult, appContentsResult, mentorshipTypesResult, accountResult] = await Promise.all([
    termsResult.data
      ? supabase.from('term_acceptances').select('accepted_at').eq('terms_id', termsResult.data.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    !isAdmin && planIds.length
      ? supabase.from('plan_app_contents').select('content_key').in('plan_id', planIds)
      : Promise.resolve({ data: [], error: null }),
    !isAdmin && profile?.status === 'active' && profile?.mentoria_aplicada === true && planIds.length
      ? supabase.from('plan_mentorships').select('mentorship_type').in('plan_id', planIds)
      : Promise.resolve({ data: [], error: null }),
    loadStudentAccount(supabase, user.id, { lastAccessAt: accessedAt }),
  ])

  let programas = []
  if (isAdmin) {
    programas = ['evs', 'cvm']
  } else {
    programas = [...new Set((mentorshipTypesResult.data || []).map(item => item.mentorship_type))]
    if (!programas.length && ['mentoria', 'implementacao'].includes(legacyProfile?.tipo_acesso)) {
      const legacyActive = !legacyProfile.acesso_expira_em
        || new Date(`${legacyProfile.acesso_expira_em}T23:59:59`) >= new Date()
      if (legacyActive) programas = ['evs', 'cvm']
    }
  }

  const lessonsResult = programas.length
    ? await supabase.from('aulas').select('*').in('mentorship_type', programas).order('ordem', { ascending: true })
    : { data: [], error: null }

  const contents = isAdmin
    ? ['calendar', 'campaigns', 'routine', 'team_goals', 'mentorship', 'assistant', 'pricing']
    : [...new Set((appContentsResult.data || []).map(item => item.content_key))]
  const active = isAdmin || profile?.status === 'active'

  return {
    perfil: legacyProfile,
    termos: termsResult.data
      ? {
          termos: termsResult.data,
          aceito: Boolean(termAcceptanceResult.data),
          accepted_at: termAcceptanceResult.data?.accepted_at || null,
        }
      : { termos: null, aceito: true, accepted_at: null },
    mentoria: {
      liberado: programas.length > 0,
      programas,
      aulas: lessonsResult.data || [],
    },
    acessos: {
      assistant: active && (isAdmin || profile?.assistant_enabled === true || contents.includes('assistant')),
      team_goals: active && (isAdmin || contents.includes('team_goals')),
      pricing: active && (isAdmin || contents.includes('pricing')),
      contents,
    },
    conta: accountResult,
  }
}

async function signFile(supabase, item, bucket) {
  if (item.storage_bucket !== bucket || !item.arquivo_nome) return item
  const { data } = await supabase.storage.from(bucket).createSignedUrl(item.arquivo_nome, 3600)
  return { ...item, arquivo_url: data?.signedUrl || null }
}

async function loadContent(supabase, weekStart) {
  const [calendarResult, calendarActionsResult, campaignsResult, routineResult, bannersResult, tutorialVideosResult] = await Promise.allSettled([
    supabase.from('calendario').select('*').order('mes_ano', { ascending: false }),
    supabase
      .from('calendar_actions')
      .select('id,action_date,title,description,channel,content_format,product_cta,content_text,material_url,sort_order')
      .eq('is_published', true)
      .order('action_date', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase.from('campanhas').select('*').order('mes_ano', { ascending: false }),
    supabase.from('rotinas').select('*').eq('semana_inicio', weekStart).maybeSingle(),
    supabase
      .from('panel_banners')
      .select('id,tag,title,body,image_url,link_url,sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('tutorial_videos')
      .select('module_key,title,video_url')
      .eq('is_active', true),
  ])

  const calendarRows = calendarResult.status === 'fulfilled' && !calendarResult.value.error
    ? calendarResult.value.data || []
    : []
  const calendarActions = calendarActionsResult.status === 'fulfilled' && !calendarActionsResult.value.error
    ? calendarActionsResult.value.data || []
    : []
  const campaignRows = campaignsResult.status === 'fulfilled' && !campaignsResult.value.error
    ? campaignsResult.value.data || []
    : []
  const routine = routineResult.status === 'fulfilled' && !routineResult.value.error
    ? routineResult.value.data || null
    : null
  const banners = bannersResult.status === 'fulfilled' && !bannersResult.value.error
    ? bannersResult.value.data || []
    : []
  const tutorialVideos = tutorialVideosResult.status === 'fulfilled' && !tutorialVideosResult.value.error
    ? tutorialVideosResult.value.data || []
    : []

  const [calendarios, campanhas, rotina] = await Promise.all([
    Promise.all(calendarRows.map(item => signFile(supabase, item, 'calendarios'))),
    Promise.all(campaignRows.map(item => signFile(supabase, item, 'campanhas'))),
    routine ? signFile(supabase, routine, 'rotinas') : null,
  ])

  return { calendarios, acoes_calendario: calendarActions, campanhas, rotina, banners, tutorial_videos: tutorialVideos }
}

export async function GET(request) {
  try {
    const supabase = serverClient()
    const user = await authenticatedUser(request, supabase)
    if (!user) return privateJson({ error: 'Não autorizado.' }, { status: 401 })

    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') || 'critical'

    if (scope === 'critical') {
      return privateJson(await loadCritical(supabase, user))
    }

    if (scope === 'content') {
      const weekStart = url.searchParams.get('semana_inicio')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) {
        return privateJson({ error: 'Semana inválida.' }, { status: 400 })
      }
      return privateJson(await loadContent(supabase, weekStart))
    }

    return privateJson({ error: 'Carga inválida.' }, { status: 400 })
  } catch (error) {
    return privateJson({ error: error.message }, { status: 500 })
  }
}
