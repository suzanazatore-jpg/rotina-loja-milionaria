import sharp from 'sharp'
import { TUTORIAL_COVER_MAX_BYTES, TUTORIAL_COVER_TYPES } from './tutorialVideoCovers'

export async function prepareTutorialCover(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new Error('Escolha uma imagem para a capa.')
  if (!TUTORIAL_COVER_TYPES.includes(file.type)) throw new Error('A capa precisa ser JPG ou PNG.')
  if (file.size > TUTORIAL_COVER_MAX_BYTES) throw new Error('A capa deve ter no máximo 3 MB.')

  const input = Buffer.from(await file.arrayBuffer())
  if (input.length > TUTORIAL_COVER_MAX_BYTES) throw new Error('A capa deve ter no máximo 3 MB.')
  const format = file.type === 'image/png' ? 'png' : 'jpeg'
  try {
    const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== format || (metadata.pages || 1) > 1) throw new Error('Formato inválido')

    // Decode and re-encode the image instead of trusting its extension or MIME
    // type. This also strips metadata and caps the stored image dimensions.
    const normalized = image.rotate().resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
    const buffer = await (format === 'png' ? normalized.png({ compressionLevel: 9 }) : normalized.jpeg({ quality: 90 })).toBuffer()
    if (buffer.length > TUTORIAL_COVER_MAX_BYTES) throw new Error('Imagem muito grande')
    return { buffer, contentType: file.type, extension: format === 'png' ? 'png' : 'jpg' }
  } catch {
    throw new Error('Não foi possível ler esta capa. Use uma imagem JPG ou PNG válida, de até 20 megapixels e 3 MB.')
  }
}
