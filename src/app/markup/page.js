'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Markup() {
  const [carregando, setCarregando] = useState(true)
  const [custo, setCusto] = useState('')
  const [lucroPct, setLucroPct] = useState('')
  const [fixasPct, setFixasPct] = useState('')
  const [variaveisPct, setVariaveisPct] = useState('')
  const [verAula, setVerAula] = useState(false)
  const router = useRouter()

  // ════════ LINK DA AULA (cole o link do vídeo aqui depois) ════════
  const VIDEO_AULA = '' // ex: 'https://player.scaleup.com.br/embed/SEU_CODIGO'

  const ouro = '#D4AF37'
  const ouroGrad = 'linear-gradient(135deg, #D4AF37, #F5D76E)'

  useEffect(() => {
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setCarregando(false)
    }
    verificar()
  }, [router])

  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: '15px' }}>Carregando...</p>
      </div>
    )
  }

  // ─── CÁLCULO (lógica da planilha 3_Markup) ───
  const c = parseFloat(custo) || 0
  const lPct = (parseFloat(lucroPct) || 0) / 100
  const fPct = (parseFloat(fixasPct) || 0) / 100
  const vPct = (parseFloat(variaveisPct) || 0) / 100

  const temDados = c > 0 && (lPct > 0 || fPct > 0 || vPct > 0)
  const somaPct = lPct + fPct + vPct
  const inviavel = somaPct >= 1

  const markup = inviavel ? 0 : 1 / (1 - somaPct)
  const precoVenda = c * markup
  const lucroRS = precoVenda * lPct
  const margemReal = precoVenda > 0 ? (lucroRS / precoVenda) * 100 : 0

  const fmt = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = v => (v || 0).toFixed(1).replace('.', ',') + '%'

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/painel')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Rotina da Loja Milionária</p>
          <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>📊 Calculadora de Markup</p>
        </div>
      </header>

      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 18px 60px' }}>

        <p style={{ fontSize: '14px', color: '#888', margin: '0 0 18px', lineHeight: 1.5 }}>
          Descubra o <strong style={{ color: '#FFF' }}>preço de venda ideal</strong> da sua peça, considerando o custo, o lucro que você quer e as despesas da loja.
        </p>

        {/* AULA EM VÍDEO */}
        <div style={{ background: '#111111', border: `1px solid ${ouro}`, borderRadius: '14px', padding: '14px', marginBottom: '20px' }}>
          <div onClick={() => setVerAula(!verAula)} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: ouroGrad, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>▶</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Como usar a calculadora de Markup</p>
              <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0' }}>Assista à aula rápida e aprenda a precificar com lucro</p>
            </div>
            <span style={{ color: ouro, fontSize: '18px' }}>{verAula ? '▲' : '▼'}</span>
          </div>
          {verAula && (
            <div style={{ marginTop: '14px' }}>
              {VIDEO_AULA ? (
                <iframe src={VIDEO_AULA} title="Como usar a calculadora de Markup" allowFullScreen style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: '10px' }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#1A1A1A', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '13px', textAlign: 'center', padding: '0 20px' }}>
                  🎬 Cole o link da aula no campo VIDEO_AULA, no topo do arquivo
                </div>
              )}
            </div>
          )}
        </div>

        {/* ENTRADAS */}
        <div style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '16px', padding: '20px', marginBottom: '18px' }}>
          <Campo label="Custo da peça (R$)" valor={custo} onChange={setCusto} placeholder="Ex: 15,00" ouro={ouro} />
          <Campo label="Lucro desejado (%)" valor={lucroPct} onChange={setLucroPct} placeholder="Ex: 25" ouro={ouro} />
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Campo label="Despesas fixas (%)" valor={fixasPct} onChange={setFixasPct} placeholder="Ex: 13" ouro={ouro} compacto />
            </div>
            <div style={{ flex: 1 }}>
              <Campo label="Despesas variáveis (%)" valor={variaveisPct} onChange={setVariaveisPct} placeholder="Ex: 5" ouro={ouro} compacto />
            </div>
          </div>
        </div>

        {/* RESULTADOS */}
        {!temDados ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#555' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>📊</div>
            <p style={{ fontSize: '14px', margin: 0 }}>Preencha os campos para ver o preço de venda ideal.</p>
          </div>
        ) : inviavel ? (
          <div style={{ background: '#3a1010', border: '1px solid #5A1A1A', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#e88', margin: 0 }}>⚠ A soma de lucro + despesas é 100% ou mais. Reveja os percentuais — não é possível precificar assim.</p>
          </div>
        ) : (
          <>
            {/* DESTAQUE: preço de venda */}
            <div style={{ background: ouroGrad, borderRadius: '18px', padding: '22px', marginBottom: '14px', color: '#0A0A0A' }}>
              <p style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px', opacity: 0.7 }}>💰 Preço de venda ideal</p>
              <div style={{ fontSize: '44px', fontWeight: 900, lineHeight: 1 }}>{fmt(precoVenda)}</div>
              <p style={{ fontSize: '13px', margin: '8px 0 0', opacity: 0.75 }}>Índice Markup: <strong>{markup.toFixed(2).replace('.', ',')}×</strong></p>
            </div>

            {/* Resumo enxuto */}
            <div style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '16px', padding: '18px' }}>
              <Linha label="Custo da peça" valor={fmt(c)} />
              <Linha label="Multiplicar por (Markup)" valor={markup.toFixed(2).replace('.', ',') + '×'} cor={ouro} />
              <div style={{ borderTop: '1px solid #2A2A2A', margin: '8px 0' }} />
              <Linha label="Preço de venda" valor={fmt(precoVenda)} forte />
              <Linha label="Lucro por peça" valor={fmt(lucroRS)} cor="#5dca8a" forte />
            </div>

            <p style={{ fontSize: '12px', color: '#555', margin: '16px 4px 0', lineHeight: 1.5, textAlign: 'center' }}>
              💡 Multiplique o custo de qualquer peça por <strong style={{ color: ouro }}>{markup.toFixed(2).replace('.', ',')}×</strong> para achar o preço de venda com esse mesmo lucro.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Campo({ label, valor, onChange, placeholder, ouro, compacto }) {
  return (
    <div style={{ marginBottom: compacto ? 0 : '16px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#888', marginBottom: '7px' }}>{label}</label>
      <input
        type="text" inputMode="decimal" value={valor}
        onChange={e => onChange(e.target.value.replace(',', '.'))}
        placeholder={placeholder}
        style={{ width: '100%', padding: '13px 15px', background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '10px', fontSize: '16px', color: '#FFF', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = ouro}
        onBlur={e => e.target.style.borderColor = '#2A2A2A'}
      />
    </div>
  )
}

function Linha({ label, valor, cor, forte }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontSize: '14px', color: '#AAA' }}>{label}</span>
      <span style={{ fontSize: forte ? '17px' : '14px', fontWeight: forte ? 800 : 600, color: cor || '#FFF' }}>{valor}</span>
    </div>
  )
}
