'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { money, date, statusLabels } from '../../CentralUI'
import { api, Panel, Modal, Copy } from './SaleUI'
import SaleForm, { actionTitles, addressFields } from './SaleForm'
import Resend from './Resend'
import SaleAudit from './SaleAudit'
import './sale.css'

const tabs = ['Detalhe', 'Comprador', 'Extras', 'Comentários', 'Auditoria']
const tabKeys = ['detail', 'buyer', 'extras', 'comments', 'audit']
const tabLabel = (key) => tabs[tabKeys.indexOf(key)] || tabs[0]
const methods = { pix: 'PIX', credit_card: 'Cartão de crédito', boleto: 'Boleto' }
const empty = '—'
const contractStates = {
  pending: 'Aguardando assinatura',
  viewed: 'Visualizado',
  signed: 'Assinado',
  canceled: 'Cancelado',
  completed: 'Liberado',
  awaiting_signature: 'Aguardando assinatura',
  retry: 'Nova tentativa pendente',
  disabled: 'Liberação pausada',
  ready: 'Na fila',
  processing: 'Processando',
  accepted: 'Aceito pelo serviço',
  failed: 'Falha',
}
function Comments({ entries, id, reload }) {
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/admin/checkout/registros', { entity: 'vendas', id, text: value })
      setValue('')
      setOpen(false)
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Comentários">
      {entries.map((c) => (
        <article key={c.id}>
          <small>
            {c.actor} · {date(c.at)}
          </small>
          <p>{c.text}</p>
        </article>
      ))}
      {!entries.length && !open && (
        <p>
          <strong>Sem Registros.</strong> Faça um comentário!
        </p>
      )}
      {open ? (
        <form className="sv-form" onSubmit={save}>
          <label>
            Comentário
            <textarea
              autoFocus
              required
              maxLength={3000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button className="sv-primary" disabled={busy || !value.trim()}>
              Enviar
            </button>
          </footer>
        </form>
      ) : (
        <button onClick={() => setOpen(true)}>Adicionar Comentário</button>
      )}
    </Panel>
  )
}
export default function SaleDetail({ id, initialTab }) {
  const base = '/api/admin/checkout/vendas/' + id
  const [tab, setTab] = useState(() => tabLabel(initialTab)),
    [data, setData] = useState(null),
    [view, setView] = useState(null),
    [gateway, setGateway] = useState(null)
  const [error, setError] = useState(''),
    [gatewayError, setGatewayError] = useState(''),
    [notice, setNotice] = useState(''),
    [dialog, setDialog] = useState(''),
    [revision, setRevision] = useState(0),
    [syncing, setSyncing] = useState(false)
  const reload = () => setRevision((n) => n + 1)
  useEffect(() => {
    const ac = new AbortController()
    setError('')
    Promise.all([
      api('/api/admin/checkout/registros?entity=vendas&id=' + id, null, ac.signal),
      api(base + '/acoes', null, ac.signal),
    ])
      .then(([record, actions]) => {
        setData(record)
        setView(actions)
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message)
      })
    return () => ac.abort()
  }, [id, base, revision])
  function selectTab(label) {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabKeys[tabs.indexOf(label)])
    window.history.pushState(null, '', url)
    setTab(label)
    setNotice('')
  }
  useEffect(() => {
    function back() {
      setTab(tabLabel(new URL(window.location.href).searchParams.get('tab')))
      setNotice('')
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])
  const needGateway = tab === 'Extras' || dialog === 'payment'
  useEffect(() => {
    if (!needGateway) return
    const ac = new AbortController()
    setGatewayError('')
    api(base + '/acoes?detail=gateway', null, ac.signal)
      .then(setGateway)
      .catch((e) => {
        if (!ac.signal.aborted) setGatewayError(e.message)
      })
    return () => ac.abort()
  }, [base, needGateway, revision])
  async function sync() {
    setSyncing(true)
    setNotice('')
    try {
      await api('/api/admin/checkout/pagamentos', { action: 'sync', order_id: id })
      setNotice('Status consultado no Pagar.me.')
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }
  if (!data || !view)
    return (
      <main className="sv">
        <Link href="/admin/checkout/vendas">← Vendas</Link>
        <p role={error ? 'alert' : 'status'}>{error || 'Carregando venda…'}</p>
        {error && <button onClick={reload}>Tentar novamente</button>}
      </main>
    )
  const r = data.record,
    buyer = view.buyer || data.customer || {},
    addr = buyer.billing_address || {},
    contract = data.contract
  const code = r.pagarme_charge_id || r.pagarme_order_id || r.id
  const provider = !r.marketplace || r.marketplace === 'pagarme' ? 'Pagar.me' : r.marketplace
  const status = statusLabels[r.status] || r.status,
    productUrl = '/admin/checkout/produtos/' + r.offer.product_id
  const events = [...view.events, ...data.activity.events]
  if (data.conversion && data.conversion.processed_at)
    events.push({
      id: 'meta:' + id,
      title: 'Evento enviado para o Facebook',
      at: data.conversion.processed_at,
      description: 'Purchase · ' + (data.conversion.mode === 'test' ? 'Teste' : 'Produção'),
      detail: {
        evento: 'Purchase',
        modo: data.conversion.mode,
        enviado_em: data.conversion.processed_at,
      },
    })
  events.sort((a, b) => new Date(b.at) - new Date(a.at))
  const phone = String(buyer.phone || '').replace(/\D/g, '')
  const principal = data.items.filter((i) => i.kind !== 'bump'),
    unit = principal.length === 1 ? principal[0].price_cents : null
  const end = gateway?.end,
    start = gateway?.start
  function saved(msg) {
    setDialog('')
    setNotice(msg)
    reload()
  }
  const related = (url, label) => (
    <Link className="sv-related" href={url} title="Ver Detalhes">
      {label} ↗
    </Link>
  )
  const actions = (
    <div className="sv-actions">
      <button disabled={syncing} onClick={sync} title="Atualizar status no Pagar.me">
        ↻ Atualizar
      </button>
      <button onClick={() => setDialog('resend')}>↗ Reenviar</button>
      <button onClick={() => setDialog('invoice')}>▤ Informar Nota Fiscal</button>
      <button disabled={r.status !== 'paid'} onClick={() => setDialog('refund')}>
        × Reembolsar
      </button>
      <button disabled={r.status !== 'paid'} onClick={() => setDialog('chargeback')}>
        ⊖ Marcar como Chargeback
      </button>
    </div>
  )
  return (
    <main className="sv">
      <nav aria-label="Caminho da venda" className="sv-crumb">
        <Link href="/admin/central-vendas">Início</Link> /{' '}
        <Link href="/admin/checkout/vendas">Vendas</Link> / {provider} / {code}
      </nav>
      <div className="sv-inner">
        <div className="sv-tabs" role="tablist" aria-label="Detalhes da venda">
          {tabs.map((t) => (
            <button role="tab" key={t} aria-selected={tab === t} onClick={() => selectTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {tab === 'Detalhe' && (
          <>
            {actions}
            <Panel
              title="Detalhe"
              badge={
                <span className={'sv-badge ' + (r.status === 'paid' ? 'paid' : '')}>
                  {r.status === 'paid' ? '✓ ' : ''}
                  {status}
                </span>
              }
              fields={[
                ['Código', code],
                ['Moeda', 'BRL'],
                ['', null],
                ['URL da Venda', <Copy link value={view.receipt} />],
                ['URL de Pagamento', <Copy link value={view.payment} />],
                [' ', null],
                ['Criada Em', date(r.created_at)],
                ['Aprovada Em', date(r.paid_at)],
                [
                  'Cancelada Em',
                  date(
                    gateway?.canceled ||
                      events.find((e) => ['Pedido cancelado', 'Reembolso registrado'].includes(e.title))
                        ?.at,
                  ),
                ],
              ]}
            />
            <Panel
              title="Pagamento"
              fields={[
                [
                  'Forma de Pagamento',
                  <button
                    className="sv-inline"
                    title="Ver Detalhes"
                    onClick={() => setDialog('payment')}
                  >
                    {methods[r.payment_method] || r.payment_method} ⓘ
                  </button>,
                ],
                [
                  'Parcelas',
                  (r.installments || 1) + ' × ' + money(r.total_cents / (r.installments || 1)),
                ],
                ['', null],
                ['Produto', money(r.subtotal_cents)],
                ['Frete', empty],
                ['Desconto', money(r.discount_cents)],
                ['Parcelamento', money(r.interest_cents)],
                ['Imposto', empty],
                ['Total', money(r.total_cents)],
                ['Afiliados', empty],
                ['Provedor', empty],
                ['Líquido', empty],
              ]}
            />
            <Panel
              title="Produto"
              fields={[
                ['Unitário', unit == null ? empty : money(unit)],
                ['Quantidade', data.items.length || empty],
                ['Total', money(r.subtotal_cents)],
                ['Nome', related(productUrl, r.product_name)],
                ['Provedor', provider],
                ['ID do Provedor', r.offer.product?.code],
                ['Oferta', related(productUrl + '/ofertas/' + r.offer_id, r.offer_name)],
                ['Produtor', 'Suzana Zatorre Educacional Ltda'],
              ]}
            />
            {data.items.some((i) => i.kind === 'bump') && (
              <Panel title="Itens da compra">
                {data.items.map((i) => (
                  <p key={i.id}>
                    {i.product?.name} · {i.kind === 'bump' ? 'Order bump' : 'Principal'} ·{' '}
                    {money(i.price_cents)}
                  </p>
                ))}
              </Panel>
            )}
            {contract && (
              <Panel
                title="Contrato e entrega"
                fields={[
                  ['Assinatura', contractStates[contract.status] || contract.status],
                  ['Assinado em', date(contract.signed_at)],
                  ['PDF', contract.has_pdf ? 'Disponível' : 'Em preparação'],
                  ['Acesso', contractStates[contract.access_status] || contract.access_status],
                  ...Object.entries(contract.channels || {}).map(([k, c]) => [
                    k,
                    (contractStates[c.state] || c.state) + ' · ' + c.attempts + ' tentativa(s)',
                  ]),
                  ['Histórico', related('/admin/checkout/configuracoes/contratos', 'Abrir contratos')],
                ]}
              />
            )}
            {view.invoice && (
              <Panel
                title="Nota Fiscal"
                fields={[
                  ['ID', view.invoice.number],
                  ['Chave', view.invoice.key || empty],
                  ['Data de emissão', view.invoice.issued],
                  ['URL XML', <Copy value={view.invoice.xml} link />],
                  ['URL PDF', <Copy value={view.invoice.pdf} link />],
                ]}
              />
            )}
          </>
        )}
        {tab === 'Comprador' && (
          <>
            <div className="sv-actions">
              <button onClick={() => setDialog('buyer')}>✎ Editar Comprador</button>
            </div>
            <Panel
              title="Comprador"
              fields={[
                ['Nome', related('/admin/checkout/clientes/' + r.customer_id, buyer.name)],
                ['Email', buyer.email],
                ['Documento', buyer.document],
                [
                  'Celular',
                  phone ? (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={'https://wa.me/' + (phone.length <= 11 ? '55' : '') + phone}
                    >
                      {buyer.phone} ↗
                    </a>
                  ) : (
                    empty
                  ),
                ],
              ]}
            />
            <Panel
              title="Endereço"
              fields={addressFields.map(([k, l]) => [
                l,
                addr[k] || (k === 'street' && addr.line_1) || empty,
              ])}
            />
            <Panel
              title="Infraestrutura"
              fields={[
                ['País', empty],
                ['Região', empty],
                ['Cidade', empty],
                ['Latitude & Longitude', empty],
                ['IP', r.client_ip],
                ['User Agent', r.user_agent],
              ]}
            />
          </>
        )}
        {tab === 'Extras' && (
          <>
            <Panel
              title="Extras"
              fields={[
                ['Indisponível Até', empty],
                ['Garantida Até', empty],
                ['Expirada Em', date(view.expires)],
                ['Fatura', <Copy value={view.receipt} link />],
                ['Email', buyer.email],
                ['Última Venda', empty],
                [
                  'Política de privacidade',
                  data.acceptance?.privacy_accepted ? 'Aceita' : 'Sem aceite registrado',
                ],
                ['Termos de uso', data.acceptance?.terms_accepted ? 'Aceitos' : 'Sem aceite registrado'],
                ['Acesso até', date(data.access?.expires_at)],
                ['Acesso revogado em', date(data.access?.revoked_at)],
                [
                  'Revisão de acesso',
                  data.access?.review_required ? 'Revisão necessária' : 'Sem revisão pendente',
                ],
              ]}
            />
            {gatewayError && <p role="alert">{gatewayError}</p>}
            <Panel
              title="Adquirente"
              fields={[
                ['Nome', gateway?.name],
                ['TID', gateway?.tid],
                ['Código', gateway?.code],
                ['Mensagem', gateway?.message || r.refusal_reason],
              ]}
            />
            <Panel
              title="Tempo de Processamento"
              fields={[
                ['Horário Inicial', date(start)],
                ['Horário Final', date(end)],
                [
                  'Duração',
                  start && end
                    ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000)) + ' segundos'
                    : empty,
                ],
              ]}
            />
            <Panel
              title="Rastreamento"
              fields={[
                ['Origem', r.utm_source],
                ['Mídia', r.utm_medium],
                ['Campanha', r.utm_campaign],
                ['Conteúdo', r.utm_content],
                ['Termo', r.utm_term],
                [
                  'Conversão Meta',
                  data.conversion?.processed_at
                    ? 'Enviada'
                    : data.conversion?.status || 'Sem envio registrado',
                ],
                ['Pedido no Pagar.me', r.pagarme_order_id],
                ['Cobrança', r.pagarme_charge_id],
              ]}
            />
          </>
        )}
        {tab === 'Comentários' && <Comments id={id} entries={data.activity.comments} reload={reload} />}
        {tab === 'Auditoria' && <SaleAudit events={events} />}
        {dialog === 'resend' && (
          <Resend
            base={base}
            view={view}
            contract={contract}
            close={() => setDialog('')}
            refresh={reload}
          />
        )}
        {actionTitles[dialog] && (
          <SaleForm
            action={dialog}
            buyer={buyer}
            invoice={view.invoice}
            record={r}
            endpoint={base + '/acoes'}
            close={() => setDialog('')}
            saved={saved}
          />
        )}
        {dialog === 'payment' && (
          <Modal title={methods[r.payment_method] || 'Pagamento'} close={() => setDialog('')}>
            <div className="sv-dialog-body">
              {r.payment_method === 'pix' ? (
                <>
                  <h3>Data Expiração</h3>
                  <p>{date(view.expires || gateway?.expires)}</p>
                  <h3>Pix Copia e Cola</h3>
                  <Copy value={view.pix || gateway?.qr} />
                </>
              ) : (
                <>
                  <h3>Cartão</h3>
                  <p>
                    {[gateway?.brand, gateway?.last4 && '•••• ' + gateway.last4]
                      .filter(Boolean)
                      .join(' ') || empty}
                  </p>
                  <p>
                    {r.installments} × {money(r.total_cents / (r.installments || 1))}
                  </p>
                </>
              )}
              {gatewayError && <p role="alert">{gatewayError}</p>}
            </div>
          </Modal>
        )}
      </div>
    </main>
  )
}
