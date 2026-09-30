import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { transformSync } = require('@babel/core')
const root = new URL('../', import.meta.url)
const compile = path => transformSync(readFileSync(new URL(path, root), 'utf8'), {
  filename: path,
  babelrc: false,
  configFile: false,
  presets: [['next/babel', { 'preset-env': { modules: 'commonjs', targets: { node: 'current' } }, 'preset-react': { runtime: 'automatic' }, 'transform-runtime': { helpers: false, regenerator: false } }]],
}).code
const adminCode = compile('src/app/admin/videos/page.js')
const playerCode = compile('src/app/components/TutorialVideoPlayer.js')

function loadHelper(path) {
  const source = readFileSync(new URL(path, root), 'utf8')
  const names = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1])
  const context = vm.createContext({ URL, Set })
  vm.runInContext(source.replace(/^export /gm, '') + `\nthis.result = { ${names.join(',')} }`, context)
  return context.result
}
const videosHelper = loadHelper('src/lib/tutorialVideos.js')
const coversHelper = loadHelper('src/lib/tutorialVideoCovers.js')

// Small hook/element harness: exercises the production event handlers without a
// browser, external providers, Supabase credentials, or extra test dependencies.
function createHooks() {
  const slots = []
  let cursor = 0
  let effects = []
  const cleanups = []
  return {
    api: {
      useState(initial) {
        const index = cursor++
        if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
        return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
      },
      useRef(initial) {
        const index = cursor++
        if (!slots[index]) slots[index] = { current: initial }
        return slots[index]
      },
      useEffect(effect, deps) {
        const index = cursor++
        if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
          slots[index] = { deps }
          effects.push(effect)
        }
      },
    },
    render(component, props) {
      cursor = 0
      const tree = component(props)
      const pending = effects
      effects = []
      for (const effect of pending) {
        const cleanup = effect()
        if (cleanup) cleanups.push(cleanup)
      }
      return tree
    },
    unmount() { cleanups.forEach(cleanup => cleanup()) },
  }
}

const jsx = (type, props, key) => ({ type, props: props || {}, key })
const jsxRuntime = { jsx, jsxs: jsx }
const playerMarker = () => null
function loadComponent(code, hooks, dependencies = {}, globals = {}) {
  const context = vm.createContext({
    URL, FormData, Map, console,
    ...globals,
    exports: {},
    require: name => {
      if (name === 'react') return hooks.api
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === '@/lib/tutorialVideos') return videosHelper
      if (name === '@/lib/tutorialVideoCovers') return coversHelper
      if (name === '@/app/components/TutorialVideoPlayer') return playerMarker
      if (name in dependencies) return dependencies[name]
      return require(name)
    },
  })
  vm.runInContext(code, context)
  return context.exports.default
}

function descendants(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => descendants(child, predicate))
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...descendants(tree.props?.children, predicate)]
}
const find = (tree, predicate) => {
  const match = descendants(tree, predicate)[0]
  assert.ok(match, 'Expected UI element to exist')
  return match
}
const textContent = tree => Array.isArray(tree) ? tree.map(textContent).join('') : tree && typeof tree === 'object' ? textContent(tree.props?.children) : String(tree ?? '')
const flush = () => new Promise(resolve => setImmediate(resolve))
const file = (name = 'capa.png', type = 'image/png', size = 16) => new File([new Uint8Array(size)], name, { type })
const panda = 'https://player.pandavideo.com.br/embed/?v=3b101f05-84aa-4de0-9b64-71f1855388af'
const coverUrl = 'https://storage.example.test/tutorial/routine/cover.png'
const savedCover = key => ({ cover_image_path: `tutorial-videos/${key}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png`, cover_image_url: `https://storage.example.test/${key}/cover.png` })
const initialVideos = () => videosHelper.TUTORIAL_VIDEO_MODULES.map(module => ({ module_key: module.key, title: module.defaultTitle, video_url: panda, is_active: true, cover_image_path: null, cover_image_url: null }))

