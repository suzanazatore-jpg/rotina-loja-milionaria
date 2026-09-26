export async function appContentKeys(supabase, user) {
  if (user.email === 'suporte@suzanazatorre.com.br') return ['calendar', 'campaigns', 'routine', 'team_goals', 'pricing', 'assistant', 'mentorship']
  const [profile, plans, legacy] = await Promise.all([
    supabase.from('profiles').select('status').eq('id', user.id).maybeSingle(),
    supabase.from('profile_plans').select('plan_id').eq('profile_id', user.id),
    supabase.from('perfis').select('tipo_acesso,status_assinatura,acesso_expira_em').eq('id', user.id).maybeSingle(),
  ])
  if (profile.error || plans.error || legacy.error) throw new Error('Não foi possível conferir o acesso.')
  if (profile.data?.status !== 'active') return []
  const old = legacy.data
  if (['atrasado', 'cancelado', 'reembolsado', 'reembolsada', 'refunded'].includes(old?.status_assinatura)) return []
  if (['teste', 'avista'].includes(old?.tipo_acesso) && old.acesso_expira_em && new Date(`${old.acesso_expira_em}T23:59:59-03:00`) < new Date()) return []
  const ids = (plans.data || []).map(plan => plan.plan_id)
  if (!ids.length) return []
  const result = await supabase.from('plan_app_contents').select('content_key').in('plan_id', ids)
  if (result.error) throw new Error('Não foi possível conferir o plano.')
  return [...new Set((result.data || []).map(item => item.content_key))]
}
