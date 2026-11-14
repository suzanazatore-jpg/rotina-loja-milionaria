import test from 'node:test'
import assert from 'node:assert/strict'
import {monthDays,monthStart,shortcutRange,orderedRange} from '../src/lib/calendarRange.js'

test('calendar starts on Monday and handles leap years and year boundaries',()=>{
 const october=monthDays('2026-10-15')
 assert.deepEqual(october.slice(0,4),[null,null,null,'2026-10-01'])
 assert.equal(monthDays('2024-02-01').filter(Boolean).length,29)
 assert.equal(monthStart('2026-12-13',1),'2027-01-01')
 assert.equal(monthStart('2027-01-13',-1),'2026-12-01')
})
test('shortcuts include both endpoints and clamp short months instead of overflowing',()=>{
 assert.deepEqual(shortcutRange('2026-11-13'),{inicio:'2026-10-17',fim:'2026-11-13'})
 assert.deepEqual(shortcutRange('2026-05-31',3),{inicio:'2026-02-28',fim:'2026-05-31'})
 assert.deepEqual(shortcutRange('2024-02-29',12),{inicio:'2023-02-28',fim:'2024-02-29'})
 assert.deepEqual(orderedRange('2026-11-13','2026-10-17'),{inicio:'2026-10-17',fim:'2026-11-13'})
 assert.deepEqual(orderedRange('2026-11-13','2026-11-13'),{inicio:'2026-11-13',fim:'2026-11-13'})
})
