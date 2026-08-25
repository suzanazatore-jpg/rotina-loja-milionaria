'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const brl = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const iso = data => data.toISOString().slice(0, 10)
const primeiroDia = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`
const nomeMes = valor => new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

export default function SalesCenter({ cores, ouro, ouroGrad }) {
  const hoje = useMemo(() => new Date(), [])
  const [usuario, setUsuario] = useState(null)
  const [aba, setAba] = useState('resumo')
  const [meta, setMeta] = useState({ monthly_target: 0, open_days: 26 })
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [vendedoras, setVendedoras] = useState([])
  const [vendas, setVendas] = useState([])
  const [dataVenda, setDataVenda] = useState(iso(hoje))
  const [valores, setValores] = useState({})
  const [novaVendedora, setNovaVendedora] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const campo = { width: '100%', boxSizing: 'border-box', background: cores.card2, color: cores.tx, border: `1px solid ${cores.borda}`, borderRadius: 12, padding: 12, font: 'inherit' }
  const botaoSecundario = { background: cores.card2, color: cores.tx, border: `1px solid ${cores.borda}`, borderRadius: 11, padding: '10px 13px', fontWeight: 800, cursor: 'pointer' }

  async function carregar() {
    setCarregando(true)
    setMensagem('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUsuario(user)
    const inicioAtual = primeiroDia(hoje)
    const inicioHistorico = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)
    const [{ data: goals, error: erroMeta }, { data: team, error: erroEquipe }, { data: sales, error: erroVendas }] = await Promise.all([
      supabase.from('sales_goals').select('*').eq('owner_id', user.id).gte('month_start', iso(inicioHistorico)).order('month_start', { ascending: false }),
      supabase.from('salespeople').select('*').eq('owner_id', user.id).order('active', { ascending: false }).order('sort_order').order('name'),
      supabase.from('daily_sales').select('*').eq('owner_id', user.id).gte('sale_date', iso(inicioHistorico)).order('sale_date', { ascending: false }),
    ])
    const erro = erroMeta || erroEquipe || erroVendas
    if (erro) setMensagem(erro.message)
    setMeta(goals?.find(item => item.month_start === inicioAtual) || { monthly_target: 0, open_days: 26 })
    setVendedoras(team || [])
    setVendas(sales || [])
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const atualizar = () => { if (document.visibilityState === 'visible') carregar() }
    window.addEventListener('focus', atualizar)
    document.addEventListener('visibilitychange', atualizar)
    return () => { window.removeEventListener('focus', atualizar); document.removeEventListener('visibilitychange', atualizar) }
  }, [])
  useEffect(() => {
    const mapa = {}
    vendas.filter(item => item.sale_date === dataVenda).forEach(item => { mapa[item.salesperson_id] = String(item.amount || '') })
    setValores(mapa)
  }, [dataVenda, vendas])

  const vendasMes = useMemo(() => vendas.filter(item => item.sale_date.startsWith(primeiroDia(hoje).slice(0, 7))).reduce((soma, item) => soma + Number(item.amount || 0), 0), [vendas, hoje])
  const vendasHoje = useMemo(() => vendas.filter(item => item.sale_date === iso(hoje)).reduce((soma, item) => soma + Number(item.amount || 0), 0), [vendas, hoje])
  const percentual = meta.monthly_target ? Math.round(vendasMes / Number(meta.monthly_target) * 100) : 0
  const metaDia = Number(meta.monthly_target || 0) / Number(meta.open_days || 1)

  const meses = useMemo(() => {
    const mapa = new Map()
    vendas.forEach(item => {
      const chave = `${item.sale_date.slice(0, 7)}-01`
      mapa.set(chave, (mapa.get(chave) || 0) + Number(item.amount || 0))
    })
    return [...mapa.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, total]) => ({ month, total }))
  }, [vendas])

  async function salvarMeta(e) {
    e.preventDefault()
    if (!usuario) return
    setSalvando(true)
    const payload = { owner_id: usuario.id, month_start: primeiroDia(hoje), monthly_target: Number(meta.monthly_target || 0), open_days: Number(meta.open_days || 26), updated_at: new Date().toISOString() }
    const { error } = await supabase.from('sales_goals').upsert(payload, { onConflict: 'owner_id,month_start' })
    setMensagem(error ? error.message : '✓ Meta mensal salva.')
    setEditandoMeta(false)
    setSalvando(false)
    if (!error) carregar()
  }

  async function adicionarVendedora(e) {
    e.preventDefault()
    if (!usuario || !novaVendedora.trim()) return
    const { error } = await supabase.from('salespeople').insert({ owner_id: usuario.id, name: novaVendedora.trim(), sort_order: vendedoras.length })
    setMensagem(error ? error.message : '✓ Vendedora adicionada.')
    if (!error) { setNovaVendedora(''); carregar() }
  }

  async function alternarVendedora(item) {
    const { error } = await supabase.from('salespeople').update({ active: !item.active, updated_at: new Date().toISOString() }).eq('id', item.id).eq('owner_id', usuario.id)
    setMensagem(error ? error.message : `✓ ${item.active ? 'Vendedora desativada' : 'Vendedora ativada'}.`)
    if (!error) carregar()
  }

  async function salvarVendas() {
    if (!usuario || !vendedoras.filter(item => item.active).length) return
    setSalvando(true)
    const payload = vendedoras.filter(item => item.active).map(item => ({ owner_id: usuario.id, salesperson_id: item.id, sale_date: dataVenda, amount: Number(String(valores[item.id] || 0).replace(',', '.')), updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('daily_sales').upsert(payload, { onConflict: 'salesperson_id,sale_date' })
    setMensagem(error ? error.message : '✓ Vendas salvas com sucesso.')
    setSalvando(false)
    if (!error) { await carregar(); setAba('resumo') }
  }

  if (carregando) return <p style={{ color: cores.tx2, textAlign: 'center', padding: 50 }}>Carregando vendas e metas...</p>

  return <div style={{ maxWidth: 980, margin: '0 auto' }}>
    <header style={{ marginBottom: 18 }}><p style={{ color: ouro, fontSize: 10, fontWeight: 900, letterSpacing: '.14em', margin: 0 }}>GESTÃO DA LOJA</p><h2 style={{ color: cores.tx, fontSize: 25, margin: '4px 0' }}>Vendas e Metas</h2><p style={{ color: cores.tx2, fontSize: 13, margin: 0 }}>Lance as vendas da equipe e acompanhe o resultado de cada mês.</p></header>
    <div style={{ background: cores.card2, borderRadius: 14, padding: 4, display: 'flex', marginBottom: 16 }}><button onClick={() => setAba('resumo')} style={{ flex: 1, background: aba === 'resumo' ? cores.card : 'transparent', color: aba === 'resumo' ? cores.tx : cores.tx2, border: 0, borderRadius: 11, padding: 11, fontWeight: 900 }}>Resumo mensal</button><button onClick={() => setAba('lancar')} style={{ flex: 1, background: aba === 'lancar' ? cores.card : 'transparent', color: aba === 'lancar' ? cores.tx : cores.tx2, border: 0, borderRadius: 11, padding: 11, fontWeight: 900 }}>Lançar vendas</button></div>
    {mensagem && <div style={{ background: cores.card, color: ouro, border: `1px solid ${cores.borda}`, borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13 }}>{mensagem}</div>}

    {aba === 'resumo' ? <>
      <section style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 20, padding: 22, marginBottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><span style={{ color: ouro, fontSize: 10, fontWeight: 900, letterSpacing: '.12em' }}>META DE {nomeMes(primeiroDia(hoje)).toUpperCase()}</span><h3 style={{ color: cores.tx, fontSize: 28, margin: '7px 0 3px' }}>{brl(vendasMes)} <small style={{ color: cores.tx2, fontSize: 13 }}>de {brl(meta.monthly_target)}</small></h3></div><button onClick={() => setEditandoMeta(!editandoMeta)} style={botaoSecundario}>Editar meta</button></div><div style={{ height: 8, background: cores.card2, borderRadius: 99, overflow: 'hidden', marginTop: 15 }}><div style={{ width: `${Math.min(100, percentual)}%`, height: '100%', background: ouroGrad }} /></div><p style={{ color: cores.tx2, fontSize: 12, margin: '7px 0 0' }}>{percentual}% alcançada</p></section>
      {editandoMeta && <form onSubmit={salvarMeta} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 16, padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}><label style={{ color: cores.tx, fontSize: 12, fontWeight: 800 }}>Meta mensal<input value={meta.monthly_target} onChange={e => setMeta({ ...meta, monthly_target: e.target.value })} type="number" min="0" step="0.01" style={campo} /></label><label style={{ color: cores.tx, fontSize: 12, fontWeight: 800 }}>Dias abertos<input value={meta.open_days} onChange={e => setMeta({ ...meta, open_days: e.target.value })} type="number" min="1" max="31" style={campo} /></label><button disabled={salvando} style={{ background: ouroGrad, color: '#211A0E', border: 0, borderRadius: 11, padding: 13, fontWeight: 900 }}>Salvar</button></form>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 11, marginBottom: 20 }}>{[['Vendas no mês', brl(vendasMes)], ['Vendas de hoje', brl(vendasHoje)], ['Meta média por dia', brl(metaDia)]].map(([label, value]) => <div key={label} style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 15, padding: 16 }}><span style={{ color: cores.tx2, fontSize: 11 }}>{label}</span><strong style={{ color: cores.tx, display: 'block', fontSize: 20, marginTop: 6 }}>{value}</strong></div>)}</div>
      <h3 style={{ color: cores.tx, fontSize: 18 }}>Resumo por mês</h3><div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>{meses.length ? meses.map(item => <div key={item.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 15px', borderBottom: `1px solid ${cores.borda}` }}><span style={{ color: cores.tx, textTransform: 'capitalize' }}>{nomeMes(item.month)}</span><strong style={{ color: ouro }}>{brl(item.total)}</strong></div>) : <p style={{ color: cores.tx2, padding: 18 }}>Nenhuma venda lançada ainda.</p>}</div>
      <h3 style={{ color: cores.tx, fontSize: 18 }}>Equipe</h3><form onSubmit={adicionarVendedora} style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input value={novaVendedora} onChange={e => setNovaVendedora(e.target.value)} placeholder="Nome da vendedora" style={{ ...campo, flex: 1 }} /><button style={{ background: ouroGrad, color: '#211A0E', border: 0, borderRadius: 11, padding: '0 15px', fontWeight: 900 }}>+ Adicionar</button></form><div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 16, overflow: 'hidden' }}>{vendedoras.length ? vendedoras.map(item => <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', borderBottom: `1px solid ${cores.borda}` }}><span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 12, background: ouroGrad, color: '#211A0E', fontWeight: 900 }}>{item.name[0]}</span><strong style={{ flex: 1, color: item.active ? cores.tx : cores.tx3 }}>{item.name}</strong><button onClick={() => alternarVendedora(item)} style={botaoSecundario}>{item.active ? 'Desativar' : 'Ativar'}</button></div>) : <p style={{ color: cores.tx2, padding: 18 }}>Cadastre a primeira vendedora.</p>}</div>
    </> : <>
      <label style={{ display: 'block', color: cores.tx, fontSize: 12, fontWeight: 800, marginBottom: 12 }}>Data do lançamento<input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} style={campo} /></label>
      <div style={{ background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>{vendedoras.filter(item => item.active).length ? vendedoras.filter(item => item.active).map(item => <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: `1px solid ${cores.borda}` }}><span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 12, background: ouroGrad, color: '#211A0E', fontWeight: 900 }}>{item.name[0]}</span><strong style={{ flex: 1, color: cores.tx }}>{item.name}</strong><input aria-label={`Vendas de ${item.name}`} value={valores[item.id] || ''} onChange={e => setValores({ ...valores, [item.id]: e.target.value })} type="number" min="0" step="0.01" placeholder="R$ 0,00" style={{ ...campo, width: 145, textAlign: 'right' }} /></label>) : <p style={{ color: cores.tx2, padding: 18 }}>Cadastre e ative pelo menos uma vendedora no Resumo mensal.</p>}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', background: cores.card, border: `1px solid ${cores.borda}`, borderRadius: 14, padding: 16, marginBottom: 12 }}><span style={{ color: cores.tx2 }}>Total do lançamento</span><strong style={{ color: ouro, fontSize: 20 }}>{brl(Object.values(valores).reduce((soma, valor) => soma + Number(String(valor || 0).replace(',', '.')), 0))}</strong></div><button onClick={salvarVendas} disabled={salvando || !vendedoras.some(item => item.active)} style={{ width: '100%', background: ouroGrad, color: '#211A0E', border: 0, borderRadius: 13, padding: 14, fontWeight: 900 }}>{salvando ? 'Salvando...' : 'Salvar lançamento'}</button>
    </>}
  </div>
}
