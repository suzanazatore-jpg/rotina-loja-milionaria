'use client'
import { useEffect,useState } from 'react'
const actions = {insert:'Cadastro',update:'Alteração',import_activate:'Importação e ativação'}
export default function CatalogAudit({productId,offerId,token}) {
  const [data,setData]=useState(null)
  const [page,setPage]=useState(1)
  const [error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    const params=new URLSearchParams({page:String(page),...(productId?{produto:productId}:{}),...(offerId?{oferta:offerId}:{})})
    fetch(`/api/admin/checkout/auditoria?${params}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal}).then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error);if(!controller.signal.aborted)setData(json)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>controller.abort()
  },[productId,offerId,token,page])
  return <section className="central-chart-panel"><h2>Histórico de alterações</h2><p className="central-data-note">Registro de cadastros e alterações a partir desta atualização. O executor identifica a conta ou integração que realizou a operação.</p>{error && <p role="alert">{error}</p>}<div className="central-table-wrap"><table className="central-table"><thead><tr><th>Data</th><th>Ação</th><th>Cadastro</th><th>Campos alterados</th><th>Executor</th></tr></thead><tbody>{data?.rows.map(row=><tr key={row.id}><td>{new Date(row.received_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</td><td>{actions[row.payload.action] || row.payload.action}</td><td>{row.payload.name || 'Catálogo'}<small>{row.payload.entity}</small></td><td>{(row.payload.changed_fields || []).join(', ') || '—'}</td><td>{row.payload.actor || 'Administração'}</td></tr>)}{!data?.rows.length && <tr><td colSpan={5}>{error?'Consulta indisponível.':!data?'Carregando…':'Nenhuma alteração registrada para este cadastro.'}</td></tr>}</tbody></table></div>{data && <div className="central-editor-actions"><button className="central-action" disabled={page===1} onClick={()=>{setData(null);setError('');setPage(p=>p-1)}}>Anterior</button><span>Página {page}</span><button className="central-action" disabled={page*25>=data.count} onClick={()=>{setData(null);setError('');setPage(p=>p+1)}}>Próxima</button></div>}</section>
}
