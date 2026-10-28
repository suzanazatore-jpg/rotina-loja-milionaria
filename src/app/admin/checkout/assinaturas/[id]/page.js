import RecordDetail from '../../RecordDetail'
export default async function Page({params}){const {id}=await params;return <RecordDetail entity="assinaturas" id={id}/>}
