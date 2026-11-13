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
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  XCircle,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  createReceptionAppointment,
  getAvailableTimes,
  getReceptionAppointments,
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
const selectedDate = ref(toDateInput(today))
const viewMode = ref('day')
const appointments = ref([])
const dentists = ref([])
const patients = ref([])
const state = ref('loading')
const errorMessage = ref('')
const appointmentDialogOpen = ref(false)
const detailsDialogOpen = ref(false)
const cancelDialogOpen = ref(false)
const selectedAppointment = ref(null)
const formElement = ref(null)
const isSaving = ref(false)
const availabilityLoading = ref(false)
const availabilityError = ref('')
const availability = ref([])
const cancelReason = ref('')
const filterSearch = ref('')
const filterDentist = ref('')
const filterProcedure = ref('')
const filterStatus = ref('')
const filterPeriod = ref('')
const appliedFilters = ref({
  search: '',
  dentist: '',
  procedure: '',
  status: '',
  period: '',
})
const page = ref(1)
const pageSize = 8
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)

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
const procedures = ['Avaliação', 'Limpeza', 'Retorno', 'Restauração', 'Urgência']
const form = ref(emptyAppointment(selectedDate.value))
const dentistOptions = computed(() =>
  dentists.value.map((dentist) => ({ value: String(dentist.id), label: dentist.name })),
)
const patientOptions = computed(() =>
  patients.value.map((patient) => ({ value: String(patient.id), label: patient.name })),
)
const timeOptions = computed(() => availability.value.map((time) => ({ value: time, label: time })))
const procedureOptions = procedures.map((procedure) => ({
  value: procedure,
  label: procedure,
}))
const formattedDate = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fromDateInput(selectedDate.value)),
)
const dateReadable = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(fromDateInput(selectedDate.value))
    .replace('.', ''),
)
const rangeDates = computed(() => {
  const anchor = fromDateInput(selectedDate.value)
  if (viewMode.value === 'day') return [selectedDate.value]
  if (viewMode.value === 'week') {
    const monday = new Date(anchor)
    monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      return toDateInput(date)
    })
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  return Array.from({ length: last.getDate() }, (_, index) =>
    toDateInput(new Date(first.getFullYear(), first.getMonth(), index + 1)),
  )
})
const calendarDates = computed(() => {
  if (viewMode.value !== 'month') return rangeDates.value
  const first = fromDateInput(rangeDates.value[0])
  const mondayOffset = (first.getDay() + 6) % 7
  return [
    ...Array.from({ length: mondayOffset }, () => ''),
    ...rangeDates.value,
  ]
})
const filteredAppointments = computed(() => {
  const filters = appliedFilters.value
  return [...appointments.value]
    .filter((item) => !filters.dentist || String(item.dentist_id) === filters.dentist)
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.procedure || item.procedure === filters.procedure)
    .filter((item) => {
      if (!filters.period) return true
      const hour = Number(item.time.slice(0, 2))
      return filters.period === 'morning'
        ? hour < 12
        : filters.period === 'afternoon'
          ? hour >= 12 && hour < 18
          : hour >= 18
    })
    .sort((a, b) =>
      `${a.appointment_date} ${a.time}`.localeCompare(`${b.appointment_date} ${b.time}`),
    )
})
const paginatedAppointments = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredAppointments.value.slice(start, start + pageSize)
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredAppointments.value.length / pageSize)))
const visibleCalendarDates = computed(() =>
  viewMode.value === 'month'
    ? calendarDates.value
    : rangeDates.value,
)
const groupedAppointments = computed(() =>
  rangeDates.value.map((date) => ({
    date,
    items: filteredAppointments.value.filter((item) => item.appointment_date === date),
  })),
)
const metrics = computed(() => [
  {
    label: 'Consultas',
    value: filteredAppointments.value.length,
    icon: CalendarDays,
    tone: 'blue',
  },
  {
    label: 'Confirmadas',
    value: filteredAppointments.value.filter((item) => item.confirmation_status === 'Confirmada')
      .length,
    icon: CheckCheck,
    tone: 'green',
  },
  {
    label: 'Aguardando confirmação',
    value: filteredAppointments.value.filter(
      (item) => item.confirmation_status === 'Pendente' && item.status !== 'Cancelada',
    ).length,
    icon: CircleAlert,
    tone: 'amber',
  },
  {
    label: 'Em espera',
    value: filteredAppointments.value.filter((item) => item.status === 'Em espera').length,
    icon: Clock3,
    tone: 'violet',
  },
  {
    label: 'Cancelamentos',
    value: filteredAppointments.value.filter((item) => item.status === 'Cancelada').length,
    icon: XCircle,
    tone: 'red',
  },
])
const periodTitle = computed(() => {
  if (viewMode.value === 'month') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      fromDateInput(selectedDate.value),
    )
  }
  if (viewMode.value === 'week') {
    const first = fromDateInput(rangeDates.value[0])
    const last = fromDateInput(rangeDates.value[6])
    const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    return `${formatter.format(first)} – ${formatter.format(last)}`
  }
  return selectedDate.value === toDateInput(today) ? 'Agenda de hoje' : 'Agenda do dia'
})
const dailyHourRange = computed(() => {
  const times = filteredAppointments.value
    .filter((item) => item.appointment_date === selectedDate.value)
    .map((item) => Number(item.time.slice(0, 2)))
  if (!times.length) return Array.from({ length: 10 }, (_, index) => index + 8)
  const start = Math.max(0, Math.min(...times))
  const end = Math.min(23, Math.max(...times) + 1)
  return Array.from({ length: Math.max(1, end - start + 1) }, (_, index) => start + index)
})

let requestId = 0
let availabilityRequestId = 0
let availabilityTimer
let pendingMutation = false

function toDateInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function fromDateInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function emptyAppointment(date) {
  return {
    patientId: '',
    dentistId: '',
    date,
    time: '',
    duration: '30',
    procedure: '',
    notes: '',
    contact: 'Telefone',
  }
}

function shiftPeriod(direction) {
  const date = fromDateInput(selectedDate.value)
  if (viewMode.value === 'week') date.setDate(date.getDate() + direction * 7)
  else if (viewMode.value === 'month') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + direction)
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()))
  }
  else date.setDate(date.getDate() + direction)
  selectedDate.value = toDateInput(date)
}

function mapAppointment(item) {
  return {
    ...item,
    time: item.appointment_time.slice(0, 5),
    duration: item.duration_minutes,
  }
}

