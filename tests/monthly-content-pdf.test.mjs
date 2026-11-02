import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { criarPdfMensal, secoesCalendario, secoesCampanha } from '../src/lib/monthlyContentPdf.js'

const campanha = { id: 5, titulo: 'Campanhas de novembro', mes_ano: '2026-11', arquivo_url: null, plano_interativo: { fases: [{ titulo: 'Black Total', periodo: '23 a 30/11', etapas: [{ titulo: 'Divulgar seleção', descricao: 'Conferir margem antes de anunciar.' }] }], orientacao: 'Encerrar no dia 30.' } }
const acoes = [{ action_date: '2026-12-01', title: 'Continuação de novembro', content_text: 'Último roteiro completo.' }, { action_date: '2026-11-02', title: 'Primeiro Story', content_text: 'Linha um\nLinha dois ' + 'ação '.repeat(2000), product_cta: 'Chame no WhatsApp', material_url: 'https://exemplo.com/' + 'longo'.repeat(100) }]

test('PDF mantém fases, orientações, roteiros extensos e continuação no mês seguinte', async () => {
  const calendario = secoesCalendario(acoes)
  assert.match(calendario[0].titulo, /^02\/11\/2026/)
  assert.ok(calendario[0].textos.includes(acoes[1].content_text))
  assert.ok(calendario[1].textos.includes('Último roteiro completo.'))
  assert.deepEqual(secoesCampanha(campanha).at(-1), { titulo: 'Orientação geral da Suzana', textos: ['Encerrar no dia 30.'] })
  const doc = await PDFDocument.load(await criarPdfMensal({ titulo: 'Calendário de novembro 👑', mes: '2026-11', secoes: calendario }))
  assert.ok(doc.getPageCount() > 2)
  assert.match(doc.getTitle(), /^Calendário de novembro/)
})

const source = readFileSync(new URL('../src/app/api/conteudos/pdf/route.js', import.meta.url), 'utf8')
  .replace("'@supabase/supabase-js'", JSON.stringify(import.meta.resolve('@supabase/supabase-js')))
  .replace("'@/lib/appContentAccessServer'", JSON.stringify(new URL('../src/lib/appContentAccessServer.js', import.meta.url).href))
  .replace("'@/lib/monthlyContentPdf'", JSON.stringify(new URL('../src/lib/monthlyContentPdf.js', import.meta.url).href))
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('downloads sem anexo exigem sessão e acesso; calendário aceita mês com somente ações publicadas', async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  let mode = 'student', key = 'calendar', empty = false
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname.endsWith('/auth/v1/user')) return mode === 'invalid' ? json({ message: 'Invalid token' }, 401) : json({ id: 'test-user', email: mode === 'admin' ? 'suporte@suzanazatorre.com.br' : 'student@example.com' })
    if (url.pathname.endsWith('/profiles')) return json([{ status: 'active' }])
    if (url.pathname.endsWith('/profile_plans')) return json([{ plan_id: 'test-plan' }])
    if (url.pathname.endsWith('/perfis')) return json([{ tipo_acesso: 'mensal', status_assinatura: 'ativo' }])
    if (url.pathname.endsWith('/plan_app_contents')) return json([{ content_key: key }])
    if (url.pathname.endsWith('/campanhas')) { assert.equal(url.searchParams.get('mes_ano'), 'eq.2026-11'); return json(empty ? [] : [campanha]) }
    if (url.pathname.endsWith('/calendario')) return json([])
    if (url.pathname.endsWith('/calendar_actions')) {
      assert.equal(url.searchParams.get('is_published'), 'eq.true')
      assert.equal(url.searchParams.get('planning_month'), 'eq.2026-11')
      return json(empty ? [] : acoes)
    }
    throw new Error(`Unexpected request ${url.pathname}`)
  }
  const request = (tipo = 'calendario', auth = true, mes = '2026-11') => new Request(`https://example.com/api/conteudos/pdf?tipo=${tipo}&mes=${mes}`, { headers: auth ? { Authorization: 'Bearer test-access-token' } : {} })
  try {
    assert.equal((await GET(request('calendario', false))).status, 401)
    assert.equal((await GET(request('rotinas'))).status, 400)
    assert.equal((await GET(request('calendario', true, '2026-13'))).status, 400)
    mode = 'invalid'; assert.equal((await GET(request())).status, 401)
    mode = 'student'; key = 'routine'; assert.equal((await GET(request())).status, 403)
    for (mode of ['student', 'admin']) {
      for (const tipo of ['calendario', 'campanhas']) {
        key = tipo === 'calendario' ? 'calendar' : 'campaigns'
        const result = await GET(request(tipo))
        assert.equal(result.status, 200)
        assert.equal(result.headers.get('Content-Type'), 'application/pdf')
        assert.match(result.headers.get('Content-Disposition'), /2026-11\.pdf/)
        assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
        await PDFDocument.load(await result.arrayBuffer())
      }
    }
    empty = true; assert.equal((await GET(request())).status, 404)
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})
