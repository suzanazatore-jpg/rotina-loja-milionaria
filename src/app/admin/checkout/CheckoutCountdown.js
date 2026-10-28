'use client'
import { useEffect, useState } from 'react'
export default function CheckoutCountdown({ config, preview = false, onExpire }) {
  const [now, setNow] = useState(null)
  const deadline = Date.parse(config.countdown_ends_at || '')
  useEffect(() => {
    if (!config.countdown_enabled || !Number.isFinite(deadline)) return
    const update = () => setNow(Date.now())
    const initial = setTimeout(update, 0)
    const interval = setInterval(update, 1000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [config.countdown_enabled, deadline])
  const remaining = now === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  useEffect(() => { if (remaining === 0 && !preview) onExpire?.(true) }, [remaining, preview, onExpire])
  if (!config.countdown_enabled || !Number.isFinite(deadline)) return null
  const clock = remaining === null ? '--:--:--' : [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map(n => String(n).padStart(2, '0')).join(' : ')
  return <div className="cp-countdown"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 5V2m-3 0h6m-3 7v4l3 2M18 6l2-2" /></svg><strong role="timer" aria-label="Tempo restante">{clock}</strong><span>{remaining === 0 ? 'Prazo encerrado' : config.countdown_message || 'Esta condição termina em:'}{preview && <small>Prévia do prazo configurado</small>}</span></div>
}
