'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminAlunasPlanInjector() {
  useEffect(() => {
    if (window.location.pathname !== '/admin/alunas') return

    const originalFetch = window.fetch.bind(window)
    let planos = []
    let planoSelecionado = ''
    let observer

    async function carregarPlanos() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const resp = await originalFetch('/api/admin/alunas', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!resp.ok) return
        const json = await resp.json()
        planos = Array.isArray(json.planos) ? json.planos : []
        injetarCampoPlano()
      } catch {
        // A tela continua funcionando mesmo se não for possível carregar os planos.
      }
    }

    function injetarCampoPlano() {
      const titulos = Array.from(document.querySelectorAll('h2'))
      const titulo = titulos.find(el => el.textContent?.trim() === 'Cadastrar nova aluna')
      if (!titulo) return

      const modal = titulo.closest('div[style*="max-width"]') || titulo.parentElement
      if (!modal || modal.querySelector('#admin-novo-plano-select')) return

      const emailSwitch = modal.querySelector('.email-switch')
      if (!emailSwitch) return

      const bloco = document.createElement('div')
      bloco.style.marginBottom = '14px'

      const label = document.createElement('label')
      label.textContent = 'Plano a liberar (opcional)'
      Object.assign(label.style, {
        display: 'block',
        fontSize: '12px',
        fontWeight: '700',
        color: '#888',
        marginBottom: '6px',
      })

      const select = document.createElement('select')
      select.id = 'admin-novo-plano-select'
      Object.assign(select.style, {
        width: '100%',
        padding: '11px 13px',
        background: '#0A0A0A',
        border: '1px solid #2A2A2A',
        borderRadius: '9px',
        fontSize: '14px',
        color: '#FFF',
        outline: 'none',
        boxSizing: 'border-box',
      })

      const vazio = document.createElement('option')
      vazio.value = ''
      vazio.textContent = 'Criar sem liberar plano'
      select.appendChild(vazio)

      planos.forEach(plano => {
        const option = document.createElement('option')
        option.value = plano.id
        option.textContent = plano.name
        select.appendChild(option)
      })

      select.value = planoSelecionado
      select.addEventListener('change', event => {
        planoSelecionado = event.target.value
      })

      const ajuda = document.createElement('small')
      ajuda.textContent = 'Ao escolher um plano, os cursos e conteúdos vinculados a ele serão liberados automaticamente.'
      Object.assign(ajuda.style, {
        color: '#666',
        display: 'block',
        marginTop: '5px',
        lineHeight: '1.35',
      })

      bloco.appendChild(label)
      bloco.appendChild(select)
      bloco.appendChild(ajuda)
      emailSwitch.parentNode.insertBefore(bloco, emailSwitch)
    }

    window.fetch = async function fetchComPlano(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || ''
      const metodo = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase()

      if (url.includes('/api/admin/alunas') && metodo === 'POST' && init?.body) {
        try {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
          if (body?.modo === 'individual') {
            const atuais = Array.isArray(body.planoIds) ? body.planoIds : []
            body.planoIds = planoSelecionado ? [...new Set([...atuais, planoSelecionado])] : atuais
            const resposta = await originalFetch(input, { ...init, body: JSON.stringify(body) })
            if (resposta.ok) planoSelecionado = ''
            return resposta
          }
        } catch {
          // Se o corpo não for JSON, segue com o fetch original.
        }
      }

      return originalFetch(input, init)
    }

    observer = new MutationObserver(injetarCampoPlano)
    observer.observe(document.body, { childList: true, subtree: true })
    carregarPlanos()
    injetarCampoPlano()

    return () => {
      if (observer) observer.disconnect()
      window.fetch = originalFetch
    }
  }, [])

  return null
}
