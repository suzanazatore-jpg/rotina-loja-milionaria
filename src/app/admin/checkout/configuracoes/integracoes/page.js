'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppIcon from '@/app/components/AppIcon'
import { supabase } from '@/lib/supabase'
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrationCatalog'
import styles from './Integrations.module.css'

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
async function readStatuses(signal) {
  const {data:{session}} = await supabase.auth.getSession()
  const response = await fetch('/api/admin/checkout/integracoes',{headers:{Authorization:`Bearer ${session?.access_token || ''}`},cache:'no-store',signal})
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Não foi possível consultar as integrações.')
  return body.statuses
}
export default function Integrations() {
  const [category,setCategory] = useState('all')
  const [search,setSearch] = useState('')
  const [selected,setSelected] = useState(null)
  const [statuses,setStatuses] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  async function refresh() {
    setLoading(true);setError('')
    try {setStatuses(await readStatuses())}
    catch(failure) {setError(failure.message);setStatuses(null)}
    finally {setLoading(false)}
  }
  useEffect(()=>{
    const controller=new AbortController()
    readStatuses(controller.signal)
      .then(data=>{if(!controller.signal.aborted)setStatuses(data)})
      .catch(failure=>{if(!controller.signal.aborted)setError(failure.message)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[])
  const filtered = INTEGRATIONS.filter(item=>(category==='all' || item.category===category) && normalize(`${item.name} ${item.description}`).includes(normalize(search.trim())))
  const groups = [
    {id:'configured',name:'Configuradas e módulos disponíveis',items:filtered.filter(item=>!item.planned && statuses?.[item.id]?.configured)},
    {id:'pending',name:'Para configurar',items:filtered.filter(item=>!item.planned && statuses && !statuses[item.id]?.configured)},
    {id:'unknown',name:loading?'Consultando configurações…':'Configuração não verificada',items:statuses?[]:filtered.filter(item=>!item.planned)},
    {id:'planned',name:'Planejadas',items:filtered.filter(item=>item.planned)},
  ].filter(group=>group.items.length)
  const selectedStatus = selected && statuses?.[selected.id]
  return <main className="central-home">
    <nav aria-label="Localização" className={styles.breadcrumb}><Link href="/admin/checkout/configuracoes">Configurações</Link><span>/</span>{selected?<><button onClick={()=>setSelected(null)}>Integrações</button><span>/</span><strong>{selected.name}</strong></>:<strong>Integrações</strong>}</nav>
    <header className={styles.heading}><div><span className={styles.eyebrow}>CONEXÕES DA CENTRAL</span><h1>{selected?selected.name:'Integrações'}</h1><p>{selected?selected.description:'Suas ferramentas organizadas em um só lugar.'}</p></div>{!selected && <label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar integrações" type="search" placeholder="Pesquisar ferramenta" value={search} onChange={event=>setSearch(event.target.value)} /></label>}</header>
    {error && <div role="alert" className={styles.notice}><p>{error}</p><button className="central-action" disabled={loading} onClick={refresh}>Tentar novamente</button></div>}
    {selected?<>
      <button className="central-action" onClick={()=>setSelected(null)}>← Todas as integrações</button>
      <section className={styles.detail} aria-label={`Detalhes de ${selected.name}`}><span className={styles.icon}><AppIcon name={selected.icon} size={32}/></span><span className={styles.badge}>{selected.planned?'Planejada':loading?'Consultando…':error?'Não verificado':selectedStatus?.label || 'Não verificado'}</span><h2>{selected.name}</h2><p>{selected.planned?selected.pending:selectedStatus?.detail || 'Consulte a configuração antes de usar esta integração.'}</p><div className={styles.actions}>{selected.actions.map(([label,href])=><Link className="central-action" href={href} key={label}>{label} →</Link>)}</div></section>
      <p className={styles.footnote}>As configurações indicam o cadastro neste aplicativo. Contas conectadas em outra plataforma precisam de uma conexão própria aqui.</p>
    </>:<>
      <div className={styles.toolbar}><nav aria-label="Categorias de integração" className={styles.categories}>{INTEGRATION_CATEGORIES.map(([key,label])=><button key={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>{label}</button>)}</nav><button className="central-action" disabled={loading} onClick={refresh}>{loading?'Consultando…':'↻ Atualizar'}</button></div>
      <p className={styles.footnote} role="status" aria-live="polite">{loading?'Consultando as configurações deste ambiente…':`${filtered.length} ${filtered.length===1?'ferramenta encontrada':'ferramentas encontradas'}. Configuração encontrada não confirma conexão ou entrega.`}</p>
      {groups.map(group=><section className={styles.section} key={group.id} aria-label={group.name}>
        <h2 className={group.id==='configured'?styles.configured:styles.pending}>{group.name}<span>{group.items.length}</span></h2>
        <div className={styles.grid}>{group.items.map(item=><button type="button" className={styles.card} key={item.id} title={item.description} onClick={()=>item.id==='meta'?window.location.assign('/admin/checkout/configuracoes/integracoes/meta'):setSelected(item)}>
          <span className={styles.brand}><span className={styles.icon}><AppIcon name={item.icon} size={24}/></span><strong>{item.name}</strong></span>
          <span className={styles.badge}>{item.planned?'Planejada':loading?'Consultando…':error?'Não verificado':statuses?.[item.id]?.label || 'Não verificado'}</span>
        </button>)}</div>
      </section>)}
      {!filtered.length && <section className={styles.detail}><h2>Nenhuma ferramenta encontrada</h2><p>Experimente outra pesquisa ou categoria.</p><button className="central-action" onClick={()=>{setSearch('');setCategory('all')}}>Limpar filtros</button></section>}
    </>}
  </main>
}
