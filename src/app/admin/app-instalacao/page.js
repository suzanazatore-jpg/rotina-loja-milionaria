'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppInstallationReport from '@/app/components/AppInstallationReport'
import styles from '../Office.module.css'

export default function OfficeInstallationReport() {
  const router = useRouter()
  const [access, setAccess] = useState('loading')
  const [theme, setTheme] = useState('escuro')
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      try { setTheme(localStorage.getItem('sz-meu-escritorio-tema') === 'claro' ? 'claro' : 'escuro') } catch {}
      if (!session) { router.replace('/login'); return }
      setAccess(session.user.email === 'suporte@suzanazatorre.com.br' ? 'allowed' : 'denied')
    }).catch(() => { if (active) setAccess('denied') })
    return () => { active = false }
  }, [router])
  const cores = theme === 'escuro'
    ? { card: '#111111', card2: '#1a1a1a', tx: '#ffffff', borda: '#34302a' }
    : { card: '#ffffff', card2: '#f0efea', tx: '#1a1a18', borda: '#e2e0d8' }
  return <div className={styles.office} data-theme={theme}>
    <header className={styles.header}><div className={styles.brand}>
      <Link className={styles.back} href="/admin">← Meu Escritório</Link>
      <div><p className={styles.eyebrow}>Administração</p><h1>Instalação do app</h1></div>
    </div></header>
    <main className={styles.main}>{access === 'allowed' ? <AppInstallationReport cores={cores}/> : <p role="status">{access === 'loading' ? 'Carregando…' : 'Acesso restrito ao administrador.'}</p>}</main>
  </div>
}
