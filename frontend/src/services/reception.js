import api from './api'

export async function getReceptionDashboard(params) {
  const { data } = await api.get('/reception/dashboard', { params })
  return data
}

export async function getReceptionAppointments(params) {
  const { data } = await api.get('/reception/appointments', { params })
  return data
}

export async function getReceptionPatients(q) {
  const { data } = await api.get('/reception/patients', { params: q ? { q } : {} })
  return data
}

export async function getPatientRegistry(params) {
  const { data } = await api.get('/reception/patients/registry', { params })
  return data
}

export async function getReceptionPatientAppointments(patientId) {
  const { data } = await api.get(`/reception/patients/${patientId}/appointments`)
  return data
}

export async function createReceptionPatient(patient) {
  const { data } = await api.post('/reception/patients', patient)
  return data
}

export async function updateReceptionPatient(id, updates) {
  const { data } = await api.patch(`/reception/patients/${id}`, updates)
  return data
}

export async function getReceptionDentists() {
  const { data } = await api.get('/reception/dentists')
  return data
}

export async function getAvailableTimes(params) {
  const { data } = await api.get('/reception/availability', { params })
  return data
}

export async function createReceptionAppointment(appointment) {
  const { data } = await api.post('/reception/appointments', appointment)
  return data
}

export async function updateReceptionAppointment(id, updates) {
  const { data } = await api.patch(`/reception/appointments/${id}`, updates)
  return data
}

export async function checkInReceptionAppointment(id, receptionNote) {
  const { data } = await api.post(`/reception/appointments/${id}/check-in`, {
    reception_note: receptionNote || null,
  })
  return data
}

export async function getNotificationPreferences() {
  const { data } = await api.get('/reception/notification-preferences')
  return data
}

export async function saveNotificationPreferences(preferences) {
  const { data } = await api.put('/reception/notification-preferences', preferences)
  return data
}
