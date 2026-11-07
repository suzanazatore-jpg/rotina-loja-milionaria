'use client'
import Script from 'next/script'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { trackingDestination, dispatchAnalytics } from '@/lib/checkoutAnalytics'
import { readCheckoutConsent, writeCheckoutConsent, clearSessionChoice } from '@/lib/checkoutConsent'
function subscribe(callback) {
  const storage = () => { clearSessionChoice(); callback() }
  window.addEventListener('storage',storage);window.addEventListener('sz-checkout-consent',callback)
  return ()=>{window.removeEventListener('storage',storage);window.removeEventListener('sz-checkout-consent',callback)}
}
function snapshot() { return readCheckoutConsent() }
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
  writeCheckoutConsent(value)
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
export default function CheckoutAnalytics({config,enabled,viewCart,currentCart,started,paying,purchase,visit,endpoint,trialId}) {
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const browserVisit = useRef(null)
  const posted = useRef(new Set())
  const consent=useSyncExternalStore(subscribe,snapshot,()=> 'unknown')
  const destination=trackingDestination(config)
  const browserAllowed = enabled && !visit?.test
  const allowed=(browserAllowed || visit?.test) && consent==='granted' && destination.channel!=='off'
  useEffect(()=>{updateConsent(Boolean(browserAllowed && allowed))},[browserAllowed,allowed])
  useEffect(()=>{
    if(!allowed || !browserAllowed)return
    if(!setup(config))return
    dispatchAnalytics(window,config,'page_view',null,`page:${viewCart.items[0].item_id}`)
    dispatchAnalytics(window,config,'view_item',viewCart,`view:${viewCart.items[0].item_id}`)
  },[allowed,browserAllowed,config,viewCart])
  useEffect(()=>{
    if (!allowed || (browserAllowed && !setup(config))) return
    browserVisit.current ||= crypto.randomUUID()
    const stages = [
      ['add_to_cart','AddToCart',true,viewCart],
      ['begin_checkout','InitiateCheckout',started,currentCart],
      ['add_payment_info','AddPaymentInfo',paying,currentCart],
    ]
    for (const [action,name,reached,cart] of stages) {
      if (!reached) continue
      const id = name + ':' + (visit?.id || browserVisit.current)
      if (browserAllowed) dispatchAnalytics(window, config, action, { ...cart, event_id: id }, id)
      if (visit && !posted.current.has(id)) {
        posted.current.add(id)
        fetch(endpoint + '/eventos', { method:'POST', keepalive:true, headers:{'Content-Type':'application/json'}, body:JSON.stringify({ consent:true, event:name, ticket:visit.ticket }) }).catch(()=>{})
      }
    }
    if (browserAllowed && trialId) dispatchAnalytics(window,config,'start_trial',{...currentCart,event_id:trialId},trialId)
  },[allowed,browserAllowed,config,viewCart,currentCart,started,paying,trialId,visit,endpoint])
  useEffect(()=>{
    if(!allowed || !browserAllowed || !purchase)return
    if(!setup(config))return
    dispatchAnalytics(window,config,'purchase',purchase,purchase.event_id)
  },[allowed,browserAllowed,config,purchase])
  if((!enabled && !visit?.test) || destination.channel==='off')return null
  return <>
    {allowed && browserAllowed && (destination.channel==='gtm' ? <Script id={`sz-gtm-${destination.id}`} src={`https://www.googletagmanager.com/gtm.js?id=${destination.id}`} strategy="afterInteractive"/> : <Script id="sz-meta-sdk" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive"/>)}
    {preferencesOpen && <aside className="pc-consent" aria-label="Cookies opcionais"><p>Permitir análise e publicidade? Usaremos cookies e enviaremos as etapas do checkout, dados da compra e identificadores do navegador e do email à Meta para medir campanhas.</p><div><button type="button" onClick={()=>{choose('denied');setPreferencesOpen(false)}}>Recusar</button><button type="button" onClick={()=>{choose('granted');setPreferencesOpen(false)}}>Permitir</button>{config.privacy_url && <a href={config.privacy_url} target="_blank" rel="noopener noreferrer">Política de privacidade</a>}</div></aside>}
    <button type="button" className="pc-cookie-settings" aria-expanded={preferencesOpen} onClick={()=>setPreferencesOpen(value=>!value)}>Preferências de cookies</button>
  </>
}
