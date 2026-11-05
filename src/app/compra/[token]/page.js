import {notFound} from 'next/navigation'
import {checkoutAdminClient} from '@/lib/checkoutAdminServer'
import {readInvoiceToken} from '@/lib/saleDetail'
export const dynamic='force-dynamic'
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'}
export default async function Purchase({params}){
 const {token}=await params,id=readInvoiceToken(token,process.env.CHECKOUT_SESSION_SECRET)
 if(!id)notFound()
 const db=checkoutAdminClient(),{data:order,error}=await db.from('orders').select('status,total_cents,created_at,payment_method,installments,pix_qr_code,pix_expires_at,offer:offers(name,product:products(name))').eq('id',id).maybeSingle()
 if(error||!order)notFound()
 const labels={paid:'Pagamento aprovado',waiting_payment:'Aguardando pagamento',pending:'Pagamento pendente',failed:'Pagamento recusado',refunded:'Pagamento reembolsado',chargedback:'Pagamento contestado',canceled:'Pagamento cancelado'}
 return <main style={{maxWidth:620,margin:'60px auto',padding:28,fontFamily:'Arial,sans-serif',color:'#24212b',background:'#fff',borderRadius:18}}><p>Suzana Zatorre</p><h1 style={{fontSize:26}}>Sua compra</h1><h2 style={{fontSize:19}}>{order.offer?.product?.name || order.offer?.name}</h2><p>{labels[order.status] || 'Em processamento'}</p><p>Valor: {(order.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p><p>Pagamento: {order.payment_method==='pix'?'Pix':'Cartão de crédito'} · {order.installments || 1} parcela(s)</p>{order.payment_method==='pix'&&['pending','waiting_payment'].includes(order.status)&&order.pix_qr_code&&new Date(order.pix_expires_at)>new Date()&&<><p>Pix Copia e Cola</p><textarea readOnly aria-label="Pix Copia e Cola" value={order.pix_qr_code} style={{width:'100%',height:120,overflowWrap:'anywhere'}}/></>}<p style={{fontSize:13,marginTop:32}}>Pagamento processado pelo Pagar.me.</p></main>
}
