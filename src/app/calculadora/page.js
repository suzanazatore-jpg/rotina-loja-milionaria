'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Calculadora() {
  const [carregando, setCarregando] = useState(true)
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [fixasPct, setFixasPct] = useState('')      // % despesas fixas
  const [variaveisPct, setVariaveisPct] = useState('') // % despesas variáveis
  const router = useRouter()

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

  // ─── CÁLCULOS (lógica da planilha) ───
  const p = parseFloat(preco) || 0
  const c = parseFloat(custo) || 0
  const fPct = (parseFloat(fixasPct) || 0) / 100
  const vPct = (parseFloat(variaveisPct) || 0) / 100

  const temDados = p > 0 && c > 0

  // No preço de venda atual, as despesas fixas e variáveis são % sobre o preço
  const despFixasRS = p * fPct
  const despVariaveisRS = p * vPct
  const custoTotal = c + despFixasRS + despVariaveisRS // quanto realmente "custa" vender por esse preço
  const lucroAtual = p - custoTotal
  const margemAtual = p > 0 ? (lucroAtual / p) * 100 : 0

  // PREÇO MÍNIMO sem prejuízo: preço onde lucro = 0
  // p_min - c - p_min*fPct - p_min*vPct = 0  →  p_min*(1 - fPct - vPct) = c  →  p_min = c / (1 - fPct - vPct)
  const somaPct = fPct + vPct
  const inviavel = somaPct >= 1 // se despesas % >= 100%, impossível
  const precoMinimo = inviavel ? 0 : c / (1 - somaPct)

  const descontoMaxRS = (p > precoMinimo && !inviavel) ? p - precoMinimo : 0
  const descontoMaxPct = p > 0 ? (descontoMaxRS / p) * 100 : 0

  // Classificação da margem (níveis da planilha)
  function nivelMargem(m) {
    if (m >= 20) return { txt: 'Margem excelente', cor: '#1d9e75', bg: '#04342c', emoji: '🟢' }
    if (m >= 15) return { txt: 'Margem muito boa', cor: '#5dca8a', bg: '#04342c', emoji: '🟢' }
    if (m >= 10) return { txt: 'Margem saudável', cor: '#5dca8a', bg: '#04342c', emoji: '🟢' }
    if (m >= 5) return { txt: 'Loja em risco', cor: '#ef9f27', bg: '#3a2800', emoji: '🟡' }
    if (m > 0) return { txt: 'Quase sem lucro', cor: '#ef9f27', bg: '#3a2800', emoji: '🟡' }
    return { txt: 'Prejuízo!', cor: '#e24b4a', bg: '#3a1010', emoji: '🔴' }
  }
  const nivel = nivelMargem(margemAtual)

  const fmt = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = v => (v || 0).toFixed(1).replace('.', ',') + '%'

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', background: '#111111', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/painel')} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', color: ouro, padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: ouro, textTransform: 'uppercase', margin: 0 }}>Rotina da Loja Milionária</p>
          <p style={{ fontSize: '15px', fontWeight: 800, margin: '1px 0 0' }}>🧮 Calculadora de Desconto</p>
        </div>
      </header>

      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 18px 60px' }}>

        <p style={{ fontSize: '14px', color: '#888', margin: '0 0 22px', lineHeight: 1.5 }}>
          Descubra até quanto você pode descontar <strong style={{ color: '#FFF' }}>sem entrar no prejuízo</strong> — considerando o custo da peça e as despesas da sua loja.
        </p>

        {/* ENTRADAS */}
        <div style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '16px', padding: '20px', marginBottom: '18px' }}>
          <Campo label="Preço de venda (R$)" valor={preco} onChange={setPreco} placeholder="Ex: 199,90" ouro={ouro} />
          <Campo label="Custo da peça (R$)" valor={custo} onChange={setCusto} placeholder="Ex: 80,00" ouro={ouro} />

          <div style={{ borderTop: '1px solid #1F1F1F', margin: '4px 0 16px', paddingTop: '16px' }}>
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 14px', lineHeight: 1.5 }}>
              💡 As despesas abaixo são os percentuais da sua loja (você encontra na sua planilha, aba Markup).
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <Campo label="Despesas fixas (%)" valor={fixasPct} onChange={setFixasPct} placeholder="Ex: 13" ouro={ouro} compacto />
              </div>
              <div style={{ flex: 1 }}>
                <Campo label="Despesas variáveis (%)" valor={variaveisPct} onChange={setVariaveisPct} placeholder="Ex: 5" ouro={ouro} compacto />
              </div>
            </div>
          </div>
        </div>

        {/* RESULTADOS */}
        {!temDados ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#555' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>🧮</div>
            <p style={{ fontSize: '14px', margin: 0 }}>Preencha o preço e o custo para ver o resultado.</p>
          </div>
        ) : inviavel ? (
          <div style={{ background: '#3a1010', border: '1px solid #5A1A1A', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#e88', margin: 0 }}>⚠ As despesas somam 100% ou mais do preço. Reveja os percentuais — não é possível ter lucro assim.</p>
          </div>
        ) : (
          <>
            {/* DESTAQUE: desconto máximo */}
            <div style={{ background: ouroGrad, borderRadius: '18px', padding: '22px', marginBottom: '14px', color: '#0A0A0A' }}>
              <p style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px', opacity: 0.7 }}>🎯 Desconto máximo sem prejuízo</p>
              <div style={{ fontSize: '44px', fontWeight: 900, lineHeight: 1 }}>{fmtPct(descontoMaxPct)}</div>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '6px 0 0' }}>Equivale a {fmt(descontoMaxRS)} de desconto</p>
              <p style={{ fontSize: '12px', margin: '4px 0 0', opacity: 0.7 }}>Preço mínimo: {fmt(precoMinimo)} • abaixo disso, você vende no prejuízo.</p>
            </div>

            {/* Situação atual */}
            <div style={{ background: '#111111', border: '1px solid #2A2A2A', borderRadius: '16px', padding: '18px' }}>
              <p style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px', color: '#888' }}>Detalhamento (no preço atual)</p>
              <Linha label="Custo da peça" valor={fmt(c)} />
              <Linha label="Despesas fixas" valor={fmt(despFixasRS)} />
              <Linha label="Despesas variáveis" valor={fmt(despVariaveisRS)} />
              <div style={{ borderTop: '1px solid #2A2A2A', margin: '8px 0' }} />
              <Linha label="Lucro por peça" valor={fmt(lucroAtual)} cor={lucroAtual >= 0 ? '#5dca8a' : '#e24b4a'} forte />
              <Linha label="Margem de lucro" valor={fmtPct(margemAtual)} cor={nivel.cor} forte />
              {/* Alerta de nível */}
              <div style={{ background: nivel.bg, borderRadius: '10px', padding: '11px 14px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{nivel.emoji}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: nivel.cor }}>{nivel.txt}</span>
              </div>
            </div>

            {/* Guia de margem (da planilha) */}
            <div style={{ marginTop: '18px', padding: '16px', background: '#0E0E0E', borderRadius: '12px', border: '1px solid #1A1A1A' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#666', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Guia de margem</p>
              {[
                { t: '≥ 20% — Margem excelente', c: '#5dca8a' },
                { t: '15% a 20% — Margem muito boa', c: '#5dca8a' },
                { t: '10% a 15% — Margem saudável', c: '#5dca8a' },
                { t: '5% a 10% — Loja em risco', c: '#ef9f27' },
                { t: 'Abaixo de 5% — Quase sem lucro', c: '#e24b4a' },
              ].map((g, i) => (
                <p key={i} style={{ fontSize: '12px', margin: '0 0 5px', color: g.c }}>{g.t}</p>
              ))}
            </div>
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
      <span style={{ fontSize: forte ? '16px' : '14px', fontWeight: forte ? 800 : 600, color: cor || '#FFF' }}>{valor}</span>
    </div>
  )
}
