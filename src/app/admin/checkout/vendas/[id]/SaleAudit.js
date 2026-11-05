'use client'
import { useState } from 'react'
import { date } from '../../CentralUI'
import { Modal, Panel } from './SaleUI'
const day = (t) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t))
function initial() {
  const end = new Date(),
    start = new Date(end)
  start.setMonth(start.getMonth() - 6)
  return { start: day(start), end: day(end) }
}
export default function SaleAudit({ events }) {
  const [period, setPeriod] = useState(initial),
    [draft, setDraft] = useState(null),
    [event, setEvent] = useState(null)
  const filtered = events.filter(
    (e) => (!period.start || day(e.at) >= period.start) && (!period.end || day(e.at) <= period.end),
  )
  const fmt = (s) => (s ? s.split('-').reverse().join('/') : '…')
  const [copyNote,setCopyNote]=useState('')
  const eventJson=event?JSON.stringify(event.detail || {registro:event.id,evento:event.title,data:event.at,detalhe:event.description},null,2):''
  async function copyJson(){
    try {await navigator.clipboard.writeText(eventJson);setCopyNote('Copiado')}
    catch {setCopyNote('Selecione o JSON para copiar.')}
  }
  return (
    <Panel title="Auditoria">
      <div className="sv-audit-tools">
        <span>
          {fmt(period.start)} – {fmt(period.end)}
        </span>
        <button onClick={() => setDraft(period)}>Filtros</button>
      </div>
      <ul className="sv-log">
        {filtered.map((e) => (
          <li key={e.id}>
            <button onClick={() => {setCopyNote('');setEvent(e)}}>
              <span>
                {e.title}
                <small>{e.description}</small>
              </span>
              <time>{date(e.at)}</time>
            </button>
          </li>
        ))}
      </ul>
      {!filtered.length && <p>Sem registros no período.</p>}
      {draft && (
        <Modal title="Filtros" close={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setPeriod(draft)
              setDraft(null)
            }}
          >
            <div className="sv-dialog-body sv-form">
              <h3>Datas</h3>
              <label>
                De
                <input
                  type="date"
                  value={draft.start}
                  max={draft.end}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={draft.end}
                  min={draft.start}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
            </div>
            <footer>
              <button
                type="button"
                onClick={() => {
                  setPeriod({ start: '', end: '' })
                  setDraft(null)
                }}
              >
                Limpar Filtros
              </button>
              <button className="sv-primary">Filtrar</button>
            </footer>
          </form>
        </Modal>
      )}
      {event && (
        <Modal title="Auditoria" close={() => setEvent(null)}>
          <div className="sv-dialog-body">
            <p>Tipo</p><h3>{event.title}</h3>
            <p>{date(event.at)}</p>
            <p>JSON <button aria-label="Copiar JSON" onClick={copyJson}>⧉</button> <small role="status">{copyNote}</small></p>
            <pre>{eventJson}</pre>
          </div>
        </Modal>
      )}
    </Panel>
  )
}
