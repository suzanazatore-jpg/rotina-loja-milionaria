import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'suporte@suzanazatorre.com.br'
const WEBHOOK = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/51621/55jbK8UteOhv/'
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
async function userOf(req, sb) { const token = req.headers.get('authorization')?.replace('Bearer ', ''); const { data: { user } } = await sb.auth.getUser(token || ''); return user }
async function allowed(sb, user, aulaId) {
  const { data: aula } = await sb.from('aulas').select('id,titulo,mentorship_type').eq('id', aulaId).maybeSingle(); if (!aula) return null
  if (user.email === ADMIN_EMAIL) return aula
  const { data: pp } = await sb.from('profile_plans').select('plan_id').eq('profile_id', user.id); const ids = (pp || []).map(x => x.plan_id)
  const { data: pm } = ids.length ? await sb.from('plan_mentorships').select('mentorship_type').in('plan_id', ids).eq('mentorship_type', aula.mentorship_type) : { data: [] }
  return pm?.length ? aula : null
}
export async function GET(req) {
  const sb = client(), user = await userOf(req, sb), aulaId = new URL(req.url).searchParams.get('aula_id')
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 }); if (!await allowed(sb,user,aulaId)) return NextResponse.json({ error: 'Aula não liberada.' }, { status: 403 })
  const { data: roots, error } = await sb.from('mentorship_comments').select('id,body,created_at').eq('aula_id', aulaId).eq('profile_id', user.id).is('parent_id', null).eq('archived', false).order('created_at',{ascending:false})
  if (error) return NextResponse.json({error:error.message},{status:500}); const ids=(roots||[]).map(x=>x.id); const {data:replies}=ids.length?await sb.from('mentorship_comments').select('id,body,created_at,parent_id').in('parent_id',ids).order('created_at'):{data:[]}
  return NextResponse.json({comentarios:(roots||[]).map(x=>({...x,respostas:(replies||[]).filter(r=>r.parent_id===x.id)}))})
}
export async function POST(req) {
  const sb=client(), user=await userOf(req,sb); if(!user)return NextResponse.json({error:'Não autorizado.'},{status:401})
  try { const {aula_id,body}=await req.json(), texto=String(body||'').trim(), aula=await allowed(sb,user,aula_id); if(!aula||!texto||texto.length>1000) throw new Error('Comentário inválido.')
    const {data,error}=await sb.from('mentorship_comments').insert({aula_id,profile_id:user.id,body:texto}).select('id,body,created_at').single(); if(error)throw error
    const {data:perfil}=await sb.from('profiles').select('name,email,phone').eq('id',user.id).maybeSingle()
    try { await fetch(WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'mentorship_comment',student_name:perfil?.name||'',student_email:perfil?.email||user.email,student_phone:perfil?.phone||'',mentorship:aula.mentorship_type.toUpperCase(),lesson:aula.titulo,message:texto})}) } catch (_) {}
    return NextResponse.json({comentario:{...data,respostas:[]}},{status:201})
  } catch(error){return NextResponse.json({error:error.message},{status:400})}
}
