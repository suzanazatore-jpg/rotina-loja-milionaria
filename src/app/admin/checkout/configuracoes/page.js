'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
export default function Settings() {
  const [settings,setSettings] = useState({gtm_id:'',meta_pixel_id:''})
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  async function headers() {
    const {data:{session}} = await supabase.auth.getSession()
    return {Authorization:`Bearer ${session?.access_token || ''}`,'Content-Type':'application/json'}
  }
  useEffect(()=>{
    let active=true
    async function load() {
      try {
        const response=await fetch('/api/admin/checkout/configuracoes',{headers:await headers(),cache:'no-store'})
        const json=await response.json()
        if(!response.ok)throw new Error(json.error)
        if(active)setSettings(json.tracking)
      } catch(error) {if(active)setMessage(error.message)}
      finally{if(active)setLoading(false)}
    }
    load();return()=>{active=false}
  },[])
  async function save(event) {
    event.preventDefault();setSaving(true);setMessage('')
    try {
      const response=await fetch('/api/admin/checkout/configuracoes',{method:'POST',headers:await headers(),body:JSON.stringify({gtm_id:settings.gtm_id,meta_pixel_id:settings.meta_pixel_id})})
      const json=await response.json()
      if(!response.ok)throw new Error(json.error)
      setSettings(json.tracking);setMessage('✓ Padrão da central salvo. As ofertas que usam esse padrão recebem a configuração automaticamente.')
    }catch(error){setMessage(error.message)}finally{setSaving(false)}
  }
  const field={background:'var(--cv-field)',color:'var(--cv-text)',border:'1px solid var(--cv-border)',padding:12,borderRadius:7,width:'100%'}
  return <main className="central-home"><div className="central-dashboard-heading"><div><span className="central-eyebrow">PADRÕES DA CENTRAL</span><h1>Configurações</h1><p>Um cadastro para todos os seus checkouts.</p></div></div><section className="central-chart-panel"><h2>Rastreamento global</h2><p className="central-data-note">As ofertas usam este padrão. Você pode personalizar ou desativar o rastreamento dentro de uma oferta.</p>{message && <p role="status" className="central-editor-message">{message}</p>}<form onSubmit={save}><fieldset disabled={loading || saving} style={{border:0,padding:0,margin:0}}><div className="central-settings-fields"><label>Google Tag Manager<input style={field} value={settings.gtm_id} onChange={event=>setSettings({...settings,gtm_id:event.target.value})} maxLength={24} placeholder="GTM-XXXXXXX" autoComplete="off" /></label><label>Meta Pixel — ID<input style={field} value={settings.meta_pixel_id} onChange={event=>setSettings({...settings,meta_pixel_id:event.target.value})} inputMode="numeric" maxLength={30} placeholder="Somente números" autoComplete="off" /></label></div><div className="central-editor-actions"><button className="central-primary" type="submit">{loading?'Carregando…':saving?'Salvando…':'Salvar padrão'}</button></div></fieldset></form><p className="central-data-note">Cadastre apenas os IDs. O envio dos eventos e a confirmação de compra serão conectados na próxima etapa.</p></section></main>
}
