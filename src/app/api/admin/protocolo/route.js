import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request) {
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const params=new URL(request.url).searchParams
  const courseId=params.get('course_id')
  const preview=params.get('preview')==='1'
  const slug=params.get('slug')
  if(!token||(!preview&&!/^[0-9a-f-]{36}$/i.test(courseId||''))||(preview&&!/^[a-z0-9-]{1,120}$/.test(slug||'')))return Response.json({error:'Solicitação inválida.'},{status:400})
  try {
    const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
    const {data:{user}}=await supabase.auth.getUser(token)
    if(!user)return Response.json({error:'Não autorizado.'},{status:401})
    const {data:profile}=await supabase.from('profiles').select('role,status').eq('id',user.id).maybeSingle()
    if(!(profile?.role==='admin'&&profile.status==='active')&&user.email!=='suporte@suzanazatorre.com.br')return Response.json({error:'Acesso exclusivo do ADM.'},{status:403})
    if(preview){
      const {data:course,error:courseError}=await supabase.from('courses').select('id,slug,title,subtitle,protocol_enabled,protocol_offer_url,is_published').eq('slug',slug).maybeSingle()
      if(courseError)throw courseError
      if(!course?.protocol_enabled)return Response.json({error:'Protocolo não encontrado.'},{status:404})
      const [lessons,materials]=await Promise.all([
        supabase.from('lessons').select('id,title,description,video_url,duration_label,protocol_checklist,sort_order,created_at').eq('course_id',course.id).order('sort_order').order('created_at'),
        supabase.from('materials').select('id,title,lesson_id,file_url,is_published').eq('course_id',course.id).order('sort_order'),
      ])
      if(lessons.error||materials.error)throw lessons.error||materials.error
      return Response.json({course,lessons:lessons.data||[],materials:materials.data||[]},{headers:{'Cache-Control':'private, no-store'}})
    }
    const [runs,entries,sales,lessons]=await Promise.all([
      supabase.from('protocol_runs').select('owner_id,lot_name,starting_pieces,goal_cents,started_on,monthly_revenue_band,team_size').eq('course_id',courseId).order('started_on',{ascending:false}).limit(1000),
      supabase.from('protocol_entries').select('owner_id,lesson_id,completed_at,note,pieces_posted,invited_count,conversations_count').eq('course_id',courseId).limit(7000),
      supabase.from('protocol_sales').select('owner_id,amount_cents,pieces').eq('course_id',courseId).limit(10000),
      supabase.from('lessons').select('id').eq('course_id',courseId).eq('is_published',true),
    ])
    for(const result of [runs,entries,sales,lessons])if(result.error)throw result.error
    const ids=(runs.data||[]).map(row=>row.owner_id)
    const profiles=ids.length?await supabase.from('profiles').select('id,name,email').in('id',ids):{data:[]}
    if(profiles.error)throw profiles.error
    const names=new Map((profiles.data||[]).map(row=>[row.id,row]))
    const rows=(runs.data||[]).map(run=>{
      const ownEntries=(entries.data||[]).filter(item=>item.owner_id===run.owner_id)
      const ownSales=(sales.data||[]).filter(item=>item.owner_id===run.owner_id)
      return {...run,name:names.get(run.owner_id)?.name||names.get(run.owner_id)?.email||'Aluna',email:names.get(run.owner_id)?.email||'',
        completed:ownEntries.filter(item=>item.completed_at).length,
        total_cents:ownSales.reduce((sum,item)=>sum+Number(item.amount_cents),0),
        sold_pieces:ownSales.reduce((sum,item)=>sum+item.pieces,0),
        entries:ownEntries,
      }
    })
    return Response.json({rows,lesson_count:lessons.data?.length||0},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return Response.json({error:'Não foi possível carregar os resultados.'},{status:500})}
}
