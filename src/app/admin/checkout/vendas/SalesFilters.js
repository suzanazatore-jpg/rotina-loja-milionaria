'use client'
import {useState} from 'react'
import CentralIcon from '@/app/admin/central-vendas/CentralIcon'
import {FilterDialog,FilterSection,statusLabels} from '../CentralUI'

function Period({filters,change}) {
 const [shortcuts,setShortcuts]=useState(false)
 const range=months=>{
  const end=new Date(),start=new Date(end)
  if(months)start.setMonth(start.getMonth()-months)
  else start.setDate(start.getDate()-27)
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  change('inicio',iso(start));change('fim',iso(end));setShortcuts(false)
 }
 return <div className="cv-period"><span className="cv-period-label">Período</span><div className="cv-period-line"><span>De</span><input aria-label="Data inicial" type="date" value={filters.inicio} max={filters.fim || undefined} onChange={e=>change('inicio',e.target.value)}/><span>a</span><input aria-label="Data final" type="date" value={filters.fim} min={filters.inicio || undefined} onChange={e=>change('fim',e.target.value)}/><button type="button" aria-label="Atalhos de período" aria-expanded={shortcuts} className="cv-period-calendar" onClick={()=>setShortcuts(v=>!v)}><CentralIcon name="calendar" size={17}/></button></div>{shortcuts&&<div className="cv-period-shortcuts"><span>Últimos</span>{[[0,'28 Dias'],[3,'3 Meses'],[6,'6 Meses'],[12,'12 Meses']].map(([n,label])=><button type="button" key={n} onClick={()=>range(n)}>{label}</button>)}</div>}</div>
}

export default function SalesFilters({filters,change,products,onClose,onApply,onClear}) {
 return <FilterDialog floating onClose={onClose} onApply={onApply} onClear={onClear}>
  <FilterSection title="Datas"><fieldset className="cv-radios cv-sales-dates"><legend className="cv-sr-only">Data de referência</legend>{[['paid_at','Aprovada Em'],['created_at','Criada Em']].map(([key,label])=><label key={key}><input name="sales-date-by" type="radio" checked={filters.date_by===key} onChange={()=>change('date_by',key)}/>{label}</label>)}</fieldset><Period filters={filters} change={change}/></FilterSection>
  <FilterSection title="Características"><label>Provedor<select value={filters.marketplace} onChange={e=>change('marketplace',e.target.value)}><option value="">Todos</option><option value="pagarme">Pagar.me</option></select></label><label>ID do Provedor<input value={filters.code} onChange={e=>change('code',e.target.value)}/></label><label>Formas de Pagamento<select value={filters.method} onChange={e=>change('method',e.target.value)}><option value="">Todas</option><option value="pix">Pix</option><option value="credit_card">Cartão de crédito</option></select></label><label>Status<select value={filters.status} onChange={e=>change('status',e.target.value)}><option value="todos">Todos</option>{Object.entries(statusLabels).filter(([key])=>!['active','past_due'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></FilterSection>
  <FilterSection title="Comprador">{[['name','Nome'],['email','Email'],['document','Documento']].map(([key,label])=><label key={key}>{label}<input type="text" value={filters[key]} onChange={e=>change(key,e.target.value)}/></label>)}</FilterSection>
  <FilterSection title="Produto"><label>Produtos<select value={filters.produto} onChange={e=>change('produto',e.target.value)}><option value="">Todos</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></FilterSection>
  <FilterSection title="Vendas Rastreadas"><fieldset className="cv-radios cv-sales-tracking"><legend className="cv-sr-only">Rastreamento por UTM</legend>{[['','Todas'],['with','Com'],['without','Sem']].map(([value,label])=><label key={value}><input type="radio" name="sales-tracking" checked={filters.tracking===value} onChange={()=>change('tracking',value)}/>{label}</label>)}</fieldset><label>Origem (UTM)<input value={filters.source} onChange={e=>change('source',e.target.value)}/></label><p className="cv-filter-hint">Considera os parâmetros UTM registrados na venda.</p></FilterSection>
 </FilterDialog>
}
