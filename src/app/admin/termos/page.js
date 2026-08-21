'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

export default function AdminTermos() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [texto, setTexto] = useState('')
  const [exigir, setExigir] = useState(true)
  const [versao, setVersao] = useState(0)
  const [atualizado, setAtualizado] = useState(null)
  const [aceites, setAceites] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    async function iniciar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) { setCarregando(false); return }
      setAutorizado(true); setToken(session.access_token)
      await carregar(session.access_token); setCarregando(false)
    }
    iniciar()
  }, [router])

  async function carregar(accessToken = token) {
    const resposta = await fetch('/api/admin/termos', { headers: { Authorization: `Bearer ${accessToken}` } })
    const dados = await resposta.json()
    if (!resposta.ok) { setMensagem(dados.error || 'Não foi possível carregar.'); return }
    if (dados.termos) {
      setTexto(dados.termos.content); setExigir(dados.termos.is_required)
      setVersao(dados.termos.version); setAtualizado(dados.termos.published_at)
    }
    setAceites(dados.aceites || 0)
  }

  async function publicar() {
    if (texto.trim().length < 50) { setMensagem('Escreva o texto completo dos termos antes de publicar.'); return }
    if (!confirm('Publicar uma nova versão? Se o aceite estiver ativo, as alunas precisarão aceitar esta versão.')) return
    setSalvando(true); setMensagem('')
    const resposta = await fetch('/api/admin/termos', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texto, is_required: exigir }),
    })
    const dados = await resposta.json()
    if (!resposta.ok) setMensagem(dados.error || 'Não foi possível publicar.')
    else { await carregar(); setMensagem(`✓ Versão ${dados.termos.version} publicada com sucesso.`) }
    setSalvando(false)
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}>
      <button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: ouro, padding: '7px 12px', cursor: 'pointer' }}>← Admin</button>
    </header>
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '26px 18px 60px' }}>
      <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p>
      <h1 style={{ fontSize: '24px', margin: '5px 0' }}>Termos de Uso</h1>
      <p style={{ color: '#888', margin: '0 0 22px' }}>Publique o texto que a aluna deve ler e aceitar para entrar na plataforma.</p>
      {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

      <section style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div><strong>📄 Texto dos termos</strong><p style={{ color: '#777', fontSize: '12px', margin: '4px 0 0' }}>{versao ? `Versão ${versao} · ${new Date(atualizado).toLocaleString('pt-BR')} · ${aceites} aceite${aceites === 1 ? '' : 's'}` : 'Nenhuma versão publicada'}</p></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', fontSize: '13px' }}><input type="checkbox" checked={exigir} onChange={e => setExigir(e.target.checked)} /> Exigir aceite das alunas</label>
        </div>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={18} placeholder="Digite aqui os Termos de Uso da Rotina da Loja Milionária..." style={{ width: '100%', minHeight: '380px', boxSizing: 'border-box', background: '#0A0A0A', color: '#EEE', border: '1px solid #333', borderRadius: '10px', padding: '16px', font: '14px/1.65 inherit', resize: 'vertical', outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}><button onClick={publicar} disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '11px 18px', fontWeight: 900, cursor: 'pointer' }}>{salvando ? 'Publicando...' : versao ? 'Publicar nova versão' : 'Publicar termos'}</button></div>
      </section>
      <div style={{ marginTop: '16px', background: '#111722', border: '1px solid #29486d', color: '#9dc2f0', fontSize: '13px', borderRadius: '10px', padding: '13px 16px', lineHeight: 1.5 }}>Cada publicação cria uma nova versão. Com o aceite ativado, a aluna precisa aceitar a versão vigente antes de acessar o conteúdo.</div>
    </main>
  </div>
}

function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
