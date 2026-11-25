import { validId, saleFilters } from './centralRecords.js'
import { CHECKOUT_ORIGIN, offerCode } from './checkoutLinks.js'

export const checkoutUtmFields = {
  utm_source: 'Origem (utm_source)',
  utm_medium: 'Mídia (utm_medium)',
  utm_campaign: 'Campanha (utm_campaign)',
  utm_content: 'Criativo (utm_content)',
  utm_term: 'Termo ou conjunto (utm_term)',
}

export const funnelGroups = {
  link: 'Link rastreável',
  model: 'Checkout',
  offer: 'Oferta',
  product: 'Produto',
  source: 'Origem',
  medium: 'Mídia',
  campaign: 'Campanha',
  creative: 'Criativo',
  term: 'Termo ou conjunto',
}

export function marketingValue(value) {
  return typeof value === 'string'
    ? Array.from(value.trim().replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, 100).join('')
    : ''
}

export function trackableCheckoutUrl(link) {
  const url = new URL('/p/' + offerCode(link.offer_id), CHECKOUT_ORIGIN)
  url.searchParams.set('sz_link', link.id)
  for (const key of Object.keys(checkoutUtmFields)) {
    if (link[key]) url.searchParams.set(key, link[key])
  }
  return url.toString()
}

export function readTrackableLink(input) {
  const name = marketingValue(input?.name)
  const tags = Object.fromEntries(Object.keys(checkoutUtmFields).map(key => [key, marketingValue(input?.[key])]))
  if (!validId(input?.offer_id) || !name || !tags.utm_source) {
    throw new Error('Preencha o nome, a oferta e a origem do link.')
  }
  return { offer_id: input.offer_id, name, ...tags }
}

const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })

function shiftDay(day, days) {
  const value = new Date(day + 'T12:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function checkoutFunnelFilters(params, now = new Date()) {
  const { inicio, fim, oferta } = saleFilters(params)
  const today = localDate.format(now)
  const to = fim || today
  const from = inicio || shiftDay(to, -6)
  const group = params.get('grupo') || 'link'
  const link = params.get('link')
  const queryPage = params.get('pagina') || '1'
  const page = Number(queryPage)
  if (from > to || to > today || from < shiftDay(to, -365)) throw new Error('Selecione um período de até um ano.')
  if (!Object.hasOwn(funnelGroups, group) || (link && !validId(link)) || !/^\d{1,5}$/.test(queryPage) || page < 1) {
    throw new Error('Filtro de rastreamento inválido.')
  }
  return {
    from, to, page, group,
    args: {
      p_from: from + 'T00:00:00-03:00',
      p_until: shiftDay(to, 1) + 'T00:00:00-03:00',
      p_offer: oferta || null,
      p_link: link || null,
      p_group: group,
      p_offset: (page - 1) * 25,
    },
  }
}
