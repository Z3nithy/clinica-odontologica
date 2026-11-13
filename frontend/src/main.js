import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './assets/styles/main.css'
import { getSessionUser } from './services/auth-session'
import {
  applyUserPreferences,
  DEFAULT_USER_PREFERENCES,
  getCachedUserPreferences,
  getUserPreferences,
} from './services/user-preferences'

const app = createApp(App)

app.use(router)

let preferenceRequest = 0

function applySessionPreferences() {
  const requestId = ++preferenceRequest
  const user = getSessionUser()
  try {
    applyUserPreferences(user ? getCachedUserPreferences(user.id) : DEFAULT_USER_PREFERENCES)
  } catch (error) {
    applyUserPreferences(DEFAULT_USER_PREFERENCES)
    window.dispatchEvent(new CustomEvent('zen:preferences-error', { detail: error.message }))
  }
  if (!user) return
  void getUserPreferences(user.id).then((preferences) => {
    if (requestId === preferenceRequest && getSessionUser()?.id === user.id) {
      applyUserPreferences(preferences)
    }
  }).catch((error) => {
    if (requestId === preferenceRequest && getSessionUser()?.id === user.id) {
      window.dispatchEvent(new CustomEvent('zen:preferences-error', {
        detail: error?.response
          ? error.response.data?.detail || 'Não foi possível sincronizar as preferências da conta.'
          : 'Não foi possível conectar à API para sincronizar as preferências.',
      }))
    }
  })
}

applySessionPreferences()
window.addEventListener('zen:session-changed', applySessionPreferences)
window.addEventListener('zen:user-preferences-changed', (event) => {
  applyUserPreferences(event.detail)
})

window.addEventListener('zen:session-expired', () => {
  router.replace({ name: 'login', query: { reason: 'session-expired' } })
})

app.mount('#app')
