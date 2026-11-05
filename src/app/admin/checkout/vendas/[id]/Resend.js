'use client'
import { useEffect, useState } from 'react'
import { api, Modal, Toggle } from './SaleUI'
const channels = [
  ['access', 'Área de Membros'],
  ['auto', 'Autoresponders'],
  ['contract', 'Contratos'],
  ['shop', 'Ecommerces'],
  ['email', 'Emails Transacionais'],
  ['billing', 'Faturamento'],
  ['sms', 'SMS'],
  ['hooks', 'Webhooks'],
]
export default function Resend({ base, view, contract, close, refresh }) {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [picked, setPicked] = useState([]),
    [hooks, setHooks] = useState([]),
    [results, setResults] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    const ac = new AbortController()
    api(base + '/webhooks', null, ac.signal)
      .then((r) => {
        const unique = new Map()
        for (const d of r.deliveries)
          if (
            r.paid &&
            d.active &&
            !d.internal &&
            d.event_type === 'order.paid' &&
            !unique.has(d.webhook_id)
          )
            unique.set(d.webhook_id, d)
        setRows([...unique.values()])
        setHooks([...unique.values()].map((d) => d.id))
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [base])
  const allowed = {
    access: view.member,
    email: view.email,
    contract: ['pending', 'viewed'].includes(contract?.status),
    hooks: rows.length > 0,
  }
  const available = channels.filter(([k]) => allowed[k]).map(([k]) => k)
  const all = available.length > 0 && available.every((k) => picked.includes(k))
  function toggle(k) {
    setPicked((a) => (a.includes(k) ? a.filter((n) => n !== k) : [...a, k]))
  }
  async function send() {
    setBusy(true)
    const out = {}
    for (const k of picked) {
      if (k === 'hooks') {
        for (const d of rows.filter((r) => hooks.includes(r.id))) {
          try {
            await api(base + '/webhooks', { delivery_id: d.id, confirm: true, request_id: requestId })
            out[d.name] = 'Na fila de envio'
          } catch (e) {
            out[d.name] = e.message
          }
        }
      } else {
        const label = channels.find(([key]) => key === k)[1]
        try {
          if (k === 'contract') {
            const r = await api('/api/admin/contratos', { id: contract.id, action: 'resend' })
            out[label] =
              Object.entries(r.sent || {})
                .map(([ch, status]) => ch + ' · ' + status)
                .join(', ') || 'Sem canal disponível'
          } else out[label] = (await api(base + '/acoes', { action: k, requestId })).message
        } catch (e) {
          out[label] = e.message
        }
      }
    }
    setResults(out)
    setBusy(false)
    refresh()
  }
  const done = Object.keys(results).length > 0
  return (
    <Modal title="Reenviar" close={close} busy={busy}>
      <div className="sv-dialog-body">
        {done ? (
          <ul role="status">
            {Object.entries(results).map(([k, v]) => (
              <li key={k}>
                <strong>{k}</strong> · {v}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            <Toggle
              label="Selecionar Todos"
              disabled={busy || loading || !available.length}
              checked={all}
              onChange={() => {
                setPicked(all ? [] : available)
                setHooks(rows.map((d) => d.id))
              }}
            />
            <div className="sv-options">
              {channels.map(([k, name]) => (
                <div key={k}>
                  <Toggle
                    label={name}
                    checked={picked.includes(k)}
                    disabled={!allowed[k] || busy || loading}
                    onChange={() => toggle(k)}
                    hint={!allowed[k] && !loading ? 'Indisponível' : undefined}
                  />
                  {k === 'hooks' && picked.includes(k) && (
                    <div className="sv-sub">
                      <p style={{ fontSize: 12, margin: '4px 0 10px' }}>
                        Os webhooks vinculados ao produto desta venda serão reenviados automaticamente.
                      </p>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                          Escolher destinos (opcional)
                        </summary>
                      {rows.map((d) => (
                        <label key={d.id}>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={hooks.includes(d.id)}
                            onChange={() =>
                              setHooks((a) =>
                                a.includes(d.id) ? a.filter((i) => i !== d.id) : [...a, d.id],
                              )
                            }
                          />{' '}
                          {d.name}
                        </label>
                      ))}
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <footer>
        <button disabled={busy} onClick={close}>
          {done ? 'Fechar' : 'Cancelar'}
        </button>
        {!done && (
          <button
            className="sv-primary"
            disabled={loading || busy || !picked.length || (picked.includes('hooks') && !hooks.length)}
            onClick={send}
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        )}
      </footer>
    </Modal>
  )
}
