const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
export function checkoutAttribution(input) {
  const output = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output
  for (const field of fields) {
    const value = input[field]
    if (typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) && value.trim()) output[field] = value.trim()
  }
  return output
}
export function browserAttribution(search) {
  return checkoutAttribution(Object.fromEntries(new URLSearchParams(search)))
}
