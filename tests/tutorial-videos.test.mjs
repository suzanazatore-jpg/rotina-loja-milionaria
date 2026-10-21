import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createClient } from '@supabase/supabase-js'

const helperSource = readFileSync(new URL('../src/lib/tutorialVideos.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const coversSource = readFileSync(new URL('../src/lib/tutorialVideoCovers.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const helper = vm.createContext({ URL, Set })
vm.runInContext(helperSource + '\nthis.toEmbedUrl = toEmbedUrl', helper)
const { toEmbedUrl } = helper

// ScaleUp's documented embed format. This is a fixture, not live app content.
const scaleup = 'https://player.scaleup.com.br/embed/510c42b9fde8af543194ea9fdc0296149cc5a1a5'
const panda = 'https://player-vz-ded14ebd-85a.tv.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af'

test('accepts ScaleUp embeds and preserves playback parameters', () => {
  for (const url of [scaleup, `${scaleup}/`, `${scaleup}?autoplay=false&events=play,pause`]) {
    assert.equal(toEmbedUrl(`  ${url}  `), url)
  }
})

test('accepts both documented Panda player hosts and preserves parameters', () => {
  for (const url of [panda, `${panda}&autoplay=false&muted=true`, panda.replace('player-vz-ded14ebd-85a.tv', 'player')]) {
    assert.equal(toEmbedUrl(url), url)
  }
  assert.equal(toEmbedUrl(panda.replace('/embed/', '/embed')), panda.replace('/embed/', '/embed'))
})

test('keeps existing YouTube, Vimeo and Loom URL conversions', () => {
  const id = 'dQw4w9WgXcQ'
  for (const url of [
    `https://youtu.be/${id}?si=example`,
    `https://www.youtube.com/watch?v=${id}&t=10`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
  ]) assert.equal(toEmbedUrl(url), `https://www.youtube.com/embed/${id}`)
  assert.equal(toEmbedUrl('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789')
  assert.equal(toEmbedUrl('https://player.vimeo.com/video/123456789'), 'https://player.vimeo.com/video/123456789')
  assert.equal(toEmbedUrl('https://www.loom.com/share/abc123'), 'https://www.loom.com/embed/abc123')
  assert.equal(toEmbedUrl('https://www.loom.com/embed/abc123'), 'https://www.loom.com/embed/abc123')
})

test('rejects unsafe URLs, lookalike hosts, unsupported pages and pasted HTML', () => {
  const rejected = [
    '', ' ', null, undefined, 'not a url',
    scaleup.replace('https:', 'http:'),
    scaleup.replace('https:', 'javascript:'),
    `javascript:alert(1)`, 'data:text/html,<script>alert(1)</script>',
    scaleup.replace('https:', ''),
    scaleup.replace('player.scaleup.com.br', 'player.scaleup.com.br.evil.test'),
    scaleup.replace('player.scaleup.com.br', 'evilplayer.scaleup.com.br'),
    scaleup.replace('player.scaleup.com.br', 'www.player.scaleup.com.br'),
    scaleup.replace('player.scaleup.com.br', 'player.scaleup.com.br@evil.test'),
    scaleup.replace('player.scaleup.com.br', 'user:password@player.scaleup.com.br'),
    scaleup.replace('player.scaleup.com.br', 'player.scaleup.com.br:8443'),
    scaleup.replace('/embed/', '/watch/'),
    'https://player.scaleup.com.br/embed/',
    'https://player.scaleup.com.br/embed/not-a-video',
    `${scaleup}/extra`,
    panda.replace('pandavideo.com.br', 'pandavideo.com.br.evil.test'),
    panda.replace('player-vz-ded14ebd-85a.tv', 'dashboard'),
    panda.replace('player-vz-ded14ebd-85a.tv', 'evil'),
    panda.replace('/embed/', '/other/'),
    'https://player.pandavideo.com.br/embed/',
    'https://player.pandavideo.com.br/embed/?v=invalid',
    `${panda}&v=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    `<iframe src="${scaleup}"></iframe>`,
  ]
  for (const url of rejected) assert.equal(toEmbedUrl(url), '', String(url))
})

const routeSource = readFileSync(new URL('../src/app/api/admin/videos/route.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')

function setup({ admin = true, dbError = null, currentCovers = [] } = {}) {
  const writes = []
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { email: admin ? 'suporte@suzanazatorre.com.br' : 'student@example.test' } } }) },
    from(table) {
      assert.equal(table, 'tutorial_videos')
      return {
        select: async () => ({ data: currentCovers, error: null }),
        upsert(rows, options) {
          writes.push({ rows, options })
          return { select: async () => ({ data: rows.map(row => ({ ...currentCovers.find(current => current.module_key === row.module_key), ...row })), error: dbError }) }
        },
      }
    },
    storage: { from: bucket => ({ getPublicUrl: path => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } }) }) },
  }
  const context = vm.createContext({ URL, Set, Date, NextResponse: Response, createClient: () => db, process: { env: {} } })
  vm.runInContext(helperSource + '\n' + coversSource + '\n' + routeSource + '\nthis.handler = PUT', context)
  const save = (videos, authenticated = true) => context.handler(new Request('https://app.example.test/api/admin/videos', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-token' } : {}) },
    body: JSON.stringify({ videos }),
  }))
  return { writes, save }
}

test('admin API saves ScaleUp and Panda for all five tutorial modules', async () => {
  const s = setup()
  const keys = ['routine', 'campaigns', 'calendar', 'team_goals', 'pricing']
  const response = await s.save(keys.map((module_key, i) => ({ module_key, title: ' Tutorial ', video_url: ` ${i % 2 ? panda : scaleup} `, is_active: true })))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0')
  const { videos } = await response.json()
  assert.equal(videos.length, 5)
  assert.equal(s.writes.length, 1)
  assert.equal(s.writes[0].options.onConflict, 'module_key')
  for (const [i, row] of videos.entries()) {
    assert.equal(row.video_url, i % 2 ? panda : scaleup)
    assert.equal(row.title, 'Tutorial')
    assert.equal(row.is_active, true)
    assert.equal(toEmbedUrl(row.video_url), row.video_url)
  }
})

test('admin API preserves remove, pause and repeated save behavior', async () => {
  const s = setup()
  const blank = await s.save([{ module_key: 'routine', title: '', video_url: '  ' }])
  assert.equal(blank.status, 200)
  assert.equal((await blank.json()).videos[0].video_url, null)
  const paused = [{ module_key: 'routine', video_url: scaleup, is_active: false }]
  for (let i = 0; i < 2; i++) {
    const response = await s.save(paused)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).videos[0].is_active, false)
  }
  assert.equal(s.writes.length, 3)
  assert.ok(s.writes.every(write => write.options.onConflict === 'module_key'))
})

test('admin API rejects invalid values and unauthorized users without writes', async () => {
  for (const options of [{ admin: false }, {}]) {
    const s = setup(options)
    const response = await s.save([{ module_key: 'routine', video_url: scaleup }], options.admin === false)
    assert.equal(response.status, 403)
    assert.equal(s.writes.length, 0)
  }
  for (const videos of [
    null,
    [{ module_key: 'unknown', video_url: scaleup }],
    [{ module_key: 'routine', video_url: 'https://evil.test/embed/video' }],
    [{ module_key: 'routine', video_url: `${scaleup}?padding=${'x'.repeat(1000)}` }],
    [{ module_key: 'routine', title: 'x'.repeat(121), video_url: panda }],
  ]) {
    const s = setup()
    assert.equal((await s.save(videos)).status, 400)
    assert.equal(s.writes.length, 0)
  }
})

test('admin API reports a storage failure instead of claiming success', async () => {
  const s = setup({ dbError: { message: 'Storage unavailable' } })
  const response = await s.save([{ module_key: 'routine', video_url: scaleup }])
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'Storage unavailable')
})

const savedCover = 'tutorial-videos/routine/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'

test('admin API saves only trusted module-specific paths and derives the cover URL', async () => {
  const s = setup()
  const response = await s.save([{ module_key: 'routine', video_url: scaleup, cover_image_path: savedCover, cover_image_url: 'https://evil.test/image.jpg' }])
  assert.equal(response.status, 200)
  const { videos } = await response.json()
  assert.equal(videos[0].cover_image_path, savedCover)
  assert.equal(videos[0].cover_image_url, `https://example.supabase.co/storage/v1/object/public/course-covers/${savedCover}`)
  assert.equal(s.writes[0].rows[0].cover_image_url, undefined)
})

test('older admin clients preserve saved covers and explicit null removes only the reference', async () => {
  const s = setup({ currentCovers: [{ module_key: 'routine', cover_image_path: savedCover }] })
  const legacy = await s.save([{ module_key: 'routine', video_url: scaleup }])
  assert.equal(legacy.status, 200)
  assert.equal((await legacy.json()).videos[0].cover_image_path, savedCover)
  assert.equal(Object.prototype.hasOwnProperty.call(s.writes[0].rows[0], 'cover_image_path'), false)
  const removed = await s.save([{ module_key: 'routine', video_url: scaleup, cover_image_path: null }])
  assert.equal(removed.status, 200)
  assert.equal((await removed.json()).videos[0].cover_image_path, null)
})

test('admin API rejects external covers, wrong modules, malformed paths and duplicate modules', async () => {
  for (const path of ['https://evil.test/image.jpg', savedCover.replace('/routine/', '/pricing/'), savedCover.replace('.jpg', '.svg'), 'tutorial-videos/routine/../../image.jpg', false, 0]) {
    const s = setup()
    assert.equal((await s.save([{ module_key: 'routine', video_url: scaleup, cover_image_path: path }])).status, 400)
    assert.equal(s.writes.length, 0)
  }
  const s = setup()
  assert.equal((await s.save([{ module_key: 'routine' }, { module_key: 'routine' }])).status, 400)
  assert.equal(s.writes.length, 0)
  assert.equal((await s.save([{ module_key: 'routine', cover_image_path: null }, { module_key: 'pricing' }])).status, 400)
  assert.equal(s.writes.length, 0)
})

test('the Supabase SDK excludes an omitted cover from the upsert columns, preserving concurrent saves', async () => {
  const requests = []
  const db = createClient('https://example.supabase.co', 'test-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) })
      return Response.json([])
    } },
  })
  const s = setup()
  await s.save([{ module_key: 'routine', video_url: scaleup }])
  await db.from('tutorial_videos').upsert(s.writes[0].rows, { onConflict: 'module_key' }).select('module_key,cover_image_path')
  assert.equal(requests.length, 1)
  assert.ok(!new URL(requests[0].url).searchParams.get('columns').includes('cover_image_path'))
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body[0], 'cover_image_path'), false)
})
