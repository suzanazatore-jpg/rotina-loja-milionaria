'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AppInstallationTracker() {
  useEffect(() => {
    let installedEvent = false
    const confirmed = new Set()
    const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    const historicalInstall = () => { try { return localStorage.getItem('rotina-pwa-instalado') === 'true' } catch { return false } }
    async function record(session) {
      if ((!standalone() && !installedEvent && !historicalInstall()) || !session?.user?.id || confirmed.has(session.user.id)) return
      const response = await fetch('/api/app-instalacao', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ evidence: standalone() ? 'standalone' : installedEvent ? 'appinstalled' : 'legacy_browser' }) }).catch(() => null)
      if (response?.ok) confirmed.add(session.user.id)
    }
    const refresh = () => { void supabase.auth.getSession().then(({ data }) => record(data.session)) }
    const installed = () => { installedEvent = true; refresh() }
    refresh()
    // Supabase recomenda tirar operações assíncronas do callback de autenticação.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => { void record(session) }, 0) })
    window.addEventListener('appinstalled', installed)
    window.addEventListener('online', refresh)
    const displayMode = window.matchMedia('(display-mode: standalone)')
    displayMode.addEventListener('change', refresh)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { displayMode.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', onVisible); subscription.unsubscribe(); window.removeEventListener('appinstalled', installed); window.removeEventListener('online', refresh) }
  }, [])
  return null
}
