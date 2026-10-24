'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CheckoutSettingsEditor from '../CheckoutSettingsEditor'
import { CHECKOUT_DEFAULTS } from '@/lib/checkoutSettings'
import Link from 'next/link'
import AppIcon from '@/app/components/AppIcon'
import styles from './SettingsHub.module.css'

const groups = [
  {name:'Personalização',items:[
    {id:'checkout',name:'Checkout',description:'Personalize cores, banners, fontes e aparência dos seus checkouts.',icon:'plans'},
    {id:'identity',name:'Marca, suporte e termos',description:'Configure a identidade da empresa, os contatos e os links legais.',icon:'profile'},
    {id:'emails',name:'Emails transacionais',description:'Consulte o que o aplicativo envia e o que ainda está em preparação.',icon:'broadcast'},
  ]},
  {name:'Organização',items:[
    {id:'products',name:'Produtos e ofertas',description:'Organize produtos, preços, parcelamentos e links de pagamento.',icon:'courses',href:'/admin/checkout'},
    {id:'plans',name:'Planos e acessos',description:'Gerencie os planos, cursos e períodos de acesso do aplicativo.',icon:'routine',href:'/admin/planos'},
    {id:'subscriptions',name:'Assinaturas',description:'Consulte as assinaturas e acompanhe suas cobranças recorrentes.',icon:'calendar',href:'/admin/checkout/assinaturas'},
  ]},
  {name:'Técnicas',items:[
    {id:'tracking',name:'Pixels e rastreamento',description:'Cadastre o Google Tag Manager e o Meta Pixel usados como padrão.',icon:'goals'},
    {id:'webhooks',name:'Webhooks',description:'Acompanhe os eventos, os recebimentos e as tentativas de entrega.',icon:'settings',href:'/admin/checkout/webhooks'},
  ]},
]
const searchText = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export default function Settings() {
  const [settings,setSettings] = useState({gtm_id:'',meta_pixel_id:'',checkout_config:{...CHECKOUT_DEFAULTS}})
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [view,setView] = useState(null)
  const [search,setSearch] = useState('')
  const [baseline,setBaseline] = useState('')
  const dirty = Boolean(baseline) && JSON.stringify(settings)!==baseline
  useEffect(()=>{
    if (!dirty) return
    const warn = event => {event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return () => window.removeEventListener('beforeunload',warn)
  },[dirty])
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
        if(active){setSettings(json.tracking);setBaseline(JSON.stringify(json.tracking))}
      } catch(error) {if(active)setMessage(error.message)}
      finally{if(active)setLoading(false)}
    }
    load();return()=>{active=false}
  },[])
  async function save(event) {
    event.preventDefault();if(!baseline || loading || saving)return;setSaving(true);setMessage('')
    try {
      const response=await fetch('/api/admin/checkout/configuracoes',{method:'POST',headers:await headers(),body:JSON.stringify({gtm_id:settings.gtm_id,meta_pixel_id:settings.meta_pixel_id,checkout_config:settings.checkout_config})})
      const json=await response.json()
      if(!response.ok)throw new Error(json.error)
      setSettings(json.tracking);setBaseline(JSON.stringify(json.tracking));setMessage('✓ Padrão da central salvo. As ofertas que usam esse padrão recebem a configuração automaticamente.')
    }catch(error){setMessage(error.message)}finally{setSaving(false)}
  }
  const field={background:'var(--cv-field)',color:'var(--cv-text)',border:'1px solid var(--cv-border)',padding:12,borderRadius:7,width:'100%'}
  const selected=groups.flatMap(group=>group.items).find(item=>item.id===view)
  const filtered=groups.map(group=>({...group,items:group.items.filter(item=>searchText(`${item.name} ${item.description}`).includes(searchText(search.trim())))})).filter(group=>group.items.length)
  const notices=message && <p role="status" className="central-editor-message">{message}</p>
  if(!selected)return <main className="central-home">
    <header className={styles.heading}><div><h1>Configurações</h1><p>Escolha o assunto que deseja configurar.</p></div><label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Pesquisar configurações" placeholder="Pesquisar configurações" value={search} onChange={event=>setSearch(event.target.value)} /></label></header>
    {notices}
    {dirty && <p className={styles.note}>Você tem alterações ainda não salvas. Abra o assunto novamente para revisar e salvar.</p>}
    {filtered.map(group=><section key={group.name} className={styles.section} aria-label={group.name}><h2>{group.name}</h2><div className={styles.grid}>{group.items.map(item=>{
      const content=<><span className={styles.icon} aria-hidden="true"><AppIcon name={item.icon} size={25}/></span><span><strong>{item.name}</strong><small>{item.description}</small></span></>
      return item.href?<Link key={item.id} className={styles.card} href={item.href}>{content}</Link>:<button key={item.id} type="button" className={styles.card} onClick={()=>setView(item.id)}>{content}</button>
    })}</div></section>)}
    {!filtered.length && <div className={styles.empty}><p>Nenhuma configuração encontrada.</p><button type="button" className="central-action" onClick={()=>setSearch('')}>Limpar pesquisa</button></div>}
  </main>
  return <main className="central-home">
    <div className={styles.back}><button type="button" className="central-action" onClick={()=>setView(null)}>← Configurações</button></div>
    <header className={styles.editorHeader}><div><h1>{selected.name}</h1><p>{selected.description}</p></div></header>
    {notices}
    {view==='emails'?<section className={`central-chart-panel ${styles.info}`}><h2>Envios do aplicativo</h2><p>Os emails de acesso e renovação são gerenciados pelo aplicativo. A edição dos modelos transacionais ainda não está disponível nesta central.</p><p>As mensagens de pagamento pendente, recusa, abandono e reembolso ainda precisam ser conectadas. Esta tela não ativa novos envios.</p><Link href="/admin/comunicacao" className="central-action">Abrir campanhas e comunicação →</Link></section>:<>
      <p className={styles.note}>{view==='tracking'?'As ofertas que usam o rastreamento padrão acompanham este cadastro. O GTM tem prioridade sobre o Pixel direto para evitar duplicidade.':'Este é o padrão da central. As ofertas que usam esse padrão acompanham as alterações; as ofertas personalizadas mantêm suas configurações.'}</p>
      <form onSubmit={save}><fieldset disabled={loading || saving || !baseline} style={{border:0,padding:0,margin:0,minWidth:0}}>
        {view==='tracking'?<section className="central-chart-panel"><h2>Rastreamento global</h2><div className="central-settings-fields"><label>Google Tag Manager<input style={field} value={settings.gtm_id} onChange={event=>setSettings({...settings,gtm_id:event.target.value})} maxLength={24} placeholder="GTM-XXXXXXX" autoComplete="off" /></label><label>Meta Pixel — ID<input style={field} value={settings.meta_pixel_id} onChange={event=>setSettings({...settings,meta_pixel_id:event.target.value})} inputMode="numeric" maxLength={30} placeholder="Somente números" autoComplete="off" /></label></div><p className="central-data-note">O rastreamento respeita o consentimento da compradora e os controles de ativação do ambiente.</p></section>:<CheckoutSettingsEditor key={view} initialTab={view==='identity'?'content':'appearance'} globalEditor value={settings.checkout_config || CHECKOUT_DEFAULTS} onChange={checkout_config=>setSettings({...settings,checkout_config})} offer={{name:'Exemplo de oferta',price:'47,00',payment_methods:['pix','credit_card'],max_installments:12,free_installments:1}} product={{name:'Seu produto',type:'one_time'}} />}
        <div className={styles.actions}><span>{dirty?'Alterações ainda não salvas':'Nenhuma alteração pendente'}</span><button className="central-primary" type="submit" disabled={!dirty || !baseline || loading || saving}>{loading?'Carregando…':saving?'Salvando…':'Salvar padrão'}</button></div>
      </fieldset></form>
    </>}
  </main>
}
