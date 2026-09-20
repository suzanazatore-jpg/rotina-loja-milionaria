import { CanvasFactory } from 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'
import { createEmbeddings, splitKnowledgeText } from '@/lib/assistantKnowledgeServer'

async function pdfTextFromStorage(supabase, fileUrl) {
  if (!String(fileUrl || '').startsWith('storage://course-materials/')) return ''
  const path = fileUrl.replace('storage://course-materials/', '')
  const { data, error } = await supabase.storage.from('course-materials').download(path)
  if (error) throw error
  const parser = new PDFParse({ data: Buffer.from(await data.arrayBuffer()), CanvasFactory })
  try {
    return String((await parser.getText()).text || '').replace(/\u0000/g, '').trim().slice(0, 300000)
  } finally {
    await parser.destroy()
  }
}

export async function syncCourseKnowledge(supabase, courseId) {
  const [courseResult, lessonsResult, materialsResult] = await Promise.all([
    supabase.from('courses').select('id,title,is_published').eq('id', courseId).maybeSingle(),
    supabase.from('lessons').select('id,course_id,title,description,updated_at').eq('course_id', courseId).eq('is_published', true).order('sort_order'),
    supabase.from('materials').select('id,course_id,lesson_id,title,file_url,created_at').eq('course_id', courseId).eq('is_published', true).order('sort_order'),
  ])
  if (courseResult.error || !courseResult.data?.is_published) throw new Error('Curso não encontrado ou não publicado.')
  if (lessonsResult.error) throw lessonsResult.error
  if (materialsResult.error) throw materialsResult.error

  const course = courseResult.data
  const lessons = lessonsResult.data || []
  const materials = materialsResult.data || []
  const sources = []
  const failures = []

  for (const lesson of lessons) {
    const summary = String(lesson.description || '').trim()
    if (summary.length >= 3) sources.push({
      sourceKey: `lesson:${lesson.id}:summary`, sourceType: 'lesson_summary', lessonId: lesson.id,
      materialId: null, title: `${course.title} — ${lesson.title} (resumo)`, text: summary, updatedAt: lesson.updated_at,
    })
  }

  for (const material of materials) {
    if (!String(material.file_url || '').startsWith('storage://course-materials/')) continue
    try {
      const text = await pdfTextFromStorage(supabase, material.file_url)
      if (text.length >= 3) sources.push({
        sourceKey: `material:${material.id}:pdf`, sourceType: 'pdf', lessonId: material.lesson_id,
        materialId: material.id, title: `${course.title} — ${material.title}`, text, updatedAt: material.created_at,
      })
    } catch {
      failures.push(material.title)
    }
  }

  const prepared = sources.flatMap(source => splitKnowledgeText(source.text).map((content, index) => ({ source, content, index })))
  const embeddings = await createEmbeddings(prepared.map(item => item.content))
  const rows = prepared.map((item, rowIndex) => {
    const { source, content, index } = item
    return {
      course_id: course.id,
      lesson_id: source.lessonId,
      material_id: source.materialId,
      source_key: source.sourceKey,
      source_type: source.sourceType,
      title: source.title.slice(0, 240),
      chunk_index: index,
      content,
      embedding: embeddings[rowIndex],
      source_updated_at: source.updatedAt,
    }
  })

  const deleted = await supabase.from('assistant_course_knowledge_chunks').delete().eq('course_id', course.id)
  if (deleted.error) throw deleted.error
  if (rows.length) {
    const inserted = await supabase.from('assistant_course_knowledge_chunks').insert(rows)
    if (inserted.error) throw inserted.error
  }
  return { course_id: course.id, course_title: course.title, sources: sources.length, chunks: rows.length, failures }
}
