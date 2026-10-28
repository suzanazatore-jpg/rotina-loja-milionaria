// Regras puras do módulo de contratos (sem rede nem banco), testáveis isoladamente.

export const CONTRACT_TEMPLATES = ['evs', 'cvm', 'trafego']
export const CONTRACT_FIELDS = ['nome', 'qualificacao', 'documento', 'documento_rotulo', 'endereco', 'email', 'telefone', 'programa', 'programa_maiusculo', 'prazo', 'prazo_plataforma', 'mentorias_grupo', 'reunioes', 'clausula_renovacao', 'data_inicio', 'data_fim', 'data_pagamento', 'valor_total', 'valor_extenso', 'valor_periodo', 'valor_pago', 'valor_pago_extenso', 'forma_pagamento', 'parcelas', 'cidade_data', 'pedido']

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const TZ = 'America/Sao_Paulo'

// Lê e valida a seção "contrato" salva em offers.checkout_config.
export function contractConfig(offer) {
  const raw = offer?.checkout_config?.contract
  if (!raw || raw.required !== true) return null
  if (!CONTRACT_TEMPLATES.includes(raw.template)) return null
  const recurring = Boolean(offer.billing_interval)
  const term = Number(raw.term_months)
  if (!recurring && (!Number.isInteger(term) || term < 1 || term > 60)) return null
  return {
    template: raw.template,
    term_months: recurring ? (Number.isInteger(term) && term > 0 ? term : 1) : term,
    recurring,
    program_name: typeof raw.program_name === 'string' && raw.program_name.trim() ? raw.program_name.trim().slice(0, 120) : offer.name,
    gate_access: raw.gate_access !== false,
    platform_months: Number.isInteger(Number(raw.platform_months)) && Number(raw.platform_months) > 0 ? Number(raw.platform_months) : 12,
  }
}

export function normalizeContractConfig(input) {
  if (!input || input.required !== true) return { required: false }
  const template = CONTRACT_TEMPLATES.includes(input.template) ? input.template : null
  const term = Number(input.term_months)
  if (!template) throw new Error('Escolha o modelo de contrato.')
  if (!Number.isInteger(term) || term < 1 || term > 60) throw new Error('Informe o prazo do contrato em meses (1 a 60).')
  const program = String(input.program_name || '').trim().slice(0, 120)
  const platform = input.platform_months === '' || input.platform_months == null ? 12 : Number(input.platform_months)
  if (!Number.isInteger(platform) || platform < 1 || platform > 120) throw new Error('Informe o acesso à plataforma em meses (1 a 120).')
  return { required: true, template, term_months: term, program_name: program || null, gate_access: input.gate_access !== false, platform_months: platform }
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n) {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const parts = []
  if (c) parts.push(CENTENAS[c])
  if (r) {
    if (r < 20) parts.push(UNIDADES[r])
    else parts.push(DEZENAS[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNIDADES[r % 10] : ''))
  }
  return parts.join(' e ')
}

export function numeroPorExtenso(n) {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1e6), milhares = Math.floor((n % 1e6) / 1000), resto = n % 1000
  const parts = []
  if (milhoes) parts.push(milhoes === 1 ? 'um milhão' : ate999(milhoes) + ' milhões')
  if (milhares) parts.push(milhares === 1 ? 'mil' : ate999(milhares) + ' mil')
  if (resto) parts.push(ate999(resto))
  if (parts.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const last = parts.pop()
    return parts.join(' ') + ' e ' + last
  }
  return parts.join(' ')
}

export function valorPorExtenso(cents) {
  const reais = Math.floor(cents / 100), centavos = cents % 100
  const parts = []
  if (reais) parts.push(numeroPorExtenso(reais) + (reais === 1 ? ' real' : (reais % 1e6 === 0 ? ' de reais' : ' reais')))
  if (centavos) parts.push(numeroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos'))
  return parts.join(' e ') || 'zero real'
}

export function brl(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
}

export function formatDocument(value) {
  const d = String(value || '').replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d
}

export function sameDocument(a, b) {
  const x = String(a || '').replace(/\D/g, ''), y = String(b || '').replace(/\D/g, '')
  return x.length >= 11 && x === y
}

function dateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = type => Number(parts.find(p => p.type === type).value)
  return { y: get('year'), m: get('month'), d: get('day') }
}
export function dataCurta(value) { const { y, m, d } = dateParts(value); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` }
export function dataExtensa(value) { const { y, m, d } = dateParts(value); return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${y}` }
export function addMonths(value, months) {
  const { y, m, d } = dateParts(value)
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 15))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString()
}

export function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '')
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (d || 'não informado')
}

