'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(character => character.charCodeAt(0)))
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

async function api(method, body) {
  const accessToken = await token()
  if (!accessToken) throw new Error('Entre novamente para alterar suas notificações.')
  const response = await fetch('/api/notificacoes/inscricao', {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível alterar suas notificações.')
  return data
}

export default function NotificationPreference({ cores, ouro = '#D4AF37' }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void api('GET')
      .then(data => { if (active) setEnabled(data.enabled === true) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function activate() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Este dispositivo não oferece suporte a notificações do aplicativo.')
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('As notificações estão bloqueadas no aparelho. Libere a permissão nas configurações do navegador ou do aplicativo.')
    }

    const keyResponse = await fetch('/api/notificacoes/chave', { cache: 'no-store' })
    const keyData = await keyResponse.json()
    if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || 'Notificações ainda não configuradas.')

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      })
    }

    await api('POST', { subscription: subscription.toJSON() })
  }

  async function toggle() {
    if (saving || loading) return
    setSaving(true)
    setMessage('')
    try {
      if (enabled) {
        await api('DELETE', { all: true })
        setEnabled(false)
        setMessage('Notificações desativadas. Você pode reativá-las quando quiser.')
      } else {
        await activate()
        setEnabled(true)
        setMessage('Notificações ativadas. Você continuará recebendo seus lembretes e orientações.')
      }
    } catch (error) {
      setMessage(error.message || 'Não foi possível alterar agora.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ borderTop: `1px solid ${cores.borda}`, marginTop: 18, paddingTop: 18 }}>
      <p style={{ color: ouro, fontSize: 10, fontWeight: 900, letterSpacing: '.12em', margin: '0 0 10px' }}>NOTIFICAÇÕES</p>
      <div style={{ background: cores.card2, border: `1px solid ${cores.borda}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <strong style={{ display: 'block', color: cores.tx, fontSize: 13 }}>Receber notificações</strong>
            <span style={{ display: 'block', color: cores.tx2, fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
              Recomendamos manter ativado. As notificações lembram você das ações certas, no momento certo, e ajudam a manter rotina, metas e campanhas em movimento.
            </span>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={loading || saving}
            aria-pressed={enabled}
            aria-label={enabled ? 'Desativar notificações' : 'Ativar notificações'}
            style={{
              flex: '0 0 auto',
              minWidth: 92,
              border: `1px solid ${loading ? cores.borda : enabled ? '#15803D' : '#B91C1C'}`,
              borderRadius: 999,
              padding: '9px 12px',
              background: loading ? cores.card : enabled ? '#15803D' : '#B91C1C',
              color: loading ? cores.tx2 : '#FFFFFF',
              fontWeight: 900,
              fontSize: 11,
              cursor: loading || saving ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Carregando...' : saving ? 'Salvando...' : enabled ? '✓ Ativadas' : '✕ Desativadas'}
          </button>
        </div>
        {message && <p style={{ color: message.startsWith('Notificações ativadas') ? ouro : cores.tx2, fontSize: 11, lineHeight: 1.45, margin: '10px 0 0' }}>{message}</p>}
      </div>
    </section>
  )
}
