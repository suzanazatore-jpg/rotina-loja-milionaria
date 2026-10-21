const REMEMBER_LOGIN_KEY = 'rotina-manter-conectada'
const LOGIN_EMAIL_KEY = 'rotina-login-email'
const observedAuthKeys = new Set()

function canUseStorage() {
  if (typeof window === 'undefined') return false

  try {
    return Boolean(window.localStorage) && Boolean(window.sessionStorage)
  } catch {
    return false
  }
}

function rememberLogin() {
  if (!canUseStorage()) return true

  try {
    return window.localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false'
  } catch {
    return true
  }
}

export const authStorage = {
  getItem(key) {
    if (!canUseStorage()) return null
    observedAuthKeys.add(key)

    try {
      const primary = rememberLogin() ? window.localStorage : window.sessionStorage
      const secondary = rememberLogin() ? window.sessionStorage : window.localStorage
      return primary.getItem(key) ?? secondary.getItem(key)
    } catch {
      return null
    }
  },

  setItem(key, value) {
    if (!canUseStorage()) return
    observedAuthKeys.add(key)

    try {
      const target = rememberLogin() ? window.localStorage : window.sessionStorage
      const other = rememberLogin() ? window.sessionStorage : window.localStorage
      target.setItem(key, value)
      other.removeItem(key)
    } catch {
      // O Supabase mantém o fluxo atual mesmo se o navegador bloquear o armazenamento.
    }
  },

  removeItem(key) {
    if (!canUseStorage()) return
    observedAuthKeys.add(key)

    try {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    } catch {
      // Sem ação adicional necessária.
    }
  },
}

export function setRememberLoginPreference(shouldRemember) {
  if (!canUseStorage()) return

  try {
    const previousStorage = rememberLogin() ? window.localStorage : window.sessionStorage
    const nextStorage = shouldRemember ? window.localStorage : window.sessionStorage
    const otherStorage = shouldRemember ? window.sessionStorage : window.localStorage

    window.localStorage.setItem(REMEMBER_LOGIN_KEY, String(shouldRemember))

    observedAuthKeys.forEach(key => {
      const value = previousStorage.getItem(key) ?? otherStorage.getItem(key)
      if (value !== null) nextStorage.setItem(key, value)
      otherStorage.removeItem(key)
    })
  } catch {
    // A preferência é um facilitador; o login não deve falhar se ela não puder ser salva.
  }
}

export function getRememberLoginPreference() {
  return rememberLogin()
}

export function getStoredLoginEmail() {
  if (!canUseStorage()) return ''

  try {
    return window.localStorage.getItem(LOGIN_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export function storeLoginEmail(email, shouldRemember) {
  if (!canUseStorage()) return

  try {
    if (shouldRemember) window.localStorage.setItem(LOGIN_EMAIL_KEY, email)
    else window.localStorage.removeItem(LOGIN_EMAIL_KEY)
  } catch {
    // O e-mail pode ser digitado normalmente quando o navegador bloquear o armazenamento.
  }
}
