'use client'
import Link from 'next/link'
import ExportButton from './ExportButton'
import {useState} from 'react'
import styles from './ProductInterior.module.css'
const money=n=>(Number(n || 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
export default function ProductOffers({product,offers,onCreate,onDuplicate,onToggle,onCopy,busy}) {
  const [filterOpen,setFilterOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [status,setStatus]=useState('all')
  const visible=offers.filter(o=>o.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (status==='all' || o.active===(status==='active')))
  return <><ExportButton section="ofertas" filters={{produto:product.id}} label="Baixar ofertas · Excel"/><button className={styles.createOffer} onClick={onCreate}>＋ Criar oferta</button><section className={styles.panel}><div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>Ofertas</h2><button className={styles.filterButton} aria-expanded={filterOpen} onClick={()=>setFilterOpen(open=>!open)}>▽ Filtros</button></div><span className={styles.count}>{visible.length} de {offers.length}</span>{filterOpen && <div className={styles.filters}><label>Nome<input value={query} onChange={e=>setQuery(e.target.value)} /></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select></label></div>}
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Nome</th><th>Quantidade</th><th>Valor total</th><th><span className={styles.srOnly}>Ações</span></th></tr></thead><tbody>{visible.map(o=><tr key={o.id}><td><Link href={`/admin/checkout/produtos/${product.id}/ofertas/${o.id}`} className={styles.textLink}>{o.name}</Link></td><td>1</td><td>{money(o.price_cents)}</td><td><div className={styles.rowActions}><Link href={`/admin/checkout/produtos/${product.id}/ofertas/${o.id}#checkout`} className={styles.textLink}>Checkout</Link><button className={styles.iconButton} title="Copiar link de pagamento" aria-label={`Copiar link de ${o.name}`} onClick={()=>onCopy(o)}>↗</button><button className={styles.iconButton} disabled={busy} title="Duplicar oferta" aria-label={`Duplicar oferta ${o.name}`} onClick={()=>onDuplicate(o)}>⧉</button><input type="checkbox" role="switch" className={styles.offerSwitch} checked={o.active} disabled={busy} aria-label={`Oferta ${o.name} ativa`} onChange={()=>onToggle(o)}/></div></td></tr>)}{!visible.length && <tr><td colSpan={4} className={styles.empty}>{offers.length?'Nenhuma oferta corresponde aos filtros.':'Nenhuma oferta cadastrada.'}</td></tr>}</tbody></table></div>
  </section></>
}