function endTime(item) {
  const [hours, minutes] = item.time.split(':').map(Number)
  const end = hours * 60 + minutes + item.duration_minutes
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

function dayAppointments(date) {
  return filteredAppointments.value.filter((item) => item.appointment_date === date)
}

function dateLabel(date, options = { weekday: 'short', day: '2-digit' }) {
  return new Intl.DateTimeFormat('pt-BR', options).format(fromDateInput(date))
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function loadAppointments() {
  const id = ++requestId
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getReceptionAppointments({
      date: rangeDates.value[0],
      date_to: rangeDates.value[rangeDates.value.length - 1],
      q:
        appliedFilters.value.search.trim() ||
        (typeof route.query.appointmentId === 'string'
          ? route.query.appointmentId
          : typeof route.query.editAppointmentId === 'string'
            ? route.query.editAppointmentId
            : undefined),
      dentist_id: appliedFilters.value.dentist
        ? Number(appliedFilters.value.dentist)
        : undefined,
      status: appliedFilters.value.status || undefined,
    })
    if (id !== requestId) return
    appointments.value = response.items.map(mapAppointment)
    state.value = 'ready'
    page.value = 1
    const requestedAppointmentId = route.query.appointmentId
    if (typeof requestedAppointmentId === 'string' && /^\d+$/.test(requestedAppointmentId)) {
      const appointment = appointments.value.find(
        (item) => item.id === Number(requestedAppointmentId),
      )
      if (appointment) showDetails(appointment)
      const query = { ...route.query }
      delete query.appointmentId
      void router.replace({ name: 'reception-agenda', query })
    }
    const requestedEditId = route.query.editAppointmentId
    if (typeof requestedEditId === 'string' && /^\d+$/.test(requestedEditId)) {
      const appointment = appointments.value.find((item) => item.id === Number(requestedEditId))
      if (appointment) openCreateDialog(appointment)
      const query = { ...route.query }
      delete query.editAppointmentId
      void router.replace({ name: 'reception-agenda', query })
    }
  } catch (error) {
    if (id !== requestId) return
    state.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar a agenda.')
    showToast(errorMessage.value, 'danger')
  }
}

async function loadDentists() {
  try {
    dentists.value = await getReceptionDentists()
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível carregar os dentistas.'), 'danger')
  }
}

async function loadPatients() {
  try {
    patients.value = await getReceptionPatients()
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível carregar os pacientes.'), 'danger')
  }
}

async function loadAvailability() {
  const id = ++availabilityRequestId
  const { date, dentistId, duration } = form.value
  if (!date || !dentistId) {
    availability.value = []
    availabilityLoading.value = false
    availabilityError.value = ''
    return
  }
  availabilityLoading.value = true
  availabilityError.value = ''
  try {
    const times = await getAvailableTimes({
      date,
      dentist_id: Number(dentistId),
      duration_minutes: Number(duration),
      exclude_appointment_id: selectedAppointment.value?.id,
    })
    if (id !== availabilityRequestId) return
    availability.value = times
    if (!times.includes(form.value.time)) form.value.time = ''
  } catch (error) {
    if (id !== availabilityRequestId) return
    availability.value = []
    availabilityError.value = getApiErrorMessage(error, 'Não foi possível consultar horários.')
    showToast(availabilityError.value, 'danger')
  } finally {
    if (id === availabilityRequestId) availabilityLoading.value = false
  }
}

function applyFilters() {
  appliedFilters.value = {
    search: filterSearch.value,
    dentist: filterDentist.value,
    procedure: filterProcedure.value,
    status: filterStatus.value,
    period: filterPeriod.value,
  }
  void loadAppointments()
}

function clearFilters() {
  filterSearch.value = ''
  filterDentist.value = ''
  filterProcedure.value = ''
  filterStatus.value = ''
  filterPeriod.value = ''
  appliedFilters.value = { search: '', dentist: '', procedure: '', status: '', period: '' }
  void loadAppointments()
}

function openCreateDialog(appointment = null) {
  selectedAppointment.value = appointment
  form.value = appointment
    ? {
        patientId: String(appointment.patient_id),
        dentistId: String(appointment.dentist_id),
        date: appointment.appointment_date,
        time: appointment.time,
        duration: String(appointment.duration_minutes),
        procedure: appointment.procedure,
        notes: appointment.administrative_notes || '',
        contact: appointment.contact_channel || 'Telefone',
      }
    : emptyAppointment(selectedDate.value)
  availability.value = []
  availabilityError.value = ''
  appointmentDialogOpen.value = true
}

async function saveAppointment() {
  if (!formElement.value?.reportValidity()) return
  if (availabilityLoading.value || availabilityError.value || !availability.value.includes(form.value.time)) {
    showToast(availabilityError.value || 'Selecione um horário disponível.', 'warning')
    return
  }
  const payload = {
    patient_id: Number(form.value.patientId),
    dentist_id: Number(form.value.dentistId),
    appointment_date: form.value.date,
    appointment_time: form.value.time,
    duration_minutes: Number(form.value.duration),
    procedure: form.value.procedure,
    contact_channel: form.value.contact,
    administrative_notes: form.value.notes || null,
  }
  isSaving.value = true
  try {
    if (selectedAppointment.value) {
      await updateReceptionAppointment(selectedAppointment.value.id, {
        ...payload,
        confirmation_status: 'Pendente',
        status: 'Agendada',
      })
    } else {
      await createReceptionAppointment(payload)
    }
    selectedDate.value = payload.appointment_date
    appointmentDialogOpen.value = false
    await loadAppointments()
    showToast(selectedAppointment.value ? 'Agendamento atualizado.' : 'Agendamento criado.', 'success')
    selectedAppointment.value = null
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível salvar o agendamento.'), 'danger')
  } finally {
    isSaving.value = false
  }
}

function showDetails(appointment) {
  selectedAppointment.value = appointment
  detailsDialogOpen.value = true
}

async function updateStatus(appointment, updates, successMessage) {
  if (pendingMutation) return false
  pendingMutation = true
  try {
    await updateReceptionAppointment(appointment.id, updates)
    await loadAppointments()
    if (detailsDialogOpen.value) detailsDialogOpen.value = false
    showToast(successMessage, 'success')
    return true
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível atualizar o agendamento.'), 'danger')
    return false
  } finally {
    pendingMutation = false
  }
}

async function confirmCancellation() {
  if (!selectedAppointment.value || !cancelReason.value.trim()) return
  const existingNotes = selectedAppointment.value.administrative_notes?.trim()
  const reason = `Motivo do cancelamento: ${cancelReason.value.trim()}`
  const administrativeNotes = [existingNotes?.slice(0, 1999 - reason.length), reason]
    .filter(Boolean)
    .join('\n')
  const canceled = await updateStatus(
    selectedAppointment.value,
    { status: 'Cancelada', administrative_notes: administrativeNotes },
    'Agendamento cancelado.',
  )
  if (!canceled) return
  cancelDialogOpen.value = false
  detailsDialogOpen.value = false
  cancelReason.value = ''
}

function statusVariant(status) {
  if (['Concluída', 'Confirmada'].includes(status)) return 'success'
  if (['Em espera', 'Aguardando chegada'].includes(status)) return 'warning'
  if (['Cancelada', 'Não compareceu'].includes(status)) return 'danger'
  if (status === 'Em atendimento') return 'info'
  return 'neutral'
}

function statusClass(status) {
  return `appointment-card--${status.toLocaleLowerCase('pt-BR').replaceAll(' ', '-')}`
}

function openCancellation(appointment) {
  selectedAppointment.value = appointment
  cancelReason.value = ''
  cancelDialogOpen.value = true
}

async function goToDashboard(id = '') {
  await router.push({ name: 'reception-dashboard' })
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

function handleShellNavigation(id) {
  if (id === 'schedule') return
  if (id === 'patient-list') {
    void router.push({ name: 'reception-patients' })
    return
  }
  if (id === 'checkin') {
    void router.push({ name: 'reception-checkin' })
    return
  }
  if (id === 'confirmations') {
    void router.push({ name: 'reception-confirmations' })
    return
  }
  if (id === 'history') {
    void router.push({ name: 'reception-history' })
    return
  }
  void goToDashboard(id === 'overview' ? '' : id)
}

async function createPatientFromAgenda() {
  appointmentDialogOpen.value = false
  await router.push({
    name: 'reception-dashboard',
    query: {
      createPatient: '1',
      returnTo: '/recepcao/agenda',
      agendaDate: form.value.date,
    },
  })
}

watch([selectedDate, viewMode], () => {
  page.value = 1
  void loadAppointments()
})
watch(
  () => [appointmentDialogOpen.value, form.value.date, form.value.dentistId, form.value.duration],
  ([open]) => {
    if (!open) return
    availabilityRequestId += 1
    clearTimeout(availabilityTimer)
    availabilityTimer = setTimeout(loadAvailability, 180)
  },
)
watch(filteredAppointments, () => {
  if (page.value > pageCount.value) page.value = pageCount.value
})

onMounted(() => {
  const requestedDate = route.query.date
  const requestedPatientId = route.query.patientId
  const requestedStatus = route.query.status
  const requestedCreate = route.query.create === '1'
  if (
    typeof requestedDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    toDateInput(fromDateInput(requestedDate)) === requestedDate
  ) {
    selectedDate.value = requestedDate
  }
  if (typeof requestedPatientId === 'string' && /^\d+$/.test(requestedPatientId)) {
    form.value = { ...emptyAppointment(selectedDate.value), patientId: requestedPatientId }
    appointmentDialogOpen.value = true
    void router.replace({ name: 'reception-agenda' })
  }
  if (requestedCreate) {
    openCreateDialog()
    const query = { ...route.query }
    delete query.create
    void router.replace({ name: 'reception-agenda', query })
  }
  if (typeof requestedStatus === 'string' && statuses.includes(requestedStatus)) {
    filterStatus.value = requestedStatus
    appliedFilters.value.status = requestedStatus
  }
  void loadAppointments()
  void loadDentists()
  void loadPatients()
})
onBeforeUnmount(() => {
  requestId += 1
  availabilityRequestId += 1
  clearTimeout(availabilityTimer)
})
</script>

<template>
  <div class="agenda-page">
    <ReceptionShell
      active-page="schedule"
      :date-label="formattedDate"
      @navigate="handleShellNavigation"
    />

    <main class="agenda-main">
      <section class="agenda-intro" aria-labelledby="agenda-title">
        <div>
          <p class="agenda-eyebrow">ORGANIZAÇÃO DA CLÍNICA</p>
          <h1 id="agenda-title">Agenda de Consultas</h1>
          <p>Gerencie os horários e atendimentos da clínica</p>
        </div>
        <UiButton @click="openCreateDialog()">
          <template #start><Plus :size="17" aria-hidden="true" /></template>Novo agendamento
        </UiButton>
      </section>

      <section class="agenda-metrics" aria-label="Resumo do período selecionado">
        <article v-for="metric in metrics" :key="metric.label" class="agenda-metric">
          <span :class="`agenda-metric__icon agenda-metric__icon--${metric.tone}`"><component :is="metric.icon" :size="18" aria-hidden="true" /></span>
          <div><span>{{ metric.label }}</span><strong>{{ state === 'loading' ? '—' : metric.value }}</strong></div>
        </article>
      </section>

      <section class="agenda-panel" aria-labelledby="agenda-calendar-title">
        <div class="agenda-panel__heading">
          <div>
            <p class="agenda-eyebrow">AGENDA DA CLÍNICA</p>
            <h2 id="agenda-calendar-title">{{ periodTitle }}</h2>
            <p class="agenda-count">{{ filteredAppointments.length }} consulta(s) no período</p>
          </div>
          <div class="agenda-toolbar">
            <div class="agenda-view-switch" role="group" aria-label="Modo de visualização">
              <button v-for="mode in [{ id: 'day', label: 'Dia' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mês' }]" :key="mode.id" type="button" :aria-pressed="viewMode === mode.id" @click="viewMode = mode.id">{{ mode.label }}</button>
            </div>
            <button class="agenda-icon-button" type="button" aria-label="Atualizar agenda" :disabled="state === 'refreshing'" @click="loadAppointments"><RefreshCw :size="17" :class="{ 'agenda-spin': state === 'refreshing' }" /></button>
          </div>
        </div>

        <div class="agenda-date-bar">
          <div class="agenda-date-controls">
            <button class="agenda-icon-button" type="button" aria-label="Período anterior" @click="shiftPeriod(-1)"><ChevronLeft :size="18" /></button>
            <span class="agenda-date-readable" aria-live="polite">{{ dateReadable }}</span>
            <label class="agenda-date-input">
              <span class="visually-hidden">Selecionar data</span>
              <CalendarDays :size="16" aria-hidden="true" />
              <input v-model="selectedDate" type="date" />
            </label>
            <button class="agenda-icon-button" type="button" aria-label="Próximo período" @click="shiftPeriod(1)"><ChevronRight :size="18" /></button>
            <UiButton variant="secondary" size="sm" @click="selectedDate = toDateInput(today)">Hoje</UiButton>
          </div>
        </div>

        <form class="agenda-filters" @submit.prevent="applyFilters">
          <label class="agenda-filter agenda-filter--search">
            <span class="visually-hidden">Pesquisar paciente</span>
            <Search :size="16" aria-hidden="true" />
            <input v-model="filterSearch" type="search" placeholder="Nome, telefone ou CPF do paciente..." />
          </label>
          <label class="agenda-filter"><span class="visually-hidden">Filtrar por dentista</span><Stethoscope :size="16" /><select v-model="filterDentist"><option value="">Todos os dentistas</option><option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">{{ dentist.name }}</option></select></label>
          <label class="agenda-filter"><span class="visually-hidden">Filtrar por consulta</span><ListFilter :size="16" /><select v-model="filterProcedure"><option value="">Todos os procedimentos</option><option v-for="procedure in procedures" :key="procedure" :value="procedure">{{ procedure }}</option></select></label>
          <label class="agenda-filter"><span class="visually-hidden">Filtrar por status</span><Check :size="16" /><select v-model="filterStatus"><option value="">Todos os status</option><option v-for="status in statuses" :key="status" :value="status">{{ status }}</option></select></label>
          <label class="agenda-filter"><span class="visually-hidden">Período do dia</span><Clock3 :size="16" /><select v-model="filterPeriod"><option value="">Qualquer horário</option><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="evening">Noite</option></select></label>
          <div class="agenda-filter-actions"><UiButton type="submit" size="sm">Filtrar</UiButton><UiButton type="button" variant="secondary" size="sm" @click="clearFilters">Limpar</UiButton></div>
        </form>

        <div v-if="state === 'loading'" class="agenda-state" role="status"><span class="agenda-spinner" aria-hidden="true"></span><strong>Carregando agenda</strong><p>Buscando os agendamentos do período.</p></div>
        <div v-else-if="state === 'error'" class="agenda-state agenda-state--error" role="alert"><CircleAlert :size="24" /><strong>Não foi possível carregar a agenda</strong><p>{{ errorMessage }}</p><UiButton variant="secondary" size="sm" @click="loadAppointments">Tentar novamente</UiButton></div>
        <template v-else>
          <div v-if="viewMode === 'day'" class="agenda-day" :aria-busy="state === 'refreshing'">
            <div v-if="!dayAppointments(selectedDate).length" class="agenda-state agenda-state--compact">
              <span class="agenda-state__icon"><CalendarDays :size="23" /></span><strong>Nenhum agendamento encontrado</strong><p>Experimente outro dia ou ajuste os filtros.</p>
              <UiButton size="sm" @click="openCreateDialog()">Criar agendamento</UiButton>
            </div>
            <div v-else class="agenda-timeline">
              <div v-for="hour in dailyHourRange" :key="hour" class="agenda-hour">
                <span class="agenda-hour__label">{{ String(hour).padStart(2, '0') }}:00</span>
                <div class="agenda-hour__appointments">
                  <button v-for="appointment in dayAppointments(selectedDate).filter(item => Number(item.time.slice(0, 2)) === hour)" :key="appointment.id" class="appointment-card" :class="statusClass(appointment.status)" :style="{ minHeight: `${Math.max(64, appointment.duration_minutes * 1.45)}px` }" type="button" @click="showDetails(appointment)">
                    <span class="appointment-card__time">{{ appointment.time }}–{{ endTime(appointment) }} · {{ appointment.duration_minutes }} min</span>
                    <strong>{{ appointment.patient_name }}</strong>
                    <span>{{ appointment.dentist_name }} · {{ appointment.procedure }}</span>
                    <span class="appointment-card__status">{{ appointment.status }}</span>
                  </button>
                  <span v-if="!dayAppointments(selectedDate).some(item => Number(item.time.slice(0, 2)) === hour)" class="agenda-hour__line"></span>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="viewMode === 'week'" class="agenda-week" :aria-busy="state === 'refreshing'">
            <section v-for="group in groupedAppointments" :key="group.date" class="agenda-week__day" :class="{ 'agenda-week__day--selected': group.date === selectedDate, 'agenda-week__day--today': group.date === toDateInput(today) }">
              <button class="agenda-week__date" type="button" @click="selectedDate = group.date; viewMode = 'day'"><span>{{ dateLabel(group.date, { weekday: 'short' }) }}</span><strong>{{ dateLabel(group.date, { day: '2-digit' }) }}</strong><small>{{ group.items.length }} consultas</small></button>
              <button v-for="appointment in group.items" :key="appointment.id" class="appointment-card appointment-card--small" :class="statusClass(appointment.status)" type="button" @click="showDetails(appointment)">
                <strong>{{ appointment.time }} · {{ appointment.patient_name }}</strong><span>{{ appointment.dentist_name }}</span><small>{{ appointment.procedure }} · {{ appointment.status }}</small>
              </button>
              <span v-if="!group.items.length" class="agenda-week__empty">Sem consultas</span>
            </section>
          </div>

          <div v-else class="agenda-month" :aria-busy="state === 'refreshing'">
            <div class="agenda-month__weekdays"><span v-for="day in ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']" :key="day">{{ day }}</span></div>
            <div class="agenda-month__grid">
              <span v-for="(date, index) in visibleCalendarDates" :key="date || `blank-${index}`" class="agenda-month__cell" :class="{ 'agenda-month__cell--empty': !date, 'agenda-month__cell--selected': date === selectedDate, 'agenda-month__cell--today': date === toDateInput(today) }">
                <template v-if="date">
                  <button type="button" class="agenda-month__date" :aria-label="`Selecionar ${dateLabel(date, { dateStyle: 'long' })}`" @click="selectedDate = date; viewMode = 'day'">{{ dateLabel(date, { day: 'numeric' }) }}</button>
                  <button v-if="dayAppointments(date).length" type="button" class="agenda-month__count" @click="selectedDate = date; viewMode = 'day'">{{ dayAppointments(date).length }} consultas</button>
                </template>
              </span>
            </div>
          </div>
        </template>
      </section>

      <section class="agenda-panel agenda-table-panel" aria-labelledby="agenda-list-title">
        <div class="agenda-panel__heading">
          <div><p class="agenda-eyebrow">DETALHAMENTO</p><h2 id="agenda-list-title">Agendamentos do período</h2></div>
          <span class="agenda-count">{{ filteredAppointments.length }} resultado(s)</span>
        </div>
        <div v-if="state === 'loading'" class="agenda-table-empty" role="status"><span class="agenda-spinner" aria-hidden="true"></span><strong>Carregando agendamentos</strong></div>
        <div v-else-if="state === 'error'" class="agenda-table-empty" role="status">A lista será exibida quando a conexão com o backend for restabelecida.</div>
        <div v-else-if="!filteredAppointments.length && state !== 'loading'" class="agenda-table-empty">
          <CalendarDays :size="21" aria-hidden="true" /><strong>Nenhum resultado encontrado</strong><span>Revise os filtros ou selecione outro período.</span>
        </div>
        <div v-else class="agenda-table-wrap" :aria-busy="state === 'refreshing'">
          <table class="agenda-table">
            <thead><tr><th scope="col">Data</th><th scope="col">Horário</th><th scope="col">Paciente</th><th scope="col">Telefone</th><th scope="col">Dentista</th><th scope="col">Consulta</th><th scope="col">Duração</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Ações</span></th></tr></thead>
            <tbody>
              <tr v-for="appointment in paginatedAppointments" :key="appointment.id">
                <td data-label="Data">{{ dateLabel(appointment.appointment_date, { day: '2-digit', month: 'short', year: 'numeric' }) }}</td>
                <td data-label="Horário"><strong>{{ appointment.time }}–{{ endTime(appointment) }}</strong></td>
                <td data-label="Paciente"><span class="agenda-person"><UiAvatar :name="appointment.patient_name" size="sm" />{{ appointment.patient_name }}</span></td>
                <td data-label="Telefone">{{ appointment.patient_phone || '—' }}</td>
                <td data-label="Dentista">{{ appointment.dentist_name }}</td>
                <td data-label="Consulta">{{ appointment.procedure }}</td>
                <td data-label="Duração">{{ appointment.duration_minutes }} min</td>
                <td data-label="Status"><UiBadge :variant="statusVariant(appointment.status)">{{ appointment.status }}</UiBadge></td>
                <td data-label="Ações"><div class="agenda-row-actions"><button class="agenda-row-action" type="button" :aria-label="`Detalhes de ${appointment.patient_name}`" @click="showDetails(appointment)"><Search :size="16" /></button><button v-if="appointment.confirmation_status === 'Pendente'" class="agenda-row-action" type="button" :aria-label="`Confirmar consulta de ${appointment.patient_name}`" @click="updateStatus(appointment, { confirmation_status: 'Confirmada' }, 'Consulta confirmada.')"><Check :size="16" /></button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="filteredAppointments.length > pageSize" class="agenda-pagination">
          <span>Página {{ page }} de {{ pageCount }}</span>
          <div><UiButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Anterior</UiButton><UiButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1">Próxima</UiButton></div>
        </div>
      </section>

      <footer class="agenda-footer"><span><Stethoscope :size="15" /> Acesso aos dados administrativos da recepção.</span><span>Zen · Gestão odontológica</span></footer>
    </main>

    <UiDialog v-model="appointmentDialogOpen" :title="selectedAppointment ? 'Reagendar consulta' : 'Novo agendamento'">
      <form ref="formElement" class="agenda-form" @submit.prevent="saveAppointment">
        <UiFormField label="Paciente" required><template #default="{ id }"><UiSelect :id="id" v-model="form.patientId" :options="patientOptions" placeholder="Selecione o paciente" required /></template></UiFormField>
        <UiFormField label="Dentista" required><template #default="{ id }"><UiSelect :id="id" v-model="form.dentistId" :options="dentistOptions" placeholder="Selecione o dentista" required /></template></UiFormField>
        <div class="agenda-form__row">
          <UiFormField label="Data" required><template #default="{ id }"><UiInput :id="id" v-model="form.date" type="date" required /></template></UiFormField>
          <UiFormField label="Duração" required><template #default="{ id }"><UiSelect :id="id" v-model="form.duration" :options="[{ value: '30', label: '30 minutos' }, { value: '45', label: '45 minutos' }, { value: '60', label: '60 minutos' }]" required /></template></UiFormField>
        </div>
        <div class="agenda-form__row">
          <UiFormField label="Horário disponível" required><template #default="{ id }"><UiSelect :id="id" v-model="form.time" :options="timeOptions" placeholder="Selecione" required :disabled="!form.dentistId || availabilityLoading" /></template></UiFormField>
          <UiFormField label="Tipo de consulta" required><template #default="{ id }"><UiSelect :id="id" v-model="form.procedure" :options="procedureOptions" placeholder="Selecione" required /></template></UiFormField>
        </div>
        <p v-if="availabilityLoading" class="agenda-form__notice" role="status">Consultando horários disponíveis...</p>
        <p v-else-if="availabilityError" class="agenda-form__error" role="alert">{{ availabilityError }}</p>
        <p v-else-if="form.dentistId && !availability.length" class="agenda-form__notice">Não há horários disponíveis para essa data.</p>
        <UiFormField label="Canal para contato"><template #default="{ id }"><UiSelect :id="id" v-model="form.contact" :options="[{ value: 'Telefone', label: 'Telefone' }, { value: 'E-mail', label: 'E-mail' }, { value: 'WhatsApp', label: 'WhatsApp' }]" /></template></UiFormField>
        <UiFormField label="Observações administrativas"><template #default="{ id }"><UiTextarea :id="id" v-model="form.notes" :rows="3" /></template></UiFormField>
        <UiButton v-if="!selectedAppointment" type="button" variant="tertiary" @click="createPatientFromAgenda">Cadastrar novo paciente</UiButton>
        <div class="agenda-form__actions"><UiButton type="button" variant="secondary" @click="appointmentDialogOpen = false">Cancelar</UiButton><UiButton type="submit" :loading="isSaving || availabilityLoading">{{ selectedAppointment ? 'Salvar alterações' : 'Criar agendamento' }}</UiButton></div>
      </form>
    </UiDialog>

    <UiDialog v-model="detailsDialogOpen" title="Detalhes do agendamento">
      <div v-if="selectedAppointment" class="agenda-details">
        <div class="agenda-details__patient"><UiAvatar :name="selectedAppointment.patient_name" size="lg" /><div><strong>{{ selectedAppointment.patient_name }}</strong><span>{{ selectedAppointment.patient_phone || 'Telefone não informado' }}</span></div></div>
        <dl class="agenda-details__grid">
          <div><dt>Data e horário</dt><dd>{{ dateLabel(selectedAppointment.appointment_date, { dateStyle: 'long' }) }} · {{ selectedAppointment.time }}–{{ endTime(selectedAppointment) }}</dd></div>
          <div><dt>Dentista</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
          <div><dt>Consulta</dt><dd>{{ selectedAppointment.procedure }} · {{ selectedAppointment.duration_minutes }} min</dd></div>
          <div><dt>Confirmação</dt><dd>{{ selectedAppointment.confirmation_status }}</dd></div>
          <div><dt>Status</dt><dd>{{ selectedAppointment.status }}</dd></div>
          <div v-if="selectedAppointment.administrative_notes"><dt>Observações administrativas</dt><dd>{{ selectedAppointment.administrative_notes }}</dd></div>
        </dl>
        <p class="agenda-form__notice">O histórico de alterações e detalhes clínicos não são fornecidos pela API para o perfil da recepção.</p>
        <div class="agenda-form__actions agenda-details__actions">
          <UiButton variant="secondary" @click="openCreateDialog(selectedAppointment); detailsDialogOpen = false">Reagendar</UiButton>
          <UiButton v-if="selectedAppointment.status === 'Agendada' || selectedAppointment.status === 'Confirmada'" variant="secondary" @click="updateStatus(selectedAppointment, { status: 'Em espera' }, 'Chegada registrada; paciente em espera.')">Registrar chegada</UiButton>
          <UiButton v-if="!['Cancelada', 'Concluída', 'Não compareceu'].includes(selectedAppointment.status)" variant="secondary" @click="updateStatus(selectedAppointment, { status: 'Não compareceu' }, 'Paciente marcado como não compareceu.')">Marcar falta</UiButton>
          <UiButton v-if="selectedAppointment.confirmation_status !== 'Confirmada' && selectedAppointment.status !== 'Cancelada'" variant="secondary" @click="updateStatus(selectedAppointment, { confirmation_status: 'Confirmada' }, 'Consulta confirmada.')">Confirmar</UiButton>
          <UiButton v-if="selectedAppointment.status !== 'Cancelada' && selectedAppointment.status !== 'Concluída'" variant="danger" @click="openCancellation(selectedAppointment)">Cancelar consulta</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiDialog v-model="cancelDialogOpen" title="Cancelar agendamento?">
      <form class="agenda-form" @submit.prevent="confirmCancellation">
        <p>O horário será liberado e o motivo ficará registrado nas observações administrativas.</p>
        <UiFormField label="Motivo do cancelamento" required><template #default="{ id }"><UiTextarea :id="id" v-model="cancelReason" :rows="3" required maxlength="500" /></template></UiFormField>
        <div class="agenda-form__actions"><UiButton type="button" variant="secondary" @click="cancelDialogOpen = false">Manter consulta</UiButton><UiButton type="submit" variant="danger">Confirmar cancelamento</UiButton></div>
      </form>
    </UiDialog>
    <UiToast :key="toastKey" v-model="toastVisible" :message="toastMessage" :variant="toastVariant" />
  </div>
</template>

<style scoped>
.agenda-page{min-height:100vh;background:var(--color-page,#f5f7fb);color:var(--color-text,#193343)}
.agenda-date-controls,.agenda-toolbar,.agenda-panel__heading,.agenda-filter,.agenda-filter-actions,.agenda-person,.agenda-row-actions,.agenda-footer,.agenda-footer span{display:flex;align-items:center}
.agenda-icon-button{display:grid;width:2.5rem;height:2.5rem;flex:0 0 auto;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer;transition:background-color .16s ease,color .16s ease,border-color .16s ease}
.agenda-icon-button:hover:not(:disabled){border-color:var(--color-blue-200);background:var(--color-blue-50);color:var(--color-primary)}
.agenda-icon-button:disabled{cursor:wait;opacity:.6}
.agenda-icon-button:focus-visible,.agenda-row-action:focus-visible{outline:3px solid var(--color-blue-300);outline-offset:2px}
.agenda-main{width:min(100% - 2 * clamp(var(--space-4),4vw,var(--space-10)),90rem);margin-inline:auto;padding-block:var(--space-6) var(--space-8)}
.agenda-intro,.agenda-intro__actions{display:flex;align-items:center}
.agenda-intro{justify-content:space-between;gap:var(--space-6);margin-bottom:var(--space-6)}
.agenda-eyebrow{margin:0 0 var(--space-1);color:var(--color-primary);font-size:.6875rem;font-weight:var(--font-weight-bold);letter-spacing:var(--letter-spacing-wide)}
.agenda-intro h1{margin:0;font-family:var(--font-heading);font-size:clamp(1.5rem,2.5vw,1.875rem);font-weight:var(--font-weight-semibold);letter-spacing:var(--letter-spacing-tight);line-height:var(--line-height-tight)}
.agenda-intro p:last-child{margin:.5rem 0 0;color:var(--color-text-secondary);font-size:var(--font-size-sm)}
.agenda-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--space-4);margin-bottom:var(--space-5)}
.agenda-metric,.agenda-panel{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-sm)}
.agenda-metric{display:grid;min-height:7rem;grid-template-columns:auto 1fr;align-content:center;align-items:center;gap:var(--space-3);padding:var(--space-4)}
.agenda-metric__icon{display:grid;width:2.5rem;height:2.5rem;place-items:center;border-radius:var(--radius-md)}
.agenda-metric__icon--blue{background:var(--color-blue-50);color:var(--color-primary)}.agenda-metric__icon--green{background:var(--color-success-subtle);color:var(--color-success-strong)}.agenda-metric__icon--amber{background:var(--color-warning-subtle);color:var(--color-warning)}.agenda-metric__icon--violet{background:var(--color-violet-subtle);color:var(--color-violet)}.agenda-metric__icon--red{background:var(--color-danger-subtle);color:var(--color-danger)}
.agenda-metric div{display:grid;gap:.2rem}.agenda-metric div>span{color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.25}.agenda-metric strong{font-family:var(--font-heading);font-size:var(--font-size-2xl);font-weight:var(--font-weight-semibold);line-height:1.15}
.agenda-panel{min-width:0;margin-bottom:var(--space-5);padding:var(--space-5)}
.agenda-panel__heading{justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-4)}
.agenda-panel__heading h2{margin:0;font-family:var(--font-heading);font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);line-height:var(--line-height-heading);text-transform:capitalize}
.agenda-count{margin:.3rem 0 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.agenda-toolbar{gap:var(--space-2)}
.agenda-view-switch{display:flex;padding:.2rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-page,#f5f7fb)}
.agenda-view-switch button{min-height:2rem;padding-inline:.7rem;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-text-secondary);font:inherit;font-size:var(--font-size-xs);cursor:pointer}
.agenda-view-switch button[aria-pressed=true]{background:var(--color-surface);color:var(--color-primary);box-shadow:var(--shadow-sm)}
.agenda-date-bar{display:flex;justify-content:flex-end;margin-bottom:var(--space-3)}
.agenda-date-controls{gap:var(--space-1)}
.agenda-date-controls .agenda-icon-button{width:2.25rem;height:2.25rem}
.agenda-date-readable{min-width:3.8rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);text-align:center;text-transform:capitalize}
.agenda-date-input{position:relative;display:grid;width:2.5rem;height:2.25rem;place-items:center;color:var(--color-text-secondary);cursor:pointer}
.agenda-date-input input{position:absolute;inset:0;width:100%;height:100%;padding:.25rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:transparent;color:transparent;cursor:pointer}
.agenda-date-input input::-webkit-calendar-picker-indicator{width:100%;height:100%;opacity:0;cursor:pointer}
.agenda-date-input:focus-within{border-radius:var(--radius-md);outline:3px solid var(--color-focus-ring);outline-offset:2px}
.agenda-date-input>svg{pointer-events:none}
.agenda-filters{display:grid;grid-template-columns:minmax(12rem,1.5fr) repeat(4,minmax(9rem,1fr)) auto;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)}
.agenda-filter{min-width:0;min-height:2.65rem;gap:.5rem;padding-inline:.7rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-muted)}
.agenda-filter:focus-within{border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-focus-ring)}
.agenda-filter input,.agenda-filter select{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-xs)}
.agenda-filter select{max-width:100%;overflow:hidden;cursor:pointer;text-overflow:ellipsis;white-space:nowrap}.agenda-filter input::placeholder{color:var(--color-text-muted)}
.agenda-filter-actions{gap:.4rem}
.agenda-day{min-height:8rem}.agenda-timeline{display:grid}
.agenda-hour{display:grid;grid-template-columns:4.25rem minmax(0,1fr);gap:var(--space-3);min-height:4.5rem}
.agenda-hour__label{padding-top:.2rem;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.agenda-hour__appointments{display:grid;gap:.5rem;padding-bottom:.6rem;border-top:1px solid var(--color-border)}
.agenda-hour__line{height:1px}
.appointment-card{display:flex;min-height:4rem;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.65rem .8rem;border:0;border-left:3px solid var(--color-primary);border-radius:var(--radius-sm);background:var(--color-blue-50);color:var(--color-text);text-align:left;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
.appointment-card:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px)}
.appointment-card__time,.appointment-card>span:not(.appointment-card__status){color:var(--color-text-secondary);font-size:var(--font-size-xs)}
.appointment-card>strong{font-size:var(--font-size-sm)}.appointment-card__status{color:var(--color-primary);font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold)}
.appointment-card--confirmada{border-color:var(--color-success-strong);background:var(--color-success-subtle)}.appointment-card--confirmada .appointment-card__status{color:var(--color-success-strong)}
.appointment-card--aguardando-chegada,.appointment-card--em-espera{border-color:var(--color-warning);background:var(--color-warning-subtle)}.appointment-card--em-atendimento{border-color:var(--color-primary);background:var(--color-blue-50)}.appointment-card--concluída{border-color:var(--color-border-strong);background:var(--color-surface-muted)}.appointment-card--cancelada,.appointment-card--não-compareceu{border-color:var(--color-danger);background:var(--color-danger-subtle)}.appointment-card--cancelada .appointment-card__status,.appointment-card--não-compareceu .appointment-card__status{color:var(--color-danger)}
.agenda-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.5rem;overflow-x:auto}
.agenda-week__day{display:flex;min-width:7.5rem;flex-direction:column;gap:.45rem;padding:.5rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface)}
.agenda-week__day--selected{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary)}
.agenda-week__day--today .agenda-week__date strong{color:var(--color-primary)}
.agenda-week__date{display:grid;justify-items:center;gap:.2rem;padding:.35rem;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-text);cursor:pointer}
.agenda-week__date span,.agenda-week__date small,.agenda-week__empty{color:var(--color-text-muted);font-size:.68rem;text-transform:capitalize}
.agenda-week__date strong{font-size:1.1rem}.agenda-week__empty{padding:.5rem;text-align:center}
.appointment-card--small{min-height:0;gap:.2rem;padding:.5rem;border-left-width:2px}
.appointment-card--small strong{font-size:.68rem;line-height:1.25}.appointment-card--small span,.appointment-card--small small{font-size:.64rem;line-height:1.25}
.agenda-month__weekdays,.agenda-month__grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.35rem}
.agenda-month__weekdays{margin-bottom:.35rem;color:var(--color-text-muted);font-size:var(--font-size-xs);text-align:center}
.agenda-month__cell{display:flex;min-height:5.5rem;flex-direction:column;align-items:flex-start;gap:.4rem;padding:.45rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)}
.agenda-month__cell--empty{border-color:transparent;background:transparent}.agenda-month__cell--selected{border-color:var(--color-primary);background:var(--color-blue-50)}.agenda-month__cell--today .agenda-month__date{color:var(--color-primary);font-weight:var(--font-weight-bold)}
.agenda-month__date,.agenda-month__count{padding:0;border:0;background:transparent;color:var(--color-text);font:inherit;cursor:pointer}
.agenda-month__date{font-size:var(--font-size-sm)}.agenda-month__count{color:var(--color-primary);font-size:.68rem;text-align:left}
.agenda-state{display:grid;min-height:14rem;align-content:center;justify-items:center;gap:var(--space-2);color:var(--color-text-secondary);text-align:center}
.agenda-state strong{color:var(--color-text);font-size:var(--font-size-sm)}.agenda-state p{margin:0 0 var(--space-2);font-size:var(--font-size-sm)}
.agenda-state--compact{min-height:12rem}.agenda-state--error>svg{color:var(--color-danger)}
.agenda-state__icon{display:grid;width:3rem;height:3rem;place-items:center;border-radius:50%;background:var(--color-blue-50);color:var(--color-primary)}
.agenda-spinner{width:1.4rem;height:1.4rem;border:2px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;animation:agenda-spin .7s linear infinite}
.agenda-spin{animation:agenda-spin .8s linear infinite}@keyframes agenda-spin{to{transform:rotate(360deg)}}
.agenda-table-panel{padding-bottom:var(--space-4)}.agenda-table-panel>.agenda-panel__heading{margin-bottom:var(--space-3)}
.agenda-table-wrap{width:100%;overflow-x:auto}.agenda-table{width:100%;border-collapse:collapse;text-align:left;font-size:var(--font-size-xs)}
.agenda-table th{padding:.7rem .6rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-weight:var(--font-weight-medium);white-space:nowrap}
.agenda-table td{padding:.7rem .6rem;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);vertical-align:middle}
.agenda-table tbody tr:last-child td{border-bottom:0}.agenda-table td strong{color:var(--color-text);white-space:nowrap}
.agenda-person{gap:.5rem;color:var(--color-text);font-weight:var(--font-weight-medium);white-space:nowrap}
.agenda-row-actions{gap:.35rem}.agenda-row-action{display:grid;width:2rem;height:2rem;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:transparent;color:var(--color-text-secondary);cursor:pointer}.agenda-row-action:hover{background:var(--color-blue-50);color:var(--color-primary)}
.agenda-table-empty{display:grid;min-height:8rem;align-content:center;justify-items:center;gap:.45rem;color:var(--color-text-muted);font-size:var(--font-size-sm)}.agenda-table-empty strong{color:var(--color-text)}
.agenda-pagination{display:flex;align-items:center;justify-content:space-between;padding-top:var(--space-3);color:var(--color-text-muted);font-size:var(--font-size-xs)}.agenda-pagination>div{display:flex;gap:.5rem}
.agenda-footer{justify-content:space-between;gap:var(--space-3);padding:var(--space-2) 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}.agenda-footer span{gap:.4rem}
.agenda-form{display:grid;gap:var(--space-4)}.agenda-form__row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)}.agenda-form__actions{display:flex;justify-content:flex-end;gap:var(--space-2);padding-top:var(--space-2)}.agenda-form__notice,.agenda-form__error{margin:0;padding:.7rem;border-radius:var(--radius-sm);background:var(--color-blue-50);color:var(--color-text-secondary);font-size:var(--font-size-xs)}.agenda-form__error{background:var(--color-danger-subtle);color:var(--color-danger)}
.agenda-details{display:grid;gap:var(--space-4)}.agenda-details__patient{display:flex;align-items:center;gap:var(--space-3)}.agenda-details__patient div{display:grid;gap:.2rem}.agenda-details__patient span{color:var(--color-text-muted);font-size:var(--font-size-sm)}.agenda-details__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin:0}.agenda-details__grid div{min-width:0}.agenda-details__grid dt{color:var(--color-text-muted);font-size:var(--font-size-xs)}.agenda-details__grid dd{margin:.25rem 0 0;color:var(--color-text);font-size:var(--font-size-sm);overflow-wrap:anywhere}.agenda-details__actions{flex-wrap:wrap}
.agenda-page :deep(button),.agenda-page :deep(input),.agenda-page :deep(select),.agenda-page :deep(textarea){font-family:inherit}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1100px){.agenda-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.agenda-filter--search{grid-column:span 2}.agenda-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.agenda-week{grid-template-columns:repeat(7,minmax(8rem,1fr))}}
@media(max-width:720px){.agenda-main{width:calc(100% - 2 * var(--space-3));padding-block:var(--space-4)}.agenda-intro{align-items:flex-start;flex-direction:column;gap:var(--space-3)}.agenda-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2)}.agenda-metric{min-height:5.5rem;padding:var(--space-3)}.agenda-metric__icon{width:2.1rem;height:2.1rem}.agenda-metric strong{font-size:var(--font-size-xl)}.agenda-panel{padding:var(--space-3)}.agenda-panel__heading{align-items:flex-start;flex-wrap:wrap}.agenda-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.agenda-filter--search{grid-column:1/-1}.agenda-filter-actions{grid-column:1/-1;justify-content:flex-end}.agenda-week{grid-template-columns:repeat(7,minmax(8rem,1fr))}.agenda-month__cell{min-height:4rem;padding:.3rem}.agenda-month__count{font-size:.58rem}.agenda-table thead{display:none}.agenda-table,.agenda-table tbody,.agenda-table tr,.agenda-table td{display:block;width:100%}.agenda-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.2rem .8rem;padding:.65rem 0;border-bottom:1px solid var(--color-border)}.agenda-table td{display:flex;min-width:0;justify-content:space-between;gap:.5rem;padding:.25rem 0;border:0;text-align:right;overflow-wrap:anywhere}.agenda-table td:before{content:attr(data-label);color:var(--color-text-muted);text-align:left}.agenda-table td[data-label=Paciente],.agenda-table td[data-label=Ações]{grid-column:1/-1}.agenda-table td[data-label=Paciente]{justify-content:flex-start}.agenda-table td[data-label=Paciente]:before{min-width:4rem}.agenda-table td[data-label=Ações]{justify-content:flex-end}.agenda-footer{align-items:flex-start;flex-direction:column}.agenda-date-controls{flex-wrap:wrap}.agenda-date-bar{justify-content:flex-start}.agenda-panel__heading h2{font-size:var(--font-size-base)}}
@media(max-width:420px){.agenda-filters{grid-template-columns:minmax(0,1fr)}.agenda-filter--search,.agenda-filter-actions{grid-column:auto}.agenda-filter-actions>*{flex:1}.agenda-view-switch button{padding-inline:.5rem}.agenda-month__weekdays,.agenda-month__grid{gap:.2rem}.agenda-month__cell{min-height:3.5rem}.agenda-month__count{max-width:100%;overflow:hidden;white-space:nowrap}.agenda-hour{grid-template-columns:3.25rem minmax(0,1fr)}.agenda-form__row,.agenda-details__grid{grid-template-columns:minmax(0,1fr)}.agenda-form__actions{flex-wrap:wrap}.agenda-form__actions>*{flex:1}}
@media(prefers-reduced-motion:reduce){.agenda-page *, .agenda-page *:before,.agenda-page *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
