'use client'
import {useEffect, useRef, useState} from 'react'
import qrcode from 'qrcode-generator'
import styles from './OfferDetail.module.css'

function LinkQR({url,onClose}) {
  const ref=useRef(null)
  const code=qrcode(0,'M')
  code.addData(url)
  code.make()
  const src=code.createDataURL(6,24)
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog ref={ref} className={styles.dialog} aria-label="QR Code de pagamento" onCancel={onClose}>
    <h2>QR Code de pagamento</h2>
    <img src={src} width="264" height="264" alt="QR Code do link de venda da oferta"/>
    <p>{url}</p>
    <a download="qr-checkout.gif" href={src} className="central-action">Baixar QR Code</a>
    <button type="button" className="central-action" onClick={onClose}>Fechar</button>
  </dialog>
}

export default function OfferPaymentLinks({link,canShare,onMessage}) {
  const [qr,setQR]=useState(false)
  async function copy() {
    try {await navigator.clipboard.writeText(link);onMessage('✓ Link copiado.')}
    catch {onMessage('Selecione a URL para copiar o link.')}
  }
  return <section className={`central-chart-panel ${styles.links}`}>
    <h2>Links de pagamento</h2>
    <div className={styles.linkRow}>
      <label>URL de pagamento<input readOnly value={link} placeholder="Preencha o nome da oferta" /></label>
      {canShare && <a className={styles.open} href={link} target="_blank" rel="noopener noreferrer"
        title="Abrir checkout em nova aba" aria-label="Abrir checkout em nova aba">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 4h7v7m0-7L10 14"/><path d="M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>
      </a>}
      <button type="button" title="Copiar link" aria-label="Copiar link" disabled={!canShare} onClick={copy}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="3" width="11" height="14" rx="2"/><path d="M5 7H4v14h11v-1"/></svg>
      </button>
      <button type="button" title="QR Code" aria-label="QR Code" disabled={!canShare} onClick={()=>setQR(true)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm11-2h3v3h4v5h-3m-4-3v3"/></svg>
      </button>
    </div>
    <small>{canShare?'Link principal de venda':'Salve a oferta para ativar o endereço.'}</small>
    <div className={styles.secondaryLink}><span>URL One Click Buy</span><small>Compra adicional em um clique indisponível nesta central.</small></div>
    {qr && canShare && <LinkQR url={link} onClose={()=>setQR(false)}/>}
  </section>
}