async function setupAdmin({ videos = initialVideos(), intercept, session = true, readError = false } = {}) {
  const hooks = createHooks()
  const calls = []
  const revoked = []
  let urlCounter = 0
  let stored = structuredClone(videos)
  let sessionCalls = 0
  class MockURL extends URL {
    static createObjectURL() { return `blob:https://app.example.test/${++urlCounter}` }
    static revokeObjectURL(url) { revoked.push(url) }
  }
  const fetch = async (url, options = {}) => {
    const call = { url, ...options, method: options.method || 'GET' }
    calls.push(call)
    const custom = await intercept?.(call, calls)
    if (custom) return custom
    if (call.method === 'GET') return readError ? Response.json({ error: 'Carregamento indisponível' }, { status: 503 }) : Response.json({ videos: stored })
    if (call.method === 'POST') return Response.json(savedCover(call.body.get('module_key')))
    stored = JSON.parse(call.body).videos.map(video => ({ ...video, title: video.title.trim(), cover_image_url: video.cover_image_path ? savedCover(video.module_key).cover_image_url : null }))
    return Response.json({ videos: stored })
  }
  const router = { push() {} }
  const component = loadComponent(adminCode, hooks, {
    'next/navigation': { useRouter: () => router },
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: session || sessionCalls === 0 ? { user: { email: 'suporte@suzanazatorre.com.br' }, access_token: `token-${++sessionCalls}` } : null } }) } } },
  }, { fetch, URL: MockURL })
  const render = () => hooks.render(component)
  render()
  await flush()
  const select = (key, selectedFile) => {
    const target = { files: selectedFile ? [selectedFile] : [], value: 'chosen-file' }
    find(render(), item => item.type === 'input' && item.props.id === `capa-${key}`).props.onChange({ target })
    assert.equal(target.value, '')
  }
  return {
    render, calls, revoked, select, unmount: hooks.unmount,
    save: () => find(render(), item => item.type === 'button' && /Salvar alterações|Salvando/.test(textContent(item))).props.onClick(),
    card: key => find(render(), item => item.type === 'article' && item.key === key),
    getStored: () => stored,
  }
}

function setupPlayer(props) {
  const hooks = createHooks()
  const component = loadComponent(playerCode, hooks)
  const outer = component(props)
  return { outer, render: () => typeof outer?.type === 'function' ? hooks.render(outer.type, outer.props) : outer, component }
}

test('player without a cover keeps the provider iframe and original parameters', () => {
  const s = setupPlayer({ videoUrl: `${panda}&muted=true`, title: 'Rotina' })
  const iframe = s.render()
  assert.equal(iframe.type, 'iframe')
  assert.equal(iframe.props.src, `${panda}&muted=true`)
  assert.equal(iframe.props.title, 'Rotina')
  assert.equal(iframe.props.allowFullScreen, true)
})

test('player with a cover mounts its iframe only after the accessible button is clicked', () => {
  const s = setupPlayer({ videoUrl: panda, coverUrl, title: 'Rotina' })
  const button = s.render()
  assert.equal(button.type, 'button')
  assert.equal(button.props['aria-label'], 'Abrir vídeo: Rotina')
  assert.equal(descendants(button, item => item.type === 'iframe').length, 0)
  button.props.onClick()
  assert.equal(s.render().type, 'iframe')
  assert.equal(s.render().props.src, panda)
})

test('broken or unsafe covers fall back to the existing player', () => {
  const s = setupPlayer({ videoUrl: panda, coverUrl })
  find(s.render(), item => item.type === 'img').props.onError()
  assert.equal(s.render().type, 'iframe')
  for (const invalid of ['javascript:alert(1)', 'data:image/png;base64,x', 'http://example.test/a.jpg', 'bad-url', 'https://user:pass@example.test/a.png']) {
    assert.equal(setupPlayer({ videoUrl: panda, coverUrl: invalid }).render().type, 'iframe')
  }
})

test('changing the video or cover resets the keyed player and missing videos preserve fallback', () => {
  const s = setupPlayer({ videoUrl: panda, coverUrl })
  s.render().props.onClick()
  for (const props of [{ videoUrl: panda, coverUrl: `${coverUrl}?v=2` }, { videoUrl: `${panda}&muted=true`, coverUrl }]) {
    assert.notEqual(s.outer.key, s.component(props).key)
    assert.equal(setupPlayer(props).render().type, 'button')
  }
  const fallback = jsx('div', { children: 'Em breve' })
  assert.equal(setupPlayer({ videoUrl: '', coverUrl, fallback }).render(), fallback)
})

