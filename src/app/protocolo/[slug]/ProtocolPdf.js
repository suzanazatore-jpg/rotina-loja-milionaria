'use client'

import { useEffect, useRef, useState } from 'react'

export default function ProtocolPdf({url}) {
  const container=useRef(null),canvas=useRef(null)
  const [document,setDocument]=useState(null),[page,setPage]=useState(1),[width,setWidth]=useState(320)
  const [zoom,setZoom]=useState(1),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const cleanUrl=url.split('#')[0]
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setWidth(Math.max(200,Math.floor(entries[0].contentRect.width))))
    if(container.current)observer.observe(container.current)
    return ()=>observer.disconnect()
  },[])
  useEffect(()=>{
    let alive=true,task,worker,port
    async function load(){
      try{
        const pdfjs=await import('pdfjs-dist/build/pdf.mjs')
        if(!alive)return
        port=new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url),{type:'module'})
        worker=new pdfjs.PDFWorker({port})
        task=pdfjs.getDocument({url:cleanUrl,worker,isEvalSupported:false})
        const pdf=await task.promise
        if(alive)setDocument(pdf)
      }catch{if(alive)setError('Não foi possível exibir a prévia. Use Abrir PDF ou Baixar PDF abaixo.')}
    }
    void load()
    return ()=>{alive=false;void task?.destroy();worker?.destroy();port?.terminate()}
  },[cleanUrl])
  useEffect(()=>{
    if(!document)return
    let alive=true,render
    async function draw(){
      try{
        const sheet=await document.getPage(page)
        if(!alive)return
        const base=sheet.getViewport({scale:1}),view=sheet.getViewport({scale:width/base.width*zoom})
        const output=Math.min(window.devicePixelRatio||1,2),element=canvas.current
        element.width=Math.floor(view.width*output);element.height=Math.floor(view.height*output)
        element.style.width=`${view.width}px`;element.style.height=`${view.height}px`
        render=sheet.render({canvasContext:element.getContext('2d'),viewport:view,transform:[output,0,0,output,0,0]})
        await render.promise
      }catch(e){if(alive&&e.name!=='RenderingCancelledException')setError('Não foi possível exibir esta página. Você pode abrir ou baixar o PDF.')}
    }
    void draw()
    return ()=>{alive=false;render?.cancel()}
  },[document,page,width,zoom])
  async function download(){
    setSaving(true)
    try{
      const response=await fetch(cleanUrl)
      if(!response.ok)throw new Error()
      const blobUrl=URL.createObjectURL(await response.blob())
      const link=window.document.createElement('a');link.href=blobUrl;link.download='tarefa-do-protocolo.pdf';link.click()
      setTimeout(()=>URL.revokeObjectURL(blobUrl),60000)
    }catch{setError('Não foi possível baixar agora. Toque no nome do material para recarregar o PDF e tente novamente.')}
    finally{setSaving(false)}
  }
  return <div className="pro-pdf-reader">
    <div className="pro-pdf-tools"><a href={cleanUrl} target="_blank" rel="noopener noreferrer">Abrir PDF ↗</a><button onClick={download} disabled={saving}>{saving?'Baixando…':'↓ Baixar PDF'}</button><button aria-label="Diminuir PDF" disabled={zoom<=1} onClick={()=>setZoom(v=>Math.max(1,v-.25))}>−</button><button aria-label="Ampliar PDF" disabled={zoom>=2} onClick={()=>setZoom(v=>Math.min(2,v+.25))}>+</button></div>
    {error&&<p role="alert">{error}</p>}
    {!document&&!error&&<p role="status">Carregando a página…</p>}
    <div ref={container} className="pro-pdf-canvas"><canvas ref={canvas} role="img" aria-label={`Página ${page} da tarefa. Para acessar o documento original, use Abrir PDF.`} /></div>
    {document?.numPages>1&&<div className="pro-pdf-tools"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {document.numPages}</span><button disabled={page>=document.numPages} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
  </div>
}
