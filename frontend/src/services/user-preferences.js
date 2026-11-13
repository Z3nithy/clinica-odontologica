import api from './api'
import { getSessionUser } from './auth-session'

export const DEFAULT_USER_PREFERENCES = Object.freeze({
  theme: 'system',
  fontScale: 100,
  density: 'comfortable',
  accent: 'blue',
  highContrast: false,
  reducedMotion: false,
  visibleFocus: true,
  underlineLinks: false,
  expandedSpacing: false,
  pageSize: 10,
  homePage: 'reception-dashboard',
  confirmActions: true,
  dateFormat: 'dd/MM/yyyy',
  timeFormat: '24h',
})

const SCALE_OPTIONS = [100, 112, 125, 137]
const PAGE_SIZE_OPTIONS = [10, 20, 50]
const HOME_PAGE_OPTIONS = [
  'manager-dashboard',
  'dentist-dashboard',
  'reception-dashboard',
  'reception-agenda',
  'reception-patients',
  'reception-checkin',
  'reception-confirmations',
  'reception-history',
  'reception-notification-settings',
  'reception-general-settings',
]

function storageKey(userId = getSessionUser()?.id) {
  if (!userId) throw new Error('Faça login para acessar as preferências da conta.')
  return `zen.user-preferences.${userId}`
}

function serverSyncKey(userId) {
  return `${storageKey(userId)}.server-synced`
}

function normalizePreferences(value, userId) {
  const preferences = { ...DEFAULT_USER_PREFERENCES, ...value }
  if (!['system', 'light', 'dark'].includes(preferences.theme)) preferences.theme = 'system'
  if (!SCALE_OPTIONS.includes(preferences.fontScale)) preferences.fontScale = 100
  if (!['comfortable', 'compact'].includes(preferences.density)) preferences.density = 'comfortable'
  if (!['blue', 'teal', 'coral'].includes(preferences.accent)) preferences.accent = 'blue'
  if (!PAGE_SIZE_OPTIONS.includes(preferences.pageSize)) preferences.pageSize = 10
  const sessionUser = getSessionUser()
  const isCurrentDentist = Boolean(sessionUser) &&
    sessionUser.id === userId &&
    sessionUser.role === 'dentist'
  const isCurrentManager = Boolean(sessionUser) &&
    sessionUser.id === userId &&
    sessionUser.role === 'manager'
  const homePageOptions = isCurrentDentist
    ? ['dentist-dashboard']
    : isCurrentManager
      ? ['manager-dashboard']
      : HOME_PAGE_OPTIONS.filter((page) => page !== 'dentist-dashboard' && page !== 'manager-dashboard')
  if (!homePageOptions.includes(preferences.homePage)) {
    preferences.homePage = isCurrentDentist
      ? 'dentist-dashboard'
      : isCurrentManager
        ? 'manager-dashboard'
        : 'reception-dashboard'
  }
  return preferences
}

function readStoredPreferences(userId) {
  const stored = localStorage.getItem(storageKey(userId))
  if (!stored) return null
  try {
    return normalizePreferences(JSON.parse(stored), userId)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('As preferências salvas estão inválidas. Restaure os padrões para continuar.', {
        cause: error,
      })
    }
    throw error
  }
}

export function getCachedUserPreferences(userId) {
  return readStoredPreferences(userId) || normalizePreferences(DEFAULT_USER_PREFERENCES, userId)
}

function cachePreferences(preferences, userId) {
  localStorage.setItem(storageKey(userId), JSON.stringify(preferences))
}

const preferenceLoads = new Map()

export async function getUserPreferences(userId) {
  if (preferenceLoads.has(userId)) return preferenceLoads.get(userId)
  const request = (async () => {
    const { data } = await api.get('/auth/me/preferences')
    let preferences = normalizePreferences(data.preferences, userId)
    if (!data.customized && localStorage.getItem(serverSyncKey(userId)) !== 'true') {
      const previousLocalPreferences = readStoredPreferences(userId)
      if (previousLocalPreferences) {
        const { data: saved } = await api.put('/auth/me/preferences', previousLocalPreferences)
        preferences = normalizePreferences(saved.preferences, userId)
      }
    }
    localStorage.setItem(serverSyncKey(userId), 'true')
    cachePreferences(preferences, userId)
    return preferences
  })()
  preferenceLoads.set(userId, request)
  try {
    return await request
  } finally {
    preferenceLoads.delete(userId)
  }
}

export async function saveUserPreferences(preferences, userId) {
  const normalized = normalizePreferences(preferences, userId)
  const { data } = await api.put('/auth/me/preferences', normalized)
  const saved = normalizePreferences(data.preferences, userId)
  cachePreferences(saved, userId)
  localStorage.setItem(serverSyncKey(userId), 'true')
  window.dispatchEvent(new CustomEvent('zen:user-preferences-changed', { detail: saved }))
  return saved
}

export async function resetUserPreferences(userId) {
  const { data } = await api.delete('/auth/me/preferences')
  const defaults = normalizePreferences(data.preferences, userId)
  localStorage.removeItem(storageKey(userId))
  localStorage.setItem(serverSyncKey(userId), 'true')
  window.dispatchEvent(new CustomEvent('zen:user-preferences-changed', { detail: defaults }))
  return defaults
}

function resolvedTheme(theme) {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let systemThemeQuery
let systemThemeListener

export function applyUserPreferences(preferences) {
  const normalized = normalizePreferences(preferences)
  const root = document.documentElement
  root.dataset.theme = resolvedTheme(normalized.theme)
  root.dataset.density = normalized.density
  root.dataset.accent = normalized.accent
  root.dataset.highContrast = String(normalized.highContrast)
  root.dataset.reducedMotion = String(normalized.reducedMotion)
  root.dataset.visibleFocus = String(normalized.visibleFocus)
  root.dataset.underlineLinks = String(normalized.underlineLinks)
  root.dataset.expandedSpacing = String(
    normalized.expandedSpacing && normalized.density !== 'compact',
  )
  root.dataset.pageSize = String(normalized.pageSize)
  root.style.fontSize = `${normalized.fontScale}%`

  if (systemThemeQuery && systemThemeListener) {
    systemThemeQuery.removeEventListener('change', systemThemeListener)
  }
  if (normalized.theme === 'system') {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemThemeListener = (event) => {
      root.dataset.theme = event.matches ? 'dark' : 'light'
    }
    systemThemeQuery.addEventListener('change', systemThemeListener)
  }
}
