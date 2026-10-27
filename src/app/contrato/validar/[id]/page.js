import { checkoutAdminClient } from '@/lib/checkoutAdminServer'
import { validationView } from '@/lib/contractsServer'
import '../../../assinar/[token]/assinar.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Validação de contrato | Suzana Zatorre', robots: { index: false, follow: false } }

const STATUS = { signed: 'Assinado', pending: 'Aguardando assinatura', viewed: 'Aguardando assinatura', canceled: 'Cancelado' }

export default async function Page({ params }) {
  const { id } = await params
  const data = await validationView(checkoutAdminClient(), id)
  return <main className="sz-sign"><div className="sz-card">
    <h1 className="sz-title">Validação de contrato</h1>
    {!data ? <p>Documento não encontrado.</p> : <>
      <p><strong>Situação:</strong> {STATUS[data.status]}</p>
      {data.program && <p><strong>Contrato:</strong> {data.program}</p>}
      {data.signer && <p><strong>Assinante:</strong> {data.signer}</p>}
      {data.signed_at && <p><strong>Assinado em:</strong> {new Date(data.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
      <p className="sz-small"><strong>SHA-256 do documento original:</strong> {data.original_sha256}</p>
      {data.signed_pdf_sha256 && <p className="sz-small"><strong>SHA-256 do PDF assinado:</strong> {data.signed_pdf_sha256}</p>}
      <p className="sz-small">Para conferir um PDF, calcule o SHA-256 do arquivo e compare com o valor acima.</p>
    </>}
  </div></main>
}
