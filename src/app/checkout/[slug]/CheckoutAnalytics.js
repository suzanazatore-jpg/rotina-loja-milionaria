'use client'
import Script from 'next/script'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { trackingDestination, dispatchAnalytics } from '@/lib/checkoutAnalytics'
const CONSENT_KEY='sz-checkout-consent-v2'
function subscribe(callback) {
  window.addEventListener('storage',callback);window.addEventListener('sz-checkout-consent',callback)
  return ()=>{window.removeEventListener('storage',callback);window.removeEventListener('sz-checkout-consent',callback)}
}
// Sem escolha salva = aceito pelo aviso fixo abaixo do botão de compra. Quem recusar fica salvo como 'denied'.
function snapshot() {try{return window.localStorage.getItem(CONSENT_KEY)==='denied'?'denied':'granted'}catch{return 'granted'}}
function updateConsent(granted) {
  try {
    window.dataLayer ||= []
    function gtag(){window.dataLayer.push(arguments)}
    const choice=granted?'granted':'denied'
    gtag('consent','update',{analytics_storage:choice,ad_storage:choice,ad_user_data:choice,ad_personalization:choice})
    if(typeof window.fbq==='function')window.fbq('consent',granted?'grant':'revoke')
  }catch{ /* Rastreadores não podem interromper a compra. */ }
}
function choose(value) {
  updateConsent(value==='granted')
  try{window.localStorage.setItem(CONSENT_KEY,value)}catch{return}
  window.dispatchEvent(new Event('sz-checkout-consent'))
}
function setup(config) {
  try {
  const destination=trackingDestination(config)
  window.__szCheckoutTrackers ||= new Set()
  if(window.__szCheckoutTrackers.has(`${destination.channel}:${destination.id}`))return true
  if(destination.channel==='gtm') {
    window.dataLayer ||= []
    window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'})
  } else if(destination.channel==='meta') {
    if(!window.fbq){
      const fbq=function(){if(fbq.callMethod)fbq.callMethod.apply(fbq,arguments);else fbq.queue.push(arguments)}
      fbq.push=fbq;fbq.loaded=true;fbq.version='2.0';fbq.queue=[]
      window.fbq=fbq;window._fbq ||= fbq
    }
    window.fbq('init',destination.id)
    window.fbq('set','autoConfig',false,destination.id)
  }
  window.__szCheckoutTrackers.add(`${destination.channel}:${destination.id}`)
  return true
  }catch{return false}
}
export default function CheckoutAnalytics({config,enabled,viewCart,currentCart,started,purchase,visitToken}) {
  const consent=useSyncExternalStore(subscribe,snapshot,()=> 'unknown')
  const destination=trackingDestination(config)
  const allowed=enabled && consent==='granted' && destination.channel!=='off'
  const sentVisit = useRef(null)
  useEffect(() => {
    if (!visitToken || consent === 'unknown') return
    function recordVisibleVisit() {
      if (document.visibilityState !== 'visible' || sentVisit.current === visitToken) return
      sentVisit.current = visitToken
      const query = new URLSearchParams(window.location.search)
      const tags = consent === 'granted' ? { campaign: query.get('utm_campaign'), adset: query.get('utm_term'), ad: query.get('utm_content') } : {}
      void fetch('/api/checkout/telemetria/visita', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ token: visitToken, ...tags }),
      }).catch(() => {})
    }
    recordVisibleVisit()
    document.addEventListener('visibilitychange', recordVisibleVisit)
    return () => document.removeEventListener('visibilitychange', recordVisibleVisit)
  }, [visitToken, consent])
  useEffect(()=>{updateConsent(allowed)},[allowed])
  useEffect(()=>{
    if(!allowed)return
    if(!setup(config))return
    dispatchAnalytics(window,config,'page_view',null,`page:${viewCart.items[0].item_id}`)
    dispatchAnalytics(window,config,'view_item',viewCart,`view:${viewCart.items[0].item_id}`)
  },[allowed,config,viewCart])
  useEffect(()=>{
    if(!allowed || !started)return
    if(!setup(config))return
    dispatchAnalytics(window,config,'begin_checkout',currentCart,`begin:${viewCart.items[0].item_id}`)
  },[allowed,started,config,currentCart,viewCart])
  useEffect(()=>{
    if(!allowed || !purchase)return
    if(!setup(config))return
    dispatchAnalytics(window,config,'purchase',purchase,purchase.event_id)
  },[allowed,config,purchase])
  if(!enabled || destination.channel==='off')return null
  return <>
    {allowed && (destination.channel==='gtm' ? <Script id={`sz-gtm-${destination.id}`} src={`https://www.googletagmanager.com/gtm.js?id=${destination.id}`} strategy="afterInteractive"/> : <Script id="sz-meta-sdk" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive"/>)}
  </>
}
// Link discreto dentro do aviso fixo do checkout para recusar (ou voltar a permitir) cookies de anúncios.
export function CookieChoice() {
  const consent=useSyncExternalStore(subscribe,snapshot,()=> 'granted')
  return consent==='denied'
    ? <button type="button" className="pc-cookie-choice" onClick={()=>choose('granted')}>Permitir cookies de anúncios</button>
    : <button type="button" className="pc-cookie-choice" onClick={()=>choose('denied')}>Não permitir cookies de anúncios</button>
}
