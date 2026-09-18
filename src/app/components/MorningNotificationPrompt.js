'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DISMISSED_KEY = 'rotina-notificacao-lembrar-depois'
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(character => character.charCodeAt(0)))
}

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

async function saveSubscription(subscription) {
  const token = await accessToken()
  if (!token) throw new Error('Entre novamente para ativar o lembrete.')

  const response = await fetch('/api/notificacoes/inscricao', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível ativar o lembrete.')
}

export default function MorningNotificationPrompt() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!pathname?.startsWith('/painel') || !isStandalone() || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return undefined
    }

    let cancelled = false
    let timer

    async function checkSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription && Notification.permission === 'granted') {
          await saveSubscription(subscription)
          return
        }

        if (Notification.permission === 'denied') return

        const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) || 0)
        if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_MS) return

        timer = window.setTimeout(() => {
          if (!cancelled) setVisible(true)
        }, 2200)
      } catch {
        // O painel continua funcionando normalmente quando o dispositivo não aceita Push.
      }
    }

    void checkSubscription()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [pathname])

  async function activate() {
    setStatus('loading')
    setMessage('')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('error')
        setMessage('Para receber o lembrete, permita as notificações nas configurações do celular.')
        return
      }

      const keyResponse = await fetch('/api/notificacoes/chave', { cache: 'no-store' })
      const keyData = await keyResponse.json()
      if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error(keyData.error || 'Notificações ainda não configuradas.')
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        })
      }

      await saveSubscription(subscription)
      window.localStorage.removeItem(DISMISSED_KEY)
      setStatus('success')
      setMessage('Pronto! Você receberá um lembrete por dia, às 8h.')
      window.setTimeout(() => setVisible(false), 5000)
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'Não foi possível ativar o lembrete.')
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // Fecha normalmente mesmo sem armazenamento local.
    }
    setVisible(false)
  }

  if (!pathname?.startsWith('/painel') || !visible) return null

  return (
    <aside className="morning-notification-prompt" role="dialog" aria-labelledby="morning-notification-title">
      <button className="morning-notification-close" type="button" onClick={dismiss} aria-label="Lembrar depois">×</button>
      <span className="morning-notification-icon" aria-hidden="true">🔔</span>
      <div className="morning-notification-copy">
        <small>LEMBRETE DIÁRIO</small>
        <strong id="morning-notification-title">Comece o dia com sua rotina</strong>
        <p>Receba uma única notificação pela manhã para conferir as tarefas do dia.</p>
        {message && <p className={`morning-notification-message ${status}`}>{message}</p>}
        {status !== 'success' && (
          <div className="morning-notification-actions">
            <button type="button" onClick={activate} disabled={status === 'loading'}>
              {status === 'loading' ? 'Ativando...' : 'Ativar lembrete das 8h'}
            </button>
            <button type="button" onClick={dismiss}>Agora não</button>
          </div>
        )}
      </div>
    </aside>
  )
}
