// Keep only actual Meta identifiers; never manufacture a browser ID.
export function checkoutAttribution(target, now = Date.now()) {
  try {
    if (target.localStorage?.getItem('sz-checkout-consent-v2') === 'denied') return {}
    const output = {}
    const cookie = String(target.document?.cookie || '')
    for (const key of ['fbc', 'fbp']) {
      const value = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`_${key}=`))?.slice(5)
      if (/^fb\.\d\.\d{10,13}\.[A-Za-z0-9._-]{1,350}$/.test(value || '')) output[key] = value
    }
    const fbclid = new URL(target.location.href).searchParams.get('fbclid')
    if (/^[A-Za-z0-9_-]{1,350}$/.test(fbclid || '')) {
      let saved
      try { saved = JSON.parse(target.sessionStorage?.getItem('sz-checkout-click') || 'null') } catch { /* Invalid storage is ignored. */ }
      const click = saved?.fbclid === fbclid && Number.isSafeInteger(saved?.click_time) && saved.click_time <= now && saved.click_time > now - 90 * 86400000 ? saved : { fbclid, click_time: now }
      Object.assign(output, { fbclid: click.fbclid, click_time: click.click_time })
      try { target.sessionStorage?.setItem('sz-checkout-click', JSON.stringify(click)) } catch { /* Purchase never depends on storage. */ }
    } else if (!output.fbc) {
      try {
        const saved = JSON.parse(target.sessionStorage?.getItem('sz-checkout-click') || 'null')
        if (/^[A-Za-z0-9_-]{1,350}$/.test(saved?.fbclid || '') && Number.isSafeInteger(saved?.click_time) && saved.click_time <= now && saved.click_time > now - 90 * 86400000) Object.assign(output, { fbclid: saved.fbclid, click_time: saved.click_time })
      } catch { /* No recorded click. */ }
    }
    return output
  } catch { return {} }
}
