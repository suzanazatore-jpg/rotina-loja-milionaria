import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function clienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request) {
  try {
    const supabase = clienteAdmin()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const materialId = new URL(request.url).searchParams.get('id')
    if (!token || !materialId) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { data: material } = await supabase.from('materials').select('id,course_id,file_url,is_published').eq('id', materialId).maybeSingle()
    if (!material?.is_published) return NextResponse.json({ error: 'Material não encontrado.' }, { status: 404 })

    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin' && user.email !== 'suporte@suzanazatorre.com.br') {
      const {data:curso}=await supabase.from('courses').select('is_mentorship,mentorship_type').eq('id',material.course_id).maybeSingle()
      if(curso?.is_mentorship){const{data:pp}=await supabase.from('profile_plans').select('plan_id').eq('profile_id',user.id);const ids=(pp||[]).map(x=>x.plan_id);const{data:pm}=ids.length?await supabase.from('plan_mentorships').select('mentorship_type').in('plan_id',ids).eq('mentorship_type',curso.mentorship_type):{data:[]};if(!pm?.length)return NextResponse.json({error:'Mentoria não liberada para este acesso.'},{status:403})}
      else {const { data: matricula } = await supabase.from('enrollments').select('id').eq('profile_id', user.id).eq('course_id', material.course_id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();if (!matricula) return NextResponse.json({ error: 'Curso não liberado para este acesso.' }, { status: 403 })}
    }

    if (/^https?:\/\//i.test(material.file_url)) return NextResponse.json({ url: material.file_url })
    const caminho = material.file_url.replace(/^storage:\/\/course-materials\//, '')
    const { data, error } = await supabase.storage.from('course-materials').createSignedUrl(caminho, 300)
    if (error) throw error
    return NextResponse.json({ url: data.signedUrl })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
