import api from './api'

export async function getManagedUsers(params) {
  const filters = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  )
  const { data } = await api.get('/manager/users', { params: filters })
  return data
}

export async function getManagedUser(id) {
  const { data } = await api.get(`/manager/users/${id}`)
  return data
}

export async function createManagedUser(user) {
  const { data } = await api.post('/manager/users', user)
  return data
}

export async function updateManagedUser(id, user) {
  const { data } = await api.patch(`/manager/users/${id}`, user)
  return data
}

export async function setManagedUserActive(id, active) {
  const { data } = await api.patch(`/manager/users/${id}/status`, null, {
    params: { active },
  })
  return data
}

export async function resendManagedUserInvitation(id) {
  const { data } = await api.post(`/manager/users/${id}/invitation/resend`)
  return data
}

export async function acceptManagedUserInvitation(payload) {
  await api.post('/manager/users/invitation/accept', payload)
}