test('selecting and replacing a cover stays local, resets the input, and revokes old previews', async () => {
  const s = await setupAdmin()
  s.select('routine', file())
  const first = find(s.card('routine'), item => item.type === 'img').props.src
  assert.ok(first.startsWith('blob:'))
  assert.equal(s.calls.length, 1)
  s.select('routine', file())
  assert.deepEqual(s.revoked, [first])
  const second = find(s.card('routine'), item => item.type === 'img').props.src
  assert.notEqual(first, second)
  s.unmount()
  assert.deepEqual(s.revoked, [first, second])
})

test('invalid files and cancelled selection preserve the existing draft cover', async () => {
  const s = await setupAdmin()
  s.select('routine', file())
  const preview = find(s.card('routine'), item => item.type === 'img').props.src
  for (const invalid of [file('large.png', 'image/png', 3 * 1024 * 1024 + 1), file('bad.svg', 'image/svg+xml'), file('empty.png', 'image/png', 0)]) {
    s.select('routine', invalid)
    assert.match(textContent(s.render()), /JPG ou PNG de até 3 MB/)
    assert.equal(find(s.card('routine'), item => item.type === 'img').props.src, preview)
  }
  s.select('routine', null)
  assert.equal(s.revoked.length, 0)
  assert.equal(s.calls.length, 1)
  s.unmount()
})

test('save uploads separate multipart requests with a fresh token and PUT only persists cover paths', async () => {
  const s = await setupAdmin()
  s.select('routine', file())
  s.select('pricing', file('preco.jpg', 'image/jpeg'))
  await s.save()
  assert.deepEqual(s.calls.map(call => call.method), ['GET', 'POST', 'POST', 'PUT'])
  for (const call of s.calls.slice(1)) assert.equal(call.headers.Authorization, 'Bearer token-2')
  for (const upload of s.calls.filter(call => call.method === 'POST')) {
    assert.equal(upload.url, '/api/admin/videos/capa')
    assert.deepEqual([...upload.body.keys()], ['module_key', 'image'])
    assert.equal(upload.headers['Content-Type'], undefined)
  }
  const payload = JSON.parse(s.calls.at(-1).body)
  assert.equal(payload.videos[0].cover_image_path, savedCover('routine').cover_image_path)
  assert.ok(payload.videos.every(video => !Object.hasOwn(video, 'cover_image_url')))
  assert.match(textContent(s.render()), /Vídeos salvos/)
  assert.doesNotMatch(textContent(s.render()), /envio pendente/)
  assert.equal(s.revoked.length, 2)
  const refreshed = await setupAdmin({ videos: s.getStored() })
  assert.equal(find(refreshed.card('routine'), item => item.type === 'img').props.src, savedCover('routine').cover_image_url)
})

test('failed PUT keeps successful cover paths so retries and repeated saves do not upload again', async () => {
  let fail = true
  const s = await setupAdmin({ intercept: call => call.method === 'PUT' && fail ? Response.json({ error: 'Falha ao salvar' }, { status: 500 }) : null })
  s.select('routine', file())
  await s.save()
  assert.match(textContent(s.render()), /Falha ao salvar/)
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 1)
  fail = false
  await s.save()
  await s.save()
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 1)
  assert.equal(s.calls.filter(call => call.method === 'PUT').length, 3)
  assert.equal(JSON.parse(s.calls.at(-1).body).videos[0].cover_image_path, savedCover('routine').cover_image_path)
})

test('partial upload failure retains failed files and reuses successful uploads on retry', async () => {
  let fail = true
  const s = await setupAdmin({ intercept: call => call.method === 'POST' && call.body.get('module_key') === 'pricing' && fail ? Response.json({ error: 'Envio indisponível' }, { status: 500 }) : null })
  s.select('routine', file())
  s.select('pricing', file())
  await s.save()
  assert.match(textContent(s.render()), /Capa de Precificação e Lucro: Envio indisponível/)
  assert.equal(s.calls.filter(call => call.method === 'PUT').length, 0)
  assert.doesNotMatch(textContent(s.card('routine')), /envio pendente/)
  assert.match(textContent(s.card('pricing')), /envio pendente/)
  fail = false
  await s.save()
  assert.deepEqual(s.calls.filter(call => call.method === 'POST').map(call => call.body.get('module_key')), ['routine', 'pricing', 'pricing'])
  assert.match(textContent(s.render()), /Vídeos salvos/)
})

