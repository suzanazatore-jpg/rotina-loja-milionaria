import { createHmac, timingSafeEqual } from 'node:crypto'

export function invoiceToken(id, secret) {
  if (!secret || secret.length < 32) return null
  return `${id}.${createHmac('sha256', secret).update(`sale-invoice:${id}`).digest('base64url')}`
}
export function readInvoiceToken(token, secret) {
  if (typeof token !== 'string' || token.length > 120 || !secret || secret.length < 32) return null
  const [id, signature, extra] = token.split('.')
  if (extra || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id || '') || !signature) return null
  const expected = Buffer.from(invoiceToken(id, secret).split('.')[1])
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null
}
export function redactAudit(value, depth = 0) {
  if (depth > 15) return '[limite]'
  if (Array.isArray(value)) return value.slice(0,100).map(v=>redactAudit(v,depth+1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k])=>!/secret|token|password|senha|authorization|api.?key|card.?number|cvv|signature_png/i.test(k)).map(([k,v])=>[k,redactAudit(v,depth+1)]))
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {try {const u=new URL(value);return `${u.origin}${/webhook|workflow|catch|assinar/i.test(u.pathname)?'/[destino protegido]':u.pathname}`}catch{return '[URL]'}}
    return value.slice(0,16000)
  }
  return value
}
export function validateInvoice(input) {
  const result={}
  for(const key of ['id','key','issued_at','xml_url','pdf_url']) {result[key]=String(input?.[key] || '').trim();if(!result[key] || result[key].length>2048)throw new Error('Preencha todos os campos da nota fiscal.')}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result.issued_at) || new Date(result.issued_at).toISOString().slice(0,10)!==result.issued_at)throw new Error('Data de emissão inválida.')
  for(const key of ['xml_url','pdf_url']){let u;try{u=new URL(result[key])}catch{throw new Error('Informe URLs válidas para XML e PDF.')}if(u.protocol!=='https:' || u.username || u.password)throw new Error('Use URLs HTTPS sem credenciais.')}
  return result
}
export function validateBuyer(input) {
  const clean=(v,max=256)=>String(v || '').trim().slice(0,max)
  const name=clean(input?.name,128),email=clean(input?.email,254).toLowerCase(),phone=clean(input?.phone,30).replace(/\D/g,''),document=clean(input?.document,30).replace(/\D/g,'')
  if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length<10 || phone.length>15 || document && ![11,14].includes(document.length))throw new Error('Confira nome, email, celular e documento.')
  const a=input?.billing_address || {}, billing_address=Object.fromEntries(['country','street','number','line_1','line_2','district','city','state','zip_code'].map(k=>[k,clean(a[k])]))
  if(!billing_address.country)throw new Error('Informe o país.')
  return {name,email,phone,document,billing_address,company_name:clean(input?.company_name,128)}
}
export function auditEvent(e) {
  return {id:e.id,title:e.title || e.type,at:e.processed_at || e.received_at || e.created_at,description:e.error || '',json:redactAudit(e.payload || {}),created_at:e.received_at || e.created_at,finished_at:e.processed_at || e.delivered_at,user:e.payload?.actor?{name:e.payload.actor,email:e.payload.actor}:null,infrastructure:e.payload?.infrastructure || null}
}
