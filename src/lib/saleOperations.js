import { randomUUID } from 'node:crypto'
import { CHECKOUT_ORIGIN, paymentLink } from './checkoutLinks.js'
import { receiptToken } from './saleReceipt.js'
import { PaymentError, pagarme } from './pagarme.js'
import { normalizeContact } from './checkoutContacts.js'
import { reverseOrderAccess } from './checkoutAccessServer.js'

export const saleActionNames = {
  access: 'Área de Membros',
  email: 'Emails Transacionais',
  invoice: 'Nota fiscal informada',
  buyer: 'Comprador editado',
  refund: 'Solicitação de reembolso',
  chargeback: 'Chargeback confirmado',
}
const fields = ['country', 'street', 'number', 'line_2', 'district', 'city', 'state', 'zip_code']
const clean = (v, max = 200) =>
  String(v ?? '')
    .trim()
    .slice(0, max)
async function checked(query) {
  const result = await query
  if (result.error)
    throw new PaymentError('Não foi possível consultar ou salvar o registro da venda.', 503)
  return result.data
}
function receiptUrl(id) {
  const token = receiptToken(id)
  return token ? CHECKOUT_ORIGIN + '/fatura/' + token : ''
}
async function audit(db, id, action, detail, key = randomUUID()) {
  return checked(
    db
      .from('webhook_events')
      .insert({
        pagarme_event_id: 'sale-operation:' + key,
        type: 'sale.' + action,
        payload: { order_id: id, ...detail },
        processed_at: new Date().toISOString(),
      }),
  )
}

export async function saleContext(db, id) {
  const [order, history] = await Promise.all([
    checked(
      db
        .from('orders')
        .select(
          'id,offer_id,status,total_cents,pagarme_charge_id,pagarme_order_id,payment_method,pix_qr_code,pix_expires_at,customer_id,customer:customers(name,email,profile_id),offer:offers(id,checkout_config,payment_path)',
        )
        .eq('id', id)
        .maybeSingle(),
    ),
    checked(
      db
        .from('webhook_events')
        .select('id,type,payload,received_at,processed_at,error')
        .eq('payload->>order_id', id)
        .like('type', 'sale.%')
        .order('received_at', { ascending: false }),
    ),
  ])
  if (!order) throw new PaymentError('Venda não encontrada.', 404)
  const [grant, legacy] = await Promise.all([
    checked(
      db
        .from('checkout_access_grants')
        .select('profile_id,expires_at,revoked_at,review_required')
        .eq('order_id', id)
        .maybeSingle(),
    ),
    checked(
      db
        .from('webhook_events')
        .select('payload,processed_at')
        .eq('pagarme_event_id', 'access:' + id)
        .maybeSingle(),
    ),
  ])
  const profileId = grant?.profile_id || (legacy?.processed_at && legacy.payload?.profile_id)
  const profile =
    profileId &&
    (await checked(
      db
        .from('perfis')
        .select('id,email,status_assinatura,acesso_expira_em')
        .eq('id', profileId)
        .maybeSingle(),
    ))
  const active = grant
    ? !grant.revoked_at && !grant.review_required && Date.parse(grant.expires_at) > Date.now()
    : profile?.status_assinatura === 'ativo' && Date.parse(profile.acesso_expira_em) > Date.now()
  const member = Boolean(
    process.env.BREVO_API_KEY &&
      order.status === 'paid' &&
      active &&
      profile?.email &&
      profile.id === order.customer?.profile_id &&
      profile.email.toLowerCase() === order.customer?.email?.toLowerCase(),
  )
  return {
    order,
    profile,
    view: {
      member,
      email: Boolean(process.env.BREVO_API_KEY && order.customer?.email && receiptUrl(id)),
      receipt: receiptUrl(id),
      payment: order.offer && paymentLink(order.offer),
      pix: order.pix_qr_code,
      expires: order.pix_expires_at,
      invoice: history.find((e) => e.type === 'sale.invoice')?.payload,
      buyer: history.find((e) => e.type === 'sale.buyer')?.payload?.buyer,
      events: history.map((e) => ({
        id: e.id,
        title: saleActionNames[e.type.slice(5)] || e.type,
        at: e.received_at,
        description: e.payload.reason || e.error || (e.processed_at ? 'Registrado' : 'Em processamento'),
        detail: {
          ação: saleActionNames[e.type.slice(5)],
          resultado: e.error || e.payload.result || 'Registrado',
          registro: e.id,
        },
      })),
    },
  }
}