test('removing pending or stored covers saves null without uploading and allows the same file again', async () => {
  const videos = initialVideos()
  Object.assign(videos[0], savedCover('routine'))
  const s = await setupAdmin({ videos })
  s.select('routine', file())
  find(s.card('routine'), item => item.type === 'button' && textContent(item) === 'Remover capa').props.onClick()
  assert.equal(descendants(s.card('routine'), item => item.type === 'img').length, 0)
  await s.save()
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 0)
  assert.equal(JSON.parse(s.calls.at(-1).body).videos[0].cover_image_path, null)
  s.select('routine', file())
  assert.match(textContent(s.card('routine')), /envio pendente/)
  s.unmount()
})

test('concurrent saves are ignored and editing controls stay disabled until completion', async () => {
  let release
  const blocked = new Promise(resolve => { release = resolve })
  const s = await setupAdmin({ intercept: call => call.method === 'POST' ? blocked : null })
  s.select('routine', file())
  const save = s.save()
  await flush()
  const tree = s.render()
  assert.equal(find(tree, item => item.type === 'fieldset').props.disabled, true)
  assert.equal(find(tree, item => item.type === 'button' && textContent(item) === '← Administração').props.disabled, true)
  assert.equal(find(tree, item => item.type === 'button' && textContent(item) === 'Salvando...').props.disabled, true)
  await s.save()
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 1)
  release(Response.json(savedCover('routine')))
  await save
  assert.equal(find(s.render(), item => item.type === 'fieldset').props.disabled, false)
})

test('unmount during upload releases previews and does not continue to PUT', async () => {
  let release
  const blocked = new Promise(resolve => { release = resolve })
  const s = await setupAdmin({ intercept: call => call.method === 'POST' ? blocked : null })
  s.select('routine', file())
  const save = s.save()
  await flush()
  s.unmount()
  assert.equal(s.revoked.length, 1)
  release(Response.json(savedCover('routine')))
  await save
  assert.equal(s.calls.filter(call => call.method === 'PUT').length, 0)
})

test('expired sessions and initial read failures cannot upload or overwrite records', async () => {
  const expired = await setupAdmin({ session: false })
  expired.select('routine', file())
  await expired.save()
  assert.match(textContent(expired.render()), /Sua sessão expirou/)
  assert.equal(expired.calls.length, 1)
  expired.unmount()
  const failed = await setupAdmin({ readError: true })
  assert.equal(find(failed.render(), item => item.type === 'fieldset').props.disabled, true)
  await failed.save()
  assert.equal(failed.calls.length, 1)
})

test('admin preview keeps paused and empty-video fallbacks with the shared component', async () => {
  const videos = initialVideos()
  videos[0].is_active = false
  videos[1].video_url = ''
  const s = await setupAdmin({ videos })
  const paused = find(s.card('routine'), item => item.type === playerMarker)
  assert.equal(paused.props.videoUrl, '')
  assert.match(textContent(paused.props.fallback), /Vídeo pausado/)
  const empty = find(s.card('campaigns'), item => item.type === playerMarker)
  assert.equal(empty.props.videoUrl, '')
  assert.match(textContent(empty.props.fallback), /Em breve/)
})

test('all five student modules pass their matching cover URL to the shared player wrapper', () => {
  const source = readFileSync(new URL('src/app/painel/page.js', root), 'utf8')
  for (const { key } of videosHelper.TUTORIAL_VIDEO_MODULES) {
    assert.ok(source.includes(`videoUrl={videosExplicativos.${key}?.video_url} coverUrl={videosExplicativos.${key}?.cover_image_url}`))
  }
  assert.ok(source.includes('<TutorialVideoPlayer videoUrl={videoUrl} coverUrl={coverUrl}'))
})
