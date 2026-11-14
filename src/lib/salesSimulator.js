// All monetary arithmetic uses integer cents; rates use hundredths of a percent.
export const SIMULATOR_BRANDS=['Visa','Mastercard','Amex','Elo','Hipercard']
export const emptySimulatorRates=()=>({brands:Object.fromEntries(SIMULATOR_BRANDS.map(b=>[b,Array(12).fill(null)])),settlementDays:2,checkedOn:'',source:'',fixedFeeCents:0})
export function parseMoney(value){const text=String(value??'').trim().replace(/R\$|\s/g,'');if(!text)return 0;const normalized=text.includes(',')?text.replace(/\./g,'').replace(',','.'):text;if(!/^\d+(\.\d{1,2})?$/.test(normalized))throw Error('Informe um valor com até duas casas decimais.');const cents=Math.round(Number(normalized)*100);if(!Number.isSafeInteger(cents)||cents>100000000)throw Error('Informe um valor de até R$ 1.000.000,00.');return cents}
export function normalizeSimulatorRates(input){if(!input||typeof input!=='object')throw Error('Tabela de taxas inválida.');const config=emptySimulatorRates();for(const brand of SIMULATOR_BRANDS){const rows=input.brands?.[brand];if(!Array.isArray(rows)||rows.length!==12)throw Error('Preencha as 12 parcelas de cada bandeira.');config.brands[brand]=rows.map(r=>{if(r===null||r==='')return null;const n=Number(r);if(!Number.isInteger(n)||n<0||n>=10000)throw Error('Taxas devem estar entre 0% e menos de 100%.');return n})}const days=Number(input.settlementDays);if(!Number.isInteger(days)||days<0||days>365)throw Error('Informe um prazo entre 0 e 365 dias.');config.settlementDays=days;const fee=Number(input.fixedFeeCents||0);if(!Number.isSafeInteger(fee)||fee<0||fee>1000000)throw Error('Custo fixo inválido.');config.fixedFeeCents=fee;config.source=String(input.source||'').trim().slice(0,120);config.checkedOn=String(input.checkedOn||'');if(config.checkedOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(config.checkedOn)||new Date(config.checkedOn+'T12:00:00Z').toISOString().slice(0,10)!==config.checkedOn))throw Error('Data de conferência inválida.');return config}
export function splitCents(total,count){const base=Math.floor(total/count),remainder=total%count;return Array.from({length:count},(_,i)=>base+(i<remainder?1:0))}
export function simulateSale({amountCents,installments=1,rateBps,mode='charge',fixedFeeCents=0}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100000000)throw Error('Informe um valor maior que zero, até R$ 1.000.000,00.');if(!Number.isInteger(installments)||installments<1||installments>12)throw Error('Escolha de 1 a 12 parcelas.');if(!Number.isInteger(rateBps)||rateBps<0||rateBps>=10000)throw Error('Cadastre uma taxa válida para esta parcela.');if(!Number.isSafeInteger(fixedFeeCents)||fixedFeeCents<0||fixedFeeCents>1000000)throw Error('Custo fixo inválido.');if(!['charge','receive'].includes(mode))throw Error('Modo inválido.')
 const feeFor=gross=>Math.floor((gross*rateBps+5000)/10000)+fixedFeeCents
 let gross=amountCents
 if(mode==='receive'){
  // Smallest cent amount whose rounded net reaches the requested target.
  let lo=amountCents,hi=Math.ceil((amountCents+fixedFeeCents)*10000/(10000-rateBps))+1
  if(!Number.isSafeInteger(hi)||hi>100000000)throw Error('O valor necessário para cobrança ultrapassa o limite do simulador.')
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(mid-feeFor(mid)>=amountCents)hi=mid;else lo=mid+1}gross=lo
 }
 const fees=feeFor(gross),net=gross-fees;if(net<0)throw Error('Os custos são maiores que o valor cobrado.');return {gross,net,fees,rateBps,percentageFee:fees-fixedFeeCents,fixedFeeCents,installments,chargeSchedule:splitCents(gross,installments),netSchedule:splitCents(net,installments)}
}
