import SaleDetail from './SaleDetail'
export default async function Page({ params, searchParams }) {
  return (
    <SaleDetail key={(await params).id} id={(await params).id} initialTab={(await searchParams).tab} />
  )
}
