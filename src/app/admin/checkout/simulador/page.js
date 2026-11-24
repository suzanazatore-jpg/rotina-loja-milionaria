'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { SIMULATOR_BRANDS, normalizeSimulatorRates, parseMoney, simulateSale } from '@/lib/salesSimulator'
import { money } from '../CentralUI'
import styles from './Simulator.module.css'

const LEGACY_RATES_KEY = 'sz-central-sales-simulator-v1'
const installmentsOptions = Array.from({ length: 12 }, (_, index) => index + 1)
const currencyInput = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const initialRates = { loading: true, rates: null, error: '', legacy: false }

function readLegacyRates() {
  try {
    const raw = localStorage.getItem(LEGACY_RATES_KEY)
    return raw ? normalizeSimulatorRates(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function installmentLabel(total, count) {
  const approximate = total % count ? '≈ ' : ''
  return `${approximate}${count}x de ${money(Math.round(total / count))}`
}

export default function SalesSimulator() {
  const [mode, setMode] = useState('receive')
  const [amount, setAmount] = useState('')
  const [brand, setBrand] = useState('Mastercard')
  const [installments, setInstallments] = useState(1)
  const [rateState, setRateState] = useState(initialRates)
  const [attempt, setAttempt] = useState(0)
  const [includeFixed, setIncludeFixed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRates() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Entre novamente para consultar as taxas.')

        const response = await fetch('/api/admin/checkout/simulador', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        })
        if (response.status === 401) throw new Error('Entre novamente para consultar as taxas.')
        if (!response.ok) throw new Error('Não foi possível carregar as taxas do Pagar.me.')

        const { rates } = await response.json()
        const legacy = rates ? null : readLegacyRates()
        if (!controller.signal.aborted) {
          setRateState({ loading: false, rates: rates ?? legacy, error: '', legacy: Boolean(legacy) })
        }
      } catch (error) {
        if (!controller.signal.aborted) setRateState({ ...initialRates, loading: false, error: error.message })
      }
    }

    loadRates()
    return () => controller.abort()
  }, [attempt])

  const { rates, loading, error, legacy } = rateState
  const rate = rates?.brands[brand]?.[installments - 1]
  const receiving = mode === 'receive'
  const amountLabel = receiving ? 'Quanto você quer receber?' : 'Quanto você quer cobrar?'
  let result
  let calculationError

  try {
    const amountCents = parseMoney(amount.trim().replace(/[.,]$/, ''))
    if (amountCents && rate != null) {
      result = simulateSale({
        amountCents,
        installments,
        rateBps: rate,
        mode,
        fixedFeeCents: includeFixed ? rates.fixedFeeCents : 0,
      })
    }
  } catch (error) {
    calculationError = error.message
  }

  function formatAmount() {
    try {
      const cents = parseMoney(amount.trim().replace(/[.,]$/, ''))
      if (amount.trim()) setAmount(currencyInput.format(cents / 100))
    } catch {
      // The result area shows the validation error.
    }
  }

  return (
    <main className="central-home">
      <nav className="central-breadcrumb" aria-label="Localização">
        <Link href="/admin/central-vendas">Dashboard</Link>
        <span>/</span>
        <span>Simulador de vendas</span>
      </nav>
      <header className="cv-heading"><h1>Simulador de vendas</h1></header>

      <section className={`central-chart-panel ${styles.panel}`} aria-label="Simular venda no cartão">
        <div className={styles.modes} role="group" aria-label="Modo da simulação">
          <button type="button" aria-pressed={receiving} onClick={() => setMode('receive')}>Quero receber</button>
          <button type="button" aria-pressed={!receiving} onClick={() => setMode('charge')}>Quero cobrar</button>
        </div>

        <div className={styles.fields}>
          <label className={styles.amount}>
            {amountLabel}
            <span className={styles.currency}>
              <span aria-hidden="true">R$</span>
              <input
                aria-label={amountLabel}
                aria-invalid={Boolean(calculationError)}
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                onBlur={formatAmount}
              />
            </span>
          </label>
          <label>
            Número de parcelas
            <select value={installments} onChange={event => setInstallments(Number(event.target.value))}>
              {installmentsOptions.map(count => <option key={count} value={count}>Em {count}x</option>)}
            </select>
          </label>
          <label>
            Bandeira
            <select value={brand} onChange={event => setBrand(event.target.value)}>
              {SIMULATOR_BRANDS.map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
        </div>

        {legacy && rates.fixedFeeCents > 0 && (
          <label className={styles.fixedFee}>
            <input type="checkbox" checked={includeFixed} onChange={event => setIncludeFixed(event.target.checked)} />
            Incluir custo adicional de {money(rates.fixedFeeCents)}
          </label>
        )}

        <div className={styles.result} aria-live="polite">
          <h2>Resultado da simulação</h2>
          {loading && <p className={styles.status}>Carregando taxas do Pagar.me…</p>}
          {error && (
            <div className={styles.error}>
              <p>{error}</p>
              <button type="button" className="central-action" onClick={() => {
                setRateState(initialRates)
                setAttempt(value => value + 1)
              }}>Tentar novamente</button>
            </div>
          )}
          {calculationError && <p className={styles.error}>{calculationError}</p>}
          {!loading && !error && !calculationError && rate == null && (
            <p className={styles.status}>Taxa indisponível para esta bandeira e parcelamento.</p>
          )}
          {!loading && !error && !calculationError && rate != null && (
            <>
              <div className={styles.totals}>
                <div>
                  <span>{receiving ? 'Você deveria cobrar' : 'Se você cobrar'}</span>
                  <strong>{money(result?.gross)}</strong>
                  {result && <small>{installmentLabel(result.gross, installments)}</small>}
                </div>
                <div>
                  <span>{receiving ? 'Para receber' : 'Você vai receber'}</span>
                  <strong>{money(result?.net)}</strong>
                  {result && <small>{installmentLabel(result.net, installments)}</small>}
                </div>
              </div>
              {result && (
                <dl className={styles.details}>
                  <div>
                    <dt>Recebimento estimado</dt>
                    <dd>{rates.settlementDays === 0 ? 'No mesmo dia' : `Em ${rates.settlementDays} ${rates.settlementDays === 1 ? 'dia' : 'dias'}`}</dd>
                  </div>
                  <div>
                    <dt>Taxas da venda</dt>
                    <dd>{money(result.fees)} <small>({percentage.format(result.rateBps / 100)}%)</small></dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </div>

        {rates && (
          <p className={styles.source}>
            {legacy ? 'Taxas salvas neste navegador' : 'Taxas do simulador Pagar.me'}
            {rates.checkedOn && ` · conferidas em ${rates.checkedOn.split('-').reverse().join('/')}`}
          </p>
        )}
      </section>
    </main>
  )
}
