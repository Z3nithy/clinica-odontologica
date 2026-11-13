<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Ellipsis,
  FileClock,
  ListFilter,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UserRoundCheck,
  Users,
  X,
  XCircle,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  createReceptionAppointment,
  createReceptionPatient,
  getAvailableTimes,
  getReceptionDashboard,
  getReceptionDentists,
  getReceptionPatients,
  updateReceptionAppointment,
} from '../services/reception'
import UiAvatar from '../components/ui/UiAvatar.vue'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiFormField from '../components/ui/UiFormField.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiSelect from '../components/ui/UiSelect.vue'
import UiTextarea from '../components/ui/UiTextarea.vue'
import UiToast from '../components/ui/UiToast.vue'

const router = useRouter()
const route = useRoute()
const today = new Date()
const dateValue = ref(toDateInput(today))
const search = ref('')
const statusFilter = ref('')
const dentistFilter = ref('')
const viewMode = ref('list')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
const dashboardState = ref('loading')
const dashboardError = ref('')
let dashboardRequestId = 0
let availabilityRequestId = 0
let pendingMutation = false
const dashboardMetrics = ref({
  total_appointments: 0,
  confirmed: 0,
  pending_confirmation: 0,
  waiting: 0,
  cancellations: 0,
})
const availabilityError = ref('')
const availabilityLoading = ref(false)
const mutationLoading = ref(false)
const patientDialogOpen = ref(false)
const appointmentDialogOpen = ref(false)
const detailsDialogOpen = ref(false)
const cancelDialogOpen = ref(false)
const selectedAppointmentId = ref(null)
const editingAppointmentId = ref(null)
const openActionMenuId = ref(null)
const patientForm = ref(null)
const appointmentForm = ref(null)
const attemptedPatientSubmit = ref(false)
const attemptedAppointmentSubmit = ref(false)
const newPatient = ref(emptyPatient())
const newAppointment = ref(emptyAppointment(dateValue.value))

const dentists = ref([])
const procedures = ['Avaliação', 'Limpeza', 'Retorno', 'Restauração', 'Urgência']
const statuses = [
  'Agendada',
  'Confirmada',
  'Aguardando chegada',
  'Em espera',
  'Em atendimento',
  'Concluída',
  'Cancelada',
  'Não compareceu',
]

const patients = ref([])
const recentPatients = ref([])
const patientSearch = ref('')
const patientsState = ref('loading')
const patientsError = ref('')
const appointments = ref([])
const visibleAppointments = computed(() => appointments.value)
const waitingAppointments = ref([])
const pendingConfirmations = ref([])
const metrics = computed(() => [
  {
    label: 'Consultas agendadas',
    value: dashboardState.value === 'loading' || dashboardState.value === 'error'
      ? '—'
      : dashboardMetrics.value.total_appointments,
    icon: CalendarDays,
    tone: 'blue',
  },
  {
    label: 'Confirmadas',
    value: dashboardMetrics.value.confirmed,
    icon: CheckCheck,
    tone: 'green',
  },
  {
    label: 'Aguardando confirmação',
    value: dashboardMetrics.value.pending_confirmation,
    icon: CircleAlert,
    tone: 'amber',
  },
  {
    label: 'Pacientes aguardando',
    value: dashboardMetrics.value.waiting,
    icon: Clock3,
    tone: 'violet',
  },
  {
    label: 'Cancelamentos',
    value: dashboardMetrics.value.cancellations,
    icon: XCircle,
    tone: 'red',
  },
])

const selectedAppointment = computed(() =>
  appointments.value.find((appointment) => appointment.id === selectedAppointmentId.value),
)
const selectedPatient = computed(() =>
  selectedAppointment.value
    ? patientById(selectedAppointment.value.patientId) || {
        id: selectedAppointment.value.patientId,
        name: selectedAppointment.value.patientName,
        phone: selectedAppointment.value.patientPhone,
      }
    : null,
)
const formattedDate = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fromDateInput(dateValue.value)),
)
const shortDate = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    fromDateInput(dateValue.value),
  ),
)
const dateHeading = computed(() =>
  dateValue.value === toDateInput(today) ? 'Agenda de hoje' : 'Agenda do dia',
)
const availableTimes = ref([])
const dentistOptions = computed(() =>
  dentists.value.map((dentist) => ({ value: String(dentist.id), label: dentist.name })),
)
const patientOptions = computed(() =>
  patients.value.map((patient) => ({ value: String(patient.id), label: patient.name })),
)
const procedureOptions = procedures.map((procedure) => ({ value: procedure, label: procedure }))
const timeOptions = computed(() =>
  availableTimes.value.map((time) => ({ value: time, label: time })),
)

function toDateInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function fromDateInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function emptyPatient() {
  return {
    name: '',
    cpf: '',
    birthDate: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    consent: false,
  }
}

function emptyAppointment(date) {
  return {
    patientId: '',
    dentist: '',
    date,
    time: '',
    procedure: '',
    duration: '30',
    notes: '',
    contact: 'Telefone',
  }
}

function mapAppointment(appointment) {
  const arrivalAt = appointment.arrival_at ? new Date(appointment.arrival_at) : null
  return {
    id: appointment.id,
    patientId: appointment.patient_id,
    patientName: appointment.patient_name,
    patientPhone: appointment.patient_phone,
    dentistId: appointment.dentist_id,
    dentist: appointment.dentist_name,
    date: appointment.appointment_date,
    time: appointment.appointment_time.slice(0, 5),
    duration: appointment.duration_minutes,
    procedure: appointment.procedure,
    confirmation: appointment.confirmation_status,
    status: appointment.status,
    contact: appointment.contact_channel || 'Telefone',
    notes: appointment.administrative_notes || '',
    arrivalAt: arrivalAt?.getTime() ?? null,
    arrival: arrivalAt
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
          arrivalAt,
        )
      : '',
  }
}

function mapPatient(patient) {
  return {
    id: patient.id,
    name: patient.name,
    cpf: patient.cpf || '',
    birthDate: patient.birth_date || '',
    phone: patient.phone,
    email: patient.email || '',
    address: patient.address || '',
    notes: patient.administrative_notes || '',
  }
}

function applyDashboard(data) {
  dashboardMetrics.value = data.metrics
  appointments.value = data.appointments.map(mapAppointment)
  waitingAppointments.value = data.waiting.map(mapAppointment)
  pendingConfirmations.value = data.pending_confirmations.map(mapAppointment)
  recentPatients.value = data.recent_patients.map(mapPatient)
  dashboardState.value = 'ready'
  dashboardError.value = ''
}

