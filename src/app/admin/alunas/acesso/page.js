'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ouro = '#D4AF37'
const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

function AcessoAlunaConteudo() {
  const router = useRouter()
  const params = useSearchParams()
  const alunaId = params.get('id')
  const [dados, setDados] = useState(null)
  const [cursos, setCursos] = useState([])
  const [planos, setPlanos] = useState([])
  const [compra, setCompra] = useState('')
  const [expiracao, setExpiracao] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (alunaId) carregar()
    // carregar usa apenas o id atual e a sessão ativa desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunaId])

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function carregar() {
    const accessToken = await token()
    if (!accessToken) { router.push('/login'); return }
    const resposta = await fetch(`/api/admin/acesso-aluna?id=${alunaId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const json = await resposta.json()
    if (!resposta.ok) { setMensagem(json.error || 'Não foi possível carregar.'); return }
    setDados(json)
    setPlanos(json.planoIds || [])
    setCursos(json.matriculas.filter(m => m.status === 'active').map(m => m.course_id))
    const primeira = json.matriculas[0]
    if (primeira?.purchased_at) setCompra(primeira.purchased_at.slice(0, 10))
    if (primeira?.expires_at) setExpiracao(primeira.expires_at.slice(0, 10))
  }

  function alternar(lista, setLista, id) { setLista(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]) }

  async function salvar() {
    setSalvando(true); setMensagem('')
    const accessToken = await token()
    const resposta = await fetch('/api/admin/acesso-aluna', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ alunaId, cursoIds: cursos, planoIds: planos, dataCompra: compra || null, dataExpiracao: expiracao || null }),
    })
    const json = await resposta.json()
    setMensagem(resposta.ok ? `✓ Acesso salvo: ${json.cursosLiberados} curso(s) liberado(s).` : json.error || 'Erro ao salvar.')
    setSalvando(false)
    if (resposta.ok) await carregar()
  }

  if (!dados) return <div style={tela}><p>{mensagem || 'Carregando...'}</p></div>

  return <div style={tela}>
    <header style={{ padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111' }}><button onClick={() => router.push('/admin/alunas')} style={voltar}>← Alunas</button></header>
    <main style={{ maxWidth: '760px', width: '100%', margin: '0 auto', padding: '26px 18px 60px', boxSizing: 'border-box' }}>
      <p style={{ color: ouro, fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', margin: 0 }}>ACESSOS DA ALUNA</p>
      <h1 style={{ fontSize: '24px', margin: '5px 0' }}>{dados.aluna.nome || dados.aluna.email}</h1>
      <p style={{ color: '#888', margin: '0 0 20px' }}>{dados.aluna.email}</p>
      {mensagem && <div style={aviso}>{mensagem}</div>}

      <Secao titulo="Planos" subtitulo="O plano libera automaticamente os cursos vinculados.">
        <Chips itens={dados.planos} selecionados={planos} alternar={id => alternar(planos, setPlanos, id)} nome="name" vazio="Nenhum plano cadastrado ainda." />
      </Secao>
      <Secao titulo="Cursos avulsos" subtitulo="Você pode liberar vários cursos além do plano.">
        <Chips itens={dados.cursos} selecionados={cursos} alternar={id => alternar(cursos, setCursos, id)} nome="title" vazio="Nenhum curso cadastrado ainda." />
      </Secao>
      <Secao titulo="Datas" subtitulo="A expiração individual tem prioridade sobre a validade do plano.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '12px' }}>
          <label>Data da compra<input type="date" value={compra} onChange={e => setCompra(e.target.value)} style={campo} /></label>
          <label>Data de expiração<input type="date" value={expiracao} onChange={e => setExpiracao(e.target.value)} style={campo} /></label>
        </div>
      </Secao>
      <button onClick={salvar} disabled={salvando} style={{ background: ouroGrad, color: '#090909', border: 0, borderRadius: '9px', padding: '12px 19px', fontWeight: 800, cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar acessos'}</button>
    </main>
  </div>
}

function Secao({ titulo, subtitulo, children }) { return <section style={{ background: '#111', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '18px', marginBottom: '14px' }}><h2 style={{ fontSize: '16px', margin: 0 }}>{titulo}</h2><p style={{ color: '#777', fontSize: '13px', margin: '4px 0 13px' }}>{subtitulo}</p>{children}</section> }
function Chips({ itens, selecionados, alternar, nome, vazio }) { return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{itens.map(item => <button key={item.id} onClick={() => alternar(item.id)} style={{ border: selecionados.includes(item.id) ? `1px solid ${ouro}` : '1px solid #333', background: selecionados.includes(item.id) ? '#30280d' : '#171717', color: '#FFF', borderRadius: '999px', padding: '8px 11px', cursor: 'pointer' }}>{item[nome]}</button>)}{!itens.length && <span style={{ color: '#666', fontSize: '13px' }}>{vazio}</span>}</div> }
const tela = { minHeight: '100vh', background: '#0A0A0A', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const voltar = { background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: ouro, padding: '7px 12px', cursor: 'pointer' }
const campo = { display: 'block', width: '100%', marginTop: '6px', background: '#0A0A0A', color: '#FFF', border: '1px solid #333', borderRadius: '8px', padding: '10px', boxSizing: 'border-box' }
const aviso = { background: '#18150b', border: '1px solid #5b4c17', color: '#F5D76E', padding: '11px 13px', borderRadius: '9px', marginBottom: '14px' }

export default function AcessoAluna() {
  return <Suspense fallback={<div style={tela}><p>Carregando...</p></div>}><AcessoAlunaConteudo /></Suspense>
}
