'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import './central.css'

const THEME_KEY = 'sz-central-vendas-tema'
function subscribe(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener('sz-central-theme', callback)
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('sz-central-theme', callback) }
}
const snapshot = () => window.localStorage.getItem(THEME_KEY) === 'claro' ? 'claro' : 'preto'
const menu = [
  ['Visão geral', '/admin/central-vendas', 'overview'],
  ['01 — Produtos e Ofertas', '/admin/checkout', 'products'],
  ['02 — Vendas', '/admin/checkout/vendas', 'sales'],
  ['03 — Assinaturas', null, 'subscriptions'],
  ['04 — Checkouts', null, 'checkouts'],
  ['05 — Integrações', null, 'integrations'],
  ['06 — Configurações', null, 'settings'],
]
export default function CentralShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'preto')
  const [access, setAccess] = useState('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (!session) { router.replace('/login'); return }
      setAccess(session.user.email?.toLowerCase() === 'suporte@suzanazatorre.com.br' ? 'allowed' : 'denied')
    }).catch(() => { if (active) setAccess('denied') })
    return () => { active = false }
  }, [router])
  function changeTheme(value) {
    window.localStorage.setItem(THEME_KEY, value)
    window.dispatchEvent(new Event('sz-central-theme'))
  }
  const title = menu.find(([, href]) => href === pathname)?.[0] || 'Central de Vendas'
  return <div className="central" data-theme={theme}>
    <aside className={`central-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <Link href="/admin/central-vendas" className="central-brand" onClick={() => setMenuOpen(false)}><span className="central-monogram">SZ</span><span>Central de Vendas<small>Suzana Zatorre</small></span></Link>
      <p className="central-nav-caption">GESTÃO COMERCIAL</p>
      <nav aria-label="Central de Vendas">{menu.map(([label, href, icon]) => href ? <Link key={icon} href={href} aria-current={pathname === href ? 'page' : undefined} className="central-nav-item" onClick={() => setMenuOpen(false)}><span className="central-nav-dot" />{label}</Link> : <div key={icon} className="central-nav-item disabled" aria-disabled="true"><span className="central-nav-dot" />{label}<small>Em breve</small></div>)}</nav>
      <Link href="/admin" className="central-office">← Meu Escritório</Link>
      <div className="central-sidebar-footer">Seu negócio. Sua central.</div>
    </aside>
    <div className="central-workspace">
      <header className="central-topbar"><div className="central-topbar-title"><button className="central-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Abrir menu da Central de Vendas">☰</button><div><span className="central-eyebrow">CENTRAL DE VENDAS</span><p>{title}</p></div></div><div className="central-theme" role="group" aria-label="Tema da Central de Vendas">{['claro', 'preto'].map(value => <button key={value} aria-pressed={theme === value} onClick={() => changeTheme(value)}>{value === 'claro' ? '☀ Claro' : '◐ Preto'}</button>)}</div></header>
      <div className="central-body">{access === 'allowed' ? children : <div className="central-access" role="status">{access === 'loading' ? 'Carregando sua central…' : 'Acesso restrito ao administrador.'}</div>}</div>
    </div>
  </div>
}
