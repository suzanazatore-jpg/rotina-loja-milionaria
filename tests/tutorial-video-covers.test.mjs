import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import sharp from 'sharp'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const coversSource = readSource('../src/lib/tutorialVideoCovers.js')
const imageSource = readSource('../src/lib/tutorialVideoCoverImage.js')
const videosSource = readSource('../src/lib/tutorialVideos.js')
const routeSource = readSource('../src/app/api/admin/videos/capa/route.js')
const helper = vm.createContext({ sharp, Buffer })
vm.runInContext(coversSource + '\n' + imageSource, helper)

async function imageFile(format = 'png', width = 32, height = 18) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: '#cc9900' } }).withMetadata({ exif: { IFD0: { Artist: 'Local test fixture' } } }).toFormat(format).toBuffer()
  return new File([buffer], `cover.${format}`, { type: format === 'jpeg' ? 'image/jpeg' : `image/${format}` })
}

test('cover sanitizer decodes JPEG/PNG, caps dimensions and strips metadata', async () => {
  for (const format of ['jpeg', 'png']) {
    const file = await imageFile(format, 2200, 1300)
    const result = await helper.prepareTutorialCover(file)
    const metadata = await sharp(result.buffer).metadata()
    assert.equal(metadata.format, format)
    assert.ok(metadata.width <= 1920)
    assert.ok(metadata.height <= 1080)
    assert.equal(metadata.exif, undefined)
    assert.equal(result.contentType, file.type)
    assert.ok(result.buffer.length <= 3 * 1024 * 1024)
  }
})

test('cover sanitizer rejects malformed, disguised, excessive and unsupported files', async () => {
  const png = await imageFile()
  for (const file of [
    null,
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['not an image'], 'fake.png', { type: 'image/png' }),
    new File(['<svg onload="alert(1)"></svg>'], 'bad.svg', { type: 'image/svg+xml' }),
    new File([await png.arrayBuffer()], 'wrong.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
    await imageFile('webp'),
    await imageFile('png', 5000, 5000),
  ]) await assert.rejects(() => helper.prepareTutorialCover(file))
})

function setup({ admin = true, uploadError = null } = {}) {
  const uploads = []
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { email: admin ? 'suporte@suzanazatorre.com.br' : 'student@example.test' } } }) },
    storage: { from(bucket) {
      assert.equal(bucket, 'course-covers')
      return {
        async upload(path, data, options) { uploads.push({ path, data, options }); return { error: uploadError } },
        getPublicUrl: path => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }
    } },
  }
  const context = vm.createContext({ Buffer, sharp, URL, Set, crypto, NextResponse: Response, createClient: () => db, process: { env: {} } })
  vm.runInContext(coversSource + '\n' + imageSource + '\n' + videosSource + '\n' + routeSource + '\nthis.handler = POST', context)
  const upload = (file, { moduleKey = 'pricing', authenticated = true, length } = {}) => {
    const body = new FormData()
    body.set('module_key', moduleKey)
    if (file) body.set('image', file)
    return context.handler(new Request('https://app.example.test/api/admin/videos/capa', {
      method: 'POST', headers: { ...(authenticated ? { Authorization: 'Bearer test-token' } : {}), ...(length ? { 'Content-Length': String(length) } : {}) }, body,
    }))
  }
  return { uploads, upload }
}

test('authorized cover upload uses a fresh module path without modifying video content', async () => {
  const s = setup()
  const response = await s.upload(await imageFile())
  assert.equal(response.status, 201)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  const result = await response.json()
  assert.match(result.cover_image_path, /^tutorial-videos\/pricing\/[0-9a-f-]{36}\.png$/)
  assert.equal(result.cover_image_url, `https://example.supabase.co/storage/v1/object/public/course-covers/${result.cover_image_path}`)
  assert.equal(s.uploads.length, 1)
  assert.equal(s.uploads[0].options.upsert, false)
  assert.equal(s.uploads[0].options.contentType, 'image/png')
})

test('cover upload rejects students, missing auth, invalid modules and files before storage writes', async () => {
  const file = await imageFile()
  const student = setup({ admin: false })
  assert.equal((await student.upload(file)).status, 403)
  assert.equal(student.uploads.length, 0)
  const s = setup()
  assert.equal((await s.upload(file, { authenticated: false })).status, 403)
  assert.equal((await s.upload(file, { moduleKey: '../routine' })).status, 400)
  assert.equal((await s.upload(null)).status, 400)
  assert.equal((await s.upload(file, { length: 5 * 1024 * 1024 })).status, 413)
  assert.equal((await s.upload(new File(['bad'], 'bad.png', { type: 'image/png' }))).status, 400)
  assert.equal(s.uploads.length, 0)
})

test('storage failures are reported and repeated uploads never overwrite an existing cover', async () => {
  const file = await imageFile()
  const failed = setup({ uploadError: { message: 'down' } })
  assert.equal((await failed.upload(file)).status, 400)
  const s = setup()
  assert.equal((await s.upload(file)).status, 201)
  assert.equal((await s.upload(file)).status, 201)
  assert.notEqual(s.uploads[0].path, s.uploads[1].path)
})
