'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ExportButton from './ExportButton'
import { FormProduto } from './CheckoutForms'
import ProductDetails from './ProductDetails'
import ProductOffers from './ProductOffers'
import ProductSales from './ProductSales'
import interior from './ProductInterior.module.css'
import CatalogAudit from './CatalogAudit'
import productStyles from './ProductCatalog.module.css'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = 'var(--cv-gold)'
const ouroGrad = 'linear-gradient(135deg, var(--cv-gold), var(--cv-gold))'
const campo = {
  width: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', border: '1px solid var(--cv-border)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', marginTop: 5,
}
const rotulo = { display: 'block', fontSize: 13, color: 'var(--cv-text)' }
const dica = { display: 'block', color: 'var(--cv-muted)', fontSize: 11, marginTop: 5 }
const botaoSecundario = { background: 'var(--cv-field)', color: ouro, border: '1px solid var(--cv-border)', borderRadius: '7px', padding: '7px 10px', cursor: 'pointer', fontSize: 13 }

const PRODUTO_VAZIO = { name: '', type: 'one_time', marketplace_id:'pagarme', plan_id: '', brevo_list_id: '', botconversa_tag: '', active: true }

export default function AdminCheckout({ initialProdutoId = null }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [produtos, setProdutos] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [planos, setPlanos] = useState([])
  const [extraOpen,setExtraOpen] = useState(false)
  const [statusFilter,setStatusFilter] = useState('all')
  const [typeFilter,setTypeFilter] = useState('all')
  const [marketplaceFilter,setMarketplaceFilter] = useState('all')
  const [marketplaces,setMarketplaces] = useState([])
  const [filtersOpen,setFiltersOpen] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [formProduto, setFormProduto] = useState(null) // { id?, dados }
  const [salvando, setSalvando] = useState(false)
  const produtoId = initialProdutoId
  const [aba, setAba] = useState('detalhes')
  const [busca, setBusca] = useState('')

  const api = useCallback(async (metodo, corpo, tk = token) => {
    const resposta = await fetch('/api/admin/checkout', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const json = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(json.error || 'Erro inesperado.')
    return json
  }, [token])

  const carregar = useCallback(async (tk) => {
    try {
      const dados = await api('GET', null, tk)
      setProdutos(dados.produtos || []); setOfertas(dados.ofertas || [])
      setPlanos(dados.planos || []); setMarketplaces(dados.marketplaces || [])
    } catch (e) { setMensagem(e.message) }
  }, [api])

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token)
      await carregar(session.access_token)
      setCarregando(false)
    }
    iniciar()
  }, [router, carregar])


  async function salvarProduto(e) {
    e.preventDefault(); setSalvando(true); setMensagem('')
    try {
      await api('POST', { entidade: 'produto', id: formProduto.id, dados: formProduto.dados })
      setFormProduto(null); await carregar(); setMensagem('✓ Produto salvo.')
    } catch (err) { setMensagem(err.message) }
    setSalvando(false)
  }

  async function alternar(entidade, item) {
    setSalvando(true)
    try {
      await api('PATCH', { entidade, id: item.id, active: !item.active })
      await carregar()
    } catch (err) { setMensagem(err.message) } finally { setSalvando(false) }
  }

  async function salvarDetalhe(dados) {
    setSalvando(true);setMensagem('')
    try {await api('POST',{entidade:'produto',id:produtoId,dados});await carregar();setMensagem('✓ Produto salvo.')} finally{setSalvando(false)}
  }

  function novaOferta(produto) {
    router.push(`/admin/checkout/produtos/${encodeURIComponent(produto.id)}/ofertas/nova`)
  }

  function linkCheckout(o) {
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/checkout/${o.slug}`
  }

  async function copiarLink(o) {try{await navigator.clipboard.writeText(linkCheckout(o));setMensagem('✓ Link copiado.')}catch{setMensagem('Não foi possível copiar o link.')}}

  const visibleProducts = produtos.filter(p => `${p.name} ${p.slug} ${p.code}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')) && (statusFilter === 'all' || p.active === (statusFilter === 'active')) && (typeFilter === 'all' || p.type === typeFilter) && (marketplaceFilter === 'all' || (p.marketplace_id || 'pagarme') === marketplaceFilter)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
  async function duplicarOferta(o) {
    setSalvando(true); setMensagem('')
    try {const result=await api('POST',{entidade:'oferta',id:o.id,action:'duplicate'}); router.push(`/admin/checkout/produtos/${o.product_id}/ofertas/${result.id}`)} catch(error){setMensagem(error.message)} finally{setSalvando(false)}
  }
  async function duplicarProduto(p) {
    setSalvando(true);setMensagem('')
    try {const result=await api('POST',{entidade:'produto',id:p.id,action:'duplicate'});router.push(`/admin/checkout/produtos/${result.id}`)} catch(error){setMensagem(error.message)} finally{setSalvando(false)}
  }
  const nomeMarketplace = id => marketplaces.find(m=>m.id===(id || 'pagarme'))?.name || (id || 'Pagar.me')
  const selecionado = produtos.find(p => p.id === produtoId)

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />
  if (produtoId && !selecionado) return <div className="central-error" role="alert">{mensagem || 'Produto não encontrado.'}<p><Link href="/admin/checkout">Voltar para Produtos</Link></p></div>

  return (
    <div style={{ minHeight: '100%', background: 'var(--cv-bg)', color: 'var(--cv-text)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
  <main style={{ width: '100%', margin: 0, padding: '26px 18px 60px' }}>
        {!selecionado && <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>CHECKOUT</p>
            <h1 style={{ fontSize: '24px', margin: '5px 0' }}>{selecionado ? selecionado.name : 'Produtos'}</h1>
            {selecionado && <p style={{ color: 'var(--cv-muted)', margin: 0 }}>O produto é o que a aluna recebe. A oferta é como ele é vendido: preço, parcelas e link do checkout.</p>}
          </div>
          <ExportButton section="catalogo" label="Baixar Excel"/><button onClick={() => { setMensagem(''); setFormProduto({ dados: { ...PRODUTO_VAZIO } }) }} style={{ background: 'var(--cv-gold)', color: 'var(--cv-on-gold)', border: 0, borderRadius: '999px', padding: '11px 18px', fontWeight: 900, cursor: 'pointer' }}>＋ Adicionar produto</button>
        </div>}

        {mensagem && <div style={{ background: 'var(--cv-selected)', border: '1px solid #5b4c17', color: 'var(--cv-gold)', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

        {!produtos.length && !mensagem && <div style={{ background: 'var(--cv-panel)', border: '1px dashed var(--cv-border)', borderRadius: 14, padding: 30, textAlign: 'center', color: 'var(--cv-muted)' }}>Nenhum produto ainda. Comece cadastrando o primeiro.</div>}

        {!selecionado ? <>
          <div className={productStyles.toolbar}><span className={productStyles.count}>{visibleProducts.length} de {produtos.length}</span><button type="button" className={productStyles.filterButton} aria-expanded={filtersOpen} aria-controls="product-filters" onClick={()=>setFiltersOpen(open=>!open)}>▽ Filtros</button></div>
          {filtersOpen && <div id="product-filters" className={productStyles.filters}><label>Nome ou código<input style={campo} value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar produto"/></label><label>Marketplace<select style={campo} value={marketplaceFilter} onChange={e=>setMarketplaceFilter(e.target.value)}><option value="all">Todos</option>{marketplaces.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Tipo<select style={campo} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">Todos</option><option value="one_time">Produto</option><option value="subscription">Assinatura</option></select></label><label>Status<select style={campo} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label><button className="central-action" onClick={()=>{setBusca('');setMarketplaceFilter('all');setTypeFilter('all');setStatusFilter('all')}}>Limpar</button></div>}
          <div className={productStyles.tableWrap}><table className={productStyles.table}><thead><tr><th>Nome</th><th>Código</th><th>Marketplace</th><th><span className={productStyles.srOnly}>Ações</span></th></tr></thead><tbody>{visibleProducts.map(p=><tr key={p.id}><td><Link className={productStyles.productName} href={`/admin/checkout/produtos/${encodeURIComponent(p.id)}`}>{p.name}</Link></td><td>{p.code || p.id}</td><td>{nomeMarketplace(p.marketplace_id)}</td><td><div className={productStyles.actions}><Link className={productStyles.productOpen} href={`/admin/checkout/produtos/${encodeURIComponent(p.id)}`} title={p.type==='subscription'?'Abrir assinatura':'Abrir produto'} aria-label={`Abrir ${p.type==='subscription'?'assinatura':'produto'} ${p.name}`}><ProductIcon kind={p.type}/></Link><button className={productStyles.duplicate} disabled={salvando} title="Duplicar produto" aria-label={`Duplicar ${p.name}`} onClick={()=>duplicarProduto(p)}><ProductIcon kind="copy"/></button></div></td></tr>)}{!visibleProducts.length && <tr><td colSpan={4}>Nenhum produto encontrado.</td></tr>}</tbody></table></div>

        </> : <>
          <div className={interior.topbar}><div className={interior.breadcrumb}><Link href="/admin/checkout">Produtos</Link><span>/</span><span>{selecionado.name}</span></div><details className={interior.additional}><summary>⚙ Configurações adicionais ⌄</summary><div><button onClick={()=>{setAba('detalhes');setExtraOpen(open=>!open)}}>Plano e integrações</button><Link href="/admin/checkout/configuracoes">Padrões de checkout</Link></div></details></div>
          <nav className="central-product-tabs" aria-label="Abas do produto">{[['detalhes','Detalhe'],['ofertas','Ofertas'],['vendas','Vendas'],['auditoria','Auditoria']].map(([key,label])=><button key={key} aria-current={aba===key?'page':undefined} onClick={()=>setAba(key)}>{label}</button>)}</nav>
          {<div hidden={aba!=='detalhes'}><ProductDetails key={`${selecionado.id}:${selecionado.updated_at || ''}`} product={selecionado} offers={ofertas.filter(o=>o.product_id===selecionado.id)} marketplaces={marketplaces} plans={planos} token={token} onSave={salvarDetalhe} saving={salvando} advanced={extraOpen}/></div>}
          {aba==='ofertas' && <ProductOffers product={selecionado} offers={ofertas.filter(o=>o.product_id===produtoId)} onCreate={()=>novaOferta(selecionado)} onDuplicate={duplicarOferta} onToggle={o=>alternar('oferta',o)} onCopy={copiarLink} busy={salvando}/>}
          {aba==='vendas' && <ProductSales productId={selecionado.id} token={token}/>}
          {aba==='auditoria' && <CatalogAudit productId={selecionado.id} token={token}/>}

        </>}
      </main>

      {formProduto && !formProduto.id && (
        <Modal titulo={formProduto.id ? 'Editar produto' : 'Adicionar produto'} sub="O que a aluna recebe ao comprar." onFechar={() => !salvando && setFormProduto(null)} onSalvar={salvarProduto} salvando={salvando} textoBotao="Salvar produto">
          <FormProduto dados={formProduto.dados} planos={planos} marketplaces={marketplaces} editando={!!formProduto.id} onChange={dados => setFormProduto(f => ({ ...f, dados }))} />
        </Modal>
      )}


    </div>
  )
}

function Modal({ titulo, sub, onFechar, onSalvar, salvando, textoBotao, children }) {
  return (
    <div onMouseDown={e => e.target === e.currentTarget && onFechar()} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <form onSubmit={onSalvar} style={{ width: 'min(620px,100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--cv-panel)', border: '1px solid #373238', borderRadius: 18, boxShadow: '0 28px 90px #000', color: 'var(--cv-text)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '18px 20px', background: 'var(--cv-panel)', borderBottom: '1px solid var(--cv-border)' }}>
          <div><h2 style={{ fontSize: 18, margin: 0 }}>{titulo}</h2><p style={{ color: 'var(--cv-muted)', fontSize: 12, margin: '4px 0 0' }}>{sub}</p></div>
          <button type="button" onClick={onFechar} disabled={salvando} aria-label="Fechar" style={{ width: 34, height: 34, background: 'var(--cv-field)', color: 'var(--cv-muted)', border: '1px solid #3c373c', borderRadius: 9, fontSize: 20, cursor: 'pointer' }}>×</button>
        </header>
        <div style={{ padding: 20 }}>{children}</div>
        <footer style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', background: 'var(--cv-panel)', borderTop: '1px solid var(--cv-border)' }}>
          <button type="button" onClick={onFechar} disabled={salvando} style={{ background: 'var(--cv-field)', color: 'var(--cv-text)', border: '1px solid #3c373c', borderRadius: 9, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
          <button disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: 9, padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{salvando ? 'Salvando...' : textoBotao}</button>
        </footer>
      </form>
    </div>
  )
}

function Bloqueio({ texto }) {
  return <div style={{ minHeight: '100%', background: 'var(--cv-bg)', color: 'var(--cv-muted)', display: 'grid', placeItems: 'center' }}>{texto}</div>
}

function ProductIcon({kind}) {return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='copy'?<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4M11 14h6m-3-3v6"/></>:kind==='subscription'?<><path d="M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/></>:<><rect x="4" y="9" width="16" height="12" rx="2"/><path d="M9 9v5h6V9M9 3h6v4H9zM12 3v4"/></>}</svg>}
