'use client'
import {useEffect,useId,useRef,useState} from 'react'
import CentralIcon from '@/app/admin/central-vendas/CentralIcon'

export default function FloatingFilters({title,children,onClose,onApply,onClear,busy}) {
 const panel=useRef(null),trigger=useRef(null),close=useRef(onClose),id=useId()
 const [position,setPosition]=useState({top:160,right:24})
 useEffect(()=>{close.current=onClose},[onClose])
 useEffect(()=>{
  const element=panel.current
  trigger.current=document.activeElement
  const anchor=trigger.current?.getBoundingClientRect()
  const reposition=()=>setPosition({top:Math.max(66,Math.min(anchor?.bottom+10 || 160,window.innerHeight-300)),right:Math.max(16,window.innerWidth-(anchor?.right || window.innerWidth-24))})
  reposition()
  element.querySelector('input,select,button')?.focus({preventScroll:true})
  const dismiss=e=>{if(!element.contains(e.target)&&!trigger.current?.contains(e.target)&&!e.target.closest('[data-cv-calendar]'))close.current()}
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close.current()}}
  document.addEventListener('pointerdown',dismiss)
  document.addEventListener('keydown',key)
  window.addEventListener('resize',reposition)
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key);window.removeEventListener('resize',reposition);trigger.current?.focus({preventScroll:true})}
 },[])
 return <div ref={panel} className="cv-floating-filter" role="dialog" aria-labelledby={id} style={{'--filter-top':`${position.top}px`,'--filter-right':`${position.right}px`}}>
  <h2 className="cv-sr-only" id={id}>{title}</h2>
  <button type="button" className="central-action cv-floating-close" onClick={onClose}><CentralIcon name="close" size={15}/>Fechar</button>
  <form onSubmit={e=>{e.preventDefault();onApply()}}>
   <div className="cv-filter-content">{children}</div>
   <footer><button type="button" className="cv-filter-clear" onClick={onClear}>Limpar Filtros</button><button className="central-primary" disabled={busy}>Filtrar</button></footer>
  </form>
 </div>
}
