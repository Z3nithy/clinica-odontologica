import api from './api'

export async function getManagerPatients(params) {
  const { data } = await api.get('/manager/patients', { params })
  return data
}

export async function getManagerPatient(id, params = {}) {
  const { data } = await api.get(`/manager/patients/${id}`, { params })
  return data
}