async function loadDashboard() {
  const requestId = ++dashboardRequestId
  dashboardState.value = appointments.value.length ? 'refreshing' : 'loading'
  try {
    const data = await getReceptionDashboard({
      date: dateValue.value,
      q: search.value.trim() || undefined,
      dentist_id: dentistFilter.value ? Number(dentistFilter.value) : undefined,
      status: statusFilter.value || undefined,
    })
    if (requestId !== dashboardRequestId) return
    applyDashboard(data)
  } catch (error) {
    if (requestId !== dashboardRequestId) return
    dashboardState.value = 'error'
    dashboardError.value = getApiErrorMessage(error, 'Falha ao carregar os dados da recepção.')
    showToast(dashboardError.value, 'danger')
  }
}

let patientRequestId = 0

async function loadPatients(query = '') {
  const requestId = ++patientRequestId
  patientsState.value = patients.value.length ? 'refreshing' : 'loading'
  try {
    const result = await getReceptionPatients(query.trim() || undefined)
    if (requestId !== patientRequestId) return
    patients.value = result.map(mapPatient)
    patientsState.value = 'ready'
    patientsError.value = ''
  } catch (error) {
    if (requestId !== patientRequestId) return
    patientsState.value = 'error'
    patientsError.value = getApiErrorMessage(error, 'Falha ao carregar os pacientes.')
    showToast(patientsError.value, 'danger')
  }
}

async function loadDentists() {
  try {
    dentists.value = await getReceptionDentists()
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Falha ao carregar os dentistas.'), 'danger')
  }
}

async function loadAvailability() {
  const requestId = ++availabilityRequestId
  const { date, dentist, duration } = newAppointment.value
  if (!date || !dentist) {
    availableTimes.value = []
    availabilityError.value = ''
    availabilityLoading.value = false
    return
  }
  availabilityLoading.value = true
  availabilityError.value = ''
  try {
    const times = await getAvailableTimes({
      date,
      dentist_id: Number(dentist),
      duration_minutes: Number(duration),
      exclude_appointment_id: editingAppointmentId.value || undefined,
    })
    if (requestId !== availabilityRequestId) return
    availableTimes.value = times
    if (!availableTimes.value.includes(newAppointment.value.time)) {
      newAppointment.value.time = ''
    }
  } catch (error) {
    if (requestId !== availabilityRequestId) return
    availableTimes.value = []
    availabilityError.value = getApiErrorMessage(error, 'Não foi possível consultar os horários.')
    showToast(availabilityError.value, 'danger')
  } finally {
    if (requestId === availabilityRequestId) availabilityLoading.value = false
  }
}

function waitDuration(appointment) {
  if (!appointment.arrivalAt) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - appointment.arrivalAt) / 60_000))
  if (minutes < 1) return 'há menos de 1 min'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `há ${hours}h ${remainder}min` : `há ${minutes} min`
}

function isOverdue(appointment) {
  if (appointment.status !== 'Aguardando chegada') return false
  const appointmentTime = new Date(`${appointment.date}T${appointment.time}:00`)
  return Date.now() - appointmentTime.getTime() >= 15 * 60_000
}

function patientById(id) {
  return patients.value.find((patient) => patient.id === id)
}

let searchDebounce
let availabilityDebounce
let patientSearchDebounce

watch([dateValue, dentistFilter, statusFilter], loadDashboard)
watch(search, () => {
  dashboardRequestId += 1
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(loadDashboard, 250)
})
watch(patientSearch, () => {
  newAppointment.value.patientId = ''
  clearTimeout(patientSearchDebounce)
  patientSearchDebounce = setTimeout(() => loadPatients(patientSearch.value), 250)
})
watch(
  () => [
    appointmentDialogOpen.value,
    editingAppointmentId.value,
    newAppointment.value.date,
    newAppointment.value.dentist,
    newAppointment.value.duration,
  ],
  ([isOpen]) => {
    if (!isOpen) return
    availabilityRequestId += 1
    availabilityLoading.value = false
    availabilityError.value = ''
    availableTimes.value = []
    clearTimeout(availabilityDebounce)
    availabilityDebounce = setTimeout(loadAvailability, 150)
  },
)
onMounted(() => {
  void loadDashboard()
  void loadPatients()
  void loadDentists()
})
watch(
  () => route.query.createPatient,
  (open) => {
    if (open === '1') openPatientDialog()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  dashboardRequestId += 1
  availabilityRequestId += 1
  patientRequestId += 1
  clearTimeout(searchDebounce)
  clearTimeout(availabilityDebounce)
  clearTimeout(patientSearchDebounce)
})

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

function shiftDate(amount) {
  const date = fromDateInput(dateValue.value)
  date.setDate(date.getDate() + amount)
  dateValue.value = toDateInput(date)
}

function openAppointmentDialog() {
  editingAppointmentId.value = null
  attemptedAppointmentSubmit.value = false
  patientSearch.value = ''
  void loadPatients()
  availabilityError.value = ''
  availableTimes.value = []
  newAppointment.value = emptyAppointment(dateValue.value)
  appointmentDialogOpen.value = true
}

function openRescheduleDialog(appointment) {
  openActionMenuId.value = null
  editingAppointmentId.value = appointment.id
  attemptedAppointmentSubmit.value = false
  newAppointment.value = {
    patientId: String(appointment.patientId),
    dentist: String(appointment.dentistId),
    date: appointment.date,
    time: appointment.time,
    procedure: appointment.procedure,
    duration: String(appointment.duration || 30),
    notes: appointment.notes || '',
    contact: appointment.contact || 'Telefone',
  }
  appointmentDialogOpen.value = true
}

function openPatientDialog() {
  attemptedPatientSubmit.value = false
  newPatient.value = emptyPatient()
  patientDialogOpen.value = true
}

async function savePatient() {
  attemptedPatientSubmit.value = true
  if (
    !patientForm.value?.checkValidity() ||
    !newPatient.value.consent ||
    (newPatient.value.cpf && !isValidCpf(newPatient.value.cpf)) ||
    !/^\d{10,13}$/.test(newPatient.value.phone.replace(/\D/g, ''))
  ) {
    patientForm.value?.reportValidity()
    return
  }
  mutationLoading.value = true
  try {
    const createdPatient = await createReceptionPatient({
      name: newPatient.value.name.trim(),
      cpf: newPatient.value.cpf || null,
      birth_date: newPatient.value.birthDate || null,
      phone: newPatient.value.phone,
      email: newPatient.value.email || null,
      address: newPatient.value.address || null,
      administrative_notes: newPatient.value.notes || null,
      consent_given: newPatient.value.consent,
    })
    recentPatients.value = [
      mapPatient(createdPatient),
      ...recentPatients.value.filter((patient) => patient.id !== createdPatient.id),
    ].slice(0, 4)
    await Promise.all([loadPatients(), loadDashboard()])
    patientDialogOpen.value = false
    if (route.query.returnTo === '/recepcao/agenda') {
      const agendaDate =
        typeof route.query.agendaDate === 'string' ? route.query.agendaDate : dateValue.value
      await router.push({
        name: 'reception-agenda',
        query: { date: agendaDate, patientId: String(createdPatient.id) },
      })
      return
    }
    showToast('Paciente cadastrado.', 'success')
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível cadastrar o paciente.'), 'danger')
  } finally {
    mutationLoading.value = false
  }
}

