import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { mesDaRotina, selecionarRotinasDoMes, agruparPlanosRotina, criarPdfRotina } from '../src/lib/routinePdf.js'

const plano = {
  _modelo: { versao: 2, mes_ano: '2026-09', dias_ativos: ['1', '2'], tarefas_diarias: [{ titulo: 'Conferir a meta' }], padrao_atendimento: [{ titulo: 'Oferecer combinações' }], tarefas_semanais: [{ dia: '1', titulo: 'Revisar estoque' }] },
  '1': { foco_titulo: 'Pós-venda', tarefas: [{ titulo: 'Chamar clientes' }], destaque: { titulo: 'Malinha condicional', descricao: 'Combinar a devolução.' } },
  '2': { foco_titulo: 'Recuperação', tarefas: [{ titulo: 'Retomar conversas' }] },
}
const rows = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((semana_inicio, i) => ({ id: i + 11, semana_inicio, titulo: 'Checklist de Sucesso', plano_dias: structuredClone(plano) }))

test('monthly PDF includes the August boundary week and keeps September when reused in November', () => {
  assert.equal(mesDaRotina({ ...rows[4], semana_inicio: '2026-11-02', semana_publicacao: '2026-09-28' }), '2026-09')
  assert.equal(selecionarRotinasDoMes([...rows, { semana_inicio: '2026-10-05' }], '2026-09').length, 5)
  assert.equal(mesDaRotina({ semana_inicio: '2026-11-02', semana_publicacao: '2026-09-28' }), '2026-09')
})

test('identical weekly plans print once; a changed week retains its own content', () => {
  assert.equal(agruparPlanosRotina(rows).length, 1)
  const edited = structuredClone(rows)
  edited[2].plano_dias['1'].tarefas[0].titulo = 'Ação exclusiva desta semana'
  assert.equal(agruparPlanosRotina(edited).length, 2)
  assert.equal(agruparPlanosRotina(edited)[0].semanas.length, 4)
})

test('PDF has valid pages, Portuguese metadata, and handles long text and emoji', async () => {
  const edited = structuredClone(rows)
  edited[0].descricao = 'Organização e ação 👑 ' + 'https://exemplo.com/'.repeat(30)
  const bytes = await criarPdfRotina(edited, '2026-09')
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getTitle(), 'Rotina de setembro de 2026')
  assert.ok(doc.getPageCount() >= 2)
  assert.equal(doc.getPages()[0].getWidth(), 595.28)
})

const source = readFileSync(new URL('../src/app/api/rotina/pdf/route.js', import.meta.url), 'utf8')
  .replace("'@supabase/supabase-js'", JSON.stringify(import.meta.resolve('@supabase/supabase-js')))
  .replace("'@/lib/appContentAccessServer'", JSON.stringify(new URL('../src/lib/appContentAccessServer.js', import.meta.url).href))
  .replace("'@/lib/routinePdf'", JSON.stringify(new URL('../src/lib/routinePdf.js', import.meta.url).href))
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('download endpoint enforces authentication, entitlement, release date and returns an attachment', async () => {
  const originalFetch = globalThis.fetch
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  let mode = 'admin'
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname.endsWith('/auth/v1/user')) return mode === 'invalid' ? json({ message: 'invalid token' }, 401) : json({ id: 'example-user', email: mode === 'admin' ? 'suporte@suzanazatorre.com.br' : 'student@example.com' })
    if (url.pathname.endsWith('/profiles')) return json([{ status: mode === 'denied' ? 'inactive' : 'active' }])
    if (url.pathname.endsWith('/profile_plans')) return json([{ plan_id: 'example-plan' }])
    if (url.pathname.endsWith('/perfis')) return json([{ tipo_acesso: 'mensal', status_assinatura: 'ativo' }])
    if (url.pathname.endsWith('/plan_app_contents')) return json([{ content_key: 'routine' }])
    if (url.pathname.endsWith('/rotinas')) {
      if (url.searchParams.has('id')) return json([{ ...rows[4], ...(mode === 'future' ? { semana_inicio: '2099-09-28' } : {}) }])
      assert.equal(url.searchParams.get('order'), 'semana_inicio.asc')
      return json(rows)
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  const request = (auth = true) => new Request('https://example.com/api/rotina/pdf?id=15', { headers: auth ? { Authorization: 'Bearer test-access-token' } : {} })
  try {
    assert.equal((await GET(request(false))).status, 401)
    mode = 'invalid'; assert.equal((await GET(request())).status, 401)
    mode = 'denied'; assert.equal((await GET(request())).status, 403)
    mode = 'future'; assert.equal((await GET(request())).status, 404)
    for (mode of ['admin', 'student']) {
      const result = await GET(request())
      assert.equal(result.status, 200)
      assert.equal(result.headers.get('Content-Type'), 'application/pdf')
      assert.equal(result.headers.get('Content-Disposition'), 'attachment; filename="Rotina_2026-09.pdf"')
      assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
      assert.equal((await PDFDocument.load(await result.arrayBuffer())).getTitle(), 'Rotina de setembro de 2026')
    }
  } finally {
    globalThis.fetch = originalFetch
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey
  }
})
