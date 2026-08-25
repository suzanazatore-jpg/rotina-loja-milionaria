'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import './team-goals.css'

const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthStart = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
const monthLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const monthKey = value => value.slice(0, 7)
const DEFAULT_WEIGHTS = { 0: 0, 1: 10, 2: 10, 3: 12, 4: 15, 5: 23, 6: 30 }
const WEEKDAYS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']]

function datesInMonth(month, weights, closedDates = []) {
  const [year, value] = month.split('-').map(Number)
  const result = []; const closed = new Set(closedDates || [])
  for (let day = new Date(year, value - 1, 1); day.getMonth() === value - 1; day.setDate(day.getDate() + 1)) {
    const iso = dateIso(day)
    if (Number(weights?.[day.getDay()] || 0) > 0 && !closed.has(iso)) result.push({ iso, weekday: day.getDay() })
  }
  return result
}

function Progress({ value, gradient }) {
  return <div className="tg-progress"><i style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: gradient }} /></div>
}

export default function SalesCenter({ cores, ouro, ouroGrad }) {
  const today = useMemo(() => new Date(), [])
  const currentMonth = monthStart(today)
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('painel')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [goals, setGoals] = useState([])
  const [goal, setGoal] = useState({ monthly_target: 0, open_days: 26, weekday_weights: DEFAULT_WEIGHTS, closed_dates: [] })
  const [salespeople, setSalespeople] = useState([])
  const [personGoals, setPersonGoals] = useState([])
  const [sales, setSales] = useState([])
  const [saleDate, setSaleDate] = useState(dateIso(today))
  const [saleValues, setSaleValues] = useState({}); const [ticketValues, setTicketValues] = useState({}); const [noteValues, setNoteValues] = useState({})
  const [newSalesperson, setNewSalesperson] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const inputStyle = { background: cores.card2, color: cores.tx, borderColor: cores.borda }
  const cardStyle = { background: cores.card, borderColor: cores.borda }

  async function load() {
    setLoading(true); setMessage('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    setUser(authUser)
    const historyStart = new Date(today.getFullYear() - 2, today.getMonth(), 1)
    const [goalResult, teamResult, salesResult, personGoalResult] = await Promise.all([
      supabase.from('sales_goals').select('*').eq('owner_id', authUser.id).gte('month_start', dateIso(historyStart)).order('month_start', { ascending: false }),
      supabase.from('salespeople').select('*').eq('owner_id', authUser.id).order('active', { ascending: false }).order('sort_order').order('name'),
      supabase.from('daily_sales').select('*').eq('owner_id', authUser.id).gte('sale_date', dateIso(historyStart)).order('sale_date', { ascending: false }),
      supabase.from('salesperson_goals').select('*').eq('owner_id', authUser.id).gte('month_start', dateIso(historyStart)),
    ])
    const error = goalResult.error || teamResult.error || salesResult.error || personGoalResult.error
    if (error) setMessage(error.message)
    setGoals(goalResult.data || []); setSalespeople(teamResult.data || []); setSales(salesResult.data || []); setPersonGoals(personGoalResult.data || []); setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setGoal(goals.find(item => item.month_start === selectedMonth) || { monthly_target: 0, open_days: 26, weekday_weights: DEFAULT_WEIGHTS, closed_dates: [] }) }, [goals, selectedMonth])
  useEffect(() => {
    const amounts = {}; const tickets = {}; const notes = {}
    sales.filter(item => item.sale_date === saleDate).forEach(item => { amounts[item.salesperson_id] = String(item.amount || ''); tickets[item.salesperson_id] = String(item.tickets || ''); notes[item.salesperson_id] = item.notes || '' })
    setSaleValues(amounts); setTicketValues(tickets); setNoteValues(notes)
  }, [saleDate, sales])

  const selectedSales = useMemo(() => sales.filter(item => monthKey(item.sale_date) === monthKey(selectedMonth)), [sales, selectedMonth])
  const totalSold = selectedSales.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const totalTickets = selectedSales.reduce((sum, item) => sum + Number(item.tickets || 0), 0)
  const target = Number(goal.monthly_target || 0); const achievement = target ? totalSold / target * 100 : 0; const missing = Math.max(0, target - totalSold)
  const weights = goal.weekday_weights || DEFAULT_WEIGHTS
  const openDates = useMemo(() => datesInMonth(selectedMonth, weights, goal.closed_dates), [selectedMonth, weights, goal.closed_dates])
  const referenceDate = selectedMonth === currentMonth ? dateIso(today) : `${selectedMonth.slice(0, 7)}-31`
  const remainingDates = openDates.filter(item => item.iso > referenceDate); const elapsedDates = openDates.filter(item => item.iso <= referenceDate)
  const requiredPerDay = remainingDates.length ? missing / remainingDates.length : 0
  const expectedToDate = openDates.length ? target * elapsedDates.length / openDates.length : 0
  const pace = !target ? 'sem-meta' : totalSold >= target ? 'batida' : totalSold >= expectedToDate ? 'no-ritmo' : 'atrasada'
  const dailyAverage = elapsedDates.length ? totalSold / elapsedDates.length : 0
  const projection = selectedMonth === currentMonth ? dailyAverage * openDates.length : totalSold
  const avgTicket = totalTickets ? totalSold / totalTickets : 0

  const ranking = useMemo(() => salespeople.map(person => {
    const personSales = selectedSales.filter(item => item.salesperson_id === person.id)
    const sold = personSales.reduce((sum, item) => sum + Number(item.amount || 0), 0); const tickets = personSales.reduce((sum, item) => sum + Number(item.tickets || 0), 0)
    const savedGoal = personGoals.find(item => item.salesperson_id === person.id && item.month_start === selectedMonth); const individualTarget = Number(savedGoal?.target_amount || 0)
    return { ...person, sold, tickets, target: individualTarget, percent: individualTarget ? sold / individualTarget * 100 : 0, avgTicket: tickets ? sold / tickets : 0 }
  }).filter(item => item.active || item.sold > 0 || item.target > 0).sort((a, b) => b.percent - a.percent || b.sold - a.sold), [salespeople, selectedSales, personGoals, selectedMonth])

  const monthHistory = useMemo(() => goals.map(item => {
    const sold = sales.filter(sale => monthKey(sale.sale_date) === monthKey(item.month_start)).reduce((sum, sale) => sum + Number(sale.amount || 0), 0); const monthTarget = Number(item.monthly_target || 0)
    return { ...item, sold, percent: monthTarget ? sold / monthTarget * 100 : 0 }
  }).sort((a, b) => b.month_start.localeCompare(a.month_start)), [goals, sales])

  async function saveGoal(event) {
    event.preventDefault(); if (!user) return; setSaving(true)
    const payload = { owner_id: user.id, month_start: selectedMonth, monthly_target: target, open_days: openDates.length || Number(goal.open_days || 26), weekday_weights: weights, closed_dates: goal.closed_dates || [], updated_at: new Date().toISOString() }
    const { error } = await supabase.from('sales_goals').upsert(payload, { onConflict: 'owner_id,month_start' })
    if (!error && salespeople.some(item => item.active)) {
      const active = salespeople.filter(item => item.active); const currentGoals = personGoals.filter(item => item.month_start === selectedMonth)
      const rows = active.map(person => ({ owner_id: user.id, salesperson_id: person.id, month_start: selectedMonth, target_amount: currentGoals.find(item => item.salesperson_id === person.id)?.target_amount ?? target / active.length, updated_at: new Date().toISOString() }))
      const result = await supabase.from('salesperson_goals').upsert(rows, { onConflict: 'salesperson_id,month_start' }); if (result.error) { setMessage(result.error.message); setSaving(false); return }
    }
    setMessage(error ? error.message : '✓ Meta e distribuição salvas.'); setSaving(false); if (!error) { setEditingGoal(false); load() }
  }

  async function savePersonTargets() {
    if (!user || !ranking.length) return; setSaving(true)
    const rows = ranking.map(person => ({ owner_id: user.id, salesperson_id: person.id, month_start: selectedMonth, target_amount: Number(person.target || 0), updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('salesperson_goals').upsert(rows, { onConflict: 'salesperson_id,month_start' })
    setMessage(error ? error.message : '✓ Metas individuais salvas.'); setSaving(false); if (!error) load()
  }
  function updatePersonTarget(id, value) { setPersonGoals(current => { const existing = current.find(item => item.salesperson_id === id && item.month_start === selectedMonth); return existing ? current.map(item => item === existing ? { ...item, target_amount: value } : item) : [...current, { owner_id: user?.id, salesperson_id: id, month_start: selectedMonth, target_amount: value }] }) }
  async function addSalesperson(event) { event.preventDefault(); if (!user || !newSalesperson.trim()) return; const { error } = await supabase.from('salespeople').insert({ owner_id: user.id, name: newSalesperson.trim(), sort_order: salespeople.length }); setMessage(error ? error.message : '✓ Vendedora adicionada.'); if (!error) { setNewSalesperson(''); load() } }
  async function toggleSalesperson(person) { const { error } = await supabase.from('salespeople').update({ active: !person.active, updated_at: new Date().toISOString() }).eq('id', person.id).eq('owner_id', user.id); setMessage(error ? error.message : `✓ Vendedora ${person.active ? 'desativada' : 'ativada'}. O histórico foi preservado.`); if (!error) load() }
  async function saveSales() {
    const active = salespeople.filter(item => item.active); if (!user || !active.length) return; setSaving(true)
    const payload = active.map(person => ({ owner_id: user.id, salesperson_id: person.id, sale_date: saleDate, amount: Number(String(saleValues[person.id] || 0).replace(',', '.')), tickets: Number(ticketValues[person.id] || 0), notes: noteValues[person.id]?.trim() || null, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('daily_sales').upsert(payload, { onConflict: 'salesperson_id,sale_date' }); setMessage(error ? error.message : '✓ Vendas do dia salvas.'); setSaving(false); if (!error) { await load(); setTab('painel') }
  }
  function setWeight(day, value) { setGoal(current => ({ ...current, weekday_weights: { ...(current.weekday_weights || DEFAULT_WEIGHTS), [day]: Math.max(0, Number(value || 0)) } })) }

  if (loading) return <p style={{ color: cores.tx2, textAlign: 'center', padding: 50 }}>Carregando metas e resultados...</p>
  return <div className="team-goals" style={{ '--tg-gold': ouro, '--tg-text': cores.tx, '--tg-muted': cores.tx2, '--tg-border': cores.borda, '--tg-card': cores.card, '--tg-card2': cores.card2 }}>
    <header className="tg-heading"><div><p>GESTÃO DE PERFORMANCE</p><h2>Calculadora de Metas</h2><span>Transforme a meta mensal em direção diária para toda a equipe.</span></div><label className="tg-month"><span>Período</span><input type="month" value={selectedMonth.slice(0, 7)} onChange={event => setSelectedMonth(`${event.target.value}-01`)} style={inputStyle} /></label></header>
    <nav className="tg-tabs" style={{ background: cores.card2 }}>{[['painel', 'Visão geral'], ['lancar', 'Lançar vendas'], ['ranking', 'Ranking'], ['historico', 'Histórico'], ['equipe', 'Equipe']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''} style={{ color: tab === id ? cores.tx : cores.tx2, background: tab === id ? cores.card : 'transparent' }}>{label}</button>)}</nav>
    {message && <div className="tg-message" style={cardStyle}>{message}</div>}
    {tab === 'painel' && <>
      <section className="tg-hero" style={cardStyle}><div><small>META DE {monthLabel(selectedMonth).toUpperCase()}</small><strong>{brl(totalSold)}</strong><span>de {brl(target)}</span></div><div className={`tg-status ${pace}`}><b>{achievement.toFixed(0)}%</b><span>{pace === 'batida' ? 'Meta batida' : pace === 'no-ritmo' ? 'No ritmo' : pace === 'atrasada' ? 'Abaixo do ritmo' : 'Defina a meta'}</span></div><Progress value={achievement} gradient={ouroGrad} /><button onClick={() => setEditingGoal(value => !value)}>Configurar meta</button></section>
      {editingGoal && <form className="tg-config" onSubmit={saveGoal} style={cardStyle}><div className="tg-config-title"><div><h3>Distribuição da meta</h3><p>Defina a meta e o peso de venda de cada dia. Zero significa que a loja não abre.</p></div><button type="button" onClick={() => setGoal(current => ({ ...current, weekday_weights: DEFAULT_WEIGHTS }))}>Restaurar sugestão</button></div><label className="tg-target">Meta mensal<input type="number" min="0" step="0.01" value={goal.monthly_target} onChange={event => setGoal({ ...goal, monthly_target: event.target.value })} style={inputStyle} /></label><div className="tg-weights">{WEEKDAYS.map(([day, label]) => <label key={day}>{label}<input type="number" min="0" max="100" value={weights[day] ?? 0} onChange={event => setWeight(day, event.target.value)} style={inputStyle} /><span>%</span></label>)}</div><p className="tg-weight-total">Soma dos pesos: <b>{Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0)}%</b> · {openDates.length} dias de venda no mês</p><button className="tg-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar e distribuir entre a equipe'}</button></form>}
      <div className="tg-metrics">{[['Falta para a meta', brl(missing), 'Valor restante'], ['Necessário por dia', brl(requiredPerDay), `${remainingDates.length} dias restantes`], ['Projeção do mês', brl(projection), projection >= target && target ? 'Tendência de meta batida' : 'Ritmo atual'], ['Ticket médio', brl(avgTicket), totalTickets ? `${totalTickets} vendas registradas` : 'Informe o nº de vendas']].map(([label, value, detail]) => <article key={label} style={cardStyle}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
      <section className="tg-week" style={cardStyle}><div className="tg-section-title"><div><h3>Meta por dia da semana</h3><p>Distribuição baseada nos pesos definidos.</p></div></div><div className="tg-week-grid">{WEEKDAYS.map(([day, label]) => { const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0) || 1; const days = openDates.filter(item => String(item.weekday) === day).length; const weekdayTarget = target * Number(weights[day] || 0) / totalWeight; return <div key={day}><span>{label}</span><strong>{brl(days ? weekdayTarget / days : 0)}</strong><small>{days ? `por dia · ${days} no mês` : 'Loja fechada'}</small></div> })}</div></section>
    </>}
    {tab === 'lancar' && <section className="tg-panel" style={cardStyle}><div className="tg-section-title"><div><h3>Lançamento diário</h3><p>Registre faturamento e número de vendas de cada vendedora.</p></div><input type="date" value={saleDate} onChange={event => setSaleDate(event.target.value)} style={inputStyle} /></div><div className="tg-entry-list">{salespeople.filter(item => item.active).map(person => <article key={person.id}><div className="tg-avatar">{person.name[0]}</div><strong>{person.name}</strong><label>Vendido<input type="number" min="0" step="0.01" value={saleValues[person.id] || ''} onChange={event => setSaleValues({ ...saleValues, [person.id]: event.target.value })} placeholder="R$ 0,00" style={inputStyle} /></label><label>Nº de vendas<input type="number" min="0" step="1" value={ticketValues[person.id] || ''} onChange={event => setTicketValues({ ...ticketValues, [person.id]: event.target.value })} placeholder="0" style={inputStyle} /></label><label className="tg-note">Observação<input value={noteValues[person.id] || ''} onChange={event => setNoteValues({ ...noteValues, [person.id]: event.target.value })} placeholder="Opcional" style={inputStyle} /></label></article>)}</div>{!salespeople.some(item => item.active) && <p className="tg-empty">Cadastre e ative uma vendedora primeiro.</p>}<footer className="tg-entry-total"><span>Total do dia</span><strong>{brl(Object.values(saleValues).reduce((sum, value) => sum + Number(value || 0), 0))}</strong><button className="tg-primary" onClick={saveSales} disabled={saving || !salespeople.some(item => item.active)}>{saving ? 'Salvando...' : 'Salvar lançamento'}</button></footer></section>}
    {tab === 'ranking' && <section><div className="tg-section-title"><div><h3>Ranking de {monthLabel(selectedMonth)}</h3><p>Classificação pelo percentual da meta individual; faturamento desempata.</p></div></div>{ranking.length ? <div className="tg-podium">{ranking.slice(0, 3).map((person, index) => <article key={person.id} className={`place-${index + 1}`} style={cardStyle}><div className="tg-trophy">{index === 0 ? '🏆' : index === 1 ? '🥈' : '🥉'}</div><span>{index + 1}º lugar</span><h3>{person.name}</h3><strong>{brl(person.sold)}</strong><small>{person.percent.toFixed(0)}% da meta de {brl(person.target)}</small><Progress value={person.percent} gradient={ouroGrad} /></article>)}</div> : <p className="tg-empty">Cadastre vendedoras e metas individuais para montar o ranking.</p>}<div className="tg-ranking-list">{ranking.slice(3).map((person, index) => <article key={person.id} style={cardStyle}><b>{index + 4}º</b><div className="tg-avatar">{person.name[0]}</div><div><strong>{person.name}</strong><small>{person.percent.toFixed(0)}% da meta</small></div><span>{brl(person.sold)}</span></article>)}</div></section>}
    {tab === 'historico' && <section><div className="tg-section-title"><div><h3>Histórico da loja</h3><p>Metas e resultados ficam preservados mês a mês.</p></div></div><div className="tg-history">{monthHistory.length ? monthHistory.map((item, index) => { const previous = monthHistory[index + 1]; const evolution = previous?.sold ? (item.sold / previous.sold - 1) * 100 : null; return <button key={item.month_start} onClick={() => { setSelectedMonth(item.month_start); setTab('painel') }} style={cardStyle}><div><strong>{monthLabel(item.month_start)}</strong><small>{item.percent.toFixed(0)}% da meta</small></div><div><span>{brl(item.sold)}</span><small>de {brl(item.monthly_target)}</small></div><b className={evolution !== null && evolution < 0 ? 'down' : ''}>{evolution === null ? '—' : `${evolution >= 0 ? '+' : ''}${evolution.toFixed(0)}%`}</b></button> }) : <p className="tg-empty">O histórico aparecerá quando a primeira meta for salva.</p>}</div></section>}
    {tab === 'equipe' && <section className="tg-panel" style={cardStyle}><div className="tg-section-title"><div><h3>Equipe e metas individuais</h3><p>A soma das metas individuais deve acompanhar a meta da loja.</p></div></div><form className="tg-add-person" onSubmit={addSalesperson}><input value={newSalesperson} onChange={event => setNewSalesperson(event.target.value)} placeholder="Nome da vendedora" style={inputStyle} /><button className="tg-primary">+ Adicionar</button></form><div className="tg-team-list">{ranking.map(person => <article key={person.id}><div className="tg-avatar">{person.name[0]}</div><div><strong>{person.name}</strong><small>{person.active ? 'Ativa' : 'Inativa · histórico preservado'}</small></div><label>Meta individual<input type="number" min="0" step="0.01" value={person.target} onChange={event => updatePersonTarget(person.id, event.target.value)} style={inputStyle} /></label><button onClick={() => toggleSalesperson(person)}>{person.active ? 'Desativar' : 'Ativar'}</button></article>)}</div><footer className="tg-team-footer"><span>Soma individual <strong>{brl(ranking.reduce((sum, person) => sum + Number(person.target || 0), 0))}</strong></span><span>Meta da loja <strong>{brl(target)}</strong></span><button className="tg-primary" onClick={savePersonTargets} disabled={saving || !ranking.length}>{saving ? 'Salvando...' : 'Salvar metas individuais'}</button></footer></section>}
  </div>
}
