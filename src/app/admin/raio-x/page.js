'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ouro = '#D4AF37'
const AGORA = Date.now()
const EIXOS = { vendas: 'Vendas', equipe: 'Equipe', estoque: 'Estoque', gestao: 'Gestão' }
const FATURAMENTOS = { 'ate-10': 'Até R$ 10 mil', '10-30': 'R$ 10–30 mil', '30-50': 'R$ 30–50 mil', '50-100': 'R$ 50–100 mil', 'mais-100': 'Mais de R$ 100 mil' }
const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const data = valor => new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function AdminRaioX() {
  const router = useRouter()
  const [leads, setLeads] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    async function carregar() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/login'); return }
        const resposta = await fetch('/api/admin/raio-x', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const resultado = await resposta.json()
        if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível carregar os leads.')
        setLeads(resultado.leads || [])
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [router])

  const filtrados = useMemo(() => leads.filter(lead => {
    const termo = busca.trim().toLowerCase()
    const combina = !termo || `${lead.nome} ${lead.email} ${lead.whatsapp}`.toLowerCase().includes(termo)
    return combina && (filtro === 'todos' || lead.gargalo === filtro)
  }), [busca, filtro, leads])

  const ultimosSeteDias = leads.filter(lead => AGORA - new Date(lead.created_at).getTime() <= 7 * 86400000).length
  const contagem = Object.keys(EIXOS).map(id => [id, leads.filter(lead => lead.gargalo === id).length]).sort((a, b) => b[1] - a[1])
  const principal = contagem[0]?.[1] ? EIXOS[contagem[0][0]] : '—'
  const potencial = leads.reduce((soma, lead) => soma + Number(lead.perda_estimada || 0), 0)

  function exportar() {
    const cabecalho = ['Data', 'Nome', 'E-mail', 'WhatsApp', 'Faturamento', 'Vendedoras', 'Gargalo', 'Perda estimada', 'Vendas', 'Equipe', 'Estoque', 'Gestão']
    const linhas = filtrados.map(lead => [data(lead.created_at), lead.nome, lead.email, lead.whatsapp, FATURAMENTOS[lead.faturamento_faixa], lead.numero_vendedoras, EIXOS[lead.gargalo], lead.perda_estimada, lead.pontuacoes?.vendas, lead.pontuacoes?.equipe, lead.pontuacoes?.estoque, lead.pontuacoes?.gestao])
    const csv = [cabecalho, ...linhas].map(linha => linha.map(valor => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `leads-raio-x-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
    <header style={{ minHeight: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 20px', borderBottom: '1px solid #282828', background: '#111', position: 'sticky', top: 0, zIndex: 5 }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button onClick={() => router.push('/admin')} style={botao}>← Admin</button><div><small style={{ color: ouro, fontWeight: 900, letterSpacing: '.1em' }}>MARKETING</small><h1 style={{ fontSize: 17, margin: 2 }}>Leads do Raio-X</h1></div></div><a href="/raio-x" target="_blank" rel="noopener noreferrer" style={{ ...botao, textDecoration: 'none', color: ouro }}>Abrir isca ↗</a></header>
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '27px 17px 70px' }}>
      {erro && <div style={{ padding: 12, marginBottom: 15, border: '1px solid #6b3030', borderRadius: 9, background: '#291313', color: '#ffb5b5' }}>{erro}</div>}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 22 }}>{[['Total de leads', leads.length], ['Últimos 7 dias', ultimosSeteDias], ['Principal gargalo', principal], ['Oportunidade estimada', brl(potencial)]].map(([rotulo, valor]) => <article key={rotulo} style={card}><small style={{ color: '#888' }}>{rotulo}</small><strong style={{ display: 'block', marginTop: 7, color: rotulo === 'Principal gargalo' ? ouro : '#FFF', fontSize: 21 }}>{valor}</strong></article>)}</section>
      <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginBottom: 14 }}><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou WhatsApp" style={{ ...campo, flex: '1 1 260px' }} /><select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...campo, flex: '0 1 190px' }}><option value="todos">Todos os gargalos</option>{Object.entries(EIXOS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select><button onClick={exportar} disabled={!filtrados.length} style={{ ...botao, minHeight: 42, color: ouro }}>Exportar CSV</button></section>
      <section style={{ overflowX: 'auto', border: '1px solid #2c2c2c', borderRadius: 13, background: '#111' }}>
        {carregando ? <p style={{ padding: 35, textAlign: 'center', color: '#777' }}>Carregando leads...</p> : !filtrados.length ? <p style={{ padding: 35, textAlign: 'center', color: '#777' }}>Nenhum lead encontrado.</p> : <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 11 }}><thead><tr>{['Data', 'Contato', 'Loja', 'Gargalo', 'Notas', 'Estimativa', 'Ação'].map(titulo => <th key={titulo} style={{ padding: '12px 13px', borderBottom: '1px solid #2c2c2c', color: '#777', textAlign: 'left' }}>{titulo}</th>)}</tr></thead><tbody>{filtrados.map(lead => <tr key={lead.id}><td style={celula}>{data(lead.created_at)}</td><td style={celula}><strong style={{ display: 'block', color: '#FFF', fontSize: 12 }}>{lead.nome}</strong><span style={{ color: '#777' }}>{lead.email}<br />{lead.whatsapp}</span></td><td style={celula}>{FATURAMENTOS[lead.faturamento_faixa] || lead.faturamento_faixa}<br /><span style={{ color: '#777' }}>{lead.numero_vendedoras} vendedora(s)</span></td><td style={celula}><b style={{ display: 'inline-block', padding: '5px 8px', borderRadius: 99, background: '#2b2414', color: ouro }}>{EIXOS[lead.gargalo] || lead.gargalo}</b></td><td style={celula}>V {lead.pontuacoes?.vendas} · E {lead.pontuacoes?.equipe}<br />Est {lead.pontuacoes?.estoque} · G {lead.pontuacoes?.gestao}</td><td style={{ ...celula, color: '#d8bd73', fontWeight: 800 }}>{brl(lead.perda_estimada)}</td><td style={celula}><a href={`https://wa.me/55${String(lead.whatsapp).replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(`Oi, ${lead.nome.split(' ')[0]}! Vi que você fez o Raio-X da Loja Lucrativa. Posso te ajudar com seu plano para ${EIXOS[lead.gargalo]?.toLowerCase()}?`)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#85d7a5', fontWeight: 800, textDecoration: 'none' }}>Chamar no WhatsApp ↗</a></td></tr>)}</tbody></table>}
      </section>
      <p style={{ color: '#595959', fontSize: 10, marginTop: 9 }}>Exibindo {filtrados.length} de {leads.length} leads. A lista guarda até os 500 cadastros mais recentes.</p>
    </main>
  </div>
}

const botao = { minHeight: 36, padding: '7px 12px', border: '1px solid #343434', borderRadius: 8, background: '#171717', color: '#CCC', fontWeight: 800, cursor: 'pointer' }
const card = { minHeight: 91, padding: 16, border: '1px solid #2d2a24', borderLeft: `3px solid ${ouro}`, borderRadius: 12, background: '#121212' }
const campo = { minHeight: 42, padding: '0 12px', border: '1px solid #343434', borderRadius: 9, outline: 0, background: '#151515', color: '#FFF', font: 'inherit', fontSize: 12 }
const celula = { padding: '13px', borderBottom: '1px solid #222', color: '#BBB', lineHeight: 1.45, verticalAlign: 'middle' }
