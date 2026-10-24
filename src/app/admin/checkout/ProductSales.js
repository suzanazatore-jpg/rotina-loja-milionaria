'use client'
import {useEffect,useRef,useState} from 'react'
import styles from './ProductInterior.module.css'
const money=n=>(Number(n || 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const date=d=>d?new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'
const statuses={paid:'Pago',waiting_payment:'Aguardando pagamento',pending:'Pendente',failed:'Falhou',canceled:'Cancelado',refunded:'Reembolsado',chargedback:'Contestação',processing:'Processando',authorized:'Autorizado'}
function SaleDetails({order,onClose}) {
  const ref=useRef(null)
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog className={styles.dialog} ref={ref} aria-labelledby="product-sale-title" onCancel={e=>{e.preventDefault();onClose()}}><header><h2 id="product-sale-title">Detalhes da venda</h2><button className="central-action" onClick={onClose}>Fechar ×</button></header><dl><dt>Código</dt><dd>{order.pagarme_order_id || order.id}</dd><dt>Contato</dt><dd>{order.customer?.name} · {order.customer?.email}</dd><dt>Valor</dt><dd>{money(order.total_cents)}</dd><dt>Status</dt><dd>{statuses[order.status] || order.status}</dd><dt>Criada em</dt><dd>{date(order.created_at)}</dd><dt>Pagamento</dt><dd>{order.payment_method==='pix'?'Pix':'Cartão'} · {order.installments}x</dd><dt>Itens</dt><dd>{order.items?.map(item=><p key={item.id}>{item.product_name} — {money(item.price_cents)}</p>)}</dd></dl></dialog>
}
export default function ProductSales({productId,token}) {
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [page,setPage]=useState(1)
  const [filters,setFilters]=useState({status:'todos',inicio:'',fim:''})
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [selected,setSelected]=useState(null)
  const [opening,setOpening]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    const params=new URLSearchParams({...filters,produto:productId,page:String(page)})
    fetch(`/api/admin/checkout/vendas?${params}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal}).then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error || 'Não foi possível consultar as vendas.');if(!controller.signal.aborted)setData(json)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>controller.abort()
  },[productId,token,page,filters])
  function filter(key,value){setFilters(current=>({...current,[key]:value}));setPage(1);setData(null);setError('')}
  async function open(id){setOpening(true);setError('');try{const response=await fetch(`/api/admin/checkout/vendas?id=${id}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const json=await response.json();if(!response.ok)throw new Error(json.error);setSelected(json.order)}catch(e){setError(e.message)}finally{setOpening(false)}}
  return <section className={styles.panel}><div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>Vendas</h2><button className={styles.filterButton} aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}>▽ Filtros</button></div><span className={styles.count}>{data?`${data.orders.length} de ${data.count}`:'Carregando…'}</span>{filtersOpen && <div className={styles.filters}><label>De<input type="date" value={filters.inicio} max={filters.fim || undefined} onChange={e=>filter('inicio',e.target.value)}/></label><label>Até<input type="date" value={filters.fim} min={filters.inicio || undefined} onChange={e=>filter('fim',e.target.value)}/></label><label>Status<select value={filters.status} onChange={e=>filter('status',e.target.value)}><option value="todos">Todos</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>}{error && <p role="alert" className="central-error">{error}</p>}
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th><span className={styles.srOnly}>Status</span></th><th>Código</th><th>Contato</th><th>Produto</th><th>Criada em</th><th>Valor</th><th><span className={styles.srOnly}>Pagamento</span></th></tr></thead><tbody>{data?.orders.map(o=><tr key={o.id}><td><span title={statuses[o.status] || o.status} aria-label={statuses[o.status] || o.status} className={o.status==='paid'?styles.paid:styles.pending}>{o.status==='paid'?'✓':'◷'}</span></td><td><button className={styles.textLink} disabled={opening} onClick={()=>open(o.id)}>{o.pagarme_order_id || o.id.slice(0,8)}</button></td><td>{o.customer?.name || '—'}</td><td>{o.product_name}</td><td>{date(o.created_at)}</td><td>{money(o.total_cents)}</td><td title={o.payment_method==='pix'?'Pix':'Cartão'}>{o.payment_method==='pix'?'◇':'▤'}</td></tr>)}{data?.orders.length===0 && <tr><td colSpan={7} className={styles.empty}>Nenhuma venda encontrada.</td></tr>}</tbody></table></div>{data && data.count>25 && <div className={styles.pagination}><button className="central-action" disabled={page===1} onClick={()=>{setPage(p=>p-1);setData(null)}}>Anterior</button><span>Página {page}</span><button className="central-action" disabled={page*25>=data.count} onClick={()=>{setPage(p=>p+1);setData(null)}}>Próxima</button></div>}{selected && <SaleDetails order={selected} onClose={()=>setSelected(null)}/>}</section>
}
