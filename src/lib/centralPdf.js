import {PDFDocument,StandardFonts,rgb} from 'pdf-lib'
const money=n=>(Number(n || 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const clean=value=>String(value ?? '').replace(/[–—]/g,'-').replace(/[^\x20-\xff\n]/g,'').slice(0,1000)
export async function dashboardPdf(data){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),purple=rgb(.29,.19,.66),muted=rgb(.37,.40,.46),ink=rgb(.10,.12,.17),light=rgb(.95,.95,.97)
 let page,y;const W=595,H=842,margin=42,usable=W-margin*2
 function text(value,x,at,size=10,heavy=false,color=ink){page.drawText(clean(value),{x,y:at,size,font:heavy?bold:font,color})}
 function newPage(){page=doc.addPage([W,H]);y=H-48;text('SUZANA ZATORRE EDUCACIONAL',margin,y,10,true,purple);y-=34}
 function need(height){if(y-height<50)newPage()}
 function title(value){need(48);text(value,margin,y,15,true);y-=24}
 function wrap(value,width,size=10){const words=clean(value).split(/\s+/),lines=[];let current='';for(const word of words){if(font.widthOfTextAtSize((current?current+' ':'')+word,size)>width&&current){lines.push(current);current=word}else current+=(current?' ':'')+word}if(current)lines.push(current);return lines.length?lines:['-']}
 function table(name,headers,rows,widths){title(name);function heading(){page.drawRectangle({x:margin,y:y-22,width:usable,height:28,color:light});let x=margin+8;headers.forEach((label,i)=>{text(label,x,y-12,10,true,purple);x+=widths[i]});y-=35}heading();if(!rows.length){text('Sem registros no período.',margin+8,y,10,false,muted);y-=28}for(const row of rows){const cells=row.map((value,i)=>wrap(value,widths[i]-14)),height=Math.max(...cells.map(c=>c.length))*13+12;if(y-height<50){newPage();title(name+' (continuação)');heading()}let x=margin+8;cells.forEach((lines,i)=>{lines.forEach((line,j)=>text(line,x,y-j*13,10));x+=widths[i]});y-=height;page.drawLine({start:{x:margin,y:y+7},end:{x:W-margin,y:y+7},thickness:.5,color:light})}y-=18}
 newPage();text('Dashboard de Vendas',margin,y,24,true);y-=25;text(`${data.start.split('-').reverse().join('/')} a ${data.end.split('-').reverse().join('/')} | ${data.dateBy==='paid_at'?'Data de aprovação':'Data de criação'}`,margin,y,11,false,muted);y-=32
 const cards=[['Faturamento aprovado',money(data.revenue)],['Vendas aprovadas',data.sales],['Produtos vendidos',data.productCount],['Clientes compradores',data.customers],['Reembolsos',data.refunds],['Ticket médio',money(data.ticket)]]
 cards.forEach(([label,value],i)=>{const col=i%3,row=Math.floor(i/3),x=margin+col*(usable/3+3),top=y-row*68;page.drawRectangle({x,y:top-55,width:usable/3-7,height:60,color:light});text(label,x+10,top-12,9,false,muted);text(value,x+10,top-35,17,true,purple)});y-=155
 title('Volume de vendas');const max=Math.max(0,...data.daily.map(d=>d.revenue)),barWidth=usable/Math.max(1,data.daily.length);data.daily.forEach((d,i)=>{const height=d.revenue/Math.max(1,max)*95;page.drawRectangle({x:margin+i*barWidth,y:y-110,width:Math.max(1,barWidth-3),height,color:purple})});text(money(max),margin,y-6,9,false,muted);text(data.start,margin,y-127,9,false,muted);text(data.end,W-margin-65,y-127,9,false,muted);y-=162
 table('Vendas por origem',['Origem','Vendas','Faturamento'],data.origins.map(r=>[r.name,r.sales,money(r.revenue)]),[285,70,156])
 table('Produtos mais vendidos',['Produto','Qtd.','Valor dos itens'],data.products.map(r=>[r.name,r.sales,money(r.revenue)]),[285,70,156])
 table('Formas de pagamento',['Forma','Aprovadas','Aprovação'],Object.entries(data.approval).map(([key,value])=>[key==='pix'?'Pix':'Cartão de crédito',`${value.paid} de ${value.total}`,`${value.total?(100*value.paid/value.total).toFixed(1):0}%`]),[285,110,116])
 table('Motivos de recusa',['Motivo','Quantidade'],Object.entries(data.refusals),[410,101])
 need(65);wrap('Valores integrais das vendas aprovadas. Divisões entre recebedores e comissões não reduzem o faturamento da central. O relatório contém os dados disponíveis no período e nos filtros selecionados.',usable,9).forEach(line=>{text(line,margin,y,9,false,muted);y-=13})
 const pages=doc.getPages();pages.forEach((p,i)=>{p.drawText(`Central de Vendas | ${i+1} / ${pages.length}`,{x:margin,y:25,size:9,font,color:muted})});return doc.save()
}
