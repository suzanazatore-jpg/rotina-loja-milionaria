'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AppIcon from '@/app/components/AppIcon'
import { supabase } from '@/lib/supabase'

function timeLabel(value) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
  if (sameDay(date, today)) return `Hoje, ${hour}`
  if (sameDay(date, yesterday)) return `Ontem, ${hour}`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

async function requestHistory(path = '', options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão encerrada.')
  const response = await fetch(`/api/notificacoes/historico${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as notificações.')
  return data
}

export default function NotificationCenter({ cores, ouro = '#D4AF37', onNavigate }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const rootRef = useRef(null)
  const pushOpenedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await requestHistory()
      setItems(data.notifications || [])
      setUnread(data.unread || 0)
      setError('')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0)
    const interval = window.setInterval(() => void load(), 60000)
    const onVisibility = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  useEffect(() => {
    const onOutside = event => {
      if (open && rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [open])

  useEffect(() => {
    if (pushOpenedRef.current) return
    const url = new URL(window.location.href)
    const id = url.searchParams.get('notificacao')
    if (!id) return
    pushOpenedRef.current = true
    void requestHistory('', { method: 'PATCH', body: JSON.stringify({ id, action: 'opened' }) })
      .then(() => {
        url.searchParams.delete('notificacao')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        void load()
      })
      .catch(() => {})
  }, [load])

  async function markAllRead() {
    if (!unread) return
    setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
    setUnread(0)
    try {
      await requestHistory('', { method: 'PATCH', body: JSON.stringify({ all: true }) })
    } catch {
      void load()
    }
  }

  async function openNotification(item) {
    const wasUnread = !item.read_at
    const now = new Date().toISOString()
    setItems(current => current.map(currentItem => currentItem.id === item.id
      ? { ...currentItem, read_at: currentItem.read_at || now, opened_at: now }
      : currentItem))
    if (wasUnread) setUnread(current => Math.max(0, current - 1))
    setOpen(false)
    void requestHistory('', { method: 'PATCH', body: JSON.stringify({ id: item.id, action: 'opened' }) }).catch(() => void load())

    const target = new URL(item.target_url || '/painel', window.location.origin)
    const section = target.searchParams.get('secao') || 'inicio'
    target.searchParams.delete('notificacao')
    window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`)
    onNavigate?.(section)
  }

  return (
    <div ref={rootRef} className="notification-center-anchor">
      <button
        type="button"
        className="notification-bell"
        aria-label={unread ? `${unread} notificações não lidas` : 'Notificações'}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        style={{ color: cores.tx, background: cores.card, borderColor: cores.borda }}
      >
        <AppIcon name="notifications" size={20} />
        {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <section className="notification-panel" style={{ color: cores.tx, background: cores.card, borderColor: cores.borda }} aria-label="Histórico de notificações">
          <header style={{ borderColor: cores.borda }}>
            <div><strong>Notificações</strong><small style={{ color: cores.tx2 }}>{unread ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}</small></div>
            {unread > 0 && <button type="button" onClick={markAllRead} style={{ color: ouro }}>Marcar todas como lidas</button>}
          </header>
          <div className="notification-list">
            {loading && <p style={{ color: cores.tx2 }}>Carregando...</p>}
            {!loading && error && <p style={{ color: '#D45B5B' }}>{error}</p>}
            {!loading && !error && items.length === 0 && <p style={{ color: cores.tx2 }}>Suas próximas mensagens aparecerão aqui.</p>}
            {!loading && !error && items.map(item => (
              <button
                type="button"
                key={item.id}
                className={item.read_at ? 'notification-item' : 'notification-item unread'}
                onClick={() => openNotification(item)}
                style={{ color: cores.tx, borderColor: cores.borda, background: item.read_at ? 'transparent' : `${ouro}12` }}
              >
                <i style={{ color: ouro, background: `${ouro}1A` }}><AppIcon name={item.notification_type === 'rotina' ? 'routine' : 'notifications'} size={19} /></i>
                <span><strong>{item.title}</strong><em style={{ color: cores.tx2 }}>{item.body}</em><small style={{ color: cores.tx3 }}>{timeLabel(item.sent_at)}</small></span>
                {!item.read_at && <b style={{ background: ouro }} aria-label="Não lida" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <style>{`
        .notification-center-anchor { position: fixed; top: 13px; right: 96px; z-index: 120; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .notification-bell { width: 36px; height: 36px; display: grid; place-items: center; position: relative; border: 1px solid; border-radius: 9px; cursor: pointer; }
        .notification-bell > span { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; display: grid; place-items: center; border-radius: 10px; background: #D4AF37; color: #17120A; border: 2px solid ${cores.card}; font-size: 9px; font-weight: 900; box-sizing: border-box; }
        .notification-panel { position: absolute; top: 44px; right: -82px; width: min(390px, calc(100vw - 24px)); max-height: min(620px, calc(100vh - 92px)); overflow: hidden; border: 1px solid; border-radius: 16px; box-shadow: 0 22px 60px rgba(0,0,0,.24); }
        .notification-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px; border-bottom: 1px solid; }
        .notification-panel > header div { display: grid; gap: 2px; }
        .notification-panel > header strong { font-size: 15px; }
        .notification-panel > header small { font-size: 11px; }
        .notification-panel > header button { border: 0; background: transparent; font-size: 11px; font-weight: 800; cursor: pointer; text-align: right; }
        .notification-list { max-height: min(540px, calc(100vh - 160px)); overflow-y: auto; padding: 6px; }
        .notification-list > p { text-align: center; padding: 30px 16px; margin: 0; font-size: 13px; }
        .notification-item { width: 100%; display: grid; grid-template-columns: 38px minmax(0,1fr) 8px; gap: 10px; align-items: start; padding: 12px 10px; border: 0; border-bottom: 1px solid; text-align: left; cursor: pointer; }
        .notification-item:last-child { border-bottom: 0; }
        .notification-item > i { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; font-style: normal; }
        .notification-item > span { min-width: 0; display: grid; gap: 4px; }
        .notification-item > span strong { font-size: 12px; line-height: 1.3; }
        .notification-item > span em { font-size: 11px; line-height: 1.4; font-style: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .notification-item > span small { font-size: 9px; }
        .notification-item > b { width: 7px; height: 7px; margin-top: 5px; border-radius: 50%; }
        @media (max-width: 720px) {
          .notification-center-anchor { top: 12px; right: 94px; }
          .notification-panel { position: fixed; top: 58px; right: 12px; left: 12px; width: auto; }
        }
      `}</style>
    </div>
  )
}
