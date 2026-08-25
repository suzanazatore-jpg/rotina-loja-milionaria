'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OURO = '#D4AF37'
const GRADIENTE = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

export default function ComentariosAdmin() {
  const router = useRouter()
  const [tab, setTab] = useState('novas')
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [respostas, setRespostas] = useState({})
  const [processando, setProcessando] = useState('')

  async function api(caminho = '', opcoes = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    const resposta = await fetch(`/api/admin/comentarios${caminho}`, { ...opcoes, headers: { ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${session?.access_token || ''}` } })
    const data = await resposta.json(); if (!resposta.ok) throw new Error(data.error || 'Não foi possível concluir.'); return data
  }
  async function carregar() { setCarregando(true); setErro(''); try { const data = await api(`?tab=${tab}`); setItens(data.comentarios || []) } catch (e) { setErro(e.message) } finally { setCarregando(false) } }
  useEffect(() => { carregar() }, [tab])

  async function responder(item) { const body = String(respostas[item.id] || '').trim(); if (!body) return; setProcessando(item.id); try { await api('', { method: 'POST', body: JSON.stringify({ parent_id: item.id, body, source: item.source }) }); setRespostas(atual => ({ ...atual, [item.id]: '' })); await carregar() } catch (e) { setErro(e.message) } finally { setProcessando('') } }
  async function arquivar(item) { setProcessando(item.id); try { await api('', { method: 'PATCH', body: JSON.stringify({ id: item.id, archived: !item.archived, source: item.source }) }); await carregar() } catch (e) { setErro(e.message) } finally { setProcessando('') } }
  async function excluir(item) { if (!window.confirm('Excluir esta pergunta e todas as respostas? Essa ação não pode ser desfeita.')) return; setProcessando(item.id); try { await api('', { method: 'DELETE', body: JSON.stringify({ id: item.id, source: item.source }) }); await carregar() } catch (e) { setErro(e.message) } finally { setProcessando('') } }

  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #292929', background: '#111', display: 'flex', alignItems: 'center', gap: 14 }}><button onClick={() => router.push('/admin')} style={secundario}>← Administração</button><div><p style={{ color: OURO, fontSize: 10, letterSpacing: '.12em', fontWeight: 800, margin: 0 }}>ADMINISTRAÇÃO</p><h1 style={{ fontSize: 17, margin: '2px 0 0' }}>Comentários</h1></div></header>
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '30px 18px 70px' }}>
      <h2 style={{ margin: 0, fontSize: 23 }}>Comentários das alunas</h2><p style={{ color: '#888', margin: '6px 0 20px', fontSize: 13 }}>Veja as dúvidas, responda pela plataforma e mantenha a caixa organizada.</p>
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #292929', marginBottom: 20 }}>{[['novas','Novas'],['todas','Todas'],['arquivadas','Arquivadas']].map(([valor,rotulo]) => <button key={valor} onClick={() => setTab(valor)} style={{ background: 'transparent', border: 0, borderBottom: tab === valor ? `2px solid ${OURO}` : '2px solid transparent', color: tab === valor ? OURO : '#777', padding: '0 0 10px', fontWeight: 800, cursor: 'pointer' }}>{rotulo}</button>)}</div>
      {erro && <div style={{ color: '#FCA5A5', background: '#291313', border: '1px solid #5B2424', padding: 12, borderRadius: 10, marginBottom: 14 }}>{erro}</div>}
      {carregando ? <p style={{ color: '#777', textAlign: 'center', padding: 40 }}>Carregando comentários...</p> : itens.length === 0 ? <div style={{ border: '1px dashed #333', borderRadius: 14, padding: 48, textAlign: 'center' }}><div style={{ fontSize: 32 }}>💬</div><p style={{ color: '#AAA' }}>{tab === 'novas' ? 'Nenhum comentário novo por enquanto.' : tab === 'arquivadas' ? 'Nenhum comentário arquivado.' : 'Nenhum comentário ainda.'}</p></div> : <div style={{ display: 'grid', gap: 13 }}>{itens.map(item => <article key={item.id} style={{ background: '#121212', border: '1px solid #303030', borderLeft: `3px solid ${item.respostas.length === 0 && !item.archived ? OURO : '#303030'}`, borderRadius: 13, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><strong style={{ fontSize: 14 }}>{item.aluna}</strong>{item.respostas.length === 0 && !item.archived && <span style={{ color: '#0A0A0A', background: GRADIENTE, fontSize: 9, fontWeight: 900, padding: '3px 7px', borderRadius: 20, marginLeft: 8 }}>NOVA</span>}<p style={{ color: '#777', fontSize: 11, margin: '4px 0 0' }}>{item.curso}{item.modulo ? ` · ${item.modulo}` : ''} · {item.aula} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</p></div><div style={{ display: 'flex', gap: 7 }}><button disabled={processando === item.id} onClick={() => arquivar(item)} style={icone}>{item.archived ? '↩' : '▣'}</button><button disabled={processando === item.id} onClick={() => excluir(item)} style={{ ...icone, color: '#F87171' }}>🗑</button></div></div>
        <p style={{ color: '#DDD', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '14px 0' }}>{item.body}</p>
        {item.respostas.map(resposta => <div key={resposta.id} style={{ borderLeft: `2px solid ${OURO}`, paddingLeft: 12, margin: '10px 0' }}><strong style={{ color: OURO, fontSize: 12 }}>Sua resposta · {new Date(resposta.created_at).toLocaleDateString('pt-BR')}</strong><p style={{ color: '#CCC', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.55, margin: '5px 0' }}>{resposta.body}</p></div>)}
        {!item.archived && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><input value={respostas[item.id] || ''} onChange={e => setRespostas(atual => ({ ...atual, [item.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') responder(item) }} maxLength={1000} placeholder="Responder pela plataforma..." style={{ flex: 1, minWidth: 0, background: '#191919', color: '#FFF', border: '1px solid #383838', borderRadius: 10, padding: '11px 13px', outlineColor: OURO }} /><button disabled={processando === item.id || !String(respostas[item.id] || '').trim()} onClick={() => responder(item)} style={{ ...principal, opacity: processando === item.id ? .5 : 1 }}>Enviar</button></div>}
      </article>)}</div>}
    </main>
  </div>
}

const secundario = { background: '#171717', color: '#DDD', border: '1px solid #333', borderRadius: 9, padding: '9px 12px', fontWeight: 700, cursor: 'pointer' }
const principal = { background: GRADIENTE, color: '#0A0A0A', border: 0, borderRadius: 9, padding: '10px 15px', fontWeight: 900, cursor: 'pointer' }
const icone = { background: '#191919', color: '#AAA', border: '1px solid #333', borderRadius: 8, width: 34, height: 34, cursor: 'pointer' }
