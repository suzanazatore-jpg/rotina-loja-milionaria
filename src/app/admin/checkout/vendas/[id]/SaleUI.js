'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
export async function api(url, body, signal) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + (session?.access_token || ''),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal,
  })
  const json = await r.json()
  if (!r.ok) throw new Error(json.error || 'Não foi possível concluir a operação.')
  return json
}
export function Modal({ title, close, busy, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="sv-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Fechar" disabled={busy} onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}
export function Panel({ title, fields, children, badge }) {
  return (
    <section className="sv-panel">
      <header>
        <h2>{title}</h2>
        {badge}
      </header>
      {fields && (
        <dl>
          {fields.map(([k, v]) => (
            <div
              key={k}
              className={k.trim() ? undefined : 'sv-spacer'}
              aria-hidden={k.trim() ? undefined : true}
            >
              <dt>{k}</dt>
              <dd>{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  )
}
export function Copy({ value, link = false }) {
  const [note, setNote] = useState('')
  if (!value) return '—'
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setNote('Copiado')
    } catch {
      setNote('Selecione e copie o texto.')
    }
  }
  return (
    <span className="sv-copy">
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" title={value}>
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
      <button aria-label="Copiar" title="Copiar" onClick={copy}>
        ⧉
      </button>
      <small role="status">{note}</small>
    </span>
  )
}
export function Toggle({ label, checked, disabled, onChange, hint }) {
  return (
    <label className="sv-toggle" title={hint}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </label>
  )
}
