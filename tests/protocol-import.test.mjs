import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/api/admin/protocolo/interpretar/route.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const materialId = '644b6186-188a-4954-bec6-d8b5c5ad4e33'
const lessonId = '2a869ba8-0fac-4cf4-b47d-a8838eb92bb2'
function setup({role='admin',material=true,path='storage://course-materials/course/day/task.pdf',text='Separe as peças da campanha. Confira os tamanhos disponíveis e registre a meta.',output={orientacao:'Confira as peças.',acoes:['Separei as peças','Conferi os tamanhos'],lembrete:'Confira a tarefa de hoje.'}}={}) {
  const reads=[],downloads=[],calls=[]
  const db={auth:{getUser:async()=>({data:{user:{id:'admin',email:'admin@example.test'}}})},from(table){
    const query={select(){return query},eq(key,value){reads.push([table,key,value]);return query},async maybeSingle(){return {data:table==='profiles'?{role,status:'active'}:table==='materials'?(material?{file_url:path,course_id:'course',title:'Dia 1',lesson_id:lessonId}:null):{title:'Dia 1'}}}}
    return query
  },storage:{from(bucket){assert.equal(bucket,'course-materials');return {download:async p=>{downloads.push(p);return {data:new Blob(['%PDF-1.7 fixture'])}}}}}}
  const context=vm.createContext({Buffer,Response,AbortSignal,process:{env:{OPENAI_API_KEY:'test'}},createClient:()=>db,CanvasFactory:{},PDFParse:class{async getText(){return {text}}async destroy(){}},fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({output_text:JSON.stringify(output)})}})
  vm.runInContext(source+'\nthis.handler=POST',context)
  const request=(token=true)=>new Request('https://example.test/api/admin/protocolo/interpretar',{method:'POST',headers:token?{Authorization:'Bearer test'}:{},body:JSON.stringify({material_id:materialId,lesson_id:lessonId})})
  return {run:token=>context.handler(request(token)),reads,downloads,calls}
}
test('rejects missing authentication before reading any material',async()=>{const s=setup();assert.equal((await s.run(false)).status,401);assert.equal(s.reads.length,0)})
test('rejects students before storage or AI access',async()=>{const s=setup({role:'student'});assert.equal((await s.run()).status,403);assert.equal(s.downloads.length,0);assert.equal(s.calls.length,0)})
test('requires material linked to the selected lesson',async()=>{const s=setup({material:false});assert.equal((await s.run()).status,400);assert.ok(s.reads.some(x=>x[0]==='materials'&&x[1]==='lesson_id'&&x[2]===lessonId));assert.equal(s.downloads.length,0)})
test('never fetches external material URLs',async()=>{const s=setup({path:'https://external.test/task.pdf'});assert.equal((await s.run()).status,400);assert.equal(s.calls.length,0);assert.equal(s.downloads.length,0)})
test('returns a draft without writing to the database',async()=>{const s=setup();const r=await s.run();assert.equal(r.status,200);assert.deepEqual((await r.json()).acoes,['Separei as peças','Conferi os tamanhos']);assert.equal(s.calls.length,1)})
test('rejects unreadable PDFs and malformed generated tasks',async()=>{for(const options of [{text:' '},{output:{orientacao:'a',acoes:[],lembrete:'b'}},{output:{orientacao:'a',acoes:['x'.repeat(181)],lembrete:'b'}}])assert.equal((await setup(options).run()).status,400)})
