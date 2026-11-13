import api from './api'

export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials)
  return data
}

export async function getCurrentUser() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function updateCurrentUser(profile) {
  const { data } = await api.patch('/auth/me', profile)
  return data
}

export async function changePassword(credentials) {
  await api.post('/auth/change-password', credentials)
}