export function formatAddress(a) {
  if (!a || typeof a !== 'object') return 'não informado'
  const street = [a.line_1 || [a.street, a.number].filter(Boolean).join(', '), a.line_2 || a.complement].filter(Boolean).join(', ')
  const city = [a.city, a.state].filter(Boolean).join('/')
  const zip = a.zip_code ? `CEP ${String(a.zip_code).replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''
  return [street, a.neighborhood, city, zip].filter(Boolean).join(', ') || 'não informado'
}

const METODOS = { pix: 'Pix', credit_card: 'cartão de crédito', boleto: 'boleto bancário' }

// "03 (três)", "12 (doze)", "01 (uma)": o padrão usado nos contratos.
export function quantidade(n, feminino = false) {
  let words = numeroPorExtenso(n)
  if (feminino) words = words.replace(/\bum$/, 'uma').replace(/\bdois$/, 'duas')
  return `${String(n).padStart(2, '0')} (${words})`
}
const meses = n => `${quantidade(n)} ${n === 1 ? 'mês' : 'meses'}`

export function buildContractFields({ order, customer, offer, config }) {
  const paidAt = order.paid_at || order.created_at
  const paid = order.total_cents
  // Valor do contrato = preço negociado (com desconto à vista), sem os juros do parcelamento.
  const price = Math.max(0, paid - (order.interest_cents || 0))
  const months = config.term_months
  const installments = order.installments || 1
  const perInstallment = Math.round(paid / installments)
  const doc = String(customer.document || '').replace(/\D/g, '')
  const pj = doc.length === 14
  const program = config.program_name || offer.name
  const parcelas = config.recurring
    ? `em cobrança recorrente de ${brl(paid)} a cada ${months === 1 ? 'mês' : meses(months)}`
    : installments > 1
      ? `parcelado em ${quantidade(installments, true)} parcelas de ${brl(perInstallment)} (${valorPorExtenso(perInstallment)})`
      : 'à vista'
  return {
    nome: customer.name,
    qualificacao: pj ? `pessoa jurídica, inscrita no CNPJ nº ${formatDocument(doc)}` : `pessoa física, inscrita no CPF nº ${formatDocument(doc)}`,
    documento: formatDocument(doc),
    documento_rotulo: pj ? 'CNPJ' : 'CPF',
    endereco: formatAddress(customer.billing_address),
    email: customer.email,
    telefone: formatPhone(customer.phone),
    programa: program,
    programa_maiusculo: program.toLocaleUpperCase('pt-BR'),
    prazo: meses(months),
    prazo_plataforma: meses(config.platform_months || 12),
    mentorias_grupo: quantidade(months * 2, true),
    reunioes: months === 1 ? '01 (uma) reunião estratégica periódica' : `${quantidade(months, true)} reuniões estratégicas periódicas`,
    clausula_renovacao: config.recurring
      ? `Após o término de cada período de ${meses(months)}, o contrato será renovado automaticamente por igual período, mediante a cobrança recorrente, até que qualquer das partes solicite o cancelamento por escrito, respeitadas as demais cláusulas deste contrato.`
      : 'Após o término do prazo inicial, o contrato poderá ser renovado mediante novo acordo entre as partes.',
    data_inicio: dataCurta(paidAt),
    data_fim: config.recurring ? 'indeterminado (renovação automática)' : dataCurta(addMonths(paidAt, months)),
    data_pagamento: dataExtensa(paidAt),
    valor_total: brl(price),
    valor_extenso: valorPorExtenso(price),
    valor_periodo: config.recurring ? (months === 1 ? 'mensal' : 'por período') : 'total',
    valor_pago: brl(paid),
    valor_pago_extenso: valorPorExtenso(paid),
    forma_pagamento: METODOS[order.payment_method] || order.payment_method || 'não informado',
    parcelas,
    cidade_data: dataExtensa(paidAt),
    pedido: String(order.id).slice(0, 8).toUpperCase(),
  }
}

export function renderContract(body, fields) {
  const missing = new Set()
  const text = String(body).replace(/\{([a-z_]+)\}/g, (all, key) => {
    if (!(key in fields)) { missing.add(key); return all }
    return String(fields[key] ?? '')
  })
  return { text, missing: [...missing] }
}

export function maskDocument(value) {
  const d = String(value || '').replace(/\D/g, '')
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`
  return '***'
}

export function maskPhone(value) {
  const d = String(value || '').replace(/\D/g, '')
  return d.length >= 4 ? `(**) *****-${d.slice(-4)}` : ''
}

export function maskEmail(value) {
  const [user, domain] = String(value || '').split('@')
  if (!domain) return ''
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
}

export const REMINDER_HOURS = [24, 48, 72]
