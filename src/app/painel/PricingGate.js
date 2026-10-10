'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PricingCenter from './PricingCenter'

const BRL = n => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const nomes = [
  ['rent','Aluguel mensal'], ['payroll','Salários e encargos'],
  ['utilities','Água, energia e internet'], ['accounting','Contabilidade'],
  ['systems','Sistemas e assinaturas'], ['other_expenses','Outras despesas fixas'],
  ['other_expenses_2','Outras despesas fixas 2'], ['other_expenses_3','Outras despesas fixas 3'],
  ['forecast_revenue','Faturamento mensal previsto'],
]
const vazio = Object.fromEntries(nomes.map(([chave]) => [chave,'']))
const n = valor => Number(String(valor || '0').replace(',','.'))

export default function PricingGate({userId,cores,ouro,ouroGrad}) {
  const [aba,setAba] = useState('fixas')
  const [dados,setDados] = useState(vazio)
  const [salvos,setSalvos] = useState(false)
  const [carregando,setCarregando] = useState(true)
  const [salvando,setSalvando] = useState(false)
  const [erro,setErro] = useState('')
  const total = useMemo(() => nomes.slice(0,-1).reduce((s,[chave]) => s+n(dados[chave]),0),[dados])
  const receita = n(dados.forecast_revenue)
  const pct = receita > 0 ? total / receita * 100 : 0
  const valido = nomes.every(([chave]) => dados[chave] !== '' && Number.isFinite(n(dados[chave])) && n(dados[chave]) >= 0)
    && receita > total && receita > 0

  useEffect(() => {
    let ativo=true
    async function buscar() {
      if (!userId) {setCarregando(false);return}
      const {data,error}=await supabase.from('pricing_fixed_expenses')
        .select('rent,payroll,utilities,accounting,systems,other_expenses,other_expenses_2,other_expenses_3,forecast_revenue')
        .eq('owner_id',userId).maybeSingle()
      if (!ativo) return
      if (error) setErro('Não foi possível consultar suas despesas. Tente recarregar a página.')
      if (!error && data) {
        setDados(Object.fromEntries(nomes.map(([chave]) => [chave,String(data[chave] ?? 0)])))
        setSalvos(true)
        setAba('precificar')
      }
      setCarregando(false)
    }
    void buscar()
    return () => {ativo=false}
  },[userId])

  async function salvar() {
    setErro('')
    if (!valido || !userId) {setErro('Preencha todos os campos (use 0 quando não houver despesa). O faturamento previsto deve superar as despesas fixas.');return}
    setSalvando(true)
    const valores=Object.fromEntries(nomes.map(([chave]) => [chave,n(dados[chave])]))
    const {error}=await supabase.from('pricing_fixed_expenses').upsert({
      owner_id:userId,...valores,updated_at:new Date().toISOString(),
    },{onConflict:'owner_id'})
    setSalvando(false)
    if (error) {setErro('Não foi possível salvar. Verifique sua conexão ou a atualização do aplicativo.');return}
    setSalvos(true)
    setAba('precificar')
  }
  const alterar=(chave,valor)=>{setDados(v=>({...v,[chave]:valor}));setSalvos(false);setErro('')}
  const pronto=salvos && valido && !carregando
  return <div style={{color:cores.tx}}>
    <nav aria-label="Etapas da precificação" style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
      <button type="button" onClick={()=>setAba('fixas')} style={botao(ouro,aba==='fixas')}>1. Despesas Fixas {pronto ? '✓' : ''}</button>
      <button type="button" onClick={()=>{if (!pronto) {window.alert('Preencha a aba Despesas Fixas primeiro.');setAba('fixas');return}setAba('precificar')}} style={botao(ouro,aba==='precificar')}>
        {pronto ? '2. Precificação e Lucro' : '🔒 2. Precificação e Lucro'}
      </button>
    </nav>
    <p style={{fontSize:12,color:cores.tx2,margin:'-7px 0 16px',lineHeight:1.5}}><strong>Observação:</strong> para precificar, primeiro preencha as despesas fixas.</p>
    {carregando ? <p>Carregando suas despesas fixas...</p> : aba==='fixas' ? <section style={{background:cores.card,border:'1px solid '+cores.borda,padding:20,borderRadius:16,maxWidth:760}}>
      <h2 style={{fontSize:21,fontWeight:800,marginBottom:8}}>Despesas Fixas da Loja</h2>
      <p style={{fontSize:13,color:cores.tx2,marginBottom:18}}>Preencha uma vez e atualize sempre que houver mudanças. Digite 0 quando não houver despesa.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
        {nomes.map(([chave,label])=><label key={chave} style={{display:'grid',gap:6,fontSize:13,fontWeight:700}}>
          {label}
          <div style={{display:'flex',alignItems:'center',border:'1px solid '+cores.borda,borderRadius:9,background:cores.card2,padding:'0 12px'}}>
            <span>R$</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={dados[chave]} onChange={e=>alterar(chave,e.target.value)}
              placeholder="0,00" style={{width:'100%',padding:12,color:cores.tx,background:'transparent',border:0,outline:0,fontSize:16}} />
          </div>
        </label>)}
      </div>
      <p style={{marginTop:16,fontSize:14}}>Total de despesas fixas mensais: <strong>{BRL(total)}</strong></p>
      <p style={{marginTop:8,fontSize:14}}>Peso estimado das despesas fixas: <strong>{receita > 0 ? pct.toFixed(2)+'%' : '—'}</strong> do faturamento previsto.</p>
      <p style={{fontSize:12,color:cores.tx2,marginTop:10}}>Se a loja faturar menos que o previsto, o percentual de despesas fixas aumenta. Atualize a previsão quando necessário.</p>
      {erro && <p role="alert" style={{color:'#e05a5a',marginTop:12}}>{erro}</p>}
      <button type="button" disabled={!valido || salvando || !userId} onClick={salvar}
        style={{...botao(ouro,true),background:ouroGrad,marginTop:18,opacity:valido ? 1 :.5}}>
        {salvando ? 'Salvando...' : 'Salvar despesas e liberar precificação'}
      </button>
    </section> : pronto ? <PricingCenter userId={userId} cores={cores} ouro={ouro} ouroGrad={ouroGrad}
      fixedExpensePct={Number(pct.toFixed(3))}/> : <p>Cadastre e salve suas despesas fixas para liberar a precificação.</p>}
  </div>
}
function botao(ouro,ativo) {
  return {padding:'12px 16px',fontSize:13,fontWeight:800,borderRadius:10,border:'1px solid '+ouro,
    color:ativo?'#111':ouro,background:ativo?ouro:'transparent',cursor:'pointer'}
}
