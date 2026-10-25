export function normalizeContact(input) {
  const name = String(input?.name || '').trim()
  const email = String(input?.email || '').trim().toLowerCase()
  const phone = String(input?.phone || '').replace(/\D/g, '')
  const document = String(input?.document || '').replace(/\D/g, '')
  if (!name || name.length > 128) throw new Error('Informe o nome do contato.')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um email válido.')
  if (phone && ![10,11,12,13].includes(phone.length)) throw new Error('Informe um celular com DDD.')
  if (document && ![11,14].includes(document.length)) throw new Error('Informe um CPF ou CNPJ com 11 ou 14 dígitos.')
  return { name, email, phone: phone || null, document: document || null }
}
export function contactFilters(query) {
  return Object.fromEntries(['name','email','phone','document'].map(key => [key, String(query.get(key) || '').trim().slice(0,150)]))
}
export function filterContacts(query, filters) {
  for (const [key,value] of Object.entries(filters)) if (value) query = query.ilike(key, `%${value.replace(/[\\%_]/g, '\\$&')}%`)
  return query
}