async function saveAppointment() {
  attemptedAppointmentSubmit.value = true
  if (
    !appointmentForm.value?.checkValidity() ||
    availabilityLoading.value ||
    availabilityError.value ||
    !availableTimes.value.includes(newAppointment.value.time)
  ) {
    if (!availabilityLoading.value && !availabilityError.value) {
      availabilityError.value = 'Selecione um horário disponível para este profissional.'
    }
    appointmentForm.value?.reportValidity()
    return
  }
  const isReschedule = Boolean(editingAppointmentId.value)
  const payload = {
    patient_id: Number(newAppointment.value.patientId),
    dentist_id: Number(newAppointment.value.dentist),
    appointment_date: newAppointment.value.date,
    appointment_time: newAppointment.value.time,
    duration_minutes: Number(newAppointment.value.duration),
    procedure: newAppointment.value.procedure,
    contact_channel: newAppointment.value.contact,
    administrative_notes: newAppointment.value.notes || null,
  }
  mutationLoading.value = true
  try {
    if (isReschedule) {
      await updateReceptionAppointment(editingAppointmentId.value, {
        ...payload,
        confirmation_status: 'Pendente',
        status: 'Agendada',
      })
    } else {
      await createReceptionAppointment(payload)
    }
    editingAppointmentId.value = null
    appointmentDialogOpen.value = false
    dateValue.value = payload.appointment_date
    await loadDashboard()
    showToast(isReschedule ? 'Agendamento reagendado.' : 'Agendamento cadastrado.', 'success')
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível salvar o agendamento.'), 'danger')
  } finally {
    mutationLoading.value = false
  }
}

async function updateAppointment(id, updates, successMessage) {
  if (pendingMutation) return false
  openActionMenuId.value = null
  pendingMutation = true
  try {
    await updateReceptionAppointment(id, updates)
    await loadDashboard()
    showToast(successMessage, 'success')
    return true
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível atualizar o agendamento.'), 'danger')
    return false
  } finally {
    pendingMutation = false
  }
}

function confirmAppointment(appointment) {
  updateAppointment(
    appointment.id,
    { confirmation_status: 'Confirmada' },
    'Confirmação registrada.',
  )
}

function checkIn(appointment) {
  updateAppointment(
    appointment.id,
    { status: 'Em espera' },
    'Chegada registrada.',
  )
}

function startAppointment(appointment) {
  updateAppointment(appointment.id, { status: 'Em atendimento' }, 'Atendimento encaminhado.')
}

function markNoShow(appointment) {
  updateAppointment(appointment.id, { status: 'Não compareceu' }, 'Falta registrada.')
}

function requestCancellation(appointment) {
  openActionMenuId.value = null
  selectedAppointmentId.value = appointment.id
  cancelDialogOpen.value = true
}

async function cancelAppointment() {
  if (!selectedAppointment.value) return
  const updated = await updateAppointment(
    selectedAppointment.value.id,
    { status: 'Cancelada' },
    'Agendamento cancelado.',
  )
  if (updated) cancelDialogOpen.value = false
}

function showDetails(appointment) {
  openActionMenuId.value = null
  selectedAppointmentId.value = appointment.id
  detailsDialogOpen.value = true
}

function toggleActionMenu(appointment) {
  openActionMenuId.value = openActionMenuId.value === appointment.id ? null : appointment.id
}

function statusVariant(status) {
  if (['Concluída', 'Confirmada'].includes(status)) return 'success'
  if (['Em espera', 'Aguardando chegada'].includes(status)) return 'warning'
  if (['Cancelada', 'Não compareceu'].includes(status)) return 'danger'
  if (status === 'Em atendimento') return 'info'
  return 'neutral'
}

