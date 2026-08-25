'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'
const campo = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '14px' }
const NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function rotuloMes(valor) { const [ano, mes] = valor.split('-'); return `${NOMES[Number(mes) - 1]} ${ano}` }
function mesesDisponiveis() {
  const hoje = new Date(); return Array.from({ length: 25 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 6 + i, 1)
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { valor, rotulo: `${NOMES[d.getMonth()]} ${d.getFullYear()}` }
  })
}

export default function AdminCalendario() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [token, setToken] = useState('')
  const [itens, setItens] = useState([])
  const [formAberto, setFormAberto] = useState(false)
  const [modoForm, setModoForm] = useState('publicar')
  const [itemEmEdicao, setItemEmEdicao] = useState(null)
  const [mesAno, setMesAno] = useState(mesAtual())
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
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

  async function requisicao(method, body, accessToken = token) {
    const form = body instanceof FormData
    const resposta = await fetch('/api/admin/calendario', { method, headers: { Authorization: `Bearer ${accessToken}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir.')
    return dados
  }
  async function carregar(accessToken = token) {
    try { const dados = await requisicao('GET', null, accessToken); setItens(dados.calendarios || []) }
    catch (error) { setMensagem(error.message) }
  }
  function limpar() { setFormAberto(false); setModoForm('publicar'); setItemEmEdicao(null); setMesAno(mesAtual()); setTitulo(''); setDescricao(''); setArquivo(null) }
  function abrirPara(item = null, modo = 'publicar') {
    setModoForm(modo); setItemEmEdicao(item); setMesAno(item?.mes_ano || mesAtual()); setTitulo(item?.titulo || ''); setDescricao(item?.descricao || ''); setArquivo(null); setMensagem(''); setFormAberto(true); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function enviar(evento) {
    evento.preventDefault()
    if (modoForm !== 'editar' && !arquivo) { setMensagem('Escolha o arquivo PDF.'); return }
    if (arquivo && arquivo.type !== 'application/pdf') { setMensagem('Envie somente um arquivo PDF.'); return }
    if (arquivo && arquivo.size > 20 * 1024 * 1024) { setMensagem('O PDF deve ter no máximo 20 MB.'); return }
    setEnviando(true); setMensagem('')
    try {
      if (modoForm === 'editar') {
        await requisicao('PUT', { id: itemEmEdicao.id, mes_ano: mesAno, titulo, descricao })
        await carregar(); limpar(); setMensagem('✓ Calendário atualizado com sucesso.')
      } else {
        const form = new FormData(); form.append('arquivo', arquivo); form.append('mes_ano', mesAno); form.append('titulo', titulo); form.append('descricao', descricao)
        const dados = await requisicao('POST', form); await carregar(); limpar(); setMensagem(dados.substituido ? '✓ Calendário do mês substituído.' : '✓ Calendário publicado com sucesso.')
      }
    } catch (error) { setMensagem(error.message) }
    setEnviando(false)
  }
  async function excluir(item) {
    if (!confirm(`Excluir o calendário de ${rotuloMes(item.mes_ano)}?`)) return
    try { await requisicao('DELETE', { id: item.id }); await carregar(); setMensagem('✓ Calendário excluído.') }
    catch (error) { setMensagem(error.message) }
  }

  if (carregando) return <Bloqueio texto="Carregando..." />
  if (!autorizado) return <Bloqueio texto="Acesso restrito ao administrador." />

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111', position: 'sticky', top: 0, zIndex: 10 }}><button onClick={() => router.push('/admin')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: ouro, padding: '7px 12px', cursor: 'pointer' }}>← Admin</button></header>
    <main style={{ maxWidth: '920px', margin: '0 auto', padding: '26px 18px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '22px' }}>
        <div><p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ADMINISTRAÇÃO</p><h1 style={{ fontSize: '24px', margin: '5px 0' }}>Calendário mensal</h1><p style={{ color: '#888', margin: 0 }}>Publique o PDF que as alunas poderão visualizar e baixar.</p></div>
        {!formAberto && <button onClick={() => abrirPara()} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '11px 17px', fontWeight: 900, cursor: 'pointer' }}>+ Publicar calendário</button>}
      </div>
      {mensagem && <div style={{ background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '16px' }}>{mensagem}</div>}

      {formAberto && <form onSubmit={enviar} style={{ background: '#111', border: '1px solid #34302A', borderRadius: '16px', padding: '20px', marginBottom: '22px' }}>
        <h2 style={{ fontSize: '17px', margin: '0 0 5px' }}>{modoForm === 'editar' ? 'Editar calendário' : modoForm === 'substituir' ? 'Substituir calendário' : 'Publicar calendário'}</h2><p style={{ color: '#777', fontSize: '12px', margin: '0 0 17px' }}>{modoForm === 'editar' ? 'Corrija as informações abaixo. O PDF atual será mantido.' : 'Se já existir um PDF no mês escolhido, ele será substituído.'}</p>
        {modoForm !== 'editar' && <label style={{ display: 'block', border: '1px dashed #66561e', background: '#0A0A0A', borderRadius: '12px', padding: '26px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: '15px' }}><strong style={{ color: ouro, display: 'block', marginBottom: '5px' }}>{arquivo ? `📄 ${arquivo.name}` : '↑ Escolher o PDF do calendário'}</strong><small style={{ color: '#777' }}>{arquivo ? `${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : 'Arquivo PDF de até 20 MB'}</small><input type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}><label>Mês *<select value={mesAno} onChange={e => setMesAno(e.target.value)} style={campo}>{mesesDisponiveis().map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}</select></label><label>Nome <small style={{ color: '#777' }}>(opcional)</small><input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo} placeholder={`Calendário de ${rotuloMes(mesAno)}`} /></label></div>
        <label style={{ display: 'block', marginTop: '12px' }}>Descrição <small style={{ color: '#777' }}>(opcional)</small><input value={descricao} onChange={e => setDescricao(e.target.value)} style={campo} placeholder="Uma orientação curta para as alunas" /></label>
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end', marginTop: '17px' }}><button type="button" onClick={limpar} style={botao}>Cancelar</button><button disabled={enviando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '10px 17px', fontWeight: 900, cursor: 'pointer' }}>{enviando ? 'Salvando...' : modoForm === 'editar' ? 'Salvar alterações' : modoForm === 'substituir' ? 'Substituir PDF' : 'Publicar PDF'}</button></div>
      </form>}

      <section style={{ display: 'grid', gap: '12px' }}>
        {itens.map(item => <article key={item.id} style={{ background: '#111', border: '1px solid #2A2A2A', borderLeft: `3px solid ${ouro}`, borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: 'rgba(212,175,55,.10)', display: 'grid', placeItems: 'center', fontSize: '24px' }}>📅</div>
          <div style={{ flex: 1, minWidth: '190px' }}><small style={{ color: ouro, fontWeight: 800, textTransform: 'uppercase' }}>{rotuloMes(item.mes_ano)}</small><h3 style={{ fontSize: '15px', margin: '4px 0 3px' }}>{item.titulo}</h3><p style={{ color: '#777', fontSize: '12px', margin: 0 }}>{item.descricao || 'PDF disponível para as alunas'}</p></div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>{item.arquivo_url && <a href={item.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ ...botao, textDecoration: 'none' }}>Visualizar</a>}<button onClick={() => abrirPara(item, 'editar')} style={botao}>Editar</button><button onClick={() => abrirPara(item, 'substituir')} style={botao}>Substituir</button><button onClick={() => excluir(item)} style={{ ...botao, color: '#f99' }}>Excluir</button></div>
        </article>)}
        {!itens.length && <div style={{ textAlign: 'center', padding: '48px 20px', background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', color: '#777' }}><div style={{ fontSize: '38px' }}>📅</div><p style={{ marginBottom: 0 }}>Nenhum calendário publicado.</p></div>}
      </section>
    </main>
  </div>
}

const botao = { background: '#1A1A1A', color: ouro, border: '1px solid #333', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer' }
function Bloqueio({ texto }) { return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#AAA', display: 'grid', placeItems: 'center' }}>{texto}</div> }