async function sendMail(db, ctx, action, requestId) {
  const { order, profile, view } = ctx
  if (!(action === 'access' ? view.member : view.email))
    throw new PaymentError('Este canal está indisponível para esta venda.', 409)
  const email = action === 'access' ? profile.email : order.customer.email
  const text =
    action === 'access'
      ? `Seu acesso à área de membros Suzana Zatorre está disponível em ${CHECKOUT_ORIGIN}/login. Entre com este e-mail. Para criar uma nova senha, acesse ${CHECKOUT_ORIGIN}/esqueci-senha.`
      : `Acompanhe sua compra pelo link ${view.receipt}`
  const key = 'sale-mail:' + order.id + ':' + action + ':' + requestId
  const inserted = await db
    .from('webhook_events')
    .insert({
      pagarme_event_id: key,
      type: 'sale.' + action,
      payload: { order_id: order.id },
      error: 'Em processamento',
    })
  if (inserted.error?.code === '23505')
    throw new PaymentError('Solicitação já registrada. Consulte a auditoria.', 409)
  if (inserted.error) throw new PaymentError('Não foi possível registrar o envio.', 503)
  let response
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        sender: { name: 'Suzana Zatorre', email: 'suporte@suzanazatorre.com.br' },
        to: [{ email }],
        subject: action === 'access' ? 'Seu acesso à área de membros' : 'Acompanhe sua compra',
        textContent: text,
      }),
    })
  } finally {
    const result = response?.ok
      ? 'Aceito pelo serviço de e-mail'
      : response
        ? 'Recusado pelo serviço de e-mail'
        : 'Envio sem confirmação'
    await checked(
      db
        .from('webhook_events')
        .update({
          processed_at: response?.ok ? new Date().toISOString() : null,
          error: response?.ok ? null : result,
          payload: { order_id: order.id, result },
        })
        .eq('pagarme_event_id', key),
    )
  }
  if (!response.ok) throw new PaymentError('O serviço de e-mail recusou o envio.', 502)
  return 'E-mail aceito pelo serviço de envio.'
}

export async function saleAction(db, ctx, input) {
  const { order } = ctx,
    { action } = input
  if (action === 'access' || action === 'email') return sendMail(db, ctx, action, input.requestId)
  if (action === 'invoice') {
    const invoice = Object.fromEntries(
      ['number', 'key', 'issued', 'xml', 'pdf'].map((k) => [
        k,
        clean(input[k], k === 'xml' || k === 'pdf' ? 1200 : 100),
      ]),
    )
    if (!invoice.number || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.issued))
      throw new PaymentError('Informe o ID e a data da nota.')
    for (const url of [invoice.xml, invoice.pdf].filter(Boolean))
      if (!/^https:\/\/[^\s]+$/i.test(url)) throw new PaymentError('Informe uma URL HTTPS.')
    await audit(db, order.id, action, invoice)
    return 'Nota fiscal registrada.'
  }
  if (action === 'buyer') {
    let contact
    try {
      contact = normalizeContact(input)
    } catch (e) {
      throw new PaymentError(e.message)
    }
    const billing_address = Object.fromEntries(fields.map((k) => [k, clean(input.billing_address?.[k])]))
    await audit(db, order.id, action, {
      buyer: { ...contact, billing_address, company: clean(input.company) },
    })
    return 'Dados do comprador desta venda atualizados.'
  }
  if (!['refund', 'chargeback'].includes(action)) throw new PaymentError('Ação inválida.')
  const reason = clean(input.reason, 1000)
  if (!reason || input.confirm !== true || order.status !== 'paid' || !order.pagarme_charge_id)
    throw new PaymentError('Confirme a ação em uma venda aprovada e informe o motivo.', 409)
  const path = '/charges/' + order.pagarme_charge_id
  const charge = await pagarme(path)
  if (
    charge.id !== order.pagarme_charge_id ||
    charge.amount !== order.total_cents ||
    (charge.order?.id && charge.order.id !== order.pagarme_order_id)
  )
    throw new PaymentError('A cobrança não corresponde à venda.', 409)
  if (action === 'refund') {
    if (
      charge.status !== 'paid' ||
      charge.paid_amount !== order.total_cents ||
      charge.canceled_amount > 0
    )
      throw new PaymentError('A cobrança não permite reembolso integral. Consulte o provedor.', 409)
    await audit(db, order.id, action, { reason, result: 'Solicitado ao provedor' })
    const result = await pagarme(path, {
      method: 'DELETE',
      body: { amount: order.total_cents },
      idempotencyKey: 'full-refund-' + order.id,
    })
    if (result.id !== charge.id)
      throw new PaymentError('Resposta sem confirmação. Consulte o provedor.', 502)
    if (!['canceled', 'refunded'].includes(result.status))
      return 'Solicitação recebida. Aguarde a confirmação do provedor.'
  } else {
    if (!['chargedback', 'chargeback'].includes(charge.status))
      throw new PaymentError('A contestação ainda não foi confirmada pelo Pagar.me.', 409)
    await audit(db, order.id, action, { reason })
  }
  await checked(
    db
      .from('orders')
      .update({ status: action === 'refund' ? 'refunded' : 'chargedback' })
      .eq('id', order.id)
      .eq('status', 'paid'),
  )
  await reverseOrderAccess(db, order.id)
  return action === 'refund' ? 'Reembolso confirmado.' : 'Chargeback confirmado.'
}