function isValidCpf(value) {
  const cpf = value.replace(/\D/g, '')
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false
  const digit = (length) => {
    const sum = Array.from(cpf.slice(0, length)).reduce(
      (total, number, index) => total + Number(number) * (length + 1 - index),
      0,
    )
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

function handleNav(id) {
  if (id === 'schedule') {
    router.push({ name: 'reception-agenda' })
    return
  }
  if (id === 'patient-list') {
    router.push({ name: 'reception-patients' })
    return
  }
  if (id === 'checkin') {
    router.push({ name: 'reception-checkin' })
    return
  }
  if (id === 'confirmations') {
    router.push({ name: 'reception-confirmations' })
    return
  }
  if (id === 'history') {
    router.push({ name: 'reception-history' })
    return
  }
  if (id === 'history') {
    statusFilter.value = 'Concluída'
    router.push({
      name: 'reception-agenda',
      query: { status: 'Concluída', date: dateValue.value },
    })
    return
  }
  if (id === 'patients') {
    document.getElementById('patient-list')?.scrollIntoView({ behavior: 'smooth' })
  } else {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
}

function showHistory() {
  handleNav('history')
}

</script>

<template>
  <div class="reception">
    <ReceptionShell
      active-page="overview"
      :date-label="formattedDate"
      @navigate="handleNav"
    />

    <main id="overview" class="reception-main">
      <div class="api-notice" role="note">
        <ShieldCheck :size="17" aria-hidden="true" />
        <span>
          <strong v-if="dashboardState === 'error'">API indisponível.</strong>
          <strong v-else>Dados da clínica.</strong>
          {{
            dashboardState === 'error'
              ? dashboardError
              : 'Agenda, pacientes e indicadores são carregados do backend.'
          }}
          <button
            v-if="dashboardState === 'error'"
            class="text-button"
            type="button"
            @click="loadDashboard"
          >
            Tentar novamente
          </button>
        </span>
      </div>

      <section class="page-intro" aria-labelledby="page-title">
        <div>
          <p class="page-eyebrow">PAINEL DA RECEPÇÃO</p>
          <h1 id="page-title">Dashboard da Recepção</h1>
          <p class="page-greeting">Bom dia! Confira a rotina da clínica hoje.</p>
        </div>
        <div class="page-intro__actions">
          <UiButton variant="secondary" @click="openPatientDialog">
            <template #start><UserRound :size="17" aria-hidden="true" /></template>
            Novo paciente
          </UiButton>
          <UiButton @click="openAppointmentDialog">
            <template #start><Plus :size="18" aria-hidden="true" /></template>
            Novo agendamento
          </UiButton>
        </div>
      </section>

      <section class="metrics-grid" aria-label="Indicadores do dia">
        <article v-for="metric in metrics" :key="metric.label" class="metric-card">
          <span class="metric-card__icon" :class="`metric-card__icon--${metric.tone}`">
            <component :is="metric.icon" :size="18" aria-hidden="true" />
          </span>
          <div>
            <p>{{ metric.label }}</p>
            <strong>{{ metric.value }}</strong>
          </div>
          <span class="metric-card__caption">{{
            dashboardState === 'error' ? 'indisponível' : 'do dia selecionado'
          }}</span>
        </article>
      </section>

      <section class="workspace-grid">
        <div class="main-column">
          <section id="schedule" class="panel schedule-panel" aria-labelledby="schedule-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">ROTINA DA CLÍNICA</p>
                <h2 id="schedule-title">{{ dateHeading }}</h2>
              </div>
              <div class="date-controls">
                <button
                  class="icon-action"
                  type="button"
                  aria-label="Dia anterior"
                  @click="shiftDate(-1)"
                >
                  <ChevronLeft :size="18" aria-hidden="true" />
                </button>
                <span class="date-readable" aria-live="polite">{{ shortDate }}</span>
                <button
                  class="icon-action"
                  type="button"
                  aria-label="Próximo dia"
                  @click="shiftDate(1)"
                >
                  <ChevronRight :size="18" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div class="schedule-controls">
              <label class="search-control">
                <Search :size="17" aria-hidden="true" />
                <span class="visually-hidden">Pesquisar paciente por nome, telefone ou CPF</span>
                <input
                  v-model="search"
                  type="search"
                  placeholder="Buscar por nome, telefone ou CPF..."
                />
              </label>
              <label class="filter-control">
                <Stethoscope :size="16" aria-hidden="true" />
                <span class="visually-hidden">Filtrar por dentista</span>
                <select v-model="dentistFilter">
                  <option value="">Todos os dentistas</option>
                  <option v-for="dentist in dentists" :key="dentist.id" :value="dentist.id">
                    {{ dentist.name }}
                  </option>
                </select>
              </label>
              <label class="filter-control">
                <ListFilter :size="16" aria-hidden="true" />
                <span class="visually-hidden">Filtrar por status</span>
                <select v-model="statusFilter">
                  <option value="">Todos os status</option>
                  <option v-for="status in statuses" :key="status" :value="status">
                    {{ status }}
                  </option>
                </select>
              </label>
              <div class="view-toggle" role="group" aria-label="Visualização da agenda">
                <button
                  :class="{ 'is-selected': viewMode === 'list' }"
                  type="button"
                  :aria-pressed="viewMode === 'list'"
                  @click="viewMode = 'list'"
                >
                  Lista
                </button>
                <button
                  :class="{ 'is-selected': viewMode === 'summary' }"
                  type="button"
                  :aria-pressed="viewMode === 'summary'"
                  @click="viewMode = 'summary'"
                >
                  Resumo do dia
                </button>
              </div>
            </div>

            <div v-if="dashboardState === 'loading'" class="schedule-message" role="status">
              <Clock3 :size="20" aria-hidden="true" />
              <div>
                <strong>Carregando agenda</strong>
                <p>Buscando os registros do dia.</p>
              </div>
            </div>
            <div v-else-if="dashboardState === 'error'" class="schedule-message" role="alert">
              <CircleAlert :size="20" aria-hidden="true" />
              <div>
                <strong>Não foi possível carregar a agenda</strong>
                <p>{{ dashboardError }}</p>
              </div>
              <button class="text-button" type="button" @click="loadDashboard">Tentar novamente</button>
            </div>
            <div v-else-if="viewMode === 'summary'" class="schedule-message">
              <CalendarDays :size="20" aria-hidden="true" />
              <div>
                <strong>{{ dashboardMetrics.total_appointments }} consultas nesta data</strong>
                <p>Use a lista para abrir detalhes e atualizar os atendimentos.</p>
              </div>
              <button class="text-button" type="button" @click="viewMode = 'list'">
                Ver lista
              </button>
            </div>

            <div v-else-if="visibleAppointments.length" class="appointment-list">
              <article
                v-for="appointment in visibleAppointments"
                :key="appointment.id"
                class="appointment-row"
              >
                <div class="appointment-time">
                  <strong>{{ appointment.time }}</strong>
                  <span>{{ appointment.duration || 30 }} min</span>
                </div>
                <div class="appointment-person">
                  <UiAvatar
                    :name="appointment.patientName"
                    size="sm"
                  />
                  <div>
                    <strong>{{ appointment.patientName }}</strong>
                    <span>{{ appointment.patientPhone || 'Contato não informado' }}</span>
                  </div>
                </div>
                <div class="appointment-detail">
                  <strong>{{ appointment.dentist }}</strong>
                  <span>{{ appointment.procedure }}</span>
                </div>
                <div class="appointment-status">
                  <UiBadge
                    :variant="
                      appointment.confirmation === 'Confirmada'
                        ? 'success'
                        : appointment.confirmation === 'Cancelada'
                          ? 'danger'
                          : 'warning'
                    "
                  >
                    {{ appointment.confirmation }}
                  </UiBadge>
                  <UiBadge :variant="statusVariant(appointment.status)">{{
                    appointment.status
                  }}</UiBadge>
                </div>
                <div class="appointment-actions">
                  <button
                    class="icon-action"
                    type="button"
                    :aria-label="`Ações da consulta de ${appointment.patientName}`"
                    :aria-expanded="openActionMenuId === appointment.id"
                    :aria-controls="`appointment-actions-${appointment.id}`"
                    @click="toggleActionMenu(appointment)"
                  >
                    <Ellipsis :size="19" aria-hidden="true" />
                  </button>
                  <div
                    :id="`appointment-actions-${appointment.id}`"
                    class="action-menu"
                    :class="{ 'action-menu--open': openActionMenuId === appointment.id }"
                  >
                    <button type="button" @click="showDetails(appointment)">
                      <Search :size="15" aria-hidden="true" /> Ver detalhes
                    </button>
                    <button
                      v-if="appointment.confirmation === 'Pendente'"
                      type="button"
                      @click="confirmAppointment(appointment)"
                    >
                      <Check :size="15" /> Confirmar
                    </button>
                    <button
                      v-if="
                        ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(
                          appointment.status,
                        )
                      "
                      type="button"
                      @click="checkIn(appointment)"
                    >
                      <UserRoundCheck :size="15" /> Registrar chegada
                    </button>
                    <button
                      v-if="appointment.status === 'Em espera'"
                      type="button"
                      @click="startAppointment(appointment)"
                    >
                      <Stethoscope :size="15" /> Encaminhar
                    </button>
                    <button
                      v-if="
                        ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(
                          appointment.status,
                        )
                      "
                      type="button"
                      @click="markNoShow(appointment)"
                    >
                      <XCircle :size="15" /> Não compareceu
                    </button>
                    <button
                      v-if="
                        ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(
                          appointment.status,
                        )
                      "
                      type="button"
                      @click="openRescheduleDialog(appointment)"
                    >
                      <CalendarDays :size="15" aria-hidden="true" /> Reagendar
                    </button>
                    <button
                      v-if="
                        !['Cancelada', 'Concluída', 'Não compareceu'].includes(appointment.status)
                      "
                      type="button"
                      class="action-menu__danger"
                      @click="requestCancellation(appointment)"
                    >
                      <X :size="15" /> Cancelar
                    </button>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="empty-schedule">
              <span><CalendarDays :size="22" aria-hidden="true" /></span>
              <strong>Nenhuma consulta encontrada</strong>
              <p>Ajuste os filtros ou escolha outra data para consultar a agenda.</p>
              <UiButton size="sm" @click="openAppointmentDialog">Criar agendamento</UiButton>
            </div>

            <footer class="schedule-footer">
              <span
                >{{ visibleAppointments.length }} de
                {{ dashboardMetrics.total_appointments }} consultas</span
              >
              <span>Ordenadas por horário</span>
            </footer>
          </section>

          <section id="patient-list" class="panel patients-panel" aria-labelledby="patients-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">CADASTROS</p>
                <h2 id="patients-title">Pacientes recentes</h2>
              </div>
              <button class="text-button" type="button" @click="openPatientDialog">
                + Novo paciente
              </button>
            </div>
            <div v-if="dashboardState === 'loading'" class="side-empty" role="status">
              <Clock3 :size="20" aria-hidden="true" />
              <p>Carregando pacientes recentes...</p>
            </div>
            <div v-else-if="dashboardState === 'error'" class="side-empty" role="alert">
              <CircleAlert :size="20" aria-hidden="true" />
              <p>{{ dashboardError }}</p>
            </div>
            <div v-else-if="recentPatients.length" class="patient-list">
              <div
                v-for="patient in recentPatients"
                :key="patient.id"
                class="patient-list__item"
              >
                <UiAvatar :name="patient.name" size="sm" />
                <div class="patient-list__info">
                  <strong>{{ patient.name }}</strong>
                  <span>{{ patient.phone || patient.email || 'Sem contato informado' }}</span>
                </div>
                <span class="patient-list__access">Dados administrativos</span>
              </div>
            </div>
            <div v-else class="side-empty">
              <Users :size="20" aria-hidden="true" />
              <p>Nenhum paciente cadastrado nesta clínica.</p>
            </div>
          </section>
        </div>

        <aside class="side-column">
          <section id="checkin" class="panel side-panel" aria-labelledby="waiting-title">
            <div class="panel-heading panel-heading--compact">
              <div>
                <p class="section-kicker">ACOMPANHAMENTO</p>
                <h2 id="waiting-title">Sala de espera</h2>
              </div>
              <span class="count-pill">{{ waitingAppointments.length }}</span>
            </div>
            <div v-if="waitingAppointments.length" class="waiting-list">
              <article
                v-for="appointment in waitingAppointments"
                :key="appointment.id"
                class="waiting-item"
              >
                <div class="waiting-item__top">
                  <UiAvatar
                    :name="appointment.patientName"
                    size="sm"
                  />
                  <div>
                    <strong>{{ appointment.patientName }}</strong>
                    <span>{{ appointment.time }} · {{ appointment.dentist }}</span>
                  </div>
                </div>
                <div class="waiting-item__status">
                  <UiBadge :variant="appointment.status === 'Em espera' ? 'warning' : 'info'">{{
                    appointment.status
                  }}</UiBadge>
                  <span v-if="appointment.arrival"
                    >Chegou às {{ appointment.arrival }} · {{ waitDuration(appointment) }}</span
                  >
                  <button v-else class="text-button" type="button" @click="checkIn(appointment)">
                    Registrar chegada
                  </button>
                </div>
                <UiBadge v-if="isOverdue(appointment)" variant="warning">Atrasado</UiBadge>
                <UiButton
                  v-if="appointment.status === 'Em espera'"
                  variant="secondary"
                  size="sm"
                  @click="startAppointment(appointment)"
                  >Encaminhar atendimento</UiButton
                >
              </article>
            </div>
            <div v-else class="side-empty">
              <UserRoundCheck :size="20" aria-hidden="true" />
              <p>Ninguém aguardando no momento.</p>
            </div>
          </section>

          <section id="confirmations" class="panel side-panel" aria-labelledby="confirm-title">
            <div class="panel-heading panel-heading--compact">
              <div>
                <p class="section-kicker">CONTATO COM PACIENTES</p>
                <h2 id="confirm-title">Confirmações</h2>
              </div>
              <span class="count-pill count-pill--amber">{{ pendingConfirmations.length }}</span>
            </div>
            <div v-if="pendingConfirmations.length" class="confirmation-list">
              <article
                v-for="appointment in pendingConfirmations"
                :key="appointment.id"
                class="confirmation-item"
              >
                <div>
                  <strong>{{ appointment.patientName }}</strong>
                  <span>{{ appointment.time }} · {{ appointment.procedure }}</span>
                </div>
                <a
                  v-if="appointment.patientPhone"
                  class="contact-link"
                  :href="`tel:${appointment.patientPhone.replace(/\\D/g, '')}`"
                  :aria-label="`Ligar para ${appointment.patientName}`"
                >
                  <UserRound :size="15" aria-hidden="true" />
                  {{ appointment.patientPhone }}
                </a>
                <UiButton variant="secondary" size="sm" @click="confirmAppointment(appointment)">
                  <template #start><Check :size="15" aria-hidden="true" /></template>
                  Registrar confirmação
                </UiButton>
              </article>
            </div>
            <div v-else class="side-empty">
              <CheckCheck :size="20" aria-hidden="true" />
              <p>Não há confirmações pendentes nesta data.</p>
            </div>
          </section>

          <section id="history" class="panel access-panel">
            <div class="access-panel__icon"><FileClock :size="18" aria-hidden="true" /></div>
            <div>
              <strong>Histórico de consultas</strong>
              <p>Consulte registros administrativos sem acessar informações clínicas.</p>
            </div>
            <button class="text-button" type="button" @click="showHistory">Ver concluídas</button>
          </section>
        </aside>
      </section>

      <footer class="reception-footer">
        <span
          ><ShieldCheck :size="14" aria-hidden="true" /> Acesso restrito a dados administrativos da
          recepção.</span
        >
        <span>Zen · Gestão odontológica</span>
      </footer>
    </main>

    <UiDialog v-model="patientDialogOpen" title="Novo paciente">
      <form ref="patientForm" class="dialog-form" @submit.prevent="savePatient">
        <p class="form-notice">Os dados serão salvos com segurança no cadastro da clínica.</p>
        <div class="dialog-form__grid">
          <UiFormField
            label="Nome completo"
            required
            :error="
              attemptedPatientSubmit && !newPatient.name.trim() ? 'Informe o nome completo.' : ''
            "
          >
            <template #default="{ id, describedBy, invalid, required }">
              <UiInput
                :id="id"
                v-model="newPatient.name"
                autocomplete="name"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
              />
            </template>
          </UiFormField>
          <UiFormField
            label="CPF"
            hint="Opcional, conforme a política da clínica"
            :error="
              attemptedPatientSubmit && newPatient.cpf && !isValidCpf(newPatient.cpf)
                ? 'Confira o CPF informado.'
                : ''
            "
          >
            <template #default="{ id, describedBy, invalid }">
              <UiInput
                :id="id"
                v-model="newPatient.cpf"
                inputmode="numeric"
                autocomplete="off"
                :aria-describedby="describedBy"
                :invalid="invalid"
              />
            </template>
          </UiFormField>
          <UiFormField label="Data de nascimento">
            <template #default="{ id }"
              ><UiInput :id="id" v-model="newPatient.birthDate" type="date"
            /></template>
          </UiFormField>
          <UiFormField
            label="Telefone"
            required
            :error="
              attemptedPatientSubmit && !/^\d{10,13}$/.test(newPatient.phone.replace(/\D/g, ''))
                ? 'Informe um telefone válido com DDD.'
                : ''
            "
          >
            <template #default="{ id, describedBy, invalid, required }">
              <UiInput
                :id="id"
                v-model="newPatient.phone"
                type="tel"
                autocomplete="tel"
                placeholder="(00) 00000-0000"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
              />
            </template>
          </UiFormField>
          <UiFormField label="E-mail">
            <template #default="{ id, describedBy, invalid }"
              ><UiInput
                :id="id"
                v-model="newPatient.email"
                type="email"
                autocomplete="email"
                :aria-describedby="describedBy"
                :invalid="invalid"
            /></template>
          </UiFormField>
          <UiFormField label="Endereço">
            <template #default="{ id }"
              ><UiInput :id="id" v-model="newPatient.address" autocomplete="street-address"
            /></template>
          </UiFormField>
        </div>
        <UiFormField label="Observações administrativas">
          <template #default="{ id }"
            ><UiTextarea :id="id" v-model="newPatient.notes" :rows="2"
          /></template>
        </UiFormField>
        <label class="consent-control">
          <input v-model="newPatient.consent" type="checkbox" required />
          <span
            >Confirmo que tenho autorização para registrar estes dados para fins
            administrativos.</span
          >
        </label>
        <p v-if="attemptedPatientSubmit && !newPatient.consent" class="field__error" role="alert">
          Confirme a autorização para registrar os dados.
        </p>
        <div class="dialog-actions">
          <UiButton variant="secondary" @click="patientDialogOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="mutationLoading">Salvar paciente</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog
      v-model="appointmentDialogOpen"
      :title="editingAppointmentId ? 'Reagendar consulta' : 'Novo agendamento'"
    >
      <form ref="appointmentForm" class="dialog-form" @submit.prevent="saveAppointment">
        <p class="form-notice">
          Os horários são consultados na agenda da clínica. A disponibilidade depende do cadastro
          de expediente e profissionais.
        </p>
        <div class="dialog-form__grid">
          <UiFormField label="Buscar paciente" hint="Nome, telefone ou CPF">
            <template #default="{ id }">
              <UiInput
                :id="id"
                v-model="patientSearch"
                type="search"
                autocomplete="off"
                placeholder="Pesquisar pacientes..."
              />
            </template>
          </UiFormField>
          <UiFormField label="Paciente" required>
            <template #default="{ id, describedBy, invalid, required }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.patientId"
                :options="patientOptions"
                placeholder="Selecione um paciente"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
                :disabled="patientsState === 'loading' || patientsState === 'refreshing' || patients.length === 0"
            /></template>
          </UiFormField>
          <UiFormField label="Dentista" required>
            <template #default="{ id, describedBy, invalid, required }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.dentist"
                :options="dentistOptions"
                placeholder="Selecione um dentista"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
                :disabled="dentists.length === 0"
            /></template>
          </UiFormField>
          <UiFormField label="Data" required>
            <template #default="{ id, describedBy, invalid, required }"
              ><UiInput
                :id="id"
                v-model="newAppointment.date"
                type="date"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
            /></template>
          </UiFormField>
          <UiFormField label="Horário disponível" required>
            <template #default="{ id, describedBy, invalid, required }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.time"
                :options="timeOptions"
                placeholder="Selecione um horário"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
                :disabled="
                  availabilityLoading ||
                  !newAppointment.dentist ||
                  Boolean(availabilityError) ||
                  availableTimes.length === 0
                "
            /></template>
          </UiFormField>
          <UiFormField label="Procedimento" required>
            <template #default="{ id, describedBy, invalid, required }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.procedure"
                :options="procedureOptions"
                placeholder="Selecione"
                required
                :aria-required="required"
                :aria-describedby="describedBy"
                :invalid="invalid"
            /></template>
          </UiFormField>
          <UiFormField label="Duração prevista">
            <template #default="{ id }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.duration"
                :options="[
                  { value: '30', label: '30 minutos' },
                  { value: '45', label: '45 minutos' },
                  { value: '60', label: '1 hora' },
                ]"
            /></template>
          </UiFormField>
        </div>
        <p v-if="availabilityLoading" class="form-notice" role="status">
          Consultando horários disponíveis...
        </p>
        <p
          v-if="patientsState === 'loading' || patientsState === 'refreshing'"
          class="form-notice"
          role="status"
        >
          Pesquisando pacientes...
        </p>
        <p v-else-if="availabilityError" class="field__error" role="alert">
          {{ availabilityError }}
        </p>
        <p v-else-if="newAppointment.dentist && availableTimes.length === 0" class="form-notice">
          Não há horários disponíveis para os critérios selecionados.
        </p>
        <p v-if="dentists.length === 0" class="form-notice">
          Nenhum dentista ativo foi cadastrado para esta clínica.
        </p>
        <p v-if="patients.length === 0" class="form-notice">
          {{
            patientSearch
              ? 'Nenhum paciente corresponde à pesquisa.'
              : 'Cadastre um paciente antes de criar o agendamento.'
          }}
        </p>
        <p v-if="patientsState === 'error'" class="field__error" role="alert">
          {{ patientsError }}
          <button class="text-button" type="button" @click="loadPatients(patientSearch)">
            Tentar novamente
          </button>
        </p>
        <UiFormField label="Observações administrativas">
          <template #default="{ id }"
            ><UiTextarea :id="id" v-model="newAppointment.notes" :rows="2"
          /></template>
        </UiFormField>
        <div class="dialog-form__grid dialog-form__grid--single">
          <UiFormField label="Canal de confirmação">
            <template #default="{ id }"
              ><UiSelect
                :id="id"
                v-model="newAppointment.contact"
                :options="[
                  { value: 'Telefone', label: 'Telefone' },
                  { value: 'E-mail', label: 'E-mail' },
                  { value: 'WhatsApp', label: 'WhatsApp (não integrado)' },
                ]"
            /></template>
          </UiFormField>
        </div>
        <div class="dialog-actions">
          <UiButton variant="secondary" @click="appointmentDialogOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="mutationLoading || availabilityLoading">
            {{ editingAppointmentId ? 'Confirmar reagendamento' : 'Salvar agendamento' }}
          </UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="detailsDialogOpen" title="Detalhes do agendamento">
      <div v-if="selectedAppointment && selectedPatient" class="details-content">
        <div class="details-content__person">
          <UiAvatar :name="selectedPatient.name" size="lg" />
          <div>
            <strong>{{ selectedPatient.name }}</strong
            ><span>{{ selectedPatient.phone }}</span>
          </div>
        </div>
        <dl class="details-grid">
          <div>
            <dt>Data e horário</dt>
            <dd>{{ formattedDate }} · {{ selectedAppointment.time }}</dd>
          </div>
          <div>
            <dt>Dentista</dt>
            <dd>{{ selectedAppointment.dentist }}</dd>
          </div>
          <div>
            <dt>Procedimento</dt>
            <dd>{{ selectedAppointment.procedure }}</dd>
          </div>
          <div>
            <dt>Confirmação</dt>
            <dd>{{ selectedAppointment.confirmation }}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{{ selectedAppointment.status }}</dd>
          </div>
        </dl>
        <p class="form-notice">Detalhes clínicos não são exibidos no perfil de recepção.</p>
      </div>
    </UiDialog>

    <UiDialog v-model="cancelDialogOpen" title="Cancelar agendamento?">
      <p class="cancel-copy">
        O cancelamento será salvo na agenda. O sistema ainda não envia notificações ao paciente.
      </p>
      <template #footer>
        <UiButton variant="secondary" @click="cancelDialogOpen = false"
          >Manter agendamento</UiButton
        >
        <UiButton variant="danger" @click="cancelAppointment">Confirmar cancelamento</UiButton>
      </template>
    </UiDialog>

    <UiToast
      :key="toastKey"
      v-model="toastVisible"
      :message="toastMessage"
      :variant="toastVariant"
    />
  </div>
</template>

<style scoped>
.reception {
  min-height: 100vh;
  background: var(--color-background);
}

.icon-action {
  position: relative;
  display: inline-grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.icon-action:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.notification-dot {
  position: absolute;
  top: 0.4rem;
  right: 0.42rem;
  width: 0.45rem;
  height: 0.45rem;
  border: 1px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-danger);
}

.action-menu button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-size: var(--font-size-sm);
  text-align: left;
}

