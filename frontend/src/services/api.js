import axios from 'axios'
import { clearSession, getAccessToken } from './auth-session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.endsWith('/auth/login')) {
      clearSession()
      window.dispatchEvent(new Event('zen:session-expired'))
    }
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).filter(Boolean).join(' ') || fallback
  }
  if (!error?.response) return 'Não foi possível conectar à API. Verifique se o backend está em execução.'
  return fallback
}

export default api
