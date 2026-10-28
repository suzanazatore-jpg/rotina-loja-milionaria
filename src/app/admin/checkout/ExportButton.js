'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
export default function ExportButton({section='tudo',filters={},label='Baixar Excel',disabled=false}) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function download() {
    setBusy(true);setError('')
    try {
      const {data:{session}}=await supabase.auth.getSession()
      if(!session)throw new Error('Entre na sua conta para exportar.')
      const qs=new URLSearchParams({section,...Object.fromEntries(Object.entries(filters).filter(([,value])=>value))})
      const response=await fetch(`/api/admin/checkout/exportar?${qs}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'})
      if(!response.ok){const json=await response.json();throw new Error(json.error || 'Não foi possível exportar.')}
      const url=URL.createObjectURL(await response.blob())
      const link=document.createElement('a');link.href=url;link.download=`central-${section}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
    } catch(error){setError(error.message)} finally {setBusy(false)}
  }
  return <span style={{display:'inline-grid',gap:6}}><button type="button" className="central-action cv-export" disabled={disabled || busy} onClick={download}>{busy?'Gerando planilha…':label}</button>{error && <small role="alert" style={{color:'var(--cv-danger)',maxWidth:300}}>{error}</small>}</span>
}
