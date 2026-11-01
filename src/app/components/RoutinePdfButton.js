'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RoutinePdfButton({ item, style, children = '↓ Baixar rotina em PDF' }) {
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')

  async function baixar() {
    setBaixando(true); setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Entre novamente para baixar a rotina.')
      const resposta = await fetch(`/api/rotina/pdf?id=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!resposta.ok) {
        const dados = await resposta.json()
        throw new Error(dados.error || 'Não foi possível baixar a rotina.')
      }
      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = resposta.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'Rotina.pdf'
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) { setErro(error.message) }
    finally { setBaixando(false) }
  }

  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, maxWidth: '100%' }}>
    <button type="button" onClick={baixar} disabled={baixando} style={{ ...style, opacity: baixando ? .65 : 1 }} aria-busy={baixando}>{baixando ? 'Gerando PDF...' : children}</button>
    {erro && <small role="alert" style={{ color: '#e35e5e', maxWidth: 290 }}>{erro}</small>}
  </span>
}
