'use client'
import { useEffect, useRef, useState } from 'react'

function ContractBody({ text }) {
  return <div className="sz-doc">{String(text || '').split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>
    if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
    if (!line.trim()) return <br key={i} />
    return <p key={i}>{line.replace(/\*\*/g, '')}</p>
  })}</div>
}

function SignaturePad({ onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    const canvas = ref.current
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1b1b'
  }, [])
  const point = e => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const down = e => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...point(e)) }
  const move = e => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...point(e)); ctx.stroke(); dirty.current = true }
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current.toDataURL('image/png')) }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null) }
  return <div className="sz-pad">
    <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Área para desenhar a assinatura" />
    <div className="sz-pad-line"><span>Assine com o dedo ou o mouse</span><button type="button" onClick={clear}>Limpar</button></div>
  </div>
}

export default function SignContract({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [documentNumber, setDocumentNumber] = useState('')
  const [codeInfo, setCodeInfo] = useState(null)
  const [code, setCode] = useState('')
  const [signature, setSignature] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const api = `/api/contratos/${encodeURIComponent(token)}`

  useEffect(() => {
    fetch(api, { cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); setData(body); if (body.status === 'signed') setDone(true) }).catch(e => setError(e.message || 'Não foi possível abrir o contrato.'))
  }, [api])

  async function post(payload) {
    setBusy(true); setError('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Erro ao processar.')
      return body
    } catch (e) { setError(e.message); return null } finally { setBusy(false) }
  }
  const sendCode = async channel => { const r = await post({ action: 'code', channel }); if (r) setCodeInfo(r) }
  const sign = async () => { const r = await post({ action: 'sign', accepted, document: documentNumber, code, signature }); if (r) { setDone(true); setData(d => ({ ...d, status: 'signed' })) } }

  if (!data && !error) return <main className="sz-sign"><div className="sz-card sz-center">Carregando contrato…</div></main>
  if (!data) return <main className="sz-sign"><div className="sz-card sz-center"><h2>Não foi possível abrir</h2><p>{error}</p></div></main>

  if (done) return <main className="sz-sign"><div className="sz-card sz-center sz-success">
    <div className="sz-check">✓</div>
    <h2>Contrato assinado!</h2>
    <p>Obrigada, {data.signer.name.split(' ')[0]}. Seu acesso está sendo liberado e você vai receber os dados de entrada por e-mail e WhatsApp.</p>
    <a className="sz-btn" href={`${api}?pdf=1`}>Baixar contrato assinado</a>
    <p className="sz-small">Validação: {data.validation_url}</p>
  </div></main>

  const canSign = accepted && documentNumber.replace(/\D/g, '').length >= 11 && code.replace(/\D/g, '').length === 6 && signature && !busy
  return <main className="sz-sign">
    <header className="sz-head"><strong>Suzana Zatorre</strong><span>Assinatura de contrato</span></header>
    <section className="sz-card">
      <h1 className="sz-title">{data.title}</h1>
      <p className="sz-small">Para: {data.signer.name} · {data.signer.document}</p>
      <ContractBody text={data.body} />
    </section>

    <section className="sz-card">
      <h2>1. Confirme seus dados</h2>
      <label className="sz-label">CPF ou CNPJ usado na compra
        <input inputMode="numeric" autoComplete="off" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="000.000.000-00" />
      </label>
      <label className="sz-checkbox"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Li e concordo com todas as cláusulas deste contrato e com a assinatura eletrônica.</label>
    </section>

    <section className="sz-card">
      <h2>2. Receba o código de confirmação</h2>
      <div className="sz-row">
        {data.channels.whatsapp && <button type="button" className="sz-btn sz-btn-outline" disabled={busy} onClick={() => sendCode('whatsapp')}>Enviar por WhatsApp {data.signer.phone}</button>}
        {data.channels.email && <button type="button" className="sz-btn sz-btn-outline" disabled={busy} onClick={() => sendCode('email')}>Enviar por e-mail {data.signer.email}</button>}
      </div>
      {codeInfo && <p className="sz-small">Código enviado para {codeInfo.destination}. Vale por 10 minutos.</p>}
      <label className="sz-label">Código de 6 dígitos
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="______" />
      </label>
    </section>

    <section className="sz-card">
      <h2>3. Sua assinatura</h2>
      <SignaturePad onChange={setSignature} />
    </section>

    {error && <p className="sz-error" role="alert">{error}</p>}
    <button type="button" className="sz-btn sz-btn-main" disabled={!canSign} onClick={sign}>{busy ? 'Assinando…' : 'Assinar contrato'}</button>
    <p className="sz-small sz-center">Ao assinar, registramos data, hora, IP e dispositivo, conforme a Lei 14.063/2020. Hash do documento: {data.original_sha256.slice(0, 16)}…</p>
  </main>
}
