const ORIGIN='https://rotina.suzanazatorre.com.br'
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
// Same application's authenticated production handlers own live operations.
// The preview never receives production payment keys or enables a live worker.
export async function liveSaleRequest(request,id,kind,body=null,fetcher=fetch){
 if(!UUID.test(id || '')||!['webhooks','gateway','sync','refund','chargeback'].includes(kind)||body&&kind==='gateway')throw new Error('Operação de venda inválida.')
 const authorization=request.headers.get('authorization')
 if(!authorization?.startsWith('Bearer '))throw new Error('Sessão administrativa necessária.')
 const financial=['refund','chargeback'].includes(kind)
 if(financial&&(!body||body.confirm!==true||!String(body.reason || '').trim()||String(body.reason).length>1000||!UUID.test(body.requestId || '')))throw new Error('Confirme a operação e informe um motivo válido.')
 if(kind==='sync'&&!body)throw new Error('Solicitação de atualização inválida.')
 const path=kind==='gateway'?'acoes?detail=gateway':financial?'acoes':'webhooks'
 const url=kind==='sync'?`${ORIGIN}/api/admin/checkout/pagamentos`:`${ORIGIN}/api/admin/checkout/vendas/${id}/${path}`
 const payload=kind==='sync'?{action:'sync',order_id:id}:financial?{action:kind,reason:body.reason.trim(),confirm:true,requestId:body.requestId}:body
 const response=await fetcher(url,{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:authorization,'Content-Type':'application/json',Origin:ORIGIN},...(body?{body:JSON.stringify(payload)}:{})})
 let result;try{result=await response.json()}catch{throw new Error('Não foi possível consultar o serviço de vendas. Tente novamente.')}
 if(!response.ok)throw new Error(result.error || 'Não foi possível concluir a operação da venda.')
 return result
}
export function eligibleLiveWebhooks(result){const seen=new Set();return (result.paid?result.deliveries || []:[]).filter(row=>{if(!row.active||row.internal||row.event_type!=='order.paid'||seen.has(row.webhook_id))return false;seen.add(row.webhook_id);return true})}
