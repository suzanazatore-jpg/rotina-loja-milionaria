import { createClient } from '@supabase/supabase-js'

export const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'

export function checkoutAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function autorizarAdmin(request, supabase) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL
}

export function gerarSlug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function reaisParaCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'number') return Math.round(valor * 100)
  const texto = String(valor).trim().replace(/[R$\s]/g, '')
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? Math.round(numero * 100) : null
}

export { totalParcelado } from './checkoutPricing.js'
