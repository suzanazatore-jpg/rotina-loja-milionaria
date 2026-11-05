import { notFound } from 'next/navigation'
import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { readReceipt } from '@/lib/saleReceipt'
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Acompanhar compra',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
const labels = {
  paid: 'Pagamento aprovado',
  refunded: 'Pagamento reembolsado',
  chargedback: 'Pagamento contestado',
  failed: 'Pagamento recusado',
  canceled: 'Pagamento cancelado',
  expired: 'Pagamento expirado',
  authorized: 'Pagamento autorizado',
  processing: 'Pagamento em processamento',
  pending: 'Pagamento pendente',
  waiting_payment: 'Aguardando pagamento',
}

export default async function Receipt({ params }) {
  const id = readReceipt((await params).token)
  if (!id) notFound()
  const { data, error } = await checkoutAdminClient()
    .from('orders')
    .select('status,payment_method,total_cents,created_at,offer:offers(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Não foi possível consultar a venda.')
  if (!data) notFound()
  const total = (data.total_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <main
      style={{
        maxWidth: 550,
        margin: '10vh auto',
        padding: '32px',
        background: '#fff',
        color: '#24183b',
        border: '1px solid #e6e0ef',
        borderRadius: 16,
      }}
    >
      <small>Suzana Zatorre Educacional</small>
      <h1>Acompanhar compra</h1>
      <p>
        <strong>{labels[data.status] || 'Consulte o atendimento'}</strong>
      </p>
      <dl>
        <dt>Oferta</dt>
        <dd>{data.offer?.name || '—'}</dd>
        <dt>Valor</dt>
        <dd>{total}</dd>
        <dt>Forma de pagamento</dt>
        <dd>
          {{ pix: 'Pix', credit_card: 'Cartão de crédito', boleto: 'Boleto' }[data.payment_method] ||
            '—'}
        </dd>
        <dt>Data da compra</dt>
        <dd>{new Date(data.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</dd>
      </dl>
    </main>
  )
}
