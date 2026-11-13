const TOKEN_KEY = 'zen.access-token'
const USER_KEY = 'zen.user'

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getSessionUser() {
  const serialized = sessionStorage.getItem(USER_KEY)
  if (!serialized) return null
  try {
    return JSON.parse(serialized)
  } catch {
    clearSession()
    return null
  }
}

export function setSession({ access_token: token, user }) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('zen:session-changed'))
}

export function updateSessionUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('zen:session-changed'))
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('zen:session-changed'))
}
