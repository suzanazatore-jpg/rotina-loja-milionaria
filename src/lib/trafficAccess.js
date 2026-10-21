export const TRAFFIC_OFFER_IDS = ['1773344369', '1715729806']
export function trafficAccessAllowed({ profile, legacy, plans }, now = new Date()) {
  if (profile?.status !== 'active' || !plans?.some(p => TRAFFIC_OFFER_IDS.includes(String(p.offer_id)))) return false
  if (['reembolsado', 'cancelado', 'blocked', 'inactive', 'expired'].includes(legacy?.status_assinatura)) return false
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now)
  return !legacy?.acesso_expira_em || legacy.acesso_expira_em.slice(0, 10) >= today
}
export async function loadTrafficAccess(db, userId) {
  const [p,l,v] = await Promise.all([
    db.from('profiles').select('status').eq('id',userId).maybeSingle(),
    db.from('perfis').select('status_assinatura,acesso_expira_em').eq('id',userId).maybeSingle(),
    db.from('profile_plans').select('plan_id').eq('profile_id',userId),
  ])
  for (const r of [p,l,v]) if(r.error) throw r.error
  const ids=(v.data||[]).map(x=>x.plan_id)
  const plans=ids.length?await db.from('plans').select('offer_id').in('id',ids):{data:[]}
  if(plans.error)throw plans.error
  return trafficAccessAllowed({profile:p.data,legacy:l.data,plans:plans.data})
}
