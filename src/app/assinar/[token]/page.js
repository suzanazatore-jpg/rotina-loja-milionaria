import SignContract from './SignContract'
import './assinar.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinatura de contrato | Suzana Zatorre', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function Page({ params }) {
  const { token } = await params
  return <SignContract token={token} />
}
