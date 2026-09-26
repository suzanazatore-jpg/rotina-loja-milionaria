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
  const [importing,setImporting]=useState('')
  const [drafts,setDrafts]=useState({})
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  async function load(courseId) {
    const [c,l,m]=await Promise.all([
      supabase.from('courses').select('*').eq('id',courseId).single(),
      supabase.from('lessons').select('id,title,description,video_url,is_published,protocol_checklist,protocol_notification,sort_order').eq('course_id',courseId).order('sort_order').order('created_at'),
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
  async function uploadTask(lesson,index,file,generate=false){
    if(!file)return
    setUploading(lesson.id);setError('');setMessage('')
    try{
      if(file.type!=='application/pdf'||file.size>20*1024*1024)throw new Error('Envie um PDF de até 20 MB.')
      const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-')
      const path=`${id}/${lesson.id}/${crypto.randomUUID()}-${safe}`
      const uploaded=await supabase.storage.from('course-materials').upload(path,file,{contentType:'application/pdf',upsert:false})
      if(uploaded.error)throw uploaded.error
      const saved=await supabase.from('materials').insert({course_id:id,lesson_id:lesson.id,title:`Dia ${index+1} — ${file.name.replace(/\.pdf$/i,'')}`,file_url:`storage://course-materials/${path}`,sort_order:materials.filter(m=>m.lesson_id===lesson.id).length,is_published:true}).select('id').single()
      if(saved.error){await supabase.storage.from('course-materials').remove([path]);throw saved.error}
      const result=await supabase.from('materials').select('id,title,lesson_id').eq('course_id',id).order('sort_order')
      if(result.error)throw result.error
      setMaterials(result.data||[]);setMessage(`PDF do Dia ${index+1} anexado.`)
      if(generate)await importTask(lesson,saved.data.id)
    }catch(e){setError(e.message)}finally{setUploading('')}
  }
  async function importTask(lesson,materialId){
    setImporting(lesson.id);setError('');setMessage('')
    try{
      const {data:{session}}=await supabase.auth.getSession()
      if(!session?.access_token)throw new Error('Sessão expirada. Entre novamente.')
      const response=await fetch('/api/admin/protocolo/interpretar',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({material_id:materialId,lesson_id:lesson.id})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Não foi possível ler o PDF.')
      setDrafts(current=>({...current,[lesson.id]:data}))
      setMessage('PDF interpretado. Revise a prévia no dia correspondente antes de aplicar e salvar.')
    }catch(e){setError(e.message)}finally{setImporting('')}
  }
  function applyDraft(index){
    const lesson=lessons[index],draft=drafts[lesson.id]
    setLessons(current=>current.map((item,i)=>i===index?{...item,description:draft.orientacao,protocol_checklist:draft.acoes,protocol_notification:draft.lembrete}:item))
    setDrafts(current=>{const next={...current};delete next[lesson.id];return next})
    setMessage('Tarefas aplicadas ao formulário. Confira os campos e clique em Salvar configurações do Protocolo para publicar.')
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
        if(checks.length>20||checks.some(v=>v.length>180))throw new Error(`Confira as ações da aula ${lesson.title}: até 20 itens de 180 caracteres.`)
        const notification=String(lesson.protocol_notification||'').trim()
        if(notification.length>180)throw new Error('O lembrete deve ter até 180 caracteres.')
        const {error:e}=await supabase.from('lessons').update({description:String(lesson.description||'').trim(),protocol_checklist:checks,protocol_notification:notification||null}).eq('id',lesson.id)
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
    <p style={{color:'#aaa',lineHeight:1.55}}>Importe o PDF do dia para gerar as orientações, as ações e o lembrete. Revise a prévia, aplique ao dia e salve para publicar. Os vídeos ficam no editor de aulas.</p>
    {loading?<p>Carregando...</p>:<>
      {error&&<p role="alert" style={{background:'#351a1a',padding:12,borderRadius:9,color:'#ffc5c5'}}>{error}</p>}
      {message&&<p role="status" style={{background:'#183322',padding:12,borderRadius:9,color:'#bff4ce'}}>{message}</p>}
      {course&&<section style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'18px 0'}}>
        <label style={{display:'flex',gap:10,alignItems:'center',fontWeight:750}}><input type="checkbox" checked={!!course.protocol_enabled} onChange={e=>setCourse({...course,protocol_enabled:e.target.checked})} /> Ativar experiência interativa neste curso</label>
        <p style={{color:'#888',fontSize:12}}>Para vender, publique o curso, suas sete aulas e libere a matrícula no ADM. A compradora acessa a jornada pelo painel do aplicativo.</p>
        <label style={{display:'block',marginTop:14}}>Link do convite para a mentoria<input style={{...input,marginTop:5}} value={course.protocol_offer_url||''} onChange={e=>setCourse({...course,protocol_offer_url:e.target.value})} placeholder="https://..." /></label>
      </section>}
      {!lessons.length&&course&&<button style={button} disabled={busy} onClick={seed}>{busy?'Criando...':'Criar as sete aulas em rascunho'}</button>}
      {lessons.map((lesson,index)=><section key={lesson.id} style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'13px 0'}}>
        <p style={{color:'#d4af37',fontSize:12,margin:0}}>DIA {index+1} · {lesson.is_published?'PUBLICADA':'RASCUNHO'} · {lesson.video_url?'VÍDEO PRONTO':'SEM VÍDEO'}</p><h2 style={{fontSize:18,margin:'5px 0 13px'}}>{lesson.title}</h2>
        <div style={{border:'1px solid #39342b',padding:14,borderRadius:10,marginBottom:14}}>
          <strong>PDF da tarefa — Dia {index+1}</strong>
          <p style={{fontSize:12,color:'#bbb'}}>Importe o PDF para transformar o conteúdo em tarefas. A aluna também pode consultar o arquivo original.</p>
          {materials.filter(m=>m.lesson_id===lesson.id).map(m=><div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',margin:'10px 0'}}><span style={{fontSize:13}}>📎 {m.title}</span><button style={{...button,fontSize:12}} disabled={!!importing||!!uploading||busy} onClick={()=>importTask(lesson,m.id)}>Gerar tarefas deste PDF</button></div>)}
          <label style={{display:'block',fontSize:13}}>Importar novo PDF e gerar tarefas<input type="file" accept="application/pdf,.pdf" disabled={!!uploading||!!importing||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void uploadTask(lesson,index,file,true)}} style={{display:'block',marginTop:8}} /></label>
          <details style={{marginTop:12,fontSize:12}}><summary style={{cursor:'pointer'}}>Somente anexar PDF, sem gerar tarefas</summary><input type="file" accept="application/pdf,.pdf" disabled={!!uploading||!!importing||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void uploadTask(lesson,index,file)}} style={{display:'block',marginTop:8}} /></details>
          {(uploading===lesson.id||importing===lesson.id)&&<p role="status" style={{color:'#e6c45c'}}> {importing===lesson.id?'Lendo o PDF e organizando as tarefas…':'Enviando PDF…'}</p>}
          {drafts[lesson.id]&&<div style={{background:'#242014',padding:14,borderRadius:9,marginTop:14}}><strong>Prévia das tarefas — ainda não publicada</strong><p style={{whiteSpace:'pre-wrap',fontSize:13}}>{drafts[lesson.id].orientacao}</p><ol style={{paddingLeft:20,fontSize:13,lineHeight:1.6}}>{drafts[lesson.id].acoes.map((acao,i)=><li key={i}>{acao}</li>)}</ol><p style={{fontSize:12}}>Lembrete: {drafts[lesson.id].lembrete}</p><p style={{fontSize:12,color:'#ccc'}}>Ao aplicar, estas ações substituem as deste dia no formulário. Você pode editar antes de salvar.</p><button style={button} disabled={busy||!!importing} onClick={()=>applyDraft(index)}>Aplicar ao dia e revisar</button> <button style={{...button,background:'#333',color:'#fff'}} onClick={()=>setDrafts(current=>{const next={...current};delete next[lesson.id];return next})}>Descartar prévia</button></div>}
        </div>
        <label style={{display:'block',fontSize:13,marginBottom:14}}>Orientação da tarefa<textarea style={{...input,marginTop:6,minHeight:95,resize:'vertical'}} maxLength={2000} value={lesson.description||''} onChange={e=>editLesson(index,'description',e.target.value)} /></label>
        <label style={{display:'block',fontSize:13}}>Ações da tarefa (uma por linha)<textarea style={{...input,marginTop:6,minHeight:95,resize:'vertical'}} value={(lesson.protocol_checklist||[]).join('\n')} onChange={e=>editLesson(index,'protocol_checklist',e.target.value.split('\n'))} /></label>
        <label style={{display:'block',fontSize:13,marginTop:14}}>Texto do lembrete deste dia<input style={{...input,marginTop:6}} maxLength={180} value={lesson.protocol_notification||''} onChange={e=>editLesson(index,'protocol_notification',e.target.value)} /></label>
      </section>)}
      {report&&<section style={{background:'#151515',border:'1px solid #333',borderRadius:14,padding:18,margin:'18px 0'}}><h2 style={{fontSize:19,margin:'0 0 7px'}}>Acompanhamento das lojistas</h2><p style={{fontSize:12,color:'#aaa'}}>{report.rows.length} iniciaram · {report.rows.filter(row=>row.completed>=7).length} concluíram os sete dias</p>
        {report.rows.map(row=><details key={row.owner_id} style={{borderTop:'1px solid #333',padding:'12px 0'}}><summary style={{cursor:'pointer'}}><strong>{row.name}</strong> · {row.completed}/7 missões · {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(row.total_cents/100)} em vendas registradas</summary>
          <p style={{fontSize:12,color:'#aaa'}}>{row.email} · Lote: {row.lot_name} · {row.sold_pieces}/{row.starting_pieces} peças · equipe: {row.team_size??'não informado'} · faturamento: {row.monthly_revenue_band||'não informado'}</p>
          {row.entries.map(entry=><p key={entry.lesson_id} style={{fontSize:12,color:'#bbb',whiteSpace:'pre-wrap'}}>Dia {lessons.findIndex(item=>item.id===entry.lesson_id)+1}: {entry.note||'Sem relato'} · {entry.completed_at?'concluído':'em andamento'}</p>)}
        </details>)}
      </section>}
      {course&&<button style={{...button,margin:'12px 0 30px'}} disabled={busy||!!importing||!!uploading||Object.keys(drafts).length>0} onClick={save}>{busy?'Salvando...':'Salvar configurações do Protocolo'}</button>}
    </>}
  </div></AdminCursosShell>
}
