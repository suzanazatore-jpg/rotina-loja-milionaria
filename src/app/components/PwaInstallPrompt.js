'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const INSTALLED_KEY = 'rotina-pwa-instalado'
const DISMISSED_KEY = 'rotina-pwa-lembrar-depois'
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function detectDevice() {
  if (typeof window === 'undefined') {
    return { ios: false, android: false, embedded: false, mobile: false, standalone: false }
  }

  const userAgent = window.navigator.userAgent || ''
  const ios = /iPad|iPhone|iPod/.test(userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  const android = /Android/i.test(userAgent)
  const embedded = /Instagram|FBAN|FBAV|WhatsApp/i.test(userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true

  return {
    ios,
    android,
    embedded,
    mobile: ios || android || window.navigator.maxTouchPoints > 0,
    standalone,
  }
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) || 0)
    return dismissedAt > 0 && Date.now() - dismissedAt < REMIND_AFTER_MS
  } catch {
    return false
  }
}

function markInstalled() {
  try {
    window.localStorage.setItem(INSTALLED_KEY, 'true')
    window.localStorage.removeItem(DISMISSED_KEY)
  } catch {
    // A instalação continua funcionando mesmo se o navegador bloquear o armazenamento local.
  }
}

export default function PwaInstallPrompt() {
  const pathname = usePathname()
  const [installEvent, setInstallEvent] = useState(null)
  const [device, setDevice] = useState(() => detectDevice())
  const [installed, setInstalled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [installing, setInstalling] = useState(false)

  const isPanel = pathname?.startsWith('/painel')
  const canOfferInstall = useMemo(
    () => device.mobile && (device.ios || device.android || device.embedded || Boolean(installEvent)),
    [device, installEvent],
  )

  useEffect(() => {
    const currentDevice = detectDevice()
    const frame = window.requestAnimationFrame(() => {
      setDevice(currentDevice)
      if (currentDevice.standalone) {
        markInstalled()
        setInstalled(true)
        setVisible(false)
        return
      }

      try {
        setInstalled(window.localStorage.getItem(INSTALLED_KEY) === 'true')
      } catch {
        setInstalled(false)
      }
    })

    function captureInstallEvent(event) {
      event.preventDefault()
      setInstallEvent(event)
    }

    function handleInstalled() {
      markInstalled()
      setInstalled(true)
      setVisible(false)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', captureInstallEvent)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('beforeinstallprompt', captureInstallEvent)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isPanel || device.standalone || !canOfferInstall) {
      return undefined
    }

    let alreadyInstalled = false
    try {
      alreadyInstalled = window.localStorage.getItem(INSTALLED_KEY) === 'true'
    } catch {
      alreadyInstalled = false
    }

    if (alreadyInstalled || wasRecentlyDismissed()) return undefined

    const timer = window.setTimeout(() => setVisible(true), 1200)
    return () => window.clearTimeout(timer)
  }, [isPanel, device.standalone, canOfferInstall])

  function remindLater() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // Fecha normalmente mesmo se o armazenamento estiver indisponível.
    }
    setVisible(false)
    setShowInstructions(false)
  }

  async function installApp() {
    if (device.ios || device.embedded || !installEvent) {
      setShowInstructions(true)
      return
    }

    setInstalling(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice?.outcome === 'accepted') {
        markInstalled()
        setInstalled(true)
        setVisible(false)
      } else {
        remindLater()
      }
    } finally {
      setInstallEvent(null)
      setInstalling(false)
    }
  }

  function openInstallOptions() {
    setShowInstructions(false)
    setVisible(true)
  }

  if (!isPanel || device.standalone || installed || !canOfferInstall) return null

  if (!visible) {
    return (
      <button
        type="button"
        onClick={openInstallOptions}
        aria-label="Instalar o App Rotina"
        style={{
          position: 'fixed', right: '16px', bottom: '82px', zIndex: 89,
          display: 'flex', alignItems: 'center', gap: '8px',
          border: '1px solid rgba(255,255,255,.2)', borderRadius: '999px', padding: '11px 16px',
          background: 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: '#0A0A0A',
          boxShadow: '0 10px 30px rgba(0,0,0,.28)', fontSize: '13px', fontWeight: 850, cursor: 'pointer',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '17px', lineHeight: 1 }}>↓</span>
        Instalar aplicativo
      </button>
    )
  }

  const instructions = device.embedded
    ? [
        'Abra o menu deste navegador.',
        `Escolha “Abrir no ${device.ios ? 'Safari' : 'Chrome'}”.`,
        device.ios ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'No Chrome, toque nos três pontinhos e depois em “Instalar app”.',
      ]
    : device.ios
      ? [
          'Toque no botão Compartilhar do Safari.',
          'Escolha “Adicionar à Tela de Início”.',
          'Mantenha “Abrir como App” ativado e toque em “Adicionar”.',
        ]
      : [
          'Abra o menu de três pontinhos do Chrome.',
          'Toque em “Instalar app” ou “Adicionar à tela inicial”.',
          'Confirme para criar o ícone do App Rotina.',
        ]

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '18px', background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(5px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        style={{
          width: '100%', maxWidth: '430px', borderRadius: '24px', padding: '24px', boxSizing: 'border-box',
          background: '#111111', color: '#FFFFFF', border: '1px solid #34302A',
          boxShadow: '0 24px 70px rgba(0,0,0,.5)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
            <Image src="/pwa-icon-192.png" alt="" width={58} height={58} priority style={{ borderRadius: '15px', flex: '0 0 auto' }} />
            <div>
              <p style={{ margin: '0 0 4px', color: '#D4AF37', fontSize: '11px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Acesso rápido</p>
              <h2 id="pwa-install-title" style={{ margin: 0, fontSize: '20px', lineHeight: 1.2 }}>Tenha o App Rotina sempre à mão</h2>
            </div>
          </div>
        </div>

        {!showInstructions ? (
          <>
            <p style={{ margin: '18px 0 20px', color: '#B9B9B9', fontSize: '14px', lineHeight: 1.55 }}>
              Instale o aplicativo na tela do seu celular e acesse suas metas, campanhas e rotina com apenas um toque.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              <button
                type="button"
                onClick={installApp}
                disabled={installing}
                style={{ border: 0, borderRadius: '12px', padding: '14px 16px', background: 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: '#0A0A0A', fontSize: '15px', fontWeight: 800, cursor: installing ? 'wait' : 'pointer' }}
              >
                {installing ? 'Abrindo instalação...' : 'Instalar agora'}
              </button>
              <button type="button" onClick={remindLater} style={{ border: '1px solid #353535', borderRadius: '12px', padding: '13px 16px', background: 'transparent', color: '#D0D0D0', fontSize: '14px', fontWeight: 650, cursor: 'pointer' }}>
                Fazer isso depois
              </button>
            </div>
            <p style={{ margin: '14px 0 0', color: '#666', fontSize: '11px', textAlign: 'center' }}>Sem App Store, sem Play Store e sem ocupar muito espaço.</p>
          </>
        ) : (
          <>
            <ol style={{ margin: '20px 0', padding: 0, listStyle: 'none', display: 'grid', gap: '12px' }}>
              {instructions.map((instruction, index) => (
                <li key={instruction} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', color: '#D0D0D0', fontSize: '14px', lineHeight: 1.45 }}>
                  <span style={{ width: '25px', height: '25px', flex: '0 0 25px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'rgba(212,175,55,.14)', color: '#D4AF37', fontSize: '12px', fontWeight: 900 }}>{index + 1}</span>
                  <span>{instruction}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={remindLater} style={{ width: '100%', border: 0, borderRadius: '12px', padding: '14px 16px', background: 'linear-gradient(135deg, #D4AF37, #F5D76E)', color: '#0A0A0A', fontSize: '15px', fontWeight: 800, cursor: 'pointer' }}>
              Entendi
            </button>
          </>
        )}
      </section>
    </div>
  )
}
