import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const source = readFileSync(new URL('../src/lib/activeRoutine.js', import.meta.url), 'utf8')
const { loadActiveRoutine } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const september = { id: 15, semana_inicio: '2026-09-28', titulo: 'Checklist', plano_dias: { '1': { tarefas: [{ id: 'vender', titulo: 'Vender' }] } }, arquivo_nome: 'setembro.pdf', storage_bucket: 'rotinas' }

function database(rows, fail = false) {
  return createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      if (fail) return new Response(JSON.stringify({ message: 'database unavailable', code: 'XX000' }), { status: 500 })
      const url = new URL(input)
      const filter = url.searchParams.get('semana_inicio')
      assert.ok(filter.startsWith('lte.'))
      assert.equal(url.searchParams.get('order'), 'semana_inicio.desc')
      assert.equal(url.searchParams.get('limit'), '1')
      const selected = rows.filter(row => row.semana_inicio <= filter.slice(4)).sort((a, b) => b.semana_inicio.localeCompare(a.semana_inicio)).slice(0, 1)
      return new Response(JSON.stringify(selected), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
}

test('September routine stays available across weeks and months with fresh execution dates', async () => {
  for (const week of ['2026-09-28', '2026-10-05', '2026-10-12', '2026-11-02', '2027-01-04']) {
    const { data, error } = await loadActiveRoutine(database([september]), week)
    assert.equal(error, null)
    assert.equal(data.id, 15)
    assert.equal(data.semana_inicio, week)
    assert.equal(data.semana_publicacao, '2026-09-28')
    assert.deepEqual(data.plano_dias, september.plano_dias)
    assert.equal(data.arquivo_nome, 'setembro.pdf')
  }
  assert.equal(september.semana_inicio, '2026-09-28')
})

test('replacement takes over from its start date and scheduled routines do not appear early', async () => {
  const replacement = { ...september, id: 16, semana_inicio: '2026-10-19', titulo: 'Nova rotina' }
  const db = database([september, replacement])
  assert.equal((await loadActiveRoutine(db, '2026-10-12')).data.id, 15)
  assert.equal((await loadActiveRoutine(db, '2026-10-19')).data.id, 16)
  assert.equal((await loadActiveRoutine(db, '2026-11-02')).data.id, 16)
})

test('no routine is returned when none has started', async () => {
  assert.equal((await loadActiveRoutine(database([]), '2026-10-05')).data, null)
  assert.equal((await loadActiveRoutine(database([september]), '2026-09-21')).data, null)
})

test('database errors remain visible to callers', async () => {
  const result = await loadActiveRoutine(database([], true), '2026-10-05')
  assert.equal(result.data, null)
  assert.equal(result.error.message, 'database unavailable')
})
