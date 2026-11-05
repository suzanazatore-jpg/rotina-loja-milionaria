import { normalizeCheckoutSettings } from '@/lib/checkoutSettings'
import { offerPath } from '@/lib/checkoutLinks'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { autorizarAdmin, checkoutAdminClient, gerarSlug, reaisParaCentavos } from '@/lib/checkoutAdminServer'
import { loadGlobalCheckoutSettings } from '@/lib/checkoutSettings'

const TIPOS_PRODUTO = new Set(['one_time', 'subscription'])
const METODOS = new Set(['pix', 'credit_card'])
const INTERVALOS = new Set(['day', 'week', 'month', 'year'])

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
  return Math.round(numero * 10000) / 10000
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
  const image = urlOuNulo(dados.image_url)
  if (image === undefined || image && (new URL(image).username || new URL(image).password || image.length > 2048)) throw new Error('Imagem do produto inválida.')
  const tipo = TIPOS_PRODUTO.has(dados.type) ? dados.type : 'one_time'
  const brevo = inteiroOuNulo(dados.brevo_list_id)
  if (Number.isNaN(brevo)) throw new Error('ID da lista do Brevo deve ser um número.')
  const code = dados.code === undefined || dados.code === '' ? undefined : Number(dados.code)
  if (code !== undefined && (!Number.isSafeInteger(code) || code < 1000000000 || code > 9999999999)) throw new Error('O código deve ter 10 dígitos.')
  return {
    ...(code !== undefined ? { code } : {}),
    name: nome,
    marketplace_id: marketplace,
    image_url: image,
    updated_at: new Date().toISOString(),
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
  const { data: produto, error } = await supabase.from('products').select('id,type,slug,active,plan_id,marketplace_id').eq('id', dados.product_id).single()
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
  if (Number.isNaN(maxParcelas) || maxParcelas < 1 || maxParcelas > 18) throw new Error('Parcelas devem ficar entre 1 e 18.')
  const semJuros = Math.min(inteiroOuNulo(dados.free_installments) ?? maxParcelas, maxParcelas)
  if (Number.isNaN(semJuros) || semJuros < 1) throw new Error('Parcelas sem juros inválidas.')
  const juros = numeroEntre(dados.monthly_interest_pct, 0, 10)
  if (Number.isNaN(juros)) throw new Error('Juros mensais devem ficar entre 0% e 10%.')
  const descontoPix = metodos.includes('pix') ? numeroEntre(dados.pix_discount_pct, 0, 50) : 0
  if (Number.isNaN(descontoPix)) throw new Error('Desconto no Pix deve ficar entre 0% e 50%.')

  const intervalo = assinatura ? (INTERVALOS.has(dados.billing_interval) ? dados.billing_interval : 'month') : null
  const qtdIntervalo = assinatura ? inteiroOuNulo(dados.billing_interval_count) ?? 1 : null
  if (assinatura && (Number.isNaN(qtdIntervalo) || qtdIntervalo < 1 || qtdIntervalo > 365)) throw new Error('Período de cobrança inválido.')
  const trial = assinatura ? inteiroOuNulo(dados.trial_days) ?? 0 : 0
  if (Number.isNaN(trial) || trial < 0) throw new Error('Dias de teste inválidos.')

  const modelo = dados.interest_model || 'price'
  if (!['price','simple'].includes(modelo)) throw new Error('Cálculo dos juros inválido.')
  const parcelaPadrao = assinatura ? 1 : inteiroOuNulo(dados.default_installments) ?? 1
  if (!Number.isInteger(parcelaPadrao) || parcelaPadrao < 1 || parcelaPadrao > maxParcelas) throw new Error('Parcela selecionada inválida.')
  const ciclos = assinatura ? inteiroOuNulo(dados.billing_cycles) ?? 0 : 0
  if (!Number.isInteger(ciclos) || ciclos < 0 || ciclos > 999) throw new Error('Máximo de cobranças inválido.')
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

  if(dados.checkout_config?.payment_alias){const alias=normalizeCheckoutSettings(dados.checkout_config).payment_alias;const existing=await supabase.from('offers').select('id').eq('checkout_config->>payment_alias',alias);if(existing.error)throw new Error('Não foi possível verificar o link curto.');if(existing.data?.some(o=>o.id!==dados.id))throw new Error('Este link curto já está em uso. Escolha outro.')}

  return {
    product_id: produto.id,
    name: nome,
    ...(dados.id ? {} : {slug: dados.slug ? gerarSlug(dados.slug) : randomUUID()}),
    ...(typeof dados.payment_path === 'string' || !dados.id ? {payment_path:offerPath(dados.payment_path || nome) || 'oferta'} : {}),
    price_cents: preco,
    payment_methods: metodos,
    max_installments: maxParcelas,
    free_installments: semJuros,
    interest_model: modelo,
    default_installments: parcelaPadrao,
    billing_cycles: ciclos,
    monthly_interest_pct: semJuros >= maxParcelas ? 0 : juros,
    pix_discount_pct: descontoPix,
    billing_interval: intervalo,
    billing_interval_count: qtdIntervalo,
    trial_days: trial,
    thank_you_url: dados.checkout_config ? normalizeCheckoutSettings(dados.checkout_config).redirects.approved || null : obrigado,
    checkout_config: {
      ...(dados.checkout_config ? normalizeCheckoutSettings(dados.checkout_config) : dados.id
        ? (await supabase.from('offers').select('checkout_config').eq('id', dados.id).single()).data?.checkout_config || {}
        : normalizeCheckoutSettings({})),
      // A chave 'Oferta ativa' publica automaticamente ofertas avulsas completas.
      // Ofertas de R$1/teste e assinaturas nunca são publicadas automaticamente.
      auto_publish: dados.active !== false
        && produto.active === true
        && produto.type === 'one_time'
        && produto.marketplace_id === 'pagarme'
        && Boolean(produto.plan_id)
        && preco >= 1000
        && !/^(teste|test)(?:\b|\s|[-_:])/i.test(nome)
        && (!dados.checkout_config?.contract?.required || (process.env.CONTRACTS_ENABLED === 'true' && (process.env.CONTRACT_TOKEN_SECRET?.length || 0) >= 32)),
    },
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
      const registro = await montarOferta(supabase, {...dados,id})
      const consulta = id
        ? supabase.from('offers').update(registro).eq('id', id)
        : supabase.from('offers').insert(registro)
      const path = registro.payment_path || (id ? (await supabase.from('offers').select('payment_path').eq('id',id).single()).data?.payment_path : null) || offerPath(registro.name)
      const { data: existingLink, error: linkCheckError } = await supabase.from('checkout_offer_links').select('offer_id').eq('path',path).maybeSingle()
      if (linkCheckError) throw new Error('Não foi possível verificar a URL amigável.')
      if (existingLink && existingLink.offer_id !== id) throw new Error('Este link já está sendo usado por outra oferta.')
      const { data, error } = await consulta.select('id,slug,payment_path').single()
      if (error) throw new Error(error.message)
      // A URL exibida no painel passa a ser registrada no roteador no mesmo salvamento.
      const { error: linkError } = await supabase.from('checkout_offer_links').upsert({ path, offer_id: data.id }, { onConflict: 'path' })
      if (linkError) throw new Error('Oferta salva, mas o link não foi registrado. Tente salvar novamente.')
      await salvarBumps(supabase, data.id, dados.bumps)
      return NextResponse.json({ ok: true, ...data, payment_path:path,
        publication: !registro.active ? 'inactive' : registro.checkout_config.auto_publish ? 'public' : 'restricted',
        payment_url: `https://rotina.suzanazatorre.com.br/p/${path}` })
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
  let updates = { active: active === true }
  if (entidade === 'oferta') {
    const {data: offer, error: offerError} = await supabase.from('offers')
      .select('id,name,price_cents,product_id,checkout_config,payment_methods').eq('id',id).maybeSingle()
    if (offerError || !offer) return erro('Oferta não encontrada.',404)
    const {data: product, error: productError} = await supabase.from('products')
      .select('active,type,plan_id,marketplace_id').eq('id',offer.product_id).maybeSingle()
    if (productError || !product) return erro('Produto não encontrado.',404)
    const restricted = Number(offer.price_cents) < 1000
      || /^(teste|test)(?:\\b|\\s|[-_:])/i.test(offer.name || '')
      || offer.checkout_config?.contract?.required && !(process.env.CONTRACTS_ENABLED === 'true' && (process.env.CONTRACT_TOKEN_SECRET?.length || 0) >= 32)
    updates.checkout_config = {...(offer.checkout_config || {}),
      auto_publish: active === true && product.active === true && product.type === 'one_time'
        && product.marketplace_id === 'pagarme' && Boolean(product.plan_id)
        && Array.isArray(offer.payment_methods) && offer.payment_methods.length > 0 && !restricted }
  }
  const { error } = await supabase.from(tabela).update(updates).eq('id', id)
  if (error) return erro(error.message, 500)
  return NextResponse.json({ ok: true, publication: updates.checkout_config?.auto_publish ? 'public' : 'restricted' })
}
