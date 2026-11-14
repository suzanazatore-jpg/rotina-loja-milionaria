'use client'
import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import CentralIcon from '@/app/admin/central-vendas/CentralIcon'
import {calendarDate,monthStart,monthDays,shortcutRange,orderedRange} from '@/lib/calendarRange'

const display=value=>value?value.split('-').reverse().join('/'):'dd/mm/aaaa'
const localToday=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
const monthName=value=>calendarDate(value).toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'})
const fullDate=value=>calendarDate(value).toLocaleDateString('pt-BR',{dateStyle:'full',timeZone:'UTC'})

export default function DateRangePicker({filters,change}) {
 const [open,setOpen]=useState(false),anchor=useRef(null),id=useId()
 return <div className="cv-period"><span className="cv-period-label" id={`${id}-label`}>Período</span><button ref={anchor} type="button" className="cv-range-trigger" aria-label={`Escolher período: ${display(filters.inicio)} a ${display(filters.fim)}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>De&nbsp; {display(filters.inicio)}&nbsp; a&nbsp; {display(filters.fim)}</span><span className="cv-period-calendar"><CentralIcon name="calendar" size={17}/></span></button>{open&&<Calendar filters={filters} change={change} anchor={anchor} onClose={()=>{setOpen(false);anchor.current?.focus({preventScroll:true})}}/>}</div>
}

function Calendar({filters,change,anchor,onClose}) {
 const today=localToday(),[month,setMonth]=useState(()=>monthStart(filters.fim || today,-1)),[start,setStart]=useState(null),[hover,setHover]=useState(null),[position,setPosition]=useState(null),panel=useRef(null),focused=useRef(false),close=useRef(onClose)
 useEffect(()=>{close.current=onClose},[onClose])
 useEffect(()=>{
  const place=()=>{const rect=anchor.current.getBoundingClientRect(),width=Math.min(512,window.innerWidth-24),height=Math.min(375,window.innerHeight-24),style=getComputedStyle(anchor.current);setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+1,window.innerHeight-height-12)),fontFamily:style.fontFamily,'--range-panel':style.getPropertyValue('--cv-panel'),'--range-text':style.getPropertyValue('--cv-text'),'--range-action':style.getPropertyValue('--cv-action')})}
  place()
  const dismiss=e=>{if(!panel.current?.contains(e.target)&&!anchor.current?.contains(e.target))close.current()}
  document.addEventListener('pointerdown',dismiss)
  window.addEventListener('resize',place)
  window.addEventListener('scroll',place,true)
  return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
 },[anchor])
 useEffect(()=>{if(position&&!focused.current){(panel.current.querySelector('button[data-day][aria-pressed="true"]') || panel.current.querySelector('button[data-day]'))?.focus({preventScroll:true});focused.current=true}},[position])
 const commit=range=>{change('inicio',range.inicio);change('fim',range.fim);onClose()}
 const select=value=>{if(start)commit(orderedRange(start,value));else{setStart(value);setHover(null)}}
 const selected=start?orderedRange(start,hover || start):{inicio:filters.inicio,fim:filters.fim}
 const preset=months=>commit(shortcutRange(today,months))
 const move=offset=>setMonth(m=>monthStart(m,offset))
 const focusDay=(e,value)=>{const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(!(e.key in offsets))return;e.preventDefault();const date=calendarDate(value);date.setUTCDate(date.getUTCDate()+offsets[e.key]);const target=panel.current.querySelector(`[data-day="${date.toISOString().slice(0,10)}"]`);target?.focus()}
 return createPortal(<div ref={panel} data-cv-calendar="true" className="cv-range-calendar" role="dialog" aria-label="Selecionar período" style={position || {visibility:'hidden'}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}>
  <div className="cv-range-presets"><span>Últimos</span>{[[0,'28 Dias'],[3,'3 Meses'],[6,'6 Meses'],[12,'12 Meses']].map(([n,label])=>{const range=shortcutRange(today,n);return <button type="button" key={n} aria-pressed={!start&&filters.inicio===range.inicio&&filters.fim===range.fim} onClick={()=>preset(n)}>{label}</button>})}</div>
  <div className="cv-range-nav"><button type="button" aria-label="Mês anterior" onClick={()=>move(-1)}>‹</button><span>{calendarDate(month).getUTCFullYear()===calendarDate(monthStart(month,1)).getUTCFullYear()?calendarDate(month).getUTCFullYear():`${calendarDate(month).getUTCFullYear()} / ${calendarDate(monthStart(month,1)).getUTCFullYear()}`}</span><button type="button" aria-label="Próximo mês" onClick={()=>move(1)}>›</button></div>
  <div className="cv-range-months">{[month,monthStart(month,1)].map(value=><section key={value} aria-label={`${monthName(value)} de ${calendarDate(value).getUTCFullYear()}`}><h4>{monthName(value)}</h4><div className="cv-range-days">{['S','T','Q','Q','S','S','D'].map((day,index)=><span className="cv-range-weekday" key={index}>{day}</span>)}{monthDays(value).map((day,index)=>{if(!day)return <span key={`empty-${index}`}/>;const first=day===selected.inicio,last=day===selected.fim,inside=selected.inicio&&selected.fim&&day>=selected.inicio&&day<=selected.fim;return <button type="button" key={day} data-day={day} disabled={day>today} className={`${inside?'in-range ':''}${first?'range-start ':''}${last?'range-end':''}`} aria-label={fullDate(day)} aria-pressed={Boolean(inside)} aria-current={day===today?'date':undefined} onClick={()=>select(day)} onMouseEnter={()=>start&&day<=today&&setHover(day)} onKeyDown={e=>focusDay(e,day)}>{Number(day.slice(-2))}</button>})}</div></section>)}</div>
  <div className="cv-range-instruction" role="status">{start?'Selecione a data final':'Selecione a data inicial e a final'}</div>
 </div>,document.body)
}
