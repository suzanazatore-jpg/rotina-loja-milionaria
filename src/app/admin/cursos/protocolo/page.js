'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PROTOCOL_DAYS } from '@/lib/protocolContent'
import AdminCursosShell from '../AdminCursosShell'

const input = { width:'100%',background:'#141414',color:'#fff',border:'1px solid #39342b',borderRadius:9,padding:'11px 12px',font:'inherit' }
const button = { background:'#d4af37',color:'#111',border:0,borderRadius:9,padding:'11px 15px',fontWeight:800,cursor:'pointer' }

export default function ProtocoloAdmin() {
  const router=useRouter()
  const [id,setId]=useState('')
  const [course,setCourse]=useState(null)
  const [lessons,setLessons]=useState([])
  const [materials,setMaterials]=useState([])
  const [uploading,setUploading]=useState('')
  const [report,setReport]=useState(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  async function load(courseId) {
    const [c,l,m]=await Promise.all([
      supabase.from('courses').select('*').eq('id',courseId).single(),
      supabase.from('lessons').select('id,title,video_url,is_published,protocol_checklist,protocol_notification,sort_order').eq('course_id',courseId).order('sort_order').order('created_at'),
      supabase.from('materials').select('id,title,lesson_id').eq('course_id',courseId).order('sort_order'),
    ])
    if(c.error||l.error||m.error)throw new Error(c.error?.message||l.error?.message||m.error?.message)
    setCourse(c.data);setLessons(l.data||[]);setMaterials(m.data||[])
    const {data:{session}}=await supabase.auth.getSession()
    if(session?.access_token){
      const response=await fetch(`/api/admin/protocolo?course_id=${courseId}`,{headers:{Authorization:`Bearer ${session.access_token}`}})
      if(response.ok)setReport(await response.json())
    }
  }
  useEffect(()=>{
    let live=true
    async function init(){
      const courseId=new URLSearchParams(window.location.search).get('id')
      if(!courseId){setError('Curso não informado.');setLoading(false);return}
      const {data:{user}}=await supabase.auth.getUser()
      if(!user){router.replace('/login');return}
      const {data:profile}=await supabase.from('profiles').select('role,status').eq('id',user.id).maybeSingle()
      if(profile?.role!=='admin'&&user.email!=='suporte@suzanazatorre.com.br'){setError('Acesso exclusivo do ADM.');setLoading(false);return}
      try {if(live){setId(courseId);await load(courseId)}}catch(e){if(live)setError(e.message)}finally{if(live)setLoading(false)}
    }
    init();return()=>{live=false}
  },[router])
  async function uploadTask(lesson,index,file){
    if(!file)return
    setUploading(lesson.id);setError('');setMessage('')
    try{
      if(file.type!=='application/pdf'||file.size>20*1024*1024)throw new Error('Envie um PDF de até 20 MB.')
      const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-')
      const path=`${id}/${lesson.id}/${crypto.randomUUID()}-${safe}`
      const uploaded=await supabase.storage.from('course-materials').upload(path,file,{contentType:'application/pdf',upsert:false})
      if(uploaded.error)throw uploaded.error
      const saved=await supabase.from('materials').insert({course_id:id,lesson_id:lesson.id,title:`Dia ${index+1} — ${file.name.replace(/\.pdf$/i,'')}`,file_url:`storage://course-materials/${path}`,sort_order:materials.filter(m=>m.lesson_id===lesson.id).length,is_published:true})
      if(saved.error){await supabase.storage.from('course-materials').remove([path]);throw saved.error}
      const result=await supabase.from('materials').select('id,title,lesson_id').eq('course_id',id).order('sort_order')
      if(result.error)throw result.error
      setMaterials(result.data||[]);setMessage(`PDF do Dia ${index+1} disponível na área da tarefa da aluna.`)
    }catch(e){setError(e.message)}finally{setUploading('')}
  }
  async function seed(){
    setBusy(true);setError('');setMessage('')
    try{
      if(lessons.length)throw new Error('Este curso já tem aulas. Configure as missões abaixo, sem criar duplicatas.')
      const {data:module,error:moduleError}=await supabase.from('modules').insert({course_id:id,title:'Protocolo · 7 dias',sort_order:0,is_published:true}).select('id').single()
      if(moduleError)throw moduleError
      const payload=PROTOCOL_DAYS.map((d,index)=>({course_id:id,module_id:module.id,slug:`dia-${index+1}-protocolo`,title:d.title,description:d.description,sort_order:index,is_published:false,protocol_checklist:d.checks,protocol_notification:d.notification,duration_label:'Aula curta · 2 a 3 min'}))
      const {error:lessonError}=await supabase.from('lessons').insert(payload)
      if(lessonError)throw lessonError
      await load(id);setMessage('Sete aulas em rascunho criadas. Adicione os vídeos e PDFs e publique cada uma.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function editLesson(index,key,value){setLessons(current=>current.map((item,i)=>i===index?{...item,[key]:value}:item))}
  async function save(){
    setBusy(true);setError('');setMessage('')
    try{
      const url=String(course.protocol_offer_url||'').trim()
      if(url && !/^https:\/\//i.test(url))throw new Error('O link da mentoria deve começar com https://.')
      for(const lesson of lessons){
        const checks=Array.isArray(lesson.protocol_checklist)?lesson.protocol_checklist.map(v=>String(v).trim()).filter(Boolean):[]
        if(checks.length>6||checks.some(v=>v.length>180))throw new Error(`Confira as ações da aula ${lesson.title}: até 6 itens de 180 caracteres.`)
        const notification=String(lesson.protocol_notification||'').trim()
        if(notification.length>180)throw new Error('O lembrete deve ter até 180 caracteres.')
        const {error:e}=await supabase.from('lessons').update({protocol_checklist:checks,protocol_notification:notification||null}).eq('id',lesson.id)
        if(e)throw e
      }
      const {error:e}=await supabase.from('courses').update({protocol_enabled:!!course.protocol_enabled,protocol_offer_url:url||null}).eq('id',id)
      if(e)throw e
      await load(id);setMessage('Configurações salvas. O acesso da aluna depende da matrícula e da publicação do curso e das aulas.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <AdminCursosShell><div style={{maxWidth:800,margin:'0 auto',color:'#fff'}}>
    <button style={{...button,background:'#222',color:'#e6c45c',marginBottom:18}} onClick={()=>router.push(`/admin/cursos/conteudo?id=${id}`)}>← Voltar ao curso</button>
    <p style={{color:'#d4af37',fontSize:12,letterSpacing:1,textTransform:'uppercase'}}>Produto de 7 dias</p><h1 style={{fontSize:25,margin:'4px 0'}}>{course?.title||'Configurar Protocolo'}</h1>
    <p style={{color:'#aaa',lineHeight:1.55}}>Envie o PDF da tarefa no dia correspondente e configure o checklist e o lembrete abaixo. Os vídeos ficam no editor de aulas.</p>
    {loading?<p>Carregando...</p>:<>
      {error&&<p role="alert" style={{background:'#351a1a',padding:12,borderRadius:9,color:'#ffc5c5'}}>{error}</p>}
      {message&&<p role="status" style={{background:'#183322',padding:12,borderRadius:9,color:'#bff4ce'}}>{message}</p>}
      {course&&<section style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'18px 0'}}>
        <label style={{display:'flex',gap:10,alignItems:'center',fontWeight:750}}><input type="checkbox" checked={!!course.protocol_enabled} onChange={e=>setCourse({...course,protocol_enabled:e.target.checked})} /> Ativar experiência interativa neste curso</label>
        <p style={{color:'#888',fontSize:12}}>Para vender, publique o curso, suas sete aulas e libere a matrícula no ADM. A compradora entra diretamente na jornada.</p>
        <label style={{display:'block',marginTop:14}}>Link do convite para a mentoria<input style={{...input,marginTop:5}} value={course.protocol_offer_url||''} onChange={e=>setCourse({...course,protocol_offer_url:e.target.value})} placeholder="https://..." /></label>
      </section>}
      {!lessons.length&&course&&<button style={button} disabled={busy} onClick={seed}>{busy?'Criando...':'Criar as sete aulas em rascunho'}</button>}
      {lessons.map((lesson,index)=><section key={lesson.id} style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'13px 0'}}>
        <p style={{color:'#d4af37',fontSize:12,margin:0}}>DIA {index+1} · {lesson.is_published?'PUBLICADA':'RASCUNHO'} · {lesson.video_url?'VÍDEO PRONTO':'SEM VÍDEO'}</p><h2 style={{fontSize:18,margin:'5px 0 13px'}}>{lesson.title}</h2>
        <div style={{border:'1px solid #39342b',padding:14,borderRadius:10,marginBottom:14}}><strong>PDF da tarefa — Dia {index+1}</strong><p style={{fontSize:12,color:'#bbb'}}>A aluna abre este PDF dentro do aplicativo. O checklist abaixo é salvo separadamente.</p>{materials.filter(m=>m.lesson_id===lesson.id).map(m=><p key={m.id} style={{fontSize:13}}>📎 {m.title}</p>)}<label style={{display:'block',fontSize:13}}>{uploading===lesson.id?'Enviando PDF...':'Adicionar PDF da tarefa'}<input type="file" accept="application/pdf,.pdf" disabled={!!uploading||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void uploadTask(lesson,index,file)}} style={{display:'block',marginTop:8}} /></label></div>
        <label style={{display:'block',fontSize:13}}>Ações da tarefa (uma por linha)<textarea style={{...input,marginTop:6,minHeight:95,resize:'vertical'}} value={(lesson.protocol_checklist||[]).join('\n')} onChange={e=>editLesson(index,'protocol_checklist',e.target.value.split('\n'))} /></label>
        <label style={{display:'block',fontSize:13,marginTop:14}}>Texto do lembrete deste dia<input style={{...input,marginTop:6}} maxLength={180} value={lesson.protocol_notification||''} onChange={e=>editLesson(index,'protocol_notification',e.target.value)} /></label>
      </section>)}
      {report&&<section style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'18px 0'}}><h2 style={{fontSize:19,margin:'0 0 7px'}}>Acompanhamento das lojistas</h2><p style={{fontSize:12,color:'#aaa'}}>{report.rows.length} iniciaram · {report.rows.filter(row=>row.completed>=7).length} concluíram os sete dias</p>
        {report.rows.map(row=><details key={row.owner_id} style={{borderTop:'1px solid #333',padding:'12px 0'}}><summary style={{cursor:'pointer'}}><strong>{row.name}</strong> · {row.completed}/7 missões · {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(row.total_cents/100)} em vendas registradas</summary>
          <p style={{fontSize:12,color:'#aaa'}}>{row.email} · Lote: {row.lot_name} · {row.sold_pieces}/{row.starting_pieces} peças · equipe: {row.team_size??'não informado'} · faturamento: {row.monthly_revenue_band||'não informado'}</p>
          {row.entries.map(entry=><p key={entry.lesson_id} style={{fontSize:12,color:'#bbb',whiteSpace:'pre-wrap'}}>Dia {lessons.findIndex(item=>item.id===entry.lesson_id)+1}: {entry.note||'Sem relato'} · {entry.completed_at?'concluído':'em andamento'}</p>)}
        </details>)}
      </section>}
      {course&&<button style={{...button,margin:'12px 0 30px'}} disabled={busy} onClick={save}>{busy?'Salvando...':'Salvar configurações do Protocolo'}</button>}
    </>}
  </div></AdminCursosShell>
}
