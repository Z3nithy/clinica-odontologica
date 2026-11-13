import api from './api'

export async function getDentistDashboard(params) {
  const { data } = await api.get('/dentist/dashboard', { params })
  return data
}

export async function getDentistPatients(params) {
  const { data } = await api.get('/dentist/patients', { params })
  return data
}

export async function getDentistPatientAppointments(patientId) {
  const { data } = await api.get(`/dentist/patients/${patientId}/appointments`)
  return data
}

export async function getDentistPatientOdontogram(patientId) {
  const { data } = await api.get(`/dentist/patients/${patientId}/odontogram`)
  return data
}

export async function getDentistPatientOdontogramHistory(patientId, params = {}) {
  const { data } = await api.get(`/dentist/patients/${patientId}/odontogram/history`, { params })
  return data
}

export async function createDentistPatientOdontogramEntry(patientId, entry) {
  const { data } = await api.post(`/dentist/patients/${patientId}/odontogram`, entry)
  return data
}

export async function getDentistTreatmentPlans(params) {
  const { data } = await api.get('/dentist/treatment-plans', { params })
  return data
}

export async function getDentistTreatmentPlan(planId) {
  const { data } = await api.get(`/dentist/treatment-plans/${planId}`)
  return data
}

export async function createDentistTreatmentPlan(payload) {
  const { data } = await api.post('/dentist/treatment-plans', payload)
  return data
}

export async function updateDentistTreatmentPlan(planId, payload) {
  const { data } = await api.patch(`/dentist/treatment-plans/${planId}`, payload)
  return data
}

export async function addDentistTreatmentPlanProcedure(planId, payload) {
  const { data } = await api.post(`/dentist/treatment-plans/${planId}/procedures`, payload)
  return data
}

export async function updateDentistTreatmentPlanProcedure(planId, procedureId, payload) {
  const { data } = await api.patch(
    `/dentist/treatment-plans/${planId}/procedures/${procedureId}`,
    payload,
  )
  return data
}

export async function deleteDentistTreatmentPlanProcedure(planId, procedureId, version, planVersion) {
  await api.delete(`/dentist/treatment-plans/${planId}/procedures/${procedureId}`, {
    params: { version, plan_version: planVersion },
  })
}

export async function getDentistTreatmentPlanHistory(planId) {
  const { data } = await api.get(`/dentist/treatment-plans/${planId}/history`)
  return data
}

export async function getDentistClinicalDocuments(params = {}) {
  const { data } = await api.get('/dentist/documents', { params })
  return data
}

export async function createDentistClinicalDocument(payload) {
  const { data } = await api.post('/dentist/documents', payload)
  return data
}

export async function getDentistClinicalDocument(documentId) {
  const { data } = await api.get(`/dentist/documents/${documentId}`)
  return data
}

export async function updateDentistClinicalDocument(documentId, payload) {
  const { data } = await api.patch(`/dentist/documents/${documentId}`, payload)
  return data
}

export async function getDentistClinicalDocumentHistory(documentId) {
  const { data } = await api.get(`/dentist/documents/${documentId}/history`)
  return data
}

export async function getDentistAppointmentHistory(params = {}) {
  const { data } = await api.get('/dentist/appointment-history', { params })
  return data
}
