// Fixture de teste: reproduz filtros/claims do cliente, sem acesso a Supabase real.
export function contractMemoryDb(seed = {}) {
  const tables = structuredClone(seed)
  const value = (row, key) => key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key]
  const db = {
    tables, calls: [], failNextReceipt: false,
    from(table) {
      const conditions = [], ops = []
      let op = 'select', input, options, single = false, maximum = Infinity
      const q = {
        select(...args) { ops.push(['select', ...args]); return q },
        insert(data) { op = 'insert'; input = data; return q },
        upsert(data, opts) { op = 'upsert'; input = data; options = opts; return q },
        update(data) { op = 'update'; input = data; return q },
        eq(k, v) { conditions.push(row => value(row, k) === v); return q },
        neq(k, v) { conditions.push(row => value(row, k) !== v); return q },
        is(k, v) { conditions.push(row => (value(row, k) ?? null) === v); return q },
        in(k, values) { conditions.push(row => values.includes(value(row, k))); return q },
        lte(k, v) { conditions.push(row => value(row, k) != null && value(row, k) <= v); return q },
        lt(k, v) { conditions.push(row => value(row, k) < v); return q },
        or(expression) {
          const alternatives = expression.split(',').map(part => {
            const [key, comparator, ...rest] = part.split('.'), expected = rest.join('.')
            return row => comparator === 'is' ? value(row, key) == null : comparator === 'neq' ? value(row, key) != null && String(value(row, key)) !== expected : String(value(row, key)) === expected
          })
          conditions.push(row => alternatives.some(fn => fn(row))); return q
        },
        order() { return q }, limit(n) { maximum = n; return q },
        single() { single = true; return q }, maybeSingle() { single = true; return q },
        then(resolve, reject) {
          try {
            db.calls.push({ table, op, input: structuredClone(input), ops })
            const rows = tables[table] ||= []
            let data
            if (op === 'insert' || op === 'upsert') {
              data = []
              for (const record of Array.isArray(input) ? input : [input]) {
                const conflict = options?.onConflict || (table === 'contracts' ? 'order_id' : table === 'webhook_events' ? 'pagarme_event_id' : 'id')
                const existing = record[conflict] == null ? null : rows.find(row => row[conflict] === record[conflict])
                if (existing) {
                  if (op === 'upsert' && options?.ignoreDuplicates) continue
                  return resolve({ data: null, error: { code: '23505' } })
                }
                const created = { id: `row-${rows.length + 1}`, processed_at: null, reminders_sent: 0, otp_attempts: 0, otp_sent_count: 0, received_at: new Date().toISOString(), created_at: new Date().toISOString(), ...structuredClone(record) }
                rows.push(created); data.push(created)
              }
            } else {
              const matched = rows.filter(row => conditions.every(fn => fn(row))).slice(0, maximum)
              if (op === 'update') {
                if (db.failNextReceipt && table === 'webhook_events' && input.processed_at) {
                  db.failNextReceipt = false
                  return resolve({ data: null, error: { message: 'receipt unavailable' } })
                }
                matched.forEach(row => Object.assign(row, structuredClone(input)))
              }
              data = matched
            }
            resolve({ data: structuredClone(single ? data[0] || null : data), error: null })
          } catch (error) { reject(error) }
        },
      }
      return q
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ data: new Blob(['pdf']), error: null }) }) },
  }
  return db
}
