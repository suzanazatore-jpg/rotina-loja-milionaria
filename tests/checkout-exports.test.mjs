import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url)
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const contactsSource=readFileSync(new URL('../src/lib/checkoutContacts.js',import.meta.url),'utf8')
const contactsUrl=dataUrl(contactsSource)
const {normalizeContact}=await import(contactsUrl)
const subscriptionsUrl=dataUrl(readFileSync(new URL('../src/lib/checkoutSubscriptions.js',import.meta.url),'utf8'))
const exportsUrl=dataUrl(readFileSync(new URL('../src/lib/checkoutExports.js',import.meta.url),'utf8').replace("'exceljs'",JSON.stringify(pathToFileURL(require.resolve('exceljs')).href)).replace("'./centralRecords.js'",JSON.stringify(pathToFileURL(new URL('../src/lib/centralRecords.js',import.meta.url).pathname).href)).replace("'./checkoutContacts.js'",JSON.stringify(contactsUrl)).replace("'./checkoutSubscriptions.js'",JSON.stringify(subscriptionsUrl)))
const {workbookBuffer,exportRows,EXPORT_SECTIONS}=await import(exportsUrl)
const ExcelJS=require('exceljs')
test('contact registration whitelists identity and rejects invalid or oversized inputs',()=>{
 assert.deepEqual(normalizeContact({name:' Ana ',email:'ANA@EXAMPLE.COM',document:'012.345.678-90',phone:'(84) 99999-1234',pagarme_customer_id:'forged',profile_id:'forged'}),{name:'Ana',email:'ana@example.com',document:'01234567890',phone:'84999991234'})
 for(const input of [{name:'Ana',email:'bad'},{name:'x'.repeat(129),email:'a@example.com'},{name:'Ana',email:'a@example.com',document:'12'}])assert.throws(()=>normalizeContact(input))
 assert.equal(normalizeContact({name:'Ana',email:'a@example.com'}).document,null)
})
test('xlsx roundtrip preserves leading zeros, literal text, money and empty sheets',async()=>{
 const rows=[EXPORT_SECTIONS.clientes.row({id:'id',name:'=HYPERLINK("bad")',email:'ana@example.com',document:'00123456789',phone:'5584999991111',billing_address:{},created_at:'2026-10-24T12:00:00Z'})]
 const bytes=await workbookBuffer([{key:'clientes',rows},{key:'vendas',rows:[{id:'order',total:4550.4}]},{key:'ofertas',rows:[]}])
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes)
 const sheet=workbook.getWorksheet('Clientes');assert.equal(sheet.getRow(2).getCell(2).value,'=HYPERLINK("bad")');assert.equal(sheet.getRow(2).getCell(5).value,'00123456789');assert.equal(sheet.getRow(2).getCell(5).type,ExcelJS.ValueType.String)
 const sales=workbook.getWorksheet('Vendas'),total=EXPORT_SECTIONS.vendas.columns.findIndex(c=>c.key==='total')+1
 assert.equal(sales.getRow(2).getCell(total).value,4550.4);assert.match(sales.getRow(2).getCell(total).numFmt,/R\$/);assert.equal(workbook.getWorksheet('Ofertas').rowCount,1)
})
test('exports paginate beyond the first thousand and use the customer filters',async()=>{
 const calls=[];let offset=0
 const db={from(table){assert.equal(table,'customers');const query={select(){return query},ilike(key,value){calls.push([key,value]);return query},order(){return query},range(start,end){offset=start;assert.equal(end,start+999);return Promise.resolve({data:Array.from({length:start===0?1000:3},(_,i)=>({id:String(start+i),name:'Ana',billing_address:{}})),error:null})}};return query}}
 const rows=await exportRows(db,'clientes',new URLSearchParams({name:'Ana_%'}));assert.equal(rows.length,1003);assert.equal(offset,1000);assert.equal(calls[0][1],'%Ana\\_\\%%')
})
test('export selectors never include gateway secrets or card references',()=>{
 for(const spec of Object.values(EXPORT_SECTIONS))assert.doesNotMatch(spec.select,/api_token|checkout_config|guru_config|card_token|card_id|client_ip|user_agent|pix_qr_code/)
})
test('an unauthenticated export request cannot read any database rows',async()=>{
 const fakeAdmin=dataUrl('export function checkoutAdminClient(){return {}};export async function autorizarAdmin(){return false}')
 const fakeNext=dataUrl('export const NextResponse={json:(data,init)=>Response.json(data,init)}')
 const source=readFileSync(new URL('../src/app/api/admin/checkout/exportar/route.js',import.meta.url),'utf8').replace("'next/server'",JSON.stringify(fakeNext)).replace("'@/lib/checkoutAdminServer'",JSON.stringify(fakeAdmin)).replace("'@/lib/checkoutExports'",JSON.stringify(exportsUrl))
 const {GET}=await import(dataUrl(source));const response=await GET(new Request('https://example.org/api/admin/checkout/exportar?section=tudo'));assert.equal(response.status,401)
})
