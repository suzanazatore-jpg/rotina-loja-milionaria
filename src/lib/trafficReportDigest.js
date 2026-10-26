// Notifications are grouped by approved recipient, not by advertising account.
export function weeklyDeliveryKey(range) {
  return 'weekly:' + range.from + ':' + range.to
}
export function groupWeeklyReports(reports, links) {
  const groups = new Map()
  for (const report of reports) {
    for (const link of links.filter(l => l.client_id === report.client_id)) {
      if (!groups.has(link.user_id)) groups.set(link.user_id, new Map())
      groups.get(link.user_id).set(report.id, report)
    }
  }
  return [...groups].map(([user_id, rows]) => ({user_id, reports:[...rows.values()].sort((a,b) => a.account_name.localeCompare(b.account_name) || a.id.localeCompare(b.id))}))
}
export function weeklyDigestNotice(range, reports) {
  const count = reports.length, period = range.from.split('-').reverse().join('/') + ' a ' + range.to.split('-').reverse().join('/')
  const title = count === 1 ? 'Seu relatório de campanhas está pronto' : 'Seus relatórios de campanhas estão prontos'
  const accountNames = [...new Set(reports.map(r => r.account_name))]
  const body = (count === 1 ? 'O relatório da sua conta' : 'Os relatórios das suas ' + count + ' contas') + ' de ' + period + ' estão disponíveis. Acesse a plataforma para consultar.'
  return {title, body, details:'Contas incluídas:\n' + accountNames.map(name => '• ' + name).join('\n'), path:'/trafego?from=' + range.from + '&to=' + range.to, ruleId:'traffic-' + weeklyDeliveryKey(range), period}
}
export function reportPeriodSelection(reports, from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) return null
  if (!reports.some(r => r.period_type === 'weekly' && r.period_start === from && r.period_end === to)) return null
  return {id:'weekly-' + from + '-' + to, period_start:from, period_end:to}
}
