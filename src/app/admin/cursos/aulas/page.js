'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Mantém o endereço antigo funcionando sem duplicar o gerenciador de cursos.
export default function CursosCompatibilidade() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/cursos') }, [router])
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#888', display: 'grid', placeItems: 'center' }}>Abrindo cursos...</div>
}
