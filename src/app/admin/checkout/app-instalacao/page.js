import { redirect } from 'next/navigation'

export default function InstallationReportRedirect() {
  redirect('/painel?secao=instalacao-app')
}
