"use client"
import {useEffect,useState} from 'react'
import {filterStorageKey,readFilters} from '@/lib/centralFilterStorage'

// Only applied filters use this hook; unfinished dialog drafts stay in memory.
export function usePersistentFilters(scope, initialValue, overrides) {
  const defaults = typeof initialValue === 'function' ? initialValue() : initialValue
  function restore() {
    try { return readFilters(window.localStorage,scope,defaults,overrides) }
    catch { return defaults }
  }
  const [saved,setSaved] = useState(() => ({scope,value:restore()}))
  const value = saved.scope === scope ? saved.value : restore()
  if (saved.scope !== scope) setSaved({scope,value})
  useEffect(() => {
    if (saved.scope !== scope) return
    try { window.localStorage.setItem(filterStorageKey(scope),JSON.stringify(saved.value)) } catch {}
  },[scope,saved])
  function setValue(next) {
    setSaved(current => ({scope,value:typeof next === 'function' ? next(current.scope === scope ? current.value : restore()) : next}))
  }
  return [value,setValue]
}
