const LEGACY_PLAN_LABELS = {
  teste: 'Período de teste',
  assinatura: 'Assinatura',
  avista: 'Plano à vista',
  rotina: 'Rotina da Loja',
  implementacao: 'Implementação',
  mentoria: 'Mentoria',
}

function firstDate(rows, preferredKey, fallbackKey) {
  const dates = rows
    .map(row => row?.[preferredKey] || row?.[fallbackKey])
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))
  return dates[0] || null
}

function lastDate(rows, key) {
  const dates = rows
    .map(row => row?.[key])
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))
  return dates[0] || null
}

export async function loadStudentAccount(supabase, userId, options = {}) {
  const [profilePlansResult, enrollmentsResult, profileResult, legacyProfileResult, activityResult] = await Promise.all([
    supabase.from('profile_plans').select('plan_id,created_at').eq('profile_id', userId),
    supabase
      .from('enrollments')
      .select('status,purchased_at,created_at,expires_at')
      .eq('profile_id', userId)
      .eq('status', 'active'),
    supabase.from('profiles').select('created_at').eq('id', userId).maybeSingle(),
    supabase.from('perfis').select('tipo_acesso,acesso_expira_em').eq('id', userId).maybeSingle(),
    supabase.from('app_user_activity').select('last_seen_at').eq('user_id', userId).maybeSingle(),
  ])

  const profilePlans = profilePlansResult.data || []
  const planIds = [...new Set(profilePlans.map(item => item.plan_id).filter(Boolean))]
  const plansResult = planIds.length
    ? await supabase.from('plans').select('id,name,commercial_name,offer_id').in('id', planIds)
    : { data: [] }
  const visiblePlans = (plansResult.data || []).filter(plan => !String(plan.offer_id || '').startsWith('__individual_'))
  const planNames = [...new Set(visiblePlans.map(plan => plan.commercial_name || plan.name).filter(Boolean))]
  const enrollments = enrollmentsResult.data || []
  const legacyProfile = legacyProfileResult.data || null

  let startedAt = firstDate(enrollments, 'purchased_at', 'created_at')
  if (!startedAt) startedAt = firstDate(profilePlans, 'created_at', 'created_at')
  if (!startedAt) startedAt = profileResult.data?.created_at || null

  const expiresAt = lastDate(enrollments, 'expires_at') || legacyProfile?.acesso_expira_em || null
  const lastAccessAt = options.lastAccessAt || activityResult.data?.last_seen_at || null

  return {
    planos: planNames.length
      ? planNames
      : (LEGACY_PLAN_LABELS[legacyProfile?.tipo_acesso] ? [LEGACY_PLAN_LABELS[legacyProfile.tipo_acesso]] : []),
    inicio_em: startedAt,
    ultimo_acesso_em: lastAccessAt,
    expira_em: expiresAt,
  }
}
