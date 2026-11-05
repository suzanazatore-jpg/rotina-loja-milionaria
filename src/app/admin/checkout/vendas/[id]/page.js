import SaleDetail from '../../SaleDetail'
export default async function Page({params}){const {id}=await params;return <SaleDetail id={id}/>}
