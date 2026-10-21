'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const GOLD = '#D4AF37'

function dateLabel(value, withTime = false) {
  if (!value) return 'Nunca'
  return new Intl.DateTimeFormat('pt-BR', withTime
    ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit' }).format(new Date(value))
}

function Stat({ value, label, detail }) {
  return <div className="reportStat"><strong>{value}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>
}

export default function NotificationReports() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('overview')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Entre novamente para continuar.')
      const response = await fetch(`/api/admin/notificacoes/relatorio?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o relatório.')
      setData(result)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    if (!term) return data?.individuals || []
    return (data?.individuals || []).filter(item => [item.name, item.email, ...(item.plans || [])]
      .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term)))
  }, [data?.individuals, search])

  const maxTimeline = Math.max(1, ...(data?.timeline || []).map(item => item.total))

  return <section className="reports">
    <div className="reportToolbar">
      <div className="reportTabs">
        <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>Visão geral</button>
        <button className={view === 'people' ? 'active' : ''} onClick={() => setView('people')}>Por lojista</button>
      </div>
      <label>Período<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select></label>
    </div>

    {loading && <div className="reportState">Carregando resultados...</div>}
    {!loading && error && <div className="reportState error">! {error}<button onClick={load}>Tentar novamente</button></div>}

    {!loading && !error && data && view === 'overview' && <>
      <div className="reportStats">
        <Stat value={data.summary.total} label="mensagens no app" detail={`${data.summary.recipients} lojistas alcançadas`} />
        <Stat value={data.summary.pushed} label="com push no celular" detail={`${data.summary.in_app_only} somente no sininho`} />
        <Stat value={data.summary.opened} label="aberturas" detail={`${data.summary.open_rate}% de taxa`} />
        <Stat value={data.summary.routine_opened} label="entradas na rotina" detail={`${data.summary.push_opened} vieram pelo push`} />
      </div>

      <div className="reportGrid">
        <article className="reportCard timelineCard">
          <div className="reportHeading"><div><small>EVOLUÇÃO</small><h3>Envios e aberturas</h3></div><span>Últimos {days} dias</span></div>
          <div className="timeline">
            {data.timeline.map(item => <div key={item.date} title={`${dateLabel(item.date)}: ${item.total} mensagens, ${item.opened} aberturas`}>
              <i style={{ height: `${Math.max(3, item.total / maxTimeline * 100)}%` }}><b style={{ height: `${item.total ? item.opened / item.total * 100 : 0}%` }} /></i>
              {(days <= 7 || item.date.endsWith('-01')) && <span>{dateLabel(`${item.date}T12:00:00`)}</span>}
            </div>)}
          </div>
          <p><i /> Mensagens geradas <b /> Aberturas</p>
        </article>

        <article className="reportCard">
          <div className="reportHeading"><div><small>COMPARAÇÃO</small><h3>Resultado por tipo</h3></div></div>
          <div className="typeList">
            {data.byType.length ? data.byType.map(item => <div key={item.key}><header><strong>{item.label}</strong><span>{item.open_rate}%</span></header><i><b style={{ width: `${Math.min(100, item.open_rate)}%` }} /></i><small>{item.opened} aberturas de {item.total} mensagens</small></div>) : <p>A coleta começa nos próximos envios.</p>}
          </div>
        </article>
      </div>

      <article className="reportCard tableCard">
        <div className="reportHeading"><div><small>DESEMPENHO</small><h3>Mensagens e horários</h3></div></div>
        <div className="reportTableWrap"><table><thead><tr><th>Mensagem</th><th>Geradas</th><th>Push</th><th>Lidas</th><th>Abertas</th><th>Taxa</th><th>Último envio</th></tr></thead><tbody>
          {data.byMessage.length ? data.byMessage.map(item => <tr key={item.key}><td><strong>{item.label}</strong></td><td>{item.total}</td><td>{item.pushed}</td><td>{item.read}</td><td>{item.opened}</td><td><b className="rate">{item.open_rate}%</b></td><td>{dateLabel(item.last_sent_at, true)}</td></tr>) : <tr><td colSpan={7}>Os resultados aparecerão depois dos próximos envios.</td></tr>}
        </tbody></table></div>
      </article>
    </>}

    {!loading && !error && data && view === 'people' && <article className="reportCard tableCard peopleCard">
      <div className="reportHeading peopleHeading"><div><small>ACOMPANHAMENTO INDIVIDUAL</small><h3>Engajamento das lojistas</h3></div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail ou plano" /></div>
      <div className="reportTableWrap"><table><thead><tr><th>Lojista</th><th>Plano</th><th>Último acesso</th><th>Mensagens</th><th>Push</th><th>Abertas</th><th>Taxa</th><th>Última abertura</th></tr></thead><tbody>
        {filteredPeople.map(item => <tr key={item.user_id}><td><strong>{item.name}</strong><small>{item.email}</small></td><td>{item.plans.join(', ') || 'Sem plano'}</td><td>{dateLabel(item.last_seen_at, true)}</td><td>{item.total}</td><td>{item.pushed}</td><td>{item.opened}</td><td><b className={`rate ${item.total && !item.opened ? 'cold' : ''}`}>{item.open_rate}%</b></td><td>{dateLabel(item.last_opened_at, true)}</td></tr>)}
        {!filteredPeople.length && <tr><td colSpan={8}>Nenhuma lojista encontrada.</td></tr>}
      </tbody></table></div>
    </article>}

    <style jsx>{`
      .reports{margin-top:18px}.reportToolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.reportTabs{display:flex;padding:4px;border:1px solid #303030;border-radius:10px;background:#111}.reportTabs button{border:0;border-radius:7px;background:transparent;color:#888;padding:9px 14px;font-weight:800;cursor:pointer}.reportTabs button.active{background:#2b230d;color:#f1cc50}.reportToolbar label{display:flex;align-items:center;gap:8px;color:#888;font-size:11px;font-weight:800}.reportToolbar select{border:1px solid #393939;border-radius:8px;background:#151515;color:#fff;padding:9px}.reportState{padding:45px;text-align:center;border:1px solid #303030;border-radius:14px;background:#111;color:#888}.reportState.error{color:#ff8c8c}.reportState button{margin-left:12px;border:1px solid #5a4730;border-radius:7px;background:#201a0f;color:${GOLD};padding:7px 10px}.reportStats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}.reportStat{padding:17px;border:1px solid #34312a;border-radius:13px;background:#121212}.reportStat strong{display:block;color:${GOLD};font-size:25px}.reportStat span{display:block;font-size:11px;font-weight:800;margin-top:3px}.reportStat small{display:block;color:#777;font-size:9px;margin-top:5px}.reportGrid{display:grid;grid-template-columns:1.25fr .75fr;gap:10px;margin-bottom:10px}.reportCard{border:1px solid #34312a;border-radius:14px;background:#121212;padding:17px}.reportHeading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}.reportHeading small{color:${GOLD};font-size:9px;font-weight:900;letter-spacing:.1em}.reportHeading h3{font-size:16px;margin:4px 0 0}.reportHeading>span{color:#777;font-size:10px}.timeline{display:flex;align-items:end;gap:3px;height:145px;border-bottom:1px solid #292929}.timeline>div{height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;min-width:2px}.timeline>div>i{display:flex;align-items:flex-end;width:100%;max-width:15px;min-height:3px;background:#4b432f;border-radius:3px 3px 0 0;overflow:hidden}.timeline>div>i b{display:block;width:100%;background:${GOLD}}.timeline>div span{height:12px;color:#666;font-size:7px;white-space:nowrap}.timelineCard>p{display:flex;align-items:center;gap:5px;color:#777;font-size:9px;margin:10px 0 0}.timelineCard>p i,.timelineCard>p b{width:9px;height:9px;border-radius:2px;background:#4b432f}.timelineCard>p b{margin-left:7px;background:${GOLD}}.typeList{display:grid;gap:15px}.typeList>div header{display:flex;justify-content:space-between;font-size:11px}.typeList>div header span{color:${GOLD};font-weight:900}.typeList>div>i{display:block;height:6px;margin:6px 0;background:#282828;border-radius:9px;overflow:hidden}.typeList>div>i b{display:block;height:100%;background:${GOLD}}.typeList small,.typeList p{color:#777;font-size:9px}.tableCard{padding:0;overflow:hidden}.tableCard .reportHeading{padding:17px;margin:0;border-bottom:1px solid #292929}.reportTableWrap{overflow:auto}.reportTableWrap table{width:100%;border-collapse:collapse;min-width:780px}.reportTableWrap th{padding:10px 12px;background:#0d0d0d;color:#777;font-size:9px;text-align:left;white-space:nowrap}.reportTableWrap td{padding:11px 12px;border-top:1px solid #232323;color:#aaa;font-size:10px}.reportTableWrap td strong{display:block;color:#eee;font-size:11px}.reportTableWrap td small{display:block;color:#666;margin-top:3px}.rate{display:inline-block;padding:4px 7px;border-radius:99px;background:#15341e;color:#9ce0aa;font-size:9px}.rate.cold{background:#3a1919;color:#ff9a9a}.peopleHeading input{width:min(330px,45vw);box-sizing:border-box;border:1px solid #373737;border-radius:8px;background:#090909;color:#fff;padding:10px 11px;outline:none}.peopleHeading input:focus{border-color:${GOLD}}
      @media(max-width:760px){.reportToolbar{align-items:stretch;flex-direction:column}.reportTabs button{flex:1}.reportTabs{display:flex}.reportToolbar label{justify-content:space-between}.reportStats{grid-template-columns:1fr 1fr}.reportGrid{grid-template-columns:1fr}.peopleHeading{align-items:stretch;flex-direction:column}.peopleHeading input{width:100%}.reportStat strong{font-size:21px}}
    `}</style>
  </section>
}
