'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MonthlyPdfButton({ tipo, mes, arquivoUrl, onDownload, style, children = 'Baixar PDF' }) {
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')

  async function baixar() {
    if (baixando) return
    setBaixando(true)
    setErro('')
    try {
      // Preserva o arquivo original quando ele já foi enviado.
      if (arquivoUrl && onDownload) { await onDownload(); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Entre novamente para baixar o material.')
      const resposta = await fetch(`/api/conteudos/pdf?tipo=${tipo}&mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!resposta.ok) {
        const dados = await resposta.json()
        throw new Error(dados.error || 'Não foi possível baixar o material.')
      }
      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = resposta.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'Material.pdf'
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) { setErro(error.message) }
    finally { setBaixando(false) }
  }

  return <span className="monthly-pdf-control">
    <button type="button" onClick={baixar} disabled={baixando} aria-busy={baixando} style={style}>{baixando ? 'Preparando PDF…' : children}</button>
    {erro && <small role="alert" className="monthly-pdf-error">{erro}</small>}
  </span>
}
