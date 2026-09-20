'use client'

import { supabase } from '@/lib/supabase'

const THROTTLE_MS = 2 * 60 * 1000

export async function registerContentAccess(event) {
  if (!event?.event_type || typeof window === 'undefined') return

  const key = `access:${event.event_type}:${event.content_type || 'app'}:${event.content_id || ''}`
  const last = Number(window.sessionStorage.getItem(key) || 0)
  if (Date.now() - last < THROTTLE_MS) return
  window.sessionStorage.setItem(key, String(Date.now()))

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/acessos', {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    })
  } catch {
    // O histórico não pode interromper a navegação da aluna.
  }
}
