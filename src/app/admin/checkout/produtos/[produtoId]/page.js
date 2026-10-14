import AdminCheckout from '../../page'
export default async function Page({ params }) { const { produtoId } = await params; return <AdminCheckout key={produtoId} initialProdutoId={produtoId} /> }
