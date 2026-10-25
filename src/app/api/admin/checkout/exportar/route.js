import {NextResponse} from 'next/server'
import {autorizarAdmin,checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {EXPORT_SECTIONS,exportRows,workbookBuffer} from '@/lib/checkoutExports'
export const runtime='nodejs'
export const maxDuration=60
export async function GET(request){
 try{const db=checkoutAdminClient();if(!await autorizarAdmin(request,db))return NextResponse.json({error:'Acesso restrito.'},{status:401,headers:{'Cache-Control':'no-store'}})
 const params=new URL(request.url).searchParams,section=params.get('section') || 'tudo'
 if(section!=='tudo' && !EXPORT_SECTIONS[section])return NextResponse.json({error:'Exportação inválida.'},{status:400})
 const keys=section==='tudo'?Object.keys(EXPORT_SECTIONS):[section]
 const sheets=await Promise.all(keys.map(async key=>({key,rows:await exportRows(db,key,section==='tudo'?new URLSearchParams():params)})))
 return new Response(await workbookBuffer(sheets),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="central-${section}.xlsx"`,'Cache-Control':'no-store'}})
 }catch(error){return NextResponse.json({error:error.message?.startsWith('Mais de 50')?error.message:'Não foi possível gerar a planilha. Confira os filtros e tente novamente.'},{status:500,headers:{'Cache-Control':'no-store'}})}
}
