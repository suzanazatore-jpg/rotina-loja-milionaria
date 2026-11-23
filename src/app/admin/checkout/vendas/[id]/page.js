import RecordDetail from '../../RecordDetail'
export default async function Page({params,searchParams}){
 const {id}=await params
 const {tab}=await searchParams
 const initialTab=['detail','buyer','extras','tracking','comments','audit'].includes(tab)?tab:'detail'
 return <RecordDetail entity="vendas" id={id} initialTab={initialTab}/>
}
