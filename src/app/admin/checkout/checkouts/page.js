'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CheckoutPreview from '../CheckoutPreview'
import { CHECKOUT_DEFAULTS } from '@/lib/checkoutSettings'
import './checkouts.css'
const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const editor = offer => `/admin/checkout/produtos/${offer.product_id}/ofertas/${offer.id}`
function Preview({ offer, product, onClose }) {
  const ref = useRef(null)
  const [device, setDevice] = useState('desktop')
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog className="checkout-catalog-preview" ref={ref} aria-labelledby="checkout-preview-title" onCancel={event => { event.preventDefault(); onClose() }}><header><div><h2 id="checkout-preview-title">{offer.name}</h2><p>Prévia visual. Nenhum pagamento é realizado aqui.</p></div><button className="central-action" onClick={onClose} aria-label="Fechar prévia">× Fechar</button></header><div className="checkout-preview-controls" role="group" aria-label="Formato da prévia">{[['desktop','Computador'],['mobile','Celular']].map(([key,label]) => <button key={key} className="central-action" aria-pressed={device === key} onClick={() => setDevice(key)}>{label}</button>)}</div><CheckoutPreview config={{ ...CHECKOUT_DEFAULTS, ...offer.checkout_config }} offer={{ ...offer, price: (offer.price_cents / 100).toFixed(2) }} product={product} device={device} /></dialog>
}
export default function CheckoutCatalog() {
  const [catalog, setCatalog] = useState({ produtos: [], ofertas: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [productId, setProductId] = useState('')
  const [preview, setPreview] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (controller.signal.aborted) return
        setLoading(true); setError('')
        if (!session) throw new Error('Entre na sua conta para consultar os checkouts.')
        const response = await fetch('/api/admin/checkout', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: controller.signal })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Não foi possível carregar os checkouts.')
        if (!controller.signal.aborted) setCatalog({ produtos: json.produtos || [], ofertas: json.ofertas || [] })
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load(); return () => controller.abort()
  }, [refresh])
  const rows = catalog.ofertas.map(offer => ({ ...offer, product: catalog.produtos.find(product => product.id === offer.product_id) })).filter(offer => offer.product)
  const active = row => row.active && row.product.active
  const visible = rows.filter(row => (!productId || row.product_id === productId) && (status === 'all' || active(row) === (status === 'active')) && `${row.name} ${row.product.name} ${row.slug}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))
  const withoutOffers = catalog.produtos.filter(product => !catalog.ofertas.some(offer => offer.product_id === product.id))
  async function copy(offer) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/checkout/${offer.slug}`); setNotice(active(offer) ? 'Link copiado. A disponibilidade do pagamento depende da configuração do checkout.' : 'Link copiado. A página só ficará disponível quando produto e oferta estiverem ativos.') }
    catch { setError('Não foi possível copiar. Selecione o link exibido e copie manualmente.') }
  }
  return <main className="central-home"><div className="central-dashboard-heading"><div><span className="central-eyebrow">PÁGINAS DE PAGAMENTO</span><h1>Checkouts</h1><p>Configure a página de cada oferta, confira o visual e copie o link de compra.</p></div><Link className="central-primary" href="/admin/checkout">+ Criar oferta</Link></div>
    {error && <p role="alert" className="central-editor-message">{error}</p>}{notice && <p role="status" className="central-editor-message">{notice}</p>}
    <section className="central-chart-panel"><div className="central-section-heading"><h2>Suas páginas de pagamento</h2><button className="central-action" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Atualizar</button></div><p className="central-data-note">Cada oferta tem seu próprio checkout. A prévia funciona mesmo com a oferta inativa. Ativar uma página não substitui a configuração e o teste do pagamento.</p>
      <div className="checkout-catalog-filters"><label>Buscar<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do produto ou da oferta" /></label><label>Produto<select value={productId} onChange={event => setProductId(event.target.value)}><option value="">Todos</option>{catalog.produtos.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Página<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Pausadas</option></select></label></div>
      <div className="central-table-wrap"><table className="central-table"><thead><tr><th>Produto / Oferta</th><th>Valor</th><th>Página</th><th>Ações</th></tr></thead><tbody>{!loading && visible.map(offer => <tr key={offer.id}><td>{offer.product.name}<small>{offer.name}</small><code className="checkout-catalog-link">/checkout/{offer.slug}</code></td><td>{money(offer.price_cents)}<small>{offer.product.type === 'subscription' ? 'Assinatura' : 'Pagamento único'}</small></td><td><span className="central-badge">{active(offer) ? 'Ativa' : 'Pausada'}</span>{!offer.product.active && <small>Produto inativo</small>}{!offer.active && <small>Oferta inativa</small>}</td><td><div className="checkout-catalog-actions"><button className="central-action" onClick={() => setPreview(offer)}>Ver prévia</button><Link className="central-action" href={`${editor(offer)}#checkout`}>Configurar página</Link><button className="central-action" onClick={() => copy(offer)}>Copiar link</button>{active(offer) && <Link className="central-action" href={`/checkout/${offer.slug}`} target="_blank" rel="noopener noreferrer">Abrir página ↗</Link>}<Link className="central-action" href={editor(offer)}>Editar oferta</Link></div></td></tr>)}{(loading || !visible.length) && <tr><td colSpan={4}>{loading ? 'Carregando checkouts…' : rows.length ? 'Nenhum checkout corresponde aos filtros.' : 'Nenhuma oferta cadastrada. Crie uma oferta para configurar seu checkout.'}</td></tr>}</tbody></table></div>
    </section>
    {!loading && withoutOffers.length > 0 && <section className="central-chart-panel checkout-catalog-pending"><h2>Produtos sem checkout</h2><p className="central-data-note">Crie a primeira oferta desses produtos para definir preço, pagamento e página.</p><ul>{withoutOffers.map(product => <li key={product.id}><span>{product.name}</span><Link className="central-action" href={`/admin/checkout/produtos/${product.id}/ofertas/nova`}>Criar oferta</Link></li>)}</ul></section>}
    {preview && <Preview offer={preview} product={preview.product} onClose={() => setPreview(null)} />}
  </main>
}
