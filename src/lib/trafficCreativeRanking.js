// Compare only ads from the same campaign and conversion event.
export function creativeGroups(ads, campaigns = []) {
 const groups = new Map()
 for (const ad of ads) {
  const key = `${ad.campaign_id || 'unknown'}:${ad.result_label || 'unknown'}:${ad.cost_label || ''}`
  if (!groups.has(key)) groups.set(key, {key, name: campaigns.find(c => c.id === ad.campaign_id)?.name || ad.campaign_name || 'Campanha não identificada', event: ad.result_label, rows: []})
  groups.get(key).rows.push(ad)
 }
 return [...groups.values()].map(group => {
  const comparable = group.rows.filter(r => r.campaign_id && r.result_label && r.spend > 0 && r.results > 0 && r.cost != null).sort((a,b) => a.cost-b.cost || b.results-a.results)
  return {...group, comparable, best: comparable[0] || null, worst: comparable.length > 1 && comparable.at(-1).cost > comparable[0].cost ? comparable.at(-1) : null, noResults: group.rows.filter(r => r.spend > 0 && r.results === 0)}
 })
}
