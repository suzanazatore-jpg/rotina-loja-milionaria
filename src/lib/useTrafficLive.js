'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { previousRange } from './trafficReportModel'

export default function useTrafficLive({ account, from, to, compare, valid }) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ key: '', snapshots: [], status: 'idle', error: '', warnings: [] })
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const clientId = account?.id
  const key = `${clientId}:${from}:${to}:${compare}`
  useEffect(() => {
    if (!clientId || !valid) return
    let current = true
    const controller = new AbortController()
    setState(old => ({ key, snapshots: old.key === key ? old.snapshots : [], status: 'loading', error: '', warnings: [] }))
    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw Error('Entre novamente na sua conta para atualizar os dados.')
        async function read(start, end, details) {
          const response = await fetch('/api/trafego/online', { method: 'POST', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ client_id: clientId, from: start, to: end, details }) })
          const body = await response.json()
          if (!response.ok) throw Error(body.error || 'Não foi possível consultar a Meta agora.')
          if (body.client_id !== clientId) throw Error('A consulta retornou uma conta inesperada.')
          return body
        }
        const data = await read(from, to, true)
        if (!current) return
        const snapshots = [data.snapshot], warnings = [...data.warnings]
        // Publish current results immediately; comparison cannot block the latest campaign data.
        setState({ key, snapshots, status: 'success', error: '', warnings })
        if (compare) {
          const prior = previousRange(from, to)
          try {
            const comparison = await read(prior.from, prior.to, false)
            if (current) setState({ key, snapshots: [...snapshots, comparison.snapshot], status: 'success', error: '', warnings: [...warnings, ...comparison.warnings] })
          } catch (error) {
            if (current) setState({ key, snapshots, status: 'success', error: '', warnings: [...warnings, 'O período anterior não pôde ser atualizado: ' + error.message] })
          }
        }
      } catch (error) {
        if (current) setState(old => ({ ...old, key, status: 'error', error: error.message, warnings: [] }))
      }
    }, 400)
    return () => { current = false; clearTimeout(timer); controller.abort() }
  }, [clientId, from, to, compare, valid, key, revision])

  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) refresh() }
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    const interval = setInterval(resume, 5 * 60 * 1000)
    return () => { clearInterval(interval); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [refresh])
  return { ...(state.key === key ? state : { snapshots: [], status: valid && clientId ? 'loading' : 'idle', error: '', warnings: [] }), refresh }
}
