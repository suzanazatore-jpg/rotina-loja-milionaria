const PREFIX = 'sz-central-filters:v1:'
export const filterStorageKey = scope => PREFIX + scope
export function normalizeFilters(value, defaults) {
  if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
      typeof source[key] === typeof fallback && ['string','number','boolean'].includes(typeof fallback) ? source[key] : fallback]))
  }
  return typeof value === typeof defaults ? value : defaults
}
export function readFilters(storage, scope, defaults, overrides = {}) {
  let value
  try { value = JSON.parse(storage?.getItem(filterStorageKey(scope)) || 'null') } catch { value = null }
  const restored = normalizeFilters(value, defaults)
  return defaults && typeof defaults === 'object' ? normalizeFilters({...restored,...overrides}, defaults) : restored
}
