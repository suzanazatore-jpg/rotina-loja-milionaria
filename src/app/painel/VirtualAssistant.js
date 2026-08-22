'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const sugestoes = [
  'Não encontro uma aula',
  'Como baixar um PDF?',
  'Como acessar uma campanha?',
  'Meu acesso não está funcionando',
]

export default function VirtualAssistant({ cores, ouro, ouroGrad, onOpenSupport }) {
  const [mensagens, setMensagens] = useState([
    { role: 'assistant', content: 'Olá! Sou a Assistente da Rotina. Conte sua dúvida e eu vou orientar você de forma simples.' },
  ])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(pergunta) {
    const conteudo = (pergunta ?? texto).trim()
    if (!conteudo || enviando) return
    const proximas = [...mensagens, { role: 'user', content: conteudo }]
    setMensagens(proximas)
    setTexto('')
    setEnviando(true)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resposta = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ messages: proximas.slice(-8) }),
      })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível responder agora.')
      setMensagens(lista => [...lista, { role: 'assistant', content: dados.answer }])
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return <section className="virtual-assistant" style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 20, overflow: 'hidden' }}>
    <header style={{ padding: '20px', borderBottom: `1px solid ${cores.borda}` }}>
      <p style={{ color: ouro, fontSize: 10, fontWeight: 900, letterSpacing: '.14em', margin: '0 0 5px' }}>ATENDIMENTO 24 HORAS</p>
      <h2 style={{ color: cores.tx, fontSize: 22, margin: 0 }}>✦ Assistente Virtual</h2>
      <p style={{ color: cores.tx2, fontSize: 13, margin: '5px 0 0' }}>Dúvidas rápidas sobre aulas, materiais, campanhas e acesso.</p>
    </header>

    <div aria-live="polite" style={{ display: 'grid', gap: 10, minHeight: 280, maxHeight: 430, overflowY: 'auto', padding: 18 }}>
      {mensagens.map((mensagem, index) => <div key={index} style={{
        justifySelf: mensagem.role === 'user' ? 'end' : 'start', maxWidth: '86%', whiteSpace: 'pre-wrap',
        background: mensagem.role === 'user' ? ouroGrad : cores.card2,
        color: mensagem.role === 'user' ? '#211A0E' : cores.tx,
        border: `1px solid ${mensagem.role === 'user' ? 'transparent' : cores.borda}`,
        borderRadius: 14, padding: '11px 13px', fontSize: 13, lineHeight: 1.55,
      }}>{mensagem.content}</div>)}
      {enviando && <span style={{ color: cores.tx2, fontSize: 12 }}>A Assistente está respondendo...</span>}
    </div>

    <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {sugestoes.map(item => <button key={item} onClick={() => enviar(item)} style={{ background: cores.card2, color: cores.tx2, border: `1px solid ${cores.borda}`, borderRadius: 99, padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>{item}</button>)}
    </div>

    <form onSubmit={e => { e.preventDefault(); enviar() }} style={{ padding: 18, borderTop: `1px solid ${cores.borda}`, display: 'flex', gap: 8 }}>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={1200} placeholder="Digite sua dúvida..." style={{ flex: 1, resize: 'none', background: cores.card2, color: cores.tx, border: `1px solid ${cores.borda}`, borderRadius: 12, padding: 12, font: 'inherit' }} />
      <button disabled={enviando || !texto.trim()} style={{ alignSelf: 'stretch', background: ouroGrad, color: '#211A0E', border: 0, borderRadius: 12, padding: '0 17px', fontWeight: 900, cursor: 'pointer' }}>Enviar</button>
    </form>
    {erro && <div style={{ padding: '0 18px 18px' }}><p style={{ color: '#C45B5B', fontSize: 12 }}>{erro}</p><button onClick={onOpenSupport} style={{ background: 'transparent', color: ouro, border: `1px solid ${ouro}`, borderRadius: 10, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }}>Abrir chamado no suporte</button></div>}
  </section>
}
