import { createClient } from '@supabase/supabase-js'
import { appContentKeys } from '@/lib/appContentAccessServer'
import { criarPdfMensal, secoesCalendario, secoesCampanha } from '@/lib/monthlyContentPdf'

export const runtime = 'nodejs'

export async function GET(request) {
  const falha = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return falha('Não autorizado.', 401)
  const params = new URL(request.url).searchParams
  const tipo = params.get('tipo'), mes = params.get('mes')
  if (!['calendario', 'campanhas'].includes(tipo) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return falha('Material ou mês inválido.', 400)
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return falha('Sessão inválida.', 401)
    if (!(await appContentKeys(supabase, user)).includes(tipo === 'calendario' ? 'calendar' : 'campaigns')) return falha('Conteúdo não incluído no seu acesso.', 403)
    const { data: item, error } = await supabase.from(tipo).select('*').eq('mes_ano', mes).maybeSingle()
    if (error) throw error
    let secoes = []
    if (tipo === 'calendario') {
      const { data: acoes, error: actionsError } = await supabase.from('calendar_actions').select('action_date,title,description,channel,content_format,product_cta,content_text,material_url,sort_order').eq('planning_month', mes).eq('is_published', true).order('action_date').order('sort_order')
      if (actionsError) throw actionsError
      secoes = secoesCalendario(acoes || [])
    } else if (item) secoes = secoesCampanha(item)
    if (!secoes.length) return falha('Nenhum conteúdo interativo disponível para gerar o PDF deste mês.', 404)
    const titulo = item?.titulo || `Calendário de postagens — ${mes}`
    const pdf = await criarPdfMensal({ titulo, descricao: item?.descricao, mes, secoes })
    return new Response(pdf, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${tipo === 'calendario' ? 'Calendario' : 'Campanhas'}_${mes}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return falha('Não foi possível gerar o PDF. Tente novamente.', 500)
  }
}
