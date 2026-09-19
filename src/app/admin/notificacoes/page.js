'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const GOLD = '#D4AF37'
const TYPES = ['motivacional', 'rotina']
const DEFAULTS = {
  motivacional: { id: 'motivacional', enabled: true, title_template: 'Bom dia, {{nome}}! 💛', body_template: 'Mensagem motivacional do banco.' },
  rotina: { id: 'rotina', enabled: true, title_template: 'Vamos começar a rotina de hoje? ✨', body_template: '{{nome}}, sua primeira ação de hoje é: {{acao}}. Abra o app e avance um passo de cada vez.' },
}

function renderPreview(text, action = 'retomar clientes quentes') {
  return String(text || '').replaceAll('{{nome}}', 'Ana').replaceAll('{{acao}}', action)
}

function cleanPastedLine(line) {
  return line.trim().replace(/^(?:\d{1,3}[.)-]|[-•])\s*/, '').trim()
}

export default function AdminNotificacoes() {
  const router = useRouter()
  const fileInputRef = useRef(null)
  const [settings, setSettings] = useState(DEFAULTS)
  const [messages, setMessages] = useState([])
  const [bulkText, setBulkText] = useState('')
  const [activeDevices, setActiveDevices] = useState(0)
  const [myActiveDevices, setMyActiveDevices] = useState(0)
  const [todayMessageId, setTodayMessageId] = useState(null)
  const [routineAction, setRoutineAction] = useState('retomar clientes quentes')
  const [routineAvailable, setRoutineAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState('')
  const [importing, setImporting] = useState(false)
  const [importFilename, setImportFilename] = useState('')
  const [importCandidates, setImportCandidates] = useState([])
  const [notice, setNotice] = useState(null)

  async function api(options = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      throw new Error('Entre novamente para continuar.')
    }
    const response = await fetch('/api/admin/notificacoes', {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) },
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta ação.')
    return result
  }

  function applyPayload(result) {
    setSettings(Object.fromEntries((result.settings || []).map(item => [item.id, item])))
    setMessages(result.messages || [])
    setActiveDevices(result.activeDevices || 0)
    setMyActiveDevices(result.myActiveDevices || 0)
    setTodayMessageId(result.todayMessageId || null)
    setRoutineAction(result.routineAction || 'começar pela primeira etapa da rotina')
    setRoutineAvailable(Boolean(result.routineAvailable))
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api()
        if (active) applyPayload(result)
      } catch (error) {
        if (active) setNotice({ type: 'error', text: error.message })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeMessages = useMemo(() => messages.filter(item => item.enabled), [messages])
  const todayMessage = messages.find(item => item.id === todayMessageId) || activeMessages[0] || messages[0]

  function updateSetting(id, field, value) {
    setSettings(current => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setNotice(null)
  }

  function updateMessage(id, field, value) {
    setMessages(current => current.map(item => item.id === id ? { ...item, [field]: value } : item))
    setNotice(null)
  }

  function addMessages() {
    const lines = bulkText.split(/\r?\n/).map(cleanPastedLine).filter(Boolean)
    if (!lines.length) {
      setNotice({ type: 'error', text: 'Cole pelo menos uma mensagem, usando uma por linha.' })
      return
    }
    const tooLong = lines.find(line => line.length > 240)
    if (tooLong) {
      setNotice({ type: 'error', text: 'Uma das mensagens passou de 240 caracteres. Encurte-a antes de adicionar.' })
      return
    }
    setMessages(current => [...current, ...lines.map(line => ({
      id: crypto.randomUUID(),
      body_template: line,
      enabled: true,
    }))])
    setBulkText('')
    setNotice({ type: 'success', text: `${lines.length} mensagem${lines.length === 1 ? '' : 's'} adicionada${lines.length === 1 ? '' : 's'}. Clique em Salvar alterações.` })
  }

  async function importFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'O arquivo deve ter no máximo 10 MB.' })
      return
    }

    setImporting(true)
    setNotice(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        throw new Error('Entre novamente para continuar.')
      }
      const form = new FormData()
      form.append('arquivo', file)
      const response = await fetch('/api/admin/notificacoes/importar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível ler o arquivo.')
      setImportFilename(result.filename)
      setImportCandidates(result.candidates || [])
      setNotice({ type: 'success', text: `${result.total} mensagem${result.total === 1 ? '' : 's'} encontrada${result.total === 1 ? '' : 's'}. Revise a prévia antes de adicionar.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setImporting(false)
    }
  }

  function updateImportCandidate(id, field, value) {
    setImportCandidates(current => current.map(item => {
      if (item.id !== id) return item
      const next = { ...item, [field]: value }
      if (field === 'text') {
        next.valid = value.trim().length > 0 && value.trim().length <= 240
        next.reason = next.valid ? null : 'A mensagem deve ter entre 1 e 240 caracteres.'
        if (!next.valid) next.selected = false
      }
      return next
    }))
  }

  function addImportedMessages() {
    const selected = importCandidates.filter(item => item.selected && item.valid).map(item => item.text.trim())
    if (!selected.length) {
      setNotice({ type: 'error', text: 'Selecione pelo menos uma mensagem válida para adicionar.' })
      return
    }
    const existing = new Set(messages.map(item => item.body_template.trim().toLocaleLowerCase('pt-BR')))
    const added = []
    let duplicates = 0
    for (const text of selected) {
      const key = text.toLocaleLowerCase('pt-BR')
      if (existing.has(key)) {
        duplicates += 1
        continue
      }
      existing.add(key)
      added.push({ id: crypto.randomUUID(), body_template: text, enabled: true })
    }
    setMessages(current => [...current, ...added])
    setImportCandidates([])
    setImportFilename('')
    setNotice({
      type: added.length ? 'success' : 'error',
      text: added.length
        ? `${added.length} mensagem${added.length === 1 ? '' : 's'} adicionada${added.length === 1 ? '' : 's'} ao banco${duplicates ? `; ${duplicates} repetida${duplicates === 1 ? '' : 's'} ignorada${duplicates === 1 ? '' : 's'}` : ''}. Clique em Salvar alterações.`
        : 'Todas as mensagens selecionadas já estavam cadastradas.',
    })
  }

  function moveMessage(index, direction) {
    const target = index + direction
    if (target < 0 || target >= messages.length) return
    setMessages(current => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setNotice(null)
  }

  function removeMessage(id) {
    if (!window.confirm('Excluir esta mensagem do banco?')) return
    setMessages(current => current.filter(item => item.id !== id))
    setNotice(null)
  }

  async function save(showNotice = true) {
    const result = await api({
      method: 'PUT',
      body: JSON.stringify({
        settings: TYPES.map(id => settings[id] || DEFAULTS[id]),
        messages,
      }),
    })
    applyPayload(result)
    if (showNotice) setNotice({ type: 'success', text: 'Tudo salvo. Os próximos envios já usarão esta configuração.' })
    return result
  }

  async function handleSave() {
    setSaving(true)
    setNotice(null)
    try {
      await save(true)
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function sendTest(type) {
    setTesting(type)
    setNotice(null)
    try {
      await save(false)
      const result = await api({ method: 'POST', body: JSON.stringify({ type }) })
      setNotice({ type: 'success', text: `Teste enviado para ${result.sent} dispositivo${result.sent === 1 ? '' : 's'} seu(s).` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setTesting('')
    }
  }

  const motivational = settings.motivacional || DEFAULTS.motivacional
  const routine = settings.rotina || DEFAULTS.rotina

  return (
    <div className="page">
      <header className="header">
        <button className="back" onClick={() => router.push('/admin')}>← Administração</button>
        <div><small>MARKETING E COMUNICAÇÃO</small><h1>Notificações</h1></div>
      </header>

      <main>
        <section className="intro">
          <div><span className="eyebrow">CONTATO DIÁRIO AUTOMÁTICO</span><h2>Abasteça uma vez. O aplicativo trabalha todos os dias.</h2><p>Às 8h, o banco avança sem repetir. Às 9h, o sistema busca a primeira tarefa pendente da rotina de cada lojista.</p></div>
          <div className="deviceStats">
            <div><strong>{activeDevices}</strong><span>ativos no app</span></div>
            <div><strong>{myActiveDevices}</strong><span>seus para teste</span></div>
          </div>
        </section>

        {notice && <div className={`notice ${notice.type}`}>{notice.type === 'success' ? '✓' : '!'} {notice.text}</div>}

        {loading ? <div className="loading">Carregando notificações...</div> : <>
          <article className={`card ${motivational.enabled ? '' : 'paused'}`}>
            <div className="cardHeader">
              <div className="time">8h</div>
              <div className="cardTitle"><h3>Banco de mensagens motivacionais</h3><p>O sistema percorre todas as mensagens ativas antes de voltar à primeira.</p></div>
              <Toggle checked={motivational.enabled} onChange={value => updateSetting('motivacional', 'enabled', value)} />
            </div>

            <div className="bankSummary">
              <div><strong>{messages.length}</strong><span>cadastradas</span></div>
              <div><strong>{activeMessages.length}</strong><span>ativas</span></div>
              <div><strong>{activeMessages.length || '—'}</strong><span>dias sem repetir</span></div>
            </div>

            <div className="bankGrid">
              <section>
                <label className="field"><span>Título fixo <i>{motivational.title_template.length}/80</i></span><input maxLength={80} value={motivational.title_template} onChange={event => updateSetting('motivacional', 'title_template', event.target.value)} /></label>
                <div className="bulkBox">
                  <div><strong>Adicionar várias de uma vez</strong><span>Cole uma mensagem por linha ou envie um PDF/Word. Não existe limite de quantidade no banco.</span></div>
                  <textarea rows={5} maxLength={20000} value={bulkText} onChange={event => setBulkText(event.target.value)} placeholder={'Você não precisa dar conta de tudo de uma vez. Comece pelo próximo passo.\nUma loja organizada vende com mais leveza e constância.\nHoje é um novo dia para movimentar clientes e oportunidades.'} />
                  <div className="bulkActions">
                    <button className="secondary" type="button" onClick={addMessages}>+ Adicionar texto</button>
                    <button className="secondary upload" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>{importing ? 'Lendo arquivo...' : '↑ Importar PDF ou Word'}</button>
                  </div>
                  <input ref={fileInputRef} className="fileInput" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importFile} />
                  <small className="fileHelp">Formatos: PDF e Word (.docx), até 10 MB. O arquivo não fica armazenado.</small>
                </div>
              </section>

              <Preview title={renderPreview(motivational.title_template)} body={renderPreview(todayMessage?.body_template || 'Cadastre a primeira mensagem motivacional.')} label="MENSAGEM DA ROTAÇÃO DE HOJE" onTest={() => sendTest('motivacional')} testing={testing === 'motivacional'} disabled={Boolean(testing) || saving || !activeMessages.length} />
            </div>

            {importCandidates.length > 0 && <section className="importPreview">
              <div className="importHeader">
                <div><span className="eyebrow">PRÉVIA DA IMPORTAÇÃO</span><h4>{importFilename}</h4><p>Marque o que deseja incluir. Você pode corrigir o texto antes de adicionar.</p></div>
                <button type="button" className="cancelImport" onClick={() => { setImportCandidates([]); setImportFilename('') }}>Cancelar</button>
              </div>
              <div className="importList">
                {importCandidates.map((item, index) => <div className={`importRow ${item.valid ? '' : 'invalid'}`} key={item.id}>
                  <input aria-label={`Selecionar mensagem ${index + 1}`} type="checkbox" checked={item.selected} disabled={!item.valid} onChange={event => updateImportCandidate(item.id, 'selected', event.target.checked)} />
                  <span>{index + 1}</span>
                  <div><textarea rows={2} maxLength={5000} value={item.text} onChange={event => updateImportCandidate(item.id, 'text', event.target.value)} /><small>{item.text.length}/240 {item.reason || ''}</small></div>
                </div>)}
              </div>
              <div className="importFooter"><span>{importCandidates.filter(item => item.selected && item.valid).length} selecionadas</span><button type="button" onClick={addImportedMessages}>Adicionar selecionadas ao banco</button></div>
            </section>}

            <div className="messageListHeader"><div><strong>Mensagens cadastradas</strong><span>Arraste pela ordem usando as setas. Mensagens pausadas não entram na rotação.</span></div></div>
            <div className="messageList">
              {!messages.length ? <div className="empty">Nenhuma mensagem cadastrada. Cole sua lista no campo acima.</div> : messages.map((item, index) => (
                <div className={`messageRow ${item.enabled ? '' : 'disabled'}`} key={item.id}>
                  <span className="number">{index + 1}</span>
                  <textarea rows={2} maxLength={240} value={item.body_template} onChange={event => updateMessage(item.id, 'body_template', event.target.value)} />
                  <span className="chars">{item.body_template.length}/240</span>
                  <label className="miniToggle"><input type="checkbox" checked={item.enabled} onChange={event => updateMessage(item.id, 'enabled', event.target.checked)} /><span>{item.enabled ? 'Ativa' : 'Pausada'}</span></label>
                  <div className="rowActions">
                    <button type="button" disabled={index === 0} onClick={() => moveMessage(index, -1)} aria-label="Subir mensagem">↑</button>
                    <button type="button" disabled={index === messages.length - 1} onClick={() => moveMessage(index, 1)} aria-label="Descer mensagem">↓</button>
                    <button className="delete" type="button" onClick={() => removeMessage(item.id)}>Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={`card ${routine.enabled ? '' : 'paused'}`}>
            <div className="cardHeader">
              <div className="time">9h</div>
              <div className="cardTitle"><h3>Lembrete inteligente da rotina</h3><p>Busca a rotina semanal, o dia atual e a primeira tarefa que cada lojista ainda não concluiu.</p></div>
              <Toggle checked={routine.enabled} onChange={value => updateSetting('rotina', 'enabled', value)} />
            </div>
            <div className="routineStatus"><span className={routineAvailable ? 'ok' : 'fallback'}>{routineAvailable ? '✓ Rotina de hoje encontrada' : 'Mensagem reserva será usada'}</span><strong>Ação usada na sua prévia:</strong> {routineAction}</div>
            <div className="bankGrid">
              <section>
                <label className="field"><span>Título <i>{routine.title_template.length}/80</i></span><input maxLength={80} value={routine.title_template} onChange={event => updateSetting('rotina', 'title_template', event.target.value)} /></label>
                <label className="field"><span>Modelo da mensagem <i>{routine.body_template.length}/240</i></span><textarea rows={4} maxLength={240} value={routine.body_template} onChange={event => updateSetting('rotina', 'body_template', event.target.value)} /></label>
                <p className="hint">Use <code>{'{{nome}}'}</code> para o primeiro nome e <code>{'{{acao}}'}</code> para a tarefa buscada automaticamente.</p>
              </section>
              <Preview title={renderPreview(routine.title_template, routineAction)} body={renderPreview(routine.body_template, routineAction)} label="PRÉVIA DINÂMICA" onTest={() => sendTest('rotina')} testing={testing === 'rotina'} disabled={Boolean(testing) || saving} />
            </div>
          </article>

          <div className="actions"><p>Horários fixos no fuso de Brasília. A rotação reinicia somente após passar por todas as mensagens ativas.</p><button disabled={saving || Boolean(testing)} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
        </>}
      </main>

      <style jsx>{`
        .page{min-height:100vh;background:#090909;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.header{min-height:68px;display:flex;align-items:center;gap:15px;padding:13px 20px;border-bottom:1px solid #292929;background:#111;position:sticky;top:0;z-index:5}.header small,.eyebrow{display:block;color:${GOLD};font-size:10px;font-weight:900;letter-spacing:.11em}.header h1{font-size:17px;margin:2px 0 0}.back{min-height:37px;padding:7px 12px;border:1px solid #353535;border-radius:8px;background:#171717;color:${GOLD};font-weight:800;cursor:pointer}main{max-width:1080px;margin:0 auto;padding:28px 18px 76px}.intro{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:18px}.intro h2{font-size:24px;margin:7px 0}.intro p{color:#929292;font-size:13px;line-height:1.55;margin:0;max-width:690px}.deviceStats{display:flex;gap:8px}.deviceStats div{min-width:115px;padding:13px;border:1px solid #3b3527;border-radius:12px;background:#15130e;text-align:center}.deviceStats strong{display:block;color:${GOLD};font-size:23px}.deviceStats span{color:#aaa;font-size:10px}.notice{margin:0 0 15px;padding:12px 14px;border-radius:9px;font-size:13px}.notice.success{border:1px solid #355e3e;background:#112317;color:#a9e5b5}.notice.error{border:1px solid #713434;background:#2a1212;color:#ffb4b4}.loading{padding:55px;text-align:center;border:1px solid #292929;border-radius:13px;color:#777}.card{margin-bottom:16px;border:1px solid #35312a;border-left:3px solid ${GOLD};border-radius:14px;background:#121212;overflow:hidden}.card.paused{border-left-color:#555}.cardHeader{display:flex;align-items:center;gap:14px;padding:17px 18px;border-bottom:1px solid #282828}.time{width:54px;height:54px;display:grid;place-items:center;flex:0 0 auto;border-radius:14px;background:rgba(212,175,55,.12);color:${GOLD};font-size:18px;font-weight:900}.cardTitle{flex:1}.cardTitle h3{font-size:16px;margin:0 0 4px}.cardTitle p{color:#777;font-size:11px;line-height:1.45;margin:0}.bankSummary{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#292929;border-bottom:1px solid #292929}.bankSummary div{padding:13px 18px;background:#151515}.bankSummary strong{display:block;color:${GOLD};font-size:19px}.bankSummary span{color:#777;font-size:10px}.bankGrid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(290px,.85fr);gap:20px;padding:18px}.field{display:block;margin-bottom:13px}.field>span{display:flex;justify-content:space-between;color:#ddd;font-size:12px;font-weight:800;margin-bottom:7px}.field i{color:#666;font-size:10px;font-style:normal;font-weight:500}.field input,.field textarea,.bulkBox textarea,.messageRow textarea,.importRow textarea{box-sizing:border-box;width:100%;border:1px solid #343434;border-radius:9px;background:#0b0b0b;color:#fff;padding:11px 12px;outline:none;font:inherit;font-size:13px;line-height:1.5}.field input:focus,.field textarea:focus,.bulkBox textarea:focus,.messageRow textarea:focus,.importRow textarea:focus{border-color:${GOLD}}.field textarea,.bulkBox textarea,.messageRow textarea,.importRow textarea{resize:vertical}.bulkBox{padding:14px;border:1px solid #302e29;border-radius:11px;background:#0d0d0d}.bulkBox>div:first-child{display:flex;flex-direction:column;margin-bottom:9px}.bulkBox strong{font-size:12px}.bulkBox span{color:#777;font-size:10px;margin-top:3px}.bulkActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.secondary{width:100%;min-height:39px;margin-top:9px;border:1px solid #4b432f;border-radius:8px;background:#1a1813;color:${GOLD};font-weight:800;cursor:pointer}.secondary:disabled{opacity:.55;cursor:wait}.secondary.upload{background:#26200f}.fileInput{display:none}.fileHelp{display:block;color:#666;font-size:9px;margin-top:8px}.importPreview{margin:0 18px 18px;border:1px solid #4b432f;border-radius:12px;background:#0d0d0d;overflow:hidden}.importHeader{display:flex;justify-content:space-between;gap:14px;padding:14px 15px;border-bottom:1px solid #292929}.importHeader h4{font-size:14px;margin:4px 0}.importHeader p{color:#777;font-size:10px;margin:0}.cancelImport{align-self:center;border:1px solid #3a3a3a;border-radius:7px;background:#181818;color:#bbb;padding:8px 10px;cursor:pointer}.importList{max-height:430px;overflow:auto}.importRow{display:grid;grid-template-columns:20px 30px 1fr;gap:9px;align-items:start;padding:10px 14px;border-bottom:1px solid #222}.importRow>input{margin-top:14px;accent-color:${GOLD}}.importRow>span{margin-top:11px;color:${GOLD};font-size:11px;font-weight:900}.importRow small{display:block;color:#666;font-size:9px;margin-top:3px}.importRow.invalid textarea{border-color:#713434}.importRow.invalid small{color:#ff8c8c}.importFooter{display:flex;justify-content:flex-end;align-items:center;gap:14px;padding:12px 14px}.importFooter span{color:#888;font-size:11px}.importFooter button{min-height:38px;border:0;border-radius:8px;background:${GOLD};color:#111;padding:0 14px;font-weight:900;cursor:pointer}.messageListHeader{display:flex;justify-content:space-between;padding:4px 18px 10px}.messageListHeader div{display:flex;flex-direction:column}.messageListHeader strong{font-size:13px}.messageListHeader span{color:#777;font-size:10px;margin-top:3px}.messageList{max-height:590px;overflow:auto;border-top:1px solid #282828}.empty{padding:30px;text-align:center;color:#777;font-size:12px}.messageRow{display:grid;grid-template-columns:36px minmax(240px,1fr) 52px 68px auto;gap:9px;align-items:center;padding:10px 14px;border-bottom:1px solid #222}.messageRow.disabled{opacity:.55}.number{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:#242014;color:${GOLD};font-size:11px;font-weight:900}.chars{color:#666;font-size:9px}.miniToggle{display:flex;align-items:center;gap:5px;color:#aaa;font-size:9px}.miniToggle input{accent-color:${GOLD}}.rowActions{display:flex;gap:5px}.rowActions button{min-width:31px;height:31px;border:1px solid #363636;border-radius:7px;background:#191919;color:#bbb;cursor:pointer}.rowActions button:disabled{opacity:.3}.rowActions .delete{padding:0 8px;color:#ff8c8c}.routineStatus{margin:14px 18px 0;padding:11px 13px;border:1px solid #302e29;border-radius:9px;background:#0d0d0d;color:#aaa;font-size:11px}.routineStatus span{display:inline-block;margin-right:12px;padding:4px 7px;border-radius:99px}.routineStatus .ok{background:#14311c;color:#9ce0aa}.routineStatus .fallback{background:#332b16;color:#e5c75e}.routineStatus strong{color:#ddd}.hint{color:#777;font-size:11px;margin:0}.hint code{padding:2px 5px;border-radius:4px;background:#272318;color:#e7c851}.actions{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:18px;padding:14px 0}.actions p{color:#777;font-size:11px;margin:0}.actions button{min-height:44px;padding:0 22px;border:0;border-radius:9px;background:linear-gradient(135deg,#d4af37,#f4d366);color:#111;font-weight:900;cursor:pointer}.actions button:disabled{opacity:.55;cursor:wait}
        @media(max-width:760px){.header{padding:12px}.header small{font-size:8px}main{padding:22px 12px 65px}.intro{align-items:stretch;flex-direction:column}.deviceStats div{flex:1}.cardHeader{align-items:flex-start;flex-wrap:wrap;padding:14px}.cardTitle{min-width:calc(100% - 72px)}.bankGrid{grid-template-columns:1fr;padding:14px}.bulkActions{grid-template-columns:1fr}.importPreview{margin:0 14px 14px}.importHeader{align-items:flex-start;flex-direction:column}.importFooter{align-items:stretch;flex-direction:column}.importFooter button{width:100%}.messageRow{grid-template-columns:34px 1fr 48px}.messageRow .miniToggle{grid-column:2}.rowActions{grid-column:3;grid-row:2}.bankSummary div{padding:11px}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}.intro h2{font-size:21px}}
      `}</style>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return <label className="toggleLabel"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="toggle" /><b>{checked ? 'Ativa' : 'Pausada'}</b><style jsx>{`.toggleLabel{display:flex;align-items:center;gap:8px;cursor:pointer;color:#bbb;font-size:11px}.toggleLabel input{position:absolute;opacity:0;pointer-events:none}.toggle{width:40px;height:22px;border-radius:99px;background:#3a3a3a;position:relative;transition:.2s}.toggle:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#aaa;transition:.2s}.toggleLabel input:checked+.toggle{background:${GOLD}}.toggleLabel input:checked+.toggle:after{left:21px;background:#111}`}</style></label>
}

function Preview({ title, body, label, onTest, testing, disabled }) {
  return <div className="preview"><span>{label}</span><div className="phoneNotification"><div className="appIcon">R</div><div><small>Rotina da Loja · agora</small><strong>{title}</strong><p>{body}</p></div></div><button disabled={disabled} onClick={onTest}>{testing ? 'Enviando...' : 'Enviar teste para mim'}</button><small className="testHelp">Ao testar, as alterações também são salvas.</small><style jsx>{`.preview{padding:14px;border:1px solid #302e29;border-radius:12px;background:#0c0c0c;align-self:start}.preview>span{display:block;color:#696969;font-size:9px;font-weight:900;letter-spacing:.12em;margin-bottom:10px}.phoneNotification{display:flex;gap:10px;padding:12px;border-radius:13px;background:linear-gradient(135deg,#34383d,#24282c);box-shadow:0 8px 20px #0005}.appIcon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:9px;background:linear-gradient(135deg,#d7b239,#f4d66b);color:#111;font-weight:1000}.phoneNotification small{display:block;color:#d0d0d0;font-size:9px;margin-bottom:3px}.phoneNotification strong{display:block;font-size:12px;line-height:1.3}.phoneNotification p{color:#eee;font-size:10px;line-height:1.4;margin:3px 0 0}.preview button{width:100%;min-height:39px;margin-top:12px;border:1px solid #494131;border-radius:8px;background:#1a1813;color:${GOLD};font-weight:800;cursor:pointer}.preview button:disabled{opacity:.45;cursor:not-allowed}.testHelp{display:block;color:#616161;font-size:9px;text-align:center;margin-top:6px}`}</style></div>
}
