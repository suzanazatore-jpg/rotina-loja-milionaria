import { createClient } from '@supabase/supabase-js'
import { appContentKeys } from '@/lib/appContentAccessServer'
import { criarPdfRotina, mesDaRotina, selecionarRotinasDoMes } from '@/lib/routinePdf'

export const runtime = 'nodejs'

export async function GET(request) {
  const falha = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return falha('Não autorizado.', 401)
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return falha('Sessão inválida.', 401)
    if (!(await appContentKeys(supabase, user)).includes('routine')) return falha('Conteúdo não incluído no seu acesso.', 403)
    const id = new URL(request.url).searchParams.get('id')
    if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return falha('Rotina inválida.', 400)
    const colunas = 'id,semana_inicio,titulo,descricao,plano_dias'
    const { data: item, error } = await supabase.from('rotinas').select(colunas).eq('id', id).maybeSingle()
    if (error) throw error
    if (!item) return falha('Rotina não encontrada.', 404)
    const admin = user.email === 'suporte@suzanazatorre.com.br'
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (!admin && item.semana_inicio > hoje) return falha('Esta rotina ainda não está disponível.', 404)
    const mes = mesDaRotina(item)
    const [ano, numero] = mes.split('-').map(Number)
    // Inclui a semana que começa no mês anterior (ex.: 31/08 em setembro).
    const inicio = new Date(Date.UTC(ano, numero - 1, -5)).toISOString().slice(0, 10)
    const fim = new Date(Date.UTC(ano, numero, 0)).toISOString().slice(0, 10)
    let consulta = supabase.from('rotinas').select(colunas).gte('semana_inicio', inicio).lte('semana_inicio', fim)
    if (!admin) consulta = consulta.lte('semana_inicio', hoje)
    const { data, error: buscaError } = await consulta.order('semana_inicio', { ascending: true })
    if (buscaError) throw buscaError
    const itens = selecionarRotinasDoMes(data || [], mes)
    const pdf = await criarPdfRotina(itens.length ? itens : [item], mes)
    return new Response(pdf, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Rotina_${mes}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return falha('Não foi possível gerar o PDF da rotina. Tente novamente.', 500)
  }
}
