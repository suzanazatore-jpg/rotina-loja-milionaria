import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { autorizarAdmin,checkoutAdminClient } from '@/lib/checkoutAdminServer'
export const runtime='nodejs'
const maximum=4*1024*1024
export async function POST(request) {
  try {
    const db=checkoutAdminClient()
    if(!await autorizarAdmin(request,db))return Response.json({error:'Acesso restrito.'},{status:401})
    if(Number(request.headers.get('content-length') || 0)>maximum+65536)return Response.json({error:'Envie uma imagem de até 4 MB.'},{status:413})
    const form=await request.formData()
    const file=form.get('image')
    if(!file || typeof file.arrayBuffer!=='function' || !file.size || file.size>maximum || !['image/jpeg','image/png','image/webp'].includes(file.type))return Response.json({error:'Envie JPG, PNG ou WebP de até 4 MB.'},{status:400})
    const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:16000000})
    const metadata=await image.metadata()
    if(!['jpeg','png','webp'].includes(metadata.format))return Response.json({error:'Formato de imagem inválido.'},{status:400})
    const output=await image.rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer()
    const path=`checkout-products/${randomUUID()}.webp`
    const {error}=await db.storage.from('panel-banners').upload(path,output,{contentType:'image/webp',cacheControl:'31536000',upsert:false})
    if(error)throw error
    const {data}=db.storage.from('panel-banners').getPublicUrl(path)
    return Response.json({url:data.publicUrl},{headers:{'Cache-Control':'no-store'}})
  } catch {return Response.json({error:'Não foi possível carregar a imagem. Confira o arquivo e tente novamente.'},{status:400})}
}
