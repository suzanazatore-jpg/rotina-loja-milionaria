export function installationAccountStatus(profile, legacy, today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())) {
  const status = String(legacy?.status_assinatura || '').toLowerCase()
  const blocked = ['cancelado','cancelada','inativo','inativa','reembolsado','reembolsada','refunded','atrasado','inadimplente','past_due','unpaid'].includes(status)
  const expired = Boolean(legacy?.acesso_expira_em && legacy.acesso_expira_em.slice(0, 10) < today)
  return { active: profile.status === 'active' && !blocked && !expired,
    financial_status: ['ativo','active','paid','approved'].includes(status) && !expired ? 'Em dia' : 'Sem informação',
    financial_source: 'Cadastro financeiro do aplicativo', expires_at: legacy?.acesso_expira_em || null }
}
export function formatInstallationPhone(value) {
  let phone = String(value || '').replace(/\D/g, '')
  if (phone.startsWith('55') && phone.length >= 12) phone = phone.slice(2)
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
  return String(value || '—')
}
