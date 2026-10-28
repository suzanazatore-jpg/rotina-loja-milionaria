import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { ContractError, sendContractInvite, finalizeSignedContract, logContractEvent, signingUrl, contractsEnabled } from '@/lib/contractsServer'
import { CONTRACT_FIELDS, CONTRACT_TEMPLATES } from '@/lib/contractTemplates'
import { fulfillPaidOrder } from '@/lib/checkoutFulfillmentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request) {
  const db = checkoutAdminClient()
  if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 403)
  const url = new URL(request.url)
  try {
    const pdf = url.searchParams.get('pdf')
    if (pdf) {
      const { data: c } = await db.from('contracts').select('signed_pdf_path').eq('id', pdf).maybeSingle()
      if (!c?.signed_pdf_path) return json({ error: 'PDF ainda não gerado.' }, 404)
      const signed = await db.storage.from('contracts').createSignedUrl(c.signed_pdf_path, 120, { download: 'contrato-assinado.pdf' })
      if (signed.error) throw signed.error
      return json({ url: signed.data.signedUrl })
    }
    const eventsFor = url.searchParams.get('eventos')
    if (eventsFor) {
      const { data, error } = await db.from('contract_events').select('type,channel,ip,detail,created_at').eq('contract_id', eventsFor).order('created_at')
      if (error) throw error
      return json({ eventos: data })
    }
    const status = url.searchParams.get('status')
    let query = db.from('contracts').select('id,order_id,customer_id,offer_id,status,fields,created_at,signed_at,reminders_sent,fulfillment_status,signed_pdf_path').order('created_at', { ascending: false }).limit(200)
    if (status && ['pending', 'viewed', 'signed', 'canceled'].includes(status)) query = query.eq('status', status)
    const [{ data: contracts, error }, { data: templates, error: tError }] = await Promise.all([query, db.from('contract_templates').select('id,slug,name,body,version,active,updated_at').order('slug')])
    if (error || tError) throw error || tError
    const customerIds = [...new Set((contracts || []).map(c => c.customer_id))]
    const offerIds = [...new Set((contracts || []).map(c => c.offer_id))]
    const [{ data: customers }, { data: offers }] = await Promise.all([
      customerIds.length ? db.from('customers').select('id,name,email,phone').in('id', customerIds) : { data: [] },
      offerIds.length ? db.from('offers').select('id,name').in('id', offerIds) : { data: [] },
    ])
    const cMap = new Map((customers || []).map(c => [c.id, c])), oMap = new Map((offers || []).map(o => [o.id, o]))
    return json({
      enabled: contractsEnabled(),
      fields: CONTRACT_FIELDS,
      templates,
      contracts: (contracts || []).map(c => ({ ...c, customer: cMap.get(c.customer_id) || null, offer: oMap.get(c.offer_id)?.name || null, link: c.status === 'signed' || c.status === 'canceled' ? null : signingUrl(c.id), has_pdf: Boolean(c.signed_pdf_path) })),
    })
  } catch (e) {
    return json({ error: e instanceof ContractError ? e.message : 'Não foi possível carregar os contratos.' }, e.status || 500)
  }
}

export async function POST(request) {
  const db = checkoutAdminClient()
  if (!await autorizarAdmin(request, db)) return json({ error: 'Acesso restrito.' }, 403)
  let body
  try { body = await request.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }
  try {
    if (body.action === 'save_template') {
      if (!CONTRACT_TEMPLATES.includes(body.slug)) return json({ error: 'Modelo inválido.' }, 400)
      const text = String(body.body || '')
      if (text.trim().length < 200) return json({ error: 'O texto do contrato está muito curto.' }, 400)
      if (text.length > 200000) return json({ error: 'O texto do contrato está muito longo.' }, 400)
      const { data: current, error } = await db.from('contract_templates').select('id,version,body,name').eq('slug', body.slug).single()
      if (error) throw error
      const name = String(body.name || current.name).trim().slice(0, 120) || current.name
      if (current.body === text && current.name === name) return json({ saved: true, version: current.version })
      // Nova versão: contratos já emitidos guardam o texto da versão que receberam.
      const { data: updated, error: upError } = await db.from('contract_templates').update({ body: text, name, version: current.version + 1, updated_at: new Date().toISOString() }).eq('id', current.id).eq('version', current.version).select('id')
      if (upError) throw upError
      if (!updated?.length) return json({ error: 'Este modelo foi atualizado em outra sessão. Recarregue antes de salvar.' }, 409)
      return json({ saved: true, version: current.version + 1 })
    }
    const { data: contract, error } = await db.from('contracts').select('*').eq('id', body.id).maybeSingle()
    if (error) throw error
    if (!contract) return json({ error: 'Contrato não encontrado.' }, 404)
    if (body.action === 'resend') {
      if (!['pending', 'viewed'].includes(contract.status)) return json({ error: 'Só é possível reenviar contratos aguardando assinatura.' }, 409)
      const { data: customer } = await db.from('customers').select('name,email,phone').eq('id', contract.customer_id).single()
      return json({ sent: await sendContractInvite(db, contract, customer, 'reminder') })
    }
    if (body.action === 'regenerate_pdf') return json(await finalizeSignedContract(db, contract.id, { sendCopy: body.send_copy === true }))
    if (body.action === 'release_access') {
      if (contract.status !== 'signed') return json({ error: 'O contrato ainda não foi assinado.' }, 409)
      const access = await fulfillPaidOrder(db, contract.order_id)
      await db.from('contracts').update({ fulfillment_status: access.fulfillment }).eq('id', contract.id)
      await logContractEvent(db, contract.id, 'access_released', { detail: { fulfillment: access.fulfillment, manual: true } })
      return json(access)
    }
    if (body.action === 'cancel') {
      if (contract.status === 'signed') return json({ error: 'Contrato assinado não pode ser cancelado por aqui.' }, 409)
      await db.from('contracts').update({ status: 'canceled', next_reminder_at: null, updated_at: new Date().toISOString() }).eq('id', contract.id).neq('status', 'signed')
      await logContractEvent(db, contract.id, 'canceled', { detail: { manual: true } })
      return json({ canceled: true })
    }
    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ error: e instanceof ContractError || e?.status ? e.message : 'Não foi possível concluir a ação.' }, e?.status || 500)
  }
}
