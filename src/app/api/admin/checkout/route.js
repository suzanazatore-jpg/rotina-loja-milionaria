import { normalizeCheckoutSettings } from '@/lib/checkoutSettings'
import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient, gerarSlug, reaisParaCentavos } from '@/lib/checkoutAdminServer'
import { loadGlobalCheckoutSettings } from '@/lib/checkoutSettings'

const TIPOS_PRODUTO = new Set(['one_time', 'subscription'])
const METODOS = new Set(['pix', 'credit_card'])
const INTERVALOS = new Set(['month', 'year'])

function erro(mensagem, status = 400) {
  return NextResponse.json({ error: mensagem }, { status })
}

function inteiroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(valor)
  return Number.isInteger(numero) ? numero : NaN
}

function numeroEntre(valor, min, max, padrao = 0) {
  if (valor === null || valor === undefined || valor === '') return padrao
  const numero = Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(numero) || numero < min || numero > max) return NaN
  return Math.round(numero * 100) / 100
}

function urlOuNulo(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return null
  try {
    const url = new URL(texto)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch { return undefined }
}

async function montarProduto(supabase,dados) {
  const nome = String(dados.name || '').trim()
  if (!nome) throw new Error('Informe o nome do produto.')
  const marketplace = String(dados.marketplace_id || 'pagarme')
  const provider = await supabase.from('checkout_marketplaces').select('id').eq('id',marketplace).eq('active',true).maybeSingle()
  if (provider.error || !provider.data) throw new Error('Selecione um marketplace disponível.')
  const tipo = TIPOS_PRODUTO.has(dados.type) ? dados.type : 'one_time'
  const brevo = inteiroOuNulo(dados.brevo_list_id)
  if (Number.isNaN(brevo)) throw new Error('ID da lista do Brevo deve ser um número.')
  const code = dados.code === undefined || dados.code === '' ? undefined : Number(dados.code)
  if (code !== undefined && (!Number.isSafeInteger(code) || code < 1000000000 || code > 9999999999)) throw new Error('O código deve ter 10 dígitos.')
  return {
    ...(code !== undefined ? { code } : {}),
    name: nome,
    marketplace_id: marketplace,
    slug: gerarSlug(dados.slug || nome),
    type: tipo,
    plan_id: dados.plan_id || null,
    access_days: null, // O prazo é definido exclusivamente pelo plano do app.
    brevo_list_id: brevo,
    botconversa_tag: String(dados.botconversa_tag || '').trim() || null,
    active: dados.active !== false,
  }
}

async function montarOferta(supabase, dados) {
  if (!dados.product_id) throw new Error('Produto da oferta não informado.')
  const { data: produto, error } = await supabase.from('products').select('id,type,slug').eq('id', dados.product_id).single()
  if (error || !produto) throw new Error('Produto não encontrado.')

  const nome = String(dados.name || '').trim()
  if (!nome) throw new Error('Informe o nome da oferta.')
  const preco = reaisParaCentavos(dados.price)
  if (!preco || preco <= 0) throw new Error('Informe um preço válido.')

  const assinatura = produto.type === 'subscription'
  let metodos = (Array.isArray(dados.payment_methods) ? dados.payment_methods : []).filter(m => METODOS.has(m))
  if (assinatura) metodos = ['credit_card'] // recorrência automática no Pagar.me é só no cartão
  if (!metodos.length) throw new Error('Selecione pelo menos uma forma de pagamento.')

  const maxParcelas = assinatura || !metodos.includes('credit_card') ? 1 : inteiroOuNulo(dados.max_installments) ?? 1
  if (Number.isNaN(maxParcelas) || maxParcelas < 1 || maxParcelas > 12) throw new Error('Parcelas devem ficar entre 1 e 12.')
  const semJuros = Math.min(inteiroOuNulo(dados.free_installments) ?? maxParcelas, maxParcelas)
  if (Number.isNaN(semJuros) || semJuros < 1) throw new Error('Parcelas sem juros inválidas.')
  const juros = numeroEntre(dados.monthly_interest_pct, 0, 10)
  if (Number.isNaN(juros)) throw new Error('Juros mensais devem ficar entre 0% e 10%.')
  const descontoPix = metodos.includes('pix') ? numeroEntre(dados.pix_discount_pct, 0, 50) : 0
  if (Number.isNaN(descontoPix)) throw new Error('Desconto no Pix deve ficar entre 0% e 50%.')

  const intervalo = assinatura ? (INTERVALOS.has(dados.billing_interval) ? dados.billing_interval : 'month') : null
  const qtdIntervalo = assinatura ? inteiroOuNulo(dados.billing_interval_count) ?? 1 : null
  if (assinatura && (Number.isNaN(qtdIntervalo) || qtdIntervalo < 1 || qtdIntervalo > 12)) throw new Error('Período de cobrança inválido.')
  const trial = assinatura ? inteiroOuNulo(dados.trial_days) ?? 0 : 0
  if (Number.isNaN(trial) || trial < 0) throw new Error('Dias de teste inválidos.')

  const obrigado = urlOuNulo(dados.thank_you_url)
  if (obrigado === undefined) throw new Error('Link da página de obrigado inválido.')
  if (dados.checkout_config) {
    const config = dados.checkout_config
    // A validação final considera também as URLs herdadas da central.
    const global = await loadGlobalCheckoutSettings(supabase)
    const urls = config.appearance_mode === 'inherit' ? global : config
    if (config.require_terms && !urls.terms_url) throw new Error('Informe a URL dos termos antes de exigir o aceite.')
    if (config.require_privacy && !urls.privacy_url) throw new Error('Informe a URL da política de privacidade antes de exigir o aceite.')
  }

  return {
    product_id: produto.id,
    name: nome,
    slug: gerarSlug(dados.slug || `${produto.slug}-${nome}`),
    price_cents: preco,
    payment_methods: metodos,
    max_installments: maxParcelas,
    free_installments: semJuros,
    monthly_interest_pct: semJuros >= maxParcelas ? 0 : juros,
    pix_discount_pct: descontoPix,
    billing_interval: intervalo,
    billing_interval_count: qtdIntervalo,
    trial_days: trial,
    thank_you_url: dados.checkout_config ? normalizeCheckoutSettings(dados.checkout_config).redirects.approved || null : obrigado,
    ...(dados.checkout_config ? {checkout_config: normalizeCheckoutSettings(dados.checkout_config)} : {}),
    active: dados.active !== false,
  }
}

async function salvarBumps(supabase, ofertaId, bumps) {
  const lista = (Array.isArray(bumps) ? bumps : [])
    .filter(b => b?.bump_offer_id && b.bump_offer_id !== ofertaId)
    .map((b, indice) => ({
      offer_id: ofertaId,
      bump_offer_id: b.bump_offer_id,
      headline: String(b.headline || '').trim() || 'Adicione também',
      description: String(b.description || '').trim() || null,
      position: indice,
      active: true,
    }))
  const { error: erroLimpar } = await supabase.from('order_bumps').delete().eq('offer_id', ofertaId)
  if (erroLimpar) throw new Error(erroLimpar.message)
  if (lista.length) {
    const { error } = await supabase.from('order_bumps').insert(lista)
    if (error) throw new Error(error.message)
  }
}

function traduzirErro(mensagem) {
  if (/duplicate key.*slug/i.test(mensagem)) return 'Já existe um item com esse link (slug). Use outro nome ou slug.'
  return mensagem
}

export async function GET(request) {
  const supabase = checkoutAdminClient()
  if (!(await autorizarAdmin(request, supabase))) return erro('Acesso restrito ao administrador.', 401)
  const [produtos, ofertas, bumps, planos, cursos, conteudos, mentorias, globalConfig, marketplaces] = await Promise.all([
    supabase.from('products').select('*').order('created_at'),
    supabase.from('offers').select('*').order('created_at'),
    supabase.from('order_bumps').select('*').order('position'),
    supabase.from('plans').select('id,name,commercial_name,period_days,offer_id').not('offer_id', 'like', '__individual_%').order('name'),
    supabase.from('plan_courses').select('plan_id,course_id,courses(id,title)'),
    supabase.from('plan_app_contents').select('plan_id,content_key'),
    supabase.from('plan_mentorships').select('plan_id,mentorship_type'),
    loadGlobalCheckoutSettings(supabase),
    supabase.from('checkout_marketplaces').select('id,name,active').order('name'),
  ])
  const falha = produtos.error || ofertas.error || bumps.error || planos.error || cursos.error || conteudos.error || mentorias.error || marketplaces.error
  if (falha) return erro(falha.message, 500)
  return NextResponse.json({ produtos: produtos.data, ofertas: ofertas.data, bumps: bumps.data, planos: planos.data, cursos: cursos.data, conteudos: conteudos.data, mentorias: mentorias.data, global_config: globalConfig, marketplaces: marketplaces.data, fulfillment_enabled: process.env.CHECKOUT_FULFILLMENT_ENABLED === 'true' }, {headers:{'Cache-Control':'no-store'}})
}

export async function POST(request) {
  const supabase = checkoutAdminClient()
  if (!(await autorizarAdmin(request, supabase))) return erro('Acesso restrito ao administrador.', 401)
  try {
    const { entidade, id, dados = {}, action } = await request.json()
    if (action === 'duplicate' && ['oferta','produto'].includes(entidade)) {
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('Cadastro inválido.')
      const { data, error } = await supabase.rpc(entidade === 'produto' ? 'checkout_duplicate_product' : 'checkout_duplicate_offer', { source_id: id })
      if (error) throw new Error(entidade === 'produto' ? 'Não foi possível duplicar o produto.' : 'Não foi possível duplicar a oferta.')
      return NextResponse.json({ok:true,id:data})
    }
    if (entidade === 'produto') {
      const registro = await montarProduto(supabase,dados)
      if (id) {
        const {data: current, error} = await supabase.from('products').select('type').eq('id',id).single()
        if (error || !current) throw new Error('Produto não encontrado.')
        if (registro.type !== current.type) throw new Error('O tipo do produto não pode ser alterado.')
      }
      const consulta = id
        ? supabase.from('products').update(registro).eq('id', id)
        : supabase.from('products').insert(registro)
      const { data, error } = await consulta.select('id').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, id: data.id })
    }
    if (entidade === 'oferta') {
      const registro = await montarOferta(supabase, dados)
      const consulta = id
        ? supabase.from('offers').update(registro).eq('id', id)
        : supabase.from('offers').insert(registro)
      const { data, error } = await consulta.select('id').single()
      if (error) throw new Error(error.message)
      await salvarBumps(supabase, data.id, dados.bumps)
      return NextResponse.json({ ok: true, id: data.id })
    }
    return erro('Entidade inválida.')
  } catch (e) {
    return erro(traduzirErro(e.message))
  }
}

// Ativar / desativar (não apagamos produtos e ofertas que já podem ter vendas)
export async function PATCH(request) {
  const supabase = checkoutAdminClient()
  if (!(await autorizarAdmin(request, supabase))) return erro('Acesso restrito ao administrador.', 401)
  const { entidade, id, active } = await request.json()
  const tabela = entidade === 'produto' ? 'products' : entidade === 'oferta' ? 'offers' : null
  if (!tabela || !id) return erro('Requisição inválida.')
  const { error } = await supabase.from(tabela).update({ active: active === true }).eq('id', id)
  if (error) return erro(error.message, 500)
  return NextResponse.json({ ok: true })
}
