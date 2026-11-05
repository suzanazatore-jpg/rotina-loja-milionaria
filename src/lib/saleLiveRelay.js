const ORIGIN='https://rotina.suzanazatorre.com.br'
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
// Same application's authenticated production handlers own live operations.
// The preview never receives production payment keys or enables a live worker.
export async function liveSaleRequest(request,id,kind,body=null,fetcher=fetch){
 if(!UUID.test(id || '')||!['webhooks','gateway'].includes(kind)||body&&kind!=='webhooks')throw new Error('Operação de venda inválida.')
 const authorization=request.headers.get('authorization')
 if(!authorization?.startsWith('Bearer '))throw new Error('Sessão administrativa necessária.')
 const path=kind==='gateway'?'acoes?detail=gateway':'webhooks'
 const response=await fetcher(`${ORIGIN}/api/admin/checkout/vendas/${id}/${path}`,{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:authorization,'Content-Type':'application/json',Origin:ORIGIN},...(body?{body:JSON.stringify(body)}:{})})
 let result;try{result=await response.json()}catch{throw new Error('Não foi possível consultar o serviço de vendas. Tente novamente.')}
 if(!response.ok)throw new Error(result.error || 'Não foi possível concluir a operação da venda.')
 return result
}
export function eligibleLiveWebhooks(result){const seen=new Set();return (result.paid?result.deliveries || []:[]).filter(row=>{if(!row.active||row.internal||row.event_type!=='order.paid'||seen.has(row.webhook_id))return false;seen.add(row.webhook_id);return true})}