.action-menu button:hover {
  background: var(--color-background);
}

.reception-main {
  width: min(100% - 2 * clamp(var(--space-4), 4vw, var(--space-10)), 90rem);
  margin-inline: auto;
  padding-block: var(--space-6) var(--space-8);
}

.api-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-blue-50);
  color: var(--color-blue-900);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-heading);
}

.api-notice svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--color-primary);
}

.page-intro,
.page-intro__actions,
.panel-heading,
.date-controls,
.schedule-controls,
.appointment-row,
.appointment-person,
.appointment-status,
.appointment-actions,
.waiting-item__top,
.waiting-item__status,
.patient-list__item,
.patient-list__info,
.reception-footer,
.dialog-actions {
  display: flex;
  align-items: center;
}

.page-intro {
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
}

.page-eyebrow,
.section-kicker {
  margin: 0 0 var(--space-1);
  color: var(--color-primary);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
}

.page-intro h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.5rem, 2.5vw, 1.875rem);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
}

.page-greeting {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.page-intro__actions {
  gap: var(--space-2);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.metric-card,
.panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.metric-card {
  position: relative;
  display: grid;
  min-height: 7.5rem;
  grid-template-columns: auto 1fr;
  align-content: center;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.metric-card__icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border-radius: var(--radius-md);
}

.metric-card__icon--blue {
  background: var(--color-blue-50);
  color: var(--color-primary);
}
.metric-card__icon--green {
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
}
.metric-card__icon--amber {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}
.metric-card__icon--violet {
  background: var(--color-violet-subtle);
  color: var(--color-violet);
}
.metric-card__icon--red {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.metric-card p {
  margin: 0 0 var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-heading);
}

.metric-card strong {
  font-family: var(--font-heading);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  line-height: 1.15;
}

.metric-card__caption {
  grid-column: 2;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(17rem, 0.8fr);
  align-items: start;
  gap: var(--space-5);
}

.main-column,
.side-column {
  display: grid;
  min-width: 0;
  gap: var(--space-5);
}

.panel {
  min-width: 0;
  padding: var(--space-5);
}

.panel-heading {
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.panel-heading h2 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-heading);
}

.panel-heading--compact {
  margin-bottom: var(--space-3);
}

.section-kicker {
  font-size: 0.625rem;
}

.date-controls {
  gap: var(--space-1);
}

.date-controls .icon-action {
  width: 2.25rem;
  height: 2.25rem;
}

.date-readable {
  min-width: 3.8rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-align: center;
  text-transform: capitalize;
}

.schedule-controls {
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.search-control,
.filter-control {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.search-control {
  min-width: min(14rem, 100%);
  flex: 1 1 10rem;
}

.search-control input,
.filter-control select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.search-control input::placeholder {
  color: var(--color-text-muted);
}

.filter-control {
  flex: 0 1 10rem;
}

.filter-control select {
  appearance: none;
  cursor: pointer;
}

.view-toggle {
  display: flex;
  min-height: 2.5rem;
  gap: 2px;
  margin-left: auto;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.view-toggle button {
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-xs);
}

.view-toggle button.is-selected {
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
}

.appointment-list {
  display: grid;
}

.appointment-row {
  position: relative;
  min-height: 4.75rem;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-1);
  border-top: 1px solid var(--color-gray-100);
}

.appointment-time {
  display: grid;
  width: 3.35rem;
  flex: 0 0 auto;
  gap: 2px;
}

.appointment-time strong,
.appointment-person strong,
.appointment-detail strong,
.waiting-item strong,
.confirmation-item strong,
.patient-list__info strong {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.appointment-time span,
.appointment-person span,
.appointment-detail span,
.waiting-item__top span,
.patient-list__info span,
.confirmation-item span {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.45;
}

.appointment-time strong {
  color: var(--color-primary);
  font-size: var(--font-size-sm);
}

.appointment-person {
  min-width: 9rem;
  flex: 1.1 1 10rem;
  gap: var(--space-2);
}

.appointment-person > div,
.appointment-detail {
  min-width: 0;
}

.appointment-person strong,
.appointment-detail strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.appointment-detail {
  flex: 0.9 1 8rem;
}

.appointment-status {
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
}

.appointment-status :deep(.badge) {
  max-width: 8.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.appointment-actions {
  position: relative;
}

.appointment-actions > .icon-action {
  width: 2rem;
  height: 2rem;
  border-color: transparent;
}

.action-menu {
  position: absolute;
  z-index: var(--z-dropdown);
  top: 100%;
  right: 0;
  display: none;
  width: max-content;
  max-width: min(17rem, 80vw);
  flex-direction: column;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.appointment-actions:focus-within .action-menu,
.appointment-actions:hover .action-menu {
  display: flex;
}

.action-menu--open {
  display: flex;
}

.action-menu__danger {
  color: var(--color-danger) !important;
}

.empty-schedule,
.side-empty {
  display: grid;
  justify-items: center;
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-schedule > span {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  margin-bottom: var(--space-3);
  border-radius: 50%;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.empty-schedule strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.empty-schedule p,
.side-empty p {
  margin: var(--space-1) 0 var(--space-3);
  font-size: var(--font-size-xs);
}

.schedule-footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-gray-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.schedule-message {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.schedule-message > svg {
  color: var(--color-primary);
}

.schedule-message strong {
  font-size: var(--font-size-sm);
}

.schedule-message p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.text-button:hover {
  text-decoration: underline;
}

.patients-panel .panel-heading {
  margin-bottom: var(--space-2);
}

.patient-list__item {
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-gray-100);
}

.patient-list__info {
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
}

.patient-list__info strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patient-list__access {
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

.count-pill {
  display: grid;
  min-width: 1.6rem;
  height: 1.6rem;
  place-items: center;
  padding-inline: var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.count-pill--amber {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.waiting-list,
.confirmation-list {
  display: grid;
}

.waiting-item,
.confirmation-item {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-gray-100);
}

.waiting-item__top {
  gap: var(--space-2);
}

.waiting-item__top > div {
  min-width: 0;
}

.waiting-item__top strong,
.confirmation-item strong {
  display: block;
}

.waiting-item__status {
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

.confirmation-item > div:first-child {
  display: grid;
  gap: 2px;
}

.contact-link {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.contact-link:hover {
  color: var(--color-primary);
}

.side-empty {
  gap: var(--space-2);
  padding: var(--space-5) var(--space-3);
}

.side-empty svg {
  color: var(--color-text-muted);
}

.side-empty p {
  margin: 0;
}

.access-panel {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: var(--space-3);
  background: var(--color-blue-50);
}

.access-panel__icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-primary);
}

.access-panel strong {
  font-size: var(--font-size-sm);
}

.access-panel p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.access-panel > .text-button {
  grid-column: 2;
  justify-self: start;
}

.reception-footer {
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.reception-footer > span:first-child {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.reception-footer svg {
  color: var(--color-success);
}

.dialog-form {
  display: grid;
  gap: var(--space-4);
}

.form-notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.dialog-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.dialog-form__grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.consent-control {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.consent-control input {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  margin: 2px 0 0;
  accent-color: var(--color-primary);
}

.dialog-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.details-content {
  display: grid;
  gap: var(--space-5);
}

.details-content__person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.details-content__person strong,
.details-content__person span {
  display: block;
}

.details-content__person span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
}

.details-grid dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.details-grid dd {
  margin: var(--space-1) 0 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.cancel-copy {
  margin: 0;
  color: var(--color-text-secondary);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 75rem) {
  .metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workspace-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 0.8fr);
  }

  .appointment-row {
    flex-wrap: wrap;
  }

  .appointment-status {
    margin-left: 3.5rem;
  }
}

@media (max-width: 56.25rem) {
  .workspace-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .side-column {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .access-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 42.5rem) {
  .reception-main {
    width: calc(100% - 2 * var(--space-3));
    padding-block: var(--space-4);
  }

  .api-notice {
    margin-bottom: var(--space-4);
    padding: var(--space-3);
    font-size: var(--font-size-xs);
  }

  .page-intro {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .page-intro__actions {
    width: 100%;
  }

  .page-intro__actions :deep(.button) {
    min-width: 0;
    flex: 1;
    padding-inline: var(--space-2);
    font-size: var(--font-size-xs);
  }

  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .metric-card {
    min-height: 6.5rem;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .metric-card__icon {
    width: 2rem;
    height: 2rem;
  }

  .metric-card p {
    font-size: 0.6875rem;
  }

  .metric-card strong {
    font-size: var(--font-size-xl);
  }

  .metric-card__caption {
    font-size: 0.625rem;
  }

  .main-column,
  .side-column {
    gap: var(--space-3);
  }

  .panel {
    padding: var(--space-4) var(--space-3);
  }

  .panel-heading {
    align-items: flex-start;
  }

  .schedule-controls {
    align-items: stretch;
  }

  .search-control {
    flex-basis: 100%;
  }

  .filter-control {
    min-width: 0;
    flex: 1 1 40%;
  }

  .view-toggle {
    width: 100%;
    margin-left: 0;
  }

  .view-toggle button {
    flex: 1;
  }

  .appointment-row {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
    padding-block: var(--space-3);
  }

  .appointment-person {
    min-width: 0;
  }

  .appointment-detail {
    grid-column: 2;
    padding-left: 2.5rem;
  }

  .appointment-status {
    grid-column: 2;
    flex-direction: row;
    flex-wrap: wrap;
    margin-left: 0;
    padding-left: 2.5rem;
  }

  .appointment-actions {
    grid-column: 3;
    grid-row: 1;
  }

  .appointment-actions > .icon-action {
    width: 2.5rem;
    height: 2.5rem;
  }

  .patient-list__access {
    display: none;
  }

  .side-column {
    grid-template-columns: minmax(0, 1fr);
  }

  .access-panel {
    grid-column: auto;
  }

  .reception-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-4);
  }

  .dialog-form__grid,
  .details-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .dialog-actions {
    position: sticky;
    bottom: 0;
    padding-top: var(--space-2);
    background: var(--color-surface);
  }

  .dialog-actions :deep(.button) {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
