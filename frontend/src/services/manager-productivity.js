import api from './api'

export async function getManagerProductivity(params) {
  const { data } = await api.get('/manager/productivity', { params })
  return data
}

export async function getManagerProductivityRecords(params) {
  const { data } = await api.get('/manager/productivity/records', { params })
  return data
}
