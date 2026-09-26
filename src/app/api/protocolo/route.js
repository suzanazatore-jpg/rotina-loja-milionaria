import { PROTOCOL_EDITING_OPEN } from '@/lib/protocolEditing'
import { createClient } from '@supabase/supabase-js'
import { protocolDay, protocolGuidance } from '@/lib/protocolGuidance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(item => [item.type, item.value]))
  return `${values.year}-${values.month}-${values.day}`
}
async function context(request, slug) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { status: 401 }
  const supabase = client()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return { status: 401 }
  if (!/^[a-z0-9-]{1,120}$/.test(String(slug || ''))) return { status: 400 }
  const { data: course, error } = await supabase.from('courses')
    .select('id,slug,title,protocol_enabled,protocol_offer_url,is_published')
    .eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!course?.is_published || !course.protocol_enabled) return { status: 404 }
  const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle()
  const admin = (profile?.role === 'admin' && profile.status === 'active') || user.email === 'suporte@suzanazatorre.com.br'
  if (!admin) {
    if (profile && profile.status !== 'active') return { status: 403 }
    const { data: legacy } = await supabase.from('perfis').select('status_assinatura,tipo_acesso,acesso_expira_em').eq('id', user.id).maybeSingle()
    if (['atrasado','cancelado','reembolsado','reembolsada','refunded'].includes(legacy?.status_assinatura)) return { status: 403 }
    if (legacy && ['teste','avista'].includes(legacy.tipo_acesso) && legacy.acesso_expira_em && new Date(`${legacy.acesso_expira_em}T23:59:59-03:00`) < new Date()) return { status: 403 }
    const { data: enrollment, error: accessError } = await supabase.from('enrollments')
      .select('id').eq('profile_id', user.id).eq('course_id', course.id).eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle()
    if (accessError) throw accessError
    if (!enrollment) return { status: 403 }
  }
  return { supabase, user, course }
}
async function state(ctx) {
  const { supabase, user, course } = ctx
  const [runResult, entriesResult, salesResult] = await Promise.all([
    supabase.from('protocol_runs').select('*').eq('owner_id', user.id).eq('course_id', course.id).maybeSingle(),
    supabase.from('protocol_entries').select('*').eq('owner_id', user.id).eq('course_id', course.id),
    supabase.from('protocol_sales').select('*').eq('owner_id', user.id).eq('course_id', course.id).order('created_at', { ascending: false }),
  ])
  for (const result of [runResult, entriesResult, salesResult]) if (result.error) throw result.error
  return { run: runResult.data, entries: entriesResult.data || [], sales: salesResult.data || [], today: todayInBrazil() }
}
export async function GET(request) {
  try {
    const ctx = await context(request, new URL(request.url).searchParams.get('slug'))
    if (ctx.status) return json({ error: 'Protocolo não disponível para esta conta.' }, ctx.status)
    return json(await state(ctx))
  } catch { return json({ error: 'Não foi possível carregar a campanha.' }, 500) }
}
export async function POST(request) {
  try {
    const body = await request.json()
    const ctx = await context(request, body?.slug)
    if (ctx.status) return json({ error: 'Protocolo não disponível para esta conta.' }, ctx.status)
    const { supabase, user, course } = ctx
    const base = { owner_id: user.id, course_id: course.id }
    if (body.action === 'start') {
      const { data: readyLessons, error: readyError } = await supabase.from('lessons').select('id,protocol_checklist')
        .eq('course_id', course.id).eq('is_published', true)
      if (readyError) throw readyError
      if (readyLessons.length !== 7 || readyLessons.some(item => !Array.isArray(item.protocol_checklist) || !item.protocol_checklist.length)) {
        return json({ error: 'As sete missões ainda estão sendo preparadas.' }, 409)
      }
      const lot = String(body.lot_name || '').trim()
      const pieces = Number(body.starting_pieces), goal = Number(body.goal_cents)
      if (!lot || lot.length > 120 || !Number.isInteger(pieces) || pieces < 1 || pieces > 100000 || !Number.isSafeInteger(goal) || goal < 100 || goal > 100000000000) return json({ error: 'Confira o lote, a quantidade e a meta.' }, 400)
      const { data: existing } = await supabase.from('protocol_runs').select('owner_id').match(base).maybeSingle()
      if (existing) return json({ error: 'Sua campanha já começou.' }, 409)
      const { error } = await supabase.from('protocol_runs').insert({ ...base, lot_name: lot, starting_pieces: pieces, goal_cents: goal, started_on: todayInBrazil() })
      if (error) throw error
    } else if (body.action === 'entry') {
      const { data: run } = await supabase.from('protocol_runs').select('started_on').match(base).maybeSingle()
      if (!run) return json({ error: 'Comece a campanha primeiro.' }, 409)
      const { data: lessons, error: lessonsError } = await supabase.from('lessons').select('id,protocol_checklist')
        .eq('course_id', course.id).eq('is_published', true).order('sort_order').order('created_at')
      if (lessonsError) throw lessonsError
      if (lessons.length !== 7) return json({ error: 'As sete missões ainda estão sendo preparadas.' }, 409)
      const index = lessons.findIndex(item => item.id === body.lesson_id)
      if (index < 0 || index >= 7 || (!PROTOCOL_EDITING_OPEN && index >= protocolDay(run.started_on, todayInBrazil()))) return json({ error: 'Esta missão ainda não está disponível.' }, 403)
      const expected = Array.isArray(lessons[index].protocol_checklist) ? lessons[index].protocol_checklist.length : 0
      const checks = body.checklist
      if (!Array.isArray(checks) || checks.length !== expected || checks.some(v => typeof v !== 'boolean')) return json({ error: 'Confira o checklist da tarefa.' }, 400)
      const note = String(body.note || '').trim()
      if (note.length > 2000) return json({ error: 'O relato deve ter até 2.000 caracteres.' }, 400)
      const metric = key => body[key] === '' || body[key] == null ? null : Number(body[key])
      const pieces = metric('pieces_posted'), invites = metric('invited_count'), conversations = metric('conversations_count')
      if ([pieces, invites, conversations].some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 100000))) return json({ error: 'Use números inteiros maiores ou iguais a zero.' }, 400)
      if (!checks.some(Boolean) && !note && [pieces, invites, conversations].every(v => v === null)) return json({ error: 'Registre ao menos uma ação ou um resultado.' }, 400)
      const completed = body.complete === true
      if (completed && (!checks.length || !checks.every(Boolean))) return json({ error: 'Marque todas as ações realizadas antes de concluir a missão.' }, 400)
      const { error } = await supabase.from('protocol_entries').upsert({ ...base, lesson_id: body.lesson_id,
        checklist: checks, pieces_posted: pieces, invited_count: invites, conversations_count: conversations,
        note, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,lesson_id' })
      if (error) throw error
      const { data: existingProgress } = await supabase.from('lesson_progress').select('id').eq('profile_id', user.id).eq('lesson_id', body.lesson_id).maybeSingle()
      const progress = { completed, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
      const progressResult = existingProgress
        ? await supabase.from('lesson_progress').update(progress).eq('id', existingProgress.id)
        : await supabase.from('lesson_progress').insert({ profile_id: user.id, lesson_id: body.lesson_id, ...progress })
      if (progressResult.error) throw progressResult.error
      const guidance = protocolGuidance({ checks, pieces, invites, conversations })
      return json({ ...await state(ctx), guidance })
    } else if (body.action === 'sale') {
      const amount = Number(body.amount_cents), pieces = Number(body.pieces)
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000 || !Number.isInteger(pieces) || pieces < 1 || pieces > 100000) return json({ error: 'Informe o valor e a quantidade da venda.' }, 400)
      const { data: run } = await supabase.from('protocol_runs').select('starting_pieces').match(base).maybeSingle()
      if (!run) return json({ error: 'Comece a campanha primeiro.' }, 409)
      const { data: sales } = await supabase.from('protocol_sales').select('pieces').match(base)
      if ((sales || []).reduce((total, sale) => total + sale.pieces, 0) + pieces > run.starting_pieces) return json({ error: 'A quantidade vendida supera o lote informado.' }, 400)
      const { error } = await supabase.from('protocol_sales').insert({ ...base, amount_cents: amount, pieces })
      if (error) throw error
    } else if (body.action === 'qualify') {
      const bands = ['ate_20','20_50','50_100','100_500','500_mais']
      const size = Number(body.team_size)
      if (!bands.includes(body.monthly_revenue_band) || !Number.isInteger(size) || size < 0 || size > 100) return json({ error: 'Confira o faturamento e o tamanho da equipe.' }, 400)
      const { data: run } = await supabase.from('protocol_runs').select('owner_id').match(base).maybeSingle()
      const { data: finalLesson } = await supabase.from('lessons').select('id').eq('course_id', course.id).eq('is_published', true).order('sort_order', { ascending: false }).limit(1).maybeSingle()
      const { data: finalEntry } = finalLesson ? await supabase.from('protocol_entries').select('completed_at').eq('owner_id', user.id).eq('lesson_id', finalLesson.id).maybeSingle() : { data: null }
      if (!run || !finalEntry?.completed_at) return json({ error: 'Conclua o balanço do dia 7 primeiro.' }, 403)
      const { error } = await supabase.from('protocol_runs').update({ monthly_revenue_band: body.monthly_revenue_band, team_size: size }).match(base)
      if (error) throw error
    } else if (body.action === 'undo_sale') {
      const { data: latest } = await supabase.from('protocol_sales').select('id').match(base).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!latest || latest.id !== body.sale_id) return json({ error: 'Só o último lançamento pode ser desfeito.' }, 409)
      const { error } = await supabase.from('protocol_sales').delete().match({ ...base, id: latest.id })
      if (error) throw error
    } else return json({ error: 'Ação não reconhecida.' }, 400)
    return json(await state(ctx))
  } catch { return json({ error: 'Não foi possível salvar agora. Tente novamente.' }, 500) }
}
