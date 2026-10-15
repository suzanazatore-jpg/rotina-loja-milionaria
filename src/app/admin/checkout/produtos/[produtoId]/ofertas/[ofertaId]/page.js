import OfferEditor from '../../../../OfferEditor'
export default async function Page({ params }) { const { produtoId, ofertaId } = await params; return <OfferEditor key={ofertaId} produtoId={produtoId} ofertaId={ofertaId} /> }
