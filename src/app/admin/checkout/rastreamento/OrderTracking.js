'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { date, FieldGrid, Timeline } from '../CentralUI'
import { conversionLabel } from './trackingLabels'

const nameAndId = (name, id) => name && name !== id ? <>{name}<br/><small>{id}</small></> : id

export default function OrderTracking({ order, conversion, revision }) {
  const [names, setNames] = useState(null)
  useEffect(() => {
    if (!order.utm_content) return
    const controller = new AbortController()
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(`/api/admin/checkout/rastreamento?${new URLSearchParams({ pedido: order.id })}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` }, cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json()
        if (!controller.signal.aborted) setNames(data.names)
      } catch { /* The registered IDs remain available. */ }
    }
    load()
    return () => controller.abort()
  }, [order.id, order.utm_content, revision])

  const hasOrigin = [order.utm_source, order.utm_medium, order.utm_campaign, order.utm_term, order.utm_content].some(value => value?.trim())
  const events = [
    { id: 'created', title: 'Pedido criado', at: order.created_at },
    { id: 'approved', title: 'Pagamento aprovado', at: order.paid_at },
    { id: 'attempt', title: 'Última tentativa de envio à Meta', description: `${conversion?.attempts} tentativa(s) no total`, at: conversion?.lastAttemptAt },
    { id: 'receipt', title: conversion?.state === 'test' ? 'Evento de teste recebido' : 'Compra recebida pela Meta', at: conversion?.at && ['test', 'accepted'].includes(conversion.state) ? conversion.at : null },
  ].filter(event => event.at).sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return <>
    <FieldGrid title="Origem da venda" fields={[
      ['Origem', order.utm_source || (hasOrigin ? '—' : 'Origem não identificada')],
      ['Mídia', order.utm_medium || '—'],
      ['Campanha', nameAndId(names?.campaign, order.utm_campaign)],
      ['Conjunto', nameAndId(names?.adset, order.utm_term)],
      ['Anúncio', nameAndId(names?.ad, order.utm_content)],
    ]}/>
    <FieldGrid title="Envio à Meta" fields={[
      ['Status do evento de compra', conversionLabel(conversion)],
      ['Tentativas registradas', conversion?.attempts ?? '—'],
      ['Próxima tentativa prevista', date(conversion?.nextAttemptAt)],
    ]}><p className="central-data-note">As compras atribuídas aos anúncios são exibidas por anúncio no relatório de rastreamento.</p></FieldGrid>
    <Timeline title="Histórico de rastreamento" events={events}/>
    <Link href="/admin/checkout/rastreamento" className="cv-link">← Voltar para Rastreamento</Link>
  </>
}
