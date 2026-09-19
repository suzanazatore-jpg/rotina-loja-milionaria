'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const GOLD = '#D4AF37'
const TYPES = [
  { id: 'motivacional', time: '8h', name: 'Mensagem motivacional', description: 'Um começo de dia acolhedor para aproximar a lojista do aplicativo.' },
  { id: 'rotina', time: '9h', name: 'Lembrete da rotina', description: 'Um convite leve para abrir o app e executar a primeira ação do dia.' },
]

const DEFAULTS = {
  motivacional: { id: 'motivacional', enabled: true, title_template: 'Bom dia, {{nome}}! 💛', body_template: 'Respire, organize o foco e comece com confiança. Hoje é mais uma oportunidade de movimentar sua loja. Toque para entrar no app.' },
  rotina: { id: 'rotina', enabled: true, title_template: 'Vamos começar a rotina de hoje? ✨', body_template: '{{nome}}, sua primeira ação já está te esperando. Abra o app e avance um passo de cada vez.' },
}

function preview(text) {
  return String(text || '').replaceAll('{{nome}}', 'Ana')
}

export default function AdminNotificacoes() {
  const router = useRouter()
  const [settings, setSettings] = useState(DEFAULTS)
  const [activeDevices, setActiveDevices] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState('')
  const [notice, setNotice] = useState(null)

  async function sessionToken() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return null
    }
    return session.access_token
  }

  async function api(path, options = {}) {
    const token = await sessionToken()
    if (!token) throw new Error('Entre novamente para continuar.')
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta ação.')
    return result
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api('/api/admin/notificacoes')
        if (!active) return
        setSettings(Object.fromEntries((result.settings || []).map(item => [item.id, item])))
        setActiveDevices(result.activeDevices || 0)
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

  function update(id, field, value) {
    setSettings(current => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setNotice(null)
  }

  function payload() {
    return TYPES.map(type => settings[type.id] || DEFAULTS[type.id])
  }

  async function save(showNotice = true) {
    const result = await api('/api/admin/notificacoes', {
      method: 'PUT',
      body: JSON.stringify({ settings: payload() }),
    })
    setSettings(Object.fromEntries(result.settings.map(item => [item.id, item])))
    if (showNotice) setNotice({ type: 'success', text: 'Alterações salvas. Os próximos envios já usarão estes textos.' })
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
      const result = await api('/api/admin/notificacoes', { method: 'POST', body: JSON.stringify({ type }) })
      setNotice({ type: 'success', text: `Teste enviado para ${result.sent} dispositivo${result.sent === 1 ? '' : 's'} seu(s).` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setTesting('')
    }
  }

  return (
    <div className="page">
      <header className="header">
        <button className="back" onClick={() => router.push('/admin')}>← Administração</button>
        <div>
          <small>MARKETING E COMUNICAÇÃO</small>
          <h1>Notificações</h1>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <span className="eyebrow">CONTATO DIÁRIO</span>
            <h2>Duas mensagens, dois convites para voltar ao app</h2>
            <p>Edite o conteúdo, pause um horário ou envie um teste para conferir como a notificação chega no celular.</p>
          </div>
          <div className="deviceCount"><strong>{activeDevices}</strong><span>dispositivo{activeDevices === 1 ? '' : 's'} ativo{activeDevices === 1 ? '' : 's'}</span></div>
        </section>

        {notice && <div className={`notice ${notice.type}`}>{notice.type === 'success' ? '✓' : '!'} {notice.text}</div>}

        {loading ? <div className="loading">Carregando notificações...</div> : (
          <div className="list">
            {TYPES.map(type => {
              const item = settings[type.id] || DEFAULTS[type.id]
              return (
                <article className={`notificationCard ${item.enabled ? '' : 'paused'}`} key={type.id}>
                  <div className="cardHeader">
                    <div className="time">{type.time}</div>
                    <div className="cardTitle">
                      <h3>{type.name}</h3>
                      <p>{type.description}</p>
                    </div>
                    <label className="toggleLabel">
                      <input type="checkbox" checked={item.enabled} onChange={event => update(type.id, 'enabled', event.target.checked)} />
                      <span className="toggle" />
                      <b>{item.enabled ? 'Ativa' : 'Pausada'}</b>
                    </label>
                  </div>

                  <div className="editorGrid">
                    <div className="fields">
                      <label>
                        <span>Título <i>{item.title_template.length}/80</i></span>
                        <input maxLength={80} value={item.title_template} onChange={event => update(type.id, 'title_template', event.target.value)} />
                      </label>
                      <label>
                        <span>Mensagem <i>{item.body_template.length}/240</i></span>
                        <textarea maxLength={240} rows={4} value={item.body_template} onChange={event => update(type.id, 'body_template', event.target.value)} />
                      </label>
                      <p className="hint">Use <code>{'{{nome}}'}</code> para chamar cada lojista pelo primeiro nome.</p>
                    </div>

                    <div className="preview">
                      <span>PRÉVIA NO CELULAR</span>
                      <div className="phoneNotification">
                        <div className="appIcon">R</div>
                        <div><small>Rotina da Loja · agora</small><strong>{preview(item.title_template)}</strong><p>{preview(item.body_template)}</p></div>
                      </div>
                      <button disabled={Boolean(testing) || saving} onClick={() => sendTest(type.id)}>{testing === type.id ? 'Enviando...' : 'Enviar teste para mim'}</button>
                      <small className="testHelp">Ao testar, as alterações também são salvas.</small>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {!loading && <div className="actions"><p>Os horários seguem o fuso de Brasília.</p><button disabled={saving || Boolean(testing)} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>}
      </main>

      <style jsx>{`
        .page{min-height:100vh;background:#090909;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.header{min-height:68px;display:flex;align-items:center;gap:15px;padding:13px 20px;border-bottom:1px solid #292929;background:#111;position:sticky;top:0;z-index:5}.header small,.eyebrow{display:block;color:${GOLD};font-size:10px;font-weight:900;letter-spacing:.11em}.header h1{font-size:17px;margin:2px 0 0}.back{min-height:37px;padding:7px 12px;border:1px solid #353535;border-radius:8px;background:#171717;color:${GOLD};font-weight:800;cursor:pointer}main{max-width:1040px;margin:0 auto;padding:28px 18px 76px}.intro{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:18px}.intro h2{font-size:24px;margin:7px 0}.intro p{color:#929292;font-size:13px;line-height:1.55;margin:0;max-width:670px}.deviceCount{min-width:150px;padding:14px 18px;border:1px solid #3b3527;border-radius:12px;background:#15130e;text-align:center}.deviceCount strong{display:block;color:${GOLD};font-size:25px}.deviceCount span{color:#aaa;font-size:11px}.notice{margin:0 0 15px;padding:12px 14px;border-radius:9px;font-size:13px}.notice.success{border:1px solid #355e3e;background:#112317;color:#a9e5b5}.notice.error{border:1px solid #713434;background:#2a1212;color:#ffb4b4}.loading{padding:55px;text-align:center;border:1px solid #292929;border-radius:13px;color:#777}.list{display:grid;gap:15px}.notificationCard{border:1px solid #35312a;border-left:3px solid ${GOLD};border-radius:14px;background:#121212;overflow:hidden}.notificationCard.paused{border-left-color:#555;opacity:.78}.cardHeader{display:flex;align-items:center;gap:14px;padding:17px 18px;border-bottom:1px solid #282828}.time{width:54px;height:54px;display:grid;place-items:center;flex:0 0 auto;border-radius:14px;background:rgba(212,175,55,.12);color:${GOLD};font-size:18px;font-weight:900}.cardTitle{flex:1}.cardTitle h3{font-size:16px;margin:0 0 4px}.cardTitle p{color:#777;font-size:11px;line-height:1.45;margin:0}.toggleLabel{display:flex;align-items:center;gap:8px;cursor:pointer;color:#bbb;font-size:11px}.toggleLabel input{position:absolute;opacity:0;pointer-events:none}.toggle{width:40px;height:22px;border-radius:99px;background:#3a3a3a;position:relative;transition:.2s}.toggle:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#aaa;transition:.2s}.toggleLabel input:checked+.toggle{background:${GOLD}}.toggleLabel input:checked+.toggle:after{left:21px;background:#111}.editorGrid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:20px;padding:18px}.fields label{display:block;margin-bottom:13px}.fields label>span{display:flex;justify-content:space-between;color:#ddd;font-size:12px;font-weight:800;margin-bottom:7px}.fields i{color:#666;font-size:10px;font-style:normal;font-weight:500}.fields input,.fields textarea{box-sizing:border-box;width:100%;border:1px solid #343434;border-radius:9px;background:#0b0b0b;color:#fff;padding:11px 12px;outline:none;font:inherit;font-size:13px;line-height:1.5}.fields input:focus,.fields textarea:focus{border-color:${GOLD}}.fields textarea{resize:vertical}.hint{color:#777;font-size:11px;margin:0}.hint code{padding:2px 5px;border-radius:4px;background:#272318;color:#e7c851}.preview{padding:14px;border:1px solid #302e29;border-radius:12px;background:#0c0c0c}.preview>span{display:block;color:#696969;font-size:9px;font-weight:900;letter-spacing:.12em;margin-bottom:10px}.phoneNotification{display:flex;gap:10px;padding:12px;border-radius:13px;background:linear-gradient(135deg,#34383d,#24282c);box-shadow:0 8px 20px #0005}.appIcon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:9px;background:linear-gradient(135deg,#d7b239,#f4d66b);color:#111;font-weight:1000}.phoneNotification small{display:block;color:#d0d0d0;font-size:9px;margin-bottom:3px}.phoneNotification strong{display:block;font-size:12px;line-height:1.3}.phoneNotification p{color:#eee;font-size:10px;line-height:1.4;margin:3px 0 0}.preview button{width:100%;min-height:39px;margin-top:12px;border:1px solid #494131;border-radius:8px;background:#1a1813;color:${GOLD};font-weight:800;cursor:pointer}.preview button:disabled,.actions button:disabled{opacity:.55;cursor:wait}.testHelp{display:block;color:#616161;font-size:9px;text-align:center;margin-top:6px}.actions{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:18px;padding:14px 0}.actions p{color:#777;font-size:11px;margin:0}.actions button{min-height:44px;padding:0 22px;border:0;border-radius:9px;background:linear-gradient(135deg,#d4af37,#f4d366);color:#111;font-weight:900;cursor:pointer}
        @media(max-width:720px){.header{padding:12px}.header small{font-size:8px}main{padding:22px 12px 65px}.intro{align-items:stretch;flex-direction:column}.deviceCount{text-align:left}.cardHeader{align-items:flex-start;flex-wrap:wrap;padding:14px}.cardTitle{min-width:calc(100% - 72px)}.toggleLabel{margin-left:68px}.editorGrid{grid-template-columns:1fr;padding:14px}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}.intro h2{font-size:21px}}
      `}</style>
    </div>
  )
}
