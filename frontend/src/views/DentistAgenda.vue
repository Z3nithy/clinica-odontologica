<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  List,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCheck,
} from 'lucide-vue-next'
import { getApiErrorMessage } from '../services/api'
import { getDentistDashboard } from '../services/dentist'
import DentistShell from '../components/DentistShell.vue'
import { dentistNavigationRoutes } from '../router/navigation'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const route = useRoute()
const router = useRouter()
const currentDate = ref(parseDateQuery(route.query.date))
const view = ref(['day', 'week', 'month', 'list'].includes(route.query.view) ? route.query.view : 'week')
const loadState = ref('loading')
const errorMessage = ref('')
const appointments = ref([])
const selectedAppointment = ref(null)
const detailOpen = ref(false)
const search = ref(typeof route.query.patientId === 'string' ? route.query.patientId : '')
const filtersOpen = ref(false)
const activeFilters = ref(false)
const filters = reactive(emptyFilters())
const filterDraft = reactive(emptyFilters())
const clinicOpenTime = ref('08:00')
const clinicCloseTime = ref('18:00')
const now = ref(new Date())
let timer
let requestId = 0

function emptyFilters() {
  return {
    status: '',
    procedure: '',
    dayPeriod: '',
    confirmed: false,
    waitingConfirmation: false,
    checkedIn: false,
  }
}

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function parseDateQuery(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date
    }
  }
  return new Date()
}

function formatDateInput(date) {
  return toDateInput(date)
}

function startOfPeriod(date, periodView = view.value) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (periodView === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  } else if (periodView === 'month') {
    start.setDate(1)
  }
  return start
}

function periodLength(date, periodView = view.value) {
  if (periodView === 'day') return 1
  if (periodView === 'week') return 7
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

const periodStart = computed(() => startOfPeriod(currentDate.value))
const periodDays = computed(() => periodLength(currentDate.value))
const periodStartKey = computed(() => toDateInput(periodStart.value))
const periodEnd = computed(() => {
  const end = new Date(periodStart.value)
  end.setDate(end.getDate() + periodDays.value - 1)
  return end
})
const periodLabel = computed(() => {
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
  if (view.value === 'day') {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(currentDate.value)
  }
  if (view.value === 'month') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate.value)
  }
  return `${formatter.format(periodStart.value)} a ${formatter.format(periodEnd.value)}`
})
const dateLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now.value),
)
const procedureOptions = computed(() => [...new Set(appointments.value.map(({ procedure }) => procedure))].sort())

const periodAppointments = computed(() => {
  const start = periodStartKey.value
  const end = toDateInput(periodEnd.value)
  return appointments.value.filter((appointment) =>
    appointment.appointment_date >= start && appointment.appointment_date <= end,
  )
})

const filteredAppointments = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  return periodAppointments.value.filter((appointment) => {
    if (term && !appointment.patient_name.toLocaleLowerCase('pt-BR').includes(term)
      && !String(appointment.id).includes(term)
      && !String(appointment.patient_id).includes(term)) return false
    if (filters.status && appointment.status !== filters.status) return false
    if (filters.procedure && appointment.procedure !== filters.procedure) return false
    if (filters.confirmed && appointment.confirmation_status !== 'Confirmada') return false
    if (filters.waitingConfirmation && appointment.confirmation_status !== 'Pendente') return false
    if (filters.checkedIn && !appointment.arrival_at) return false
    if (filters.dayPeriod) {
      const hour = Number(appointment.appointment_time.slice(0, 2))
      if (filters.dayPeriod === 'morning' && (hour < 6 || hour >= 12)) return false
      if (filters.dayPeriod === 'afternoon' && (hour < 12 || hour >= 18)) return false
      if (filters.dayPeriod === 'night' && (hour < 18 || hour >= 24)) return false
    }
    return true
  })
})

const appointmentsByDate = computed(() => {
  const grouped = new Map()
  for (const appointment of filteredAppointments.value) {
    if (!grouped.has(appointment.appointment_date)) grouped.set(appointment.appointment_date, [])
    grouped.get(appointment.appointment_date).push(appointment)
  }
  for (const rows of grouped.values()) rows.sort(compareAppointments)
  return grouped
})
const allAppointmentsByDate = computed(() => {
  const grouped = new Map()
  for (const appointment of periodAppointments.value) {
    if (!grouped.has(appointment.appointment_date)) grouped.set(appointment.appointment_date, [])
    grouped.get(appointment.appointment_date).push(appointment)
  }
  return grouped
})

const selectedDayAppointments = computed(() =>
  (appointmentsByDate.value.get(toDateInput(currentDate.value)) || []),
)
const confirmedCount = computed(() =>
  filteredAppointments.value.filter((appointment) =>
    appointment.confirmation_status === 'Confirmada'
    && !['Cancelada', 'Reagendada'].includes(appointment.status),
  ).length,
)
const completedCount = computed(() =>
  filteredAppointments.value.filter((appointment) => appointment.status === 'Concluída').length,
)
const activeAppointmentCount = computed(() =>
  filteredAppointments.value.filter((appointment) => !['Cancelada', 'Reagendada'].includes(appointment.status)).length,
)
const availableSlotCount = computed(() => {
  let available = 0
  for (const day of calendarDays.value) {
    const dayAppointments = allAppointmentsByDate.value.get(toDateInput(day.date)) || []
    for (const slot of timeSlots.value) {
      const slotStart = slot.minutes
      const slotEnd = slotStart + 30
      const occupied = dayAppointments.some((appointment) => {
        if (['Cancelada', 'Reagendada'].includes(appointment.status)) return false
        const start = timeToMinutes(appointment.appointment_time)
        return start < slotEnd && start + appointment.duration_minutes > slotStart
      })
      if (!occupied) available += 1
    }
  }
  return available
})
const calendarDays = computed(() =>
  Array.from({ length: periodDays.value }, (_, index) => {
    const date = new Date(periodStart.value)
    date.setDate(date.getDate() + index)
    const key = toDateInput(date)
    return {
      date,
      key,
      appointments: appointmentsByDate.value.get(key) || [],
      isToday: key === toDateInput(now.value),
      isSelected: key === toDateInput(currentDate.value),
    }
  }),
)
const monthLeadingBlanks = computed(() => (periodStart.value.getDay() + 6) % 7)
const timeSlots = computed(() => {
  const start = timeToMinutes(clinicOpenTime.value)
  const close = timeToMinutes(clinicCloseTime.value)
  const slots = []
  for (let minute = start; minute + 30 <= close; minute += 30) {
    slots.push({ minutes: minute, label: minutesToTime(minute) })
  }
  return slots
})
const dailyTimeline = computed(() => {
  const rows = selectedDayAppointments.value
    .map((appointment) => ({
      type: ['Cancelada', 'Reagendada'].includes(appointment.status) ? 'inactive' : 'appointment',
      minutes: timeToMinutes(appointment.appointment_time),
      appointment,
    }))
  const occupiedSlots = new Set()
  for (const appointment of rows
    .filter((row) => row.type === 'appointment')
    .map((row) => row.appointment)) {
    const start = timeToMinutes(appointment.appointment_time)
    const end = start + appointment.duration_minutes
    for (const slot of timeSlots.value) {
      if (slot.minutes < end && slot.minutes + 30 > start) occupiedSlots.add(slot.minutes)
    }
  }
  for (const slot of timeSlots.value) {
    if (!occupiedSlots.has(slot.minutes)) rows.push({ type: 'available', minutes: slot.minutes })
  }
  return rows.sort((left, right) => left.minutes - right.minutes)
})
function rowContainsNow(row) {
  if (toDateInput(currentDate.value) !== toDateInput(now.value) || row.type === 'inactive') return false
  const currentMinutes = now.value.getHours() * 60 + now.value.getMinutes()
  const end = row.type === 'appointment'
    ? row.minutes + row.appointment.duration_minutes
    : row.minutes + 30
  return currentMinutes >= row.minutes && currentMinutes < end
}
const metrics = computed(() => [
  { label: 'Consultas agendadas', value: activeAppointmentCount.value, icon: CalendarDays },
  { label: 'Horários livres (estim.)', value: availableSlotCount.value, icon: Clock3, hint: 'blocos de 30 min' },
  { label: 'Consultas confirmadas', value: confirmedCount.value, icon: UserRoundCheck },
  { label: 'Atendimentos concluídos', value: completedCount.value, icon: FileClock },
  { label: 'Bloqueios de agenda', value: '—', icon: Clock3, hint: 'não disponíveis no sistema' },
])

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function compareAppointments(left, right) {
  return left.appointment_time.localeCompare(right.appointment_time)
}

function displayStatus(status) {
  return status === 'Em espera' ? 'Aguardando atendimento' : status
}

function statusVariant(status) {
  if (status === 'Concluída') return 'success'
  if (status === 'Em atendimento') return 'info'
  if (status === 'Em espera') return 'warning'
  return 'neutral'
}

function appointmentEnd(appointment) {
  return minutesToTime(timeToMinutes(appointment.appointment_time) + appointment.duration_minutes)
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${value}T12:00:00`))
}

function formatCreatedAt(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function setDate(value) {
  currentDate.value = parseDateQuery(value)
  void updateRoute()
  void loadAppointments()
}

function navigatePeriod(direction) {
  const next = new Date(currentDate.value)
  if (view.value === 'day') next.setDate(next.getDate() + direction)
  else if (view.value === 'week') next.setDate(next.getDate() + direction * 7)
  else next.setMonth(next.getMonth() + direction, 1)
  currentDate.value = next
  void updateRoute()
  void loadAppointments()
}

function goToToday() {
  currentDate.value = new Date()
  void updateRoute()
  void loadAppointments()
}

function changeView(nextView) {
  view.value = nextView
  void updateRoute()
  void loadAppointments()
}

function updateRoute() {
  const query = { date: toDateInput(currentDate.value), view: view.value }
  if (typeof route.query.patientId === 'string' && search.value === route.query.patientId) {
    query.patientId = route.query.patientId
  }
  void router.replace({
    name: 'dentist-agenda',
    query,
  })
}

async function loadAppointments() {
  const id = ++requestId
  loadState.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const result = await getDentistDashboard({
      date: toDateInput(startOfPeriod(currentDate.value)),
      days: periodLength(currentDate.value),
    })
    if (id !== requestId) return
    if (!result.clinic_open_time || !result.clinic_close_time
      || !Array.isArray(result.appointments)
      || result.appointments.some((appointment) => !appointment.created_at)) {
      throw new Error('A API da agenda está desatualizada. Atualize ou reinicie o backend para carregar os dados completos.')
    }
    appointments.value = result.appointments
    clinicOpenTime.value = result.clinic_open_time.slice(0, 5)
    clinicCloseTime.value = result.clinic_close_time.slice(0, 5)
    loadState.value = 'ready'
  } catch (error) {
    if (id !== requestId) return
    errorMessage.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, 'Não foi possível carregar sua agenda.')
    loadState.value = 'error'
  }
}

function applyFilters() {
  Object.assign(filters, filterDraft)
  activeFilters.value = Object.values(filters).some(Boolean)
  filtersOpen.value = false
}

function clearFilters() {
  Object.assign(filters, emptyFilters())
  Object.assign(filterDraft, emptyFilters())
  activeFilters.value = false
  search.value = ''
}

function selectCalendarDay(day) {
  currentDate.value = new Date(day.date)
  changeView('day')
}

function openDetails(appointment) {
  selectedAppointment.value = appointment
  detailOpen.value = true
}

function openAppointmentOdontogram() {
  if (!selectedAppointment.value) return
  const appointment = selectedAppointment.value
  detailOpen.value = false
  void router.push({
    name: 'dentist-odontogram',
    query: {
      patientId: String(appointment.patient_id),
      appointmentId: String(appointment.id),
    },
  })
}

function handleNavigation(page) {
  if (dentistNavigationRoutes[page]) {
    void router.push({ name: dentistNavigationRoutes[page] })
  }
}

watch(
  () => [route.query.date, route.query.view, route.query.patientId],
  ([date, nextView, patientId]) => {
    if (typeof date === 'string' && date !== toDateInput(currentDate.value)) {
      currentDate.value = parseDateQuery(date)
      void loadAppointments()
    }
    if (['day', 'week', 'month', 'list'].includes(nextView) && nextView !== view.value) {
      view.value = nextView
      void loadAppointments()
    }
    if (typeof patientId === 'string' && patientId !== search.value) {
      search.value = patientId
    }
  },
)

onMounted(() => {
  void loadAppointments()
  timer = window.setInterval(() => {
    now.value = new Date()
    void loadAppointments()
  }, 60_000)
})

onBeforeUnmount(() => {
  requestId += 1
  window.clearInterval(timer)
})
</script>

<template>
  <div class="dentist-agenda-page">
    <DentistShell active-page="schedule" :date-label="dateLabel" @navigate="handleNavigation" />

    <main class="dentist-agenda-main">
      <header class="agenda-intro">
        <div>
          <p class="agenda-eyebrow">PORTAL CLÍNICO</p>
          <h1>Minha Agenda</h1>
          <p>Organize seus horários e acompanhe seus atendimentos</p>
        </div>
        <div class="agenda-intro__actions">
          <UiButton variant="secondary" disabled title="Bloqueios de agenda ainda não estão disponíveis.">
            <template #start><Clock3 :size="16" aria-hidden="true" /></template>
            Bloquear horário
          </UiButton>
          <span class="agenda-disabled-hint">Gerenciamento de horários é feito pela recepção.</span>
        </div>
      </header>

      <section class="agenda-toolbar" aria-label="Controles da agenda">
        <div class="agenda-period">
          <div class="agenda-period__navigation">
            <button type="button" class="agenda-icon-button" aria-label="Período anterior" @click="navigatePeriod(-1)">
              <ChevronLeft :size="18" aria-hidden="true" />
            </button>
            <button type="button" class="agenda-today" @click="goToToday">Hoje</button>
            <button type="button" class="agenda-icon-button" aria-label="Próximo período" @click="navigatePeriod(1)">
              <ChevronRight :size="18" aria-hidden="true" />
            </button>
          </div>
          <label class="agenda-date-picker">
            <CalendarDays :size="16" aria-hidden="true" />
            <span class="visually-hidden">Ir para data</span>
            <input :value="toDateInput(currentDate)" type="date" @change="setDate($event.target.value)" />
          </label>
          <strong class="agenda-period__label">{{ periodLabel }}</strong>
        </div>
        <div class="agenda-toolbar__right">
          <label class="agenda-search">
            <Search :size="17" aria-hidden="true" />
            <span class="visually-hidden">Buscar paciente ou código da consulta</span>
            <input v-model="search" type="search" placeholder="Buscar paciente ou código..." />
          </label>
          <div class="agenda-view-switch" role="group" aria-label="Visualização da agenda">
            <button type="button" :aria-pressed="view === 'day'" @click="changeView('day')">Dia</button>
            <button type="button" :aria-pressed="view === 'week'" @click="changeView('week')">Semana</button>
            <button type="button" :aria-pressed="view === 'month'" @click="changeView('month')">Mês</button>
            <button type="button" :aria-pressed="view === 'list'" aria-label="Lista" @click="changeView('list')">
              <List :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section class="agenda-metrics" aria-label="Indicadores do período">
        <article v-for="metric in metrics" :key="metric.label" class="agenda-metric">
          <span class="agenda-metric__icon"><component :is="metric.icon" :size="17" aria-hidden="true" /></span>
          <div>
            <span>{{ metric.label }}</span>
            <strong>{{ loadState === 'ready' || loadState === 'refreshing' ? metric.value : '—' }}</strong>
            <small v-if="metric.hint">{{ metric.hint }}</small>
          </div>
        </article>
      </section>

      <section class="agenda-panel" aria-labelledby="agenda-calendar-title">
        <div class="agenda-panel__header">
          <div>
            <p class="agenda-eyebrow">AGENDA INDIVIDUAL</p>
            <h2 id="agenda-calendar-title">{{ view === 'list' ? 'Lista de consultas' : 'Calendário de consultas' }}</h2>
          </div>
          <button
            class="agenda-filter-trigger"
            type="button"
            :aria-expanded="filtersOpen"
            @click="filtersOpen = !filtersOpen"
          >
            <SlidersHorizontal :size="16" aria-hidden="true" />
            Filtros
            <span v-if="activeFilters" class="agenda-filter-dot" aria-label="Filtros aplicados"></span>
          </button>
        </div>

        <div v-if="filtersOpen" class="agenda-filter-panel">
          <label>
            <span>Status</span>
            <select v-model="filterDraft.status">
              <option value="">Todos</option>
              <option v-for="status in ['Agendada', 'Em espera', 'Em atendimento', 'Concluída', 'Cancelada', 'Reagendada']" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label>
            <span>Procedimento</span>
            <select v-model="filterDraft.procedure">
              <option value="">Todos</option>
              <option v-for="procedure in procedureOptions" :key="procedure" :value="procedure">{{ procedure }}</option>
            </select>
          </label>
          <label>
            <span>Período do dia</span>
            <select v-model="filterDraft.dayPeriod">
              <option value="">Qualquer horário</option>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="night">Noite</option>
            </select>
          </label>
          <label class="agenda-filter-check">
            <input v-model="filterDraft.confirmed" type="checkbox" />
            Somente confirmadas
          </label>
          <label class="agenda-filter-check">
            <input v-model="filterDraft.waitingConfirmation" type="checkbox" />
            Aguardando confirmação
          </label>
          <label class="agenda-filter-check">
            <input v-model="filterDraft.checkedIn" type="checkbox" />
            Check-in realizado
          </label>
          <div class="agenda-filter-panel__actions">
            <UiButton variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
            <UiButton @click="applyFilters">Aplicar filtros</UiButton>
          </div>
        </div>

        <div v-if="loadState === 'error'" class="agenda-state agenda-state--error" role="alert">
          <div>
            <strong>Agenda indisponível</strong>
            <p>{{ errorMessage }}</p>
          </div>
          <UiButton variant="secondary" @click="loadAppointments">Tentar novamente</UiButton>
        </div>
        <div v-else-if="loadState === 'loading'" class="agenda-state" role="status">
          <span class="agenda-spinner" aria-hidden="true"></span>
          Carregando consultas...
        </div>
        <div v-else-if="view === 'month'" class="month-calendar">
          <div class="month-weekdays" aria-hidden="true">
            <span v-for="day in ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']" :key="day">{{ day }}</span>
          </div>
          <div class="month-grid">
            <span v-for="blank in monthLeadingBlanks" :key="`blank-${blank}`" class="month-blank" aria-hidden="true"></span>
            <button
              v-for="day in calendarDays"
              :key="day.key"
              type="button"
              class="month-day"
              :class="{ 'month-day--today': day.isToday, 'month-day--selected': day.isSelected }"
              :aria-label="`${formatLongDate(day.key)}, ${day.appointments.length} consultas`"
              @click="selectCalendarDay(day)"
            >
              <span class="month-day__number">{{ day.date.getDate() }}</span>
              <span v-if="day.appointments.length" class="month-day__events">
                <i aria-hidden="true"></i>
                {{ day.appointments.length }} {{ day.appointments.length === 1 ? 'consulta' : 'consultas' }}
              </span>
              <span v-else class="month-day__empty">Livre</span>
            </button>
          </div>
        </div>
        <div v-else-if="view === 'week'" class="week-calendar">
          <article v-for="day in calendarDays" :key="day.key" class="week-day" :class="{ 'week-day--today': day.isToday }">
            <button class="week-day__heading" type="button" @click="selectCalendarDay(day)">
              <span>{{ new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day.date) }}</span>
              <strong>{{ day.date.getDate() }}</strong>
              <small>{{ day.appointments.length }} consultas</small>
            </button>
            <button
              v-for="appointment in day.appointments"
              :key="appointment.id"
              type="button"
              class="calendar-appointment calendar-appointment--week"
              :class="`calendar-appointment--${statusVariant(appointment.status)}`"
              @click="openDetails(appointment)"
            >
              <strong>{{ appointment.appointment_time.slice(0, 5) }} · {{ appointment.patient_name }}</strong>
              <span>{{ appointment.procedure }}</span>
              <span class="calendar-appointment__status">{{ displayStatus(appointment.status) }}</span>
            </button>
            <span v-if="!day.appointments.length" class="week-day__empty">Sem consultas</span>
          </article>
        </div>
        <div v-else-if="view === 'day'" class="day-calendar">
          <div v-if="!dailyTimeline.length" class="agenda-empty">
            <CalendarRange :size="23" aria-hidden="true" />
            <strong>{{ search || activeFilters ? 'Nenhum resultado para os filtros' : 'Nenhuma consulta nesta data' }}</strong>
            <span>Não há agendamentos para exibir neste dia.</span>
          </div>
          <div v-else class="timeline">
            <div
              v-for="row in dailyTimeline"
              :key="`${row.type}-${row.minutes}-${row.appointment?.id || ''}`"
              class="timeline-row"
              :class="{ 'timeline-row--current': rowContainsNow(row) }"
            >
              <time :aria-label="`${rowContainsNow(row) ? 'Agora, ' : ''}${minutesToTime(row.minutes)}`">
                {{ minutesToTime(row.minutes) }}<span v-if="rowContainsNow(row)"> Agora</span>
              </time>
              <div class="timeline-row__content">
                <button
                  v-if="row.type !== 'available'"
                  type="button"
                  class="calendar-appointment"
                  :class="[
                    `calendar-appointment--${statusVariant(row.appointment.status)}`,
                    { 'calendar-appointment--inactive': row.type === 'inactive' },
                  ]"
                  @click="openDetails(row.appointment)"
                >
                  <strong>{{ row.appointment.patient_name }}</strong>
                  <span>{{ row.appointment.procedure }} · {{ row.appointment.duration_minutes }} min · até {{ appointmentEnd(row.appointment) }}</span>
                  <span class="calendar-appointment__status">{{ displayStatus(row.appointment.status) }} · {{ row.appointment.confirmation_status }}</span>
                </button>
                <div v-else class="timeline-available"><span>Horário livre · 30 min</span></div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="agenda-list-view">
          <div v-if="!filteredAppointments.length" class="agenda-empty">
            <CalendarDays :size="23" aria-hidden="true" />
            <strong>{{ search || activeFilters ? 'Nenhuma consulta encontrada' : 'Nenhuma consulta neste período' }}</strong>
            <span>Experimente alterar a data, a busca ou os filtros selecionados.</span>
          </div>
          <div v-else class="agenda-table-wrap">
            <table>
              <thead>
                <tr><th>Data</th><th>Horário</th><th>Paciente</th><th>Procedimento</th><th>Duração</th><th>Confirmação</th><th>Status</th><th><span class="visually-hidden">Ações</span></th></tr>
              </thead>
              <tbody>
                <tr v-for="appointment in filteredAppointments" :key="appointment.id">
                  <td>{{ formatDateInput(new Date(`${appointment.appointment_date}T12:00:00`)) }}</td>
                  <td>{{ appointment.appointment_time.slice(0, 5) }}–{{ appointmentEnd(appointment) }}</td>
                  <td><strong>{{ appointment.patient_name }}</strong></td>
                  <td>{{ appointment.procedure }}</td>
                  <td>{{ appointment.duration_minutes }} min</td>
                  <td>{{ appointment.confirmation_status }}</td>
                  <td><UiBadge :variant="statusVariant(appointment.status)">{{ displayStatus(appointment.status) }}</UiBadge></td>
                  <td><button class="agenda-detail-link" type="button" @click="openDetails(appointment)">Detalhes</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <footer v-if="loadState === 'ready' || loadState === 'refreshing'" class="agenda-panel__footer">
          <span>{{ filteredAppointments.length }} consultas no período · Horários livres estimados em blocos de 30 min, sem considerar bloqueios não cadastrados no sistema.</span>
          <span class="agenda-source"><ShieldCheck :size="14" aria-hidden="true" /> Agenda individual</span>
        </footer>
      </section>

      <p class="agenda-permission-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        A agenda é somente para consulta. Criação, bloqueios, cancelamentos e remarcações ainda são gerenciados pela recepção.
      </p>
    </main>

    <UiDialog v-model="detailOpen" title="Detalhes da consulta">
      <div v-if="selectedAppointment" class="appointment-details">
        <div class="appointment-details__patient">
          <UiAvatar :name="selectedAppointment.patient_name" size="md" />
          <div>
            <strong>{{ selectedAppointment.patient_name }}</strong>
            <span>Paciente #{{ selectedAppointment.patient_id }}</span>
          </div>
          <UiBadge :variant="statusVariant(selectedAppointment.status)">{{ displayStatus(selectedAppointment.status) }}</UiBadge>
        </div>
        <dl>
          <div><dt>Código da consulta</dt><dd>#{{ selectedAppointment.id }}</dd></div>
          <div><dt>Data</dt><dd>{{ formatLongDate(selectedAppointment.appointment_date) }}</dd></div>
          <div><dt>Horário</dt><dd>{{ selectedAppointment.appointment_time.slice(0, 5) }}–{{ appointmentEnd(selectedAppointment) }}</dd></div>
          <div><dt>Duração</dt><dd>{{ selectedAppointment.duration_minutes }} minutos</dd></div>
          <div><dt>Procedimento</dt><dd>{{ selectedAppointment.procedure }}</dd></div>
          <div><dt>Confirmação</dt><dd>{{ selectedAppointment.confirmation_status }}</dd></div>
          <div><dt>Agendada em</dt><dd>{{ formatCreatedAt(selectedAppointment.created_at) }}</dd></div>
          <div v-if="selectedAppointment.arrival_at">
            <dt>Check-in</dt>
            <dd>{{ formatCreatedAt(selectedAppointment.arrival_at) }}</dd>
          </div>
        </dl>
        <p class="appointment-details__note">
          Contatos e prontuário não são exibidos aqui. O odontograma está disponível para registros clínicos autorizados.
        </p>
        <UiButton variant="secondary" @click="openAppointmentOdontogram">
          Abrir odontograma deste paciente
        </UiButton>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped>
.dentist-agenda-page { min-height: 100vh; background: var(--color-page); }
.dentist-agenda-main { width: min(100%, 96rem); margin-inline: auto; padding: clamp(var(--space-4), 3vw, var(--space-10)); }
.agenda-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-5); margin-bottom: var(--space-6); }
.agenda-intro h1 { margin: 0; color: var(--color-text); font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.4rem); letter-spacing: var(--letter-spacing-tight); }
.agenda-intro p:not(.agenda-eyebrow) { margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.agenda-eyebrow { margin: 0 0 var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.agenda-intro__actions { display: flex; align-items: center; gap: var(--space-3); }
.agenda-disabled-hint { max-width: 12rem; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.45; }
.agenda-toolbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); margin-bottom: var(--space-5); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.agenda-period, .agenda-period__navigation, .agenda-toolbar__right, .agenda-view-switch, .agenda-search, .agenda-date-picker { display: flex; align-items: center; }
.agenda-period { min-width: 0; flex-wrap: wrap; gap: var(--space-3); }
.agenda-period__navigation { gap: var(--space-1); }
.agenda-icon-button, .agenda-today { min-width: 2.25rem; min-height: 2.25rem; display: inline-grid; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; }
.agenda-today { padding-inline: var(--space-3); font: inherit; font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.agenda-icon-button:hover, .agenda-today:hover { color: var(--color-primary); border-color: var(--color-primary); }
.agenda-date-picker { min-height: 2.25rem; gap: var(--space-2); padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-primary); }
.agenda-date-picker input { width: 8.5rem; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-xs); }
.agenda-period__label { color: var(--color-text); font-size: var(--font-size-sm); text-transform: capitalize; }
.agenda-toolbar__right { justify-content: flex-end; gap: var(--space-3); }
.agenda-search { width: min(18rem, 30vw); min-height: 2.5rem; gap: var(--space-2); padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); }
.agenda-search:focus-within { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.agenda-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-xs); }
.agenda-view-switch { gap: 2px; padding: 3px; border-radius: var(--radius-sm); background: var(--color-background); }
.agenda-view-switch button { min-width: 2.2rem; min-height: 2rem; padding-inline: var(--space-2); display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.agenda-view-switch button[aria-pressed='true'] { background: var(--color-surface); color: var(--color-primary); box-shadow: var(--shadow-sm); font-weight: var(--font-weight-semibold); }
.agenda-view-switch button:focus-visible, .agenda-icon-button:focus-visible, .agenda-today:focus-visible, .agenda-filter-trigger:focus-visible, .calendar-appointment:focus-visible, .month-day:focus-visible, .week-day__heading:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.agenda-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
.agenda-metric { display: flex; min-width: 0; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.agenda-metric__icon { display: grid; width: 2.3rem; height: 2.3rem; flex: 0 0 auto; place-items: center; border-radius: var(--radius-sm); background: var(--color-primary-subtle); color: var(--color-primary); }
.agenda-metric > div { display: grid; min-width: 0; gap: 2px; }
.agenda-metric span:not(.agenda-metric__icon) { color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.35; }
.agenda-metric strong { color: var(--color-text); font-size: var(--font-size-lg); line-height: 1.1; }
.agenda-metric small { color: var(--color-text-muted); font-size: 0.6875rem; }
.agenda-panel { min-width: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.agenda-panel__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-5); border-bottom: 1px solid var(--color-border); }
.agenda-panel__header h2 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); }
.agenda-panel__header .agenda-eyebrow { margin-bottom: var(--space-1); }
.agenda-filter-trigger { position: relative; min-height: 2.4rem; display: inline-flex; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.agenda-filter-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-primary); }
.agenda-filter-panel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); background: var(--color-background); }
.agenda-filter-panel > label:not(.agenda-filter-check) { display: grid; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.agenda-filter-panel select { min-height: 2.4rem; padding-inline: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; }
.agenda-filter-check { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text); font-size: var(--font-size-xs); }
.agenda-filter-check input { width: 1rem; height: 1rem; accent-color: var(--color-primary); }
.agenda-filter-panel__actions { display: flex; justify-content: flex-end; gap: var(--space-2); grid-column: 1 / -1; }
.agenda-state, .agenda-empty { min-height: 12rem; display: flex; align-items: center; justify-content: center; gap: var(--space-3); padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm); text-align: center; }
.agenda-state--error { justify-content: space-between; color: var(--color-danger); }
.agenda-state--error p { margin: var(--space-1) 0 0; color: var(--color-text-secondary); }
.agenda-spinner { width: 1.25rem; height: 1.25rem; border: 2px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: agenda-spin .7s linear infinite; }
.agenda-empty { flex-direction: column; }
.agenda-empty svg { color: var(--color-primary); }
.agenda-empty strong { color: var(--color-text); }
.agenda-empty span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.month-calendar { padding: var(--space-4); }
.month-weekdays, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.month-weekdays { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); text-align: center; }
.month-weekdays span { padding: var(--space-2); }
.month-day, .month-blank { min-height: 5.3rem; border: 1px solid var(--color-border); }
.month-day { display: grid; align-content: start; justify-items: start; gap: var(--space-2); padding: var(--space-2); background: var(--color-surface); color: var(--color-text); cursor: pointer; text-align: left; }
.month-day:hover { background: var(--color-primary-subtle); }
.month-day--today .month-day__number { color: var(--color-primary); font-weight: var(--font-weight-bold); }
.month-day--selected { box-shadow: inset 0 0 0 2px var(--color-primary); }
.month-day__number { font-size: var(--font-size-sm); }
.month-day__events { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-primary); font-size: 0.6875rem; }
.month-day__events i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.month-day__empty { color: var(--color-text-muted); font-size: 0.6875rem; }
.week-calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-height: 20rem; }
.week-day { min-width: 0; padding: var(--space-2); border-right: 1px solid var(--color-border); }
.week-day:last-child { border-right: 0; }
.week-day--today { background: var(--color-primary-subtle); }
.week-day__heading { width: 100%; display: grid; justify-items: center; gap: 2px; margin-bottom: var(--space-3); padding: var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); cursor: pointer; text-transform: capitalize; }
.week-day__heading strong { color: var(--color-text); font-size: var(--font-size-lg); }
.week-day__heading small { font-size: 0.65rem; }
.week-day__empty { display: block; padding: var(--space-2); color: var(--color-text-muted); font-size: 0.6875rem; text-align: center; }
.calendar-appointment { width: 100%; display: grid; gap: 3px; margin-bottom: var(--space-2); padding: var(--space-2); border: 0; border-left: 3px solid var(--color-primary); border-radius: var(--radius-sm); background: var(--color-primary-subtle); color: var(--color-text); cursor: pointer; text-align: left; }
.calendar-appointment:hover { filter: brightness(.97); }
.calendar-appointment strong { overflow: hidden; font-size: 0.6875rem; text-overflow: ellipsis; white-space: nowrap; }
.calendar-appointment span { overflow: hidden; color: var(--color-text-secondary); font-size: 0.65rem; text-overflow: ellipsis; white-space: nowrap; }
.calendar-appointment--success { border-left-color: var(--color-success); background: var(--color-success-subtle); }
.calendar-appointment--warning { border-left-color: var(--color-warning); background: var(--color-warning-subtle); }
.calendar-appointment--info { border-left-color: var(--color-primary); }
.calendar-appointment--neutral { border-left-color: var(--color-text-muted); background: var(--color-background); }
.calendar-appointment--inactive { opacity: .72; }
.calendar-appointment__status { font-weight: var(--font-weight-semibold); }
.day-calendar { padding: var(--space-4) var(--space-5); }
.timeline-row { display: grid; grid-template-columns: 4rem minmax(0, 1fr); min-height: 3.7rem; gap: var(--space-3); }
.timeline-row > time { padding-top: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; text-align: right; }
.timeline-row--current > time { color: var(--color-primary); font-weight: var(--font-weight-semibold); }
.timeline-row--current .timeline-row__content { border-top-color: var(--color-primary); }
.timeline-row--current .calendar-appointment { box-shadow: inset 0 0 0 1px var(--color-primary); }
.timeline-row__content { min-width: 0; border-top: 1px solid var(--color-border); }
.timeline-available { min-height: 3.6rem; display: flex; align-items: center; padding-inline: var(--space-3); color: var(--color-text-muted); font-size: var(--font-size-xs); }
.timeline-row .calendar-appointment { min-height: 3.5rem; margin: 2px 0; padding: var(--space-2) var(--space-3); }
.timeline-row .calendar-appointment strong { font-size: var(--font-size-sm); }
.timeline-row .calendar-appointment span { font-size: var(--font-size-xs); }
.agenda-table-wrap { overflow-x: auto; }
.agenda-table-wrap table { width: 100%; border-collapse: collapse; text-align: left; }
.agenda-table-wrap th, .agenda-table-wrap td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-xs); white-space: nowrap; }
.agenda-table-wrap th { background: var(--color-background); color: var(--color-text-secondary); font-weight: var(--font-weight-semibold); }
.agenda-table-wrap td strong { color: var(--color-text); }
.agenda-detail-link { padding: var(--space-1); border: 0; background: none; color: var(--color-primary); cursor: pointer; font: inherit; font-weight: var(--font-weight-semibold); }
.agenda-panel__footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: var(--font-size-xs); }
.agenda-source { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--space-1); color: var(--color-text-secondary); }
.agenda-permission-note { display: flex; align-items: flex-start; gap: var(--space-2); margin: var(--space-4) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
.agenda-permission-note svg { flex: 0 0 auto; color: var(--color-primary); }
.appointment-details { display: grid; gap: var(--space-4); }
.appointment-details__patient { display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
.appointment-details__patient > div { display: grid; flex: 1; gap: var(--space-1); }
.appointment-details__patient strong { color: var(--color-text); }
.appointment-details__patient span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.appointment-details dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
.appointment-details dl > div { min-width: 0; }
.appointment-details dt { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.appointment-details dd { margin: var(--space-1) 0 0; color: var(--color-text); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.appointment-details__note { margin: 0; padding: var(--space-3); border-radius: var(--radius-sm); background: var(--color-background); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
@keyframes agenda-spin { to { transform: rotate(360deg); } }
@media (max-width: 68rem) { .agenda-toolbar { align-items: stretch; flex-direction: column; } .agenda-toolbar__right { justify-content: space-between; } .agenda-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .week-calendar { overflow-x: auto; grid-template-columns: repeat(7, minmax(8rem, 1fr)); } }
@media (max-width: 42.5rem) { .dentist-agenda-main { padding: var(--space-4); } .agenda-intro { align-items: flex-start; flex-direction: column; } .agenda-intro__actions { align-items: flex-start; flex-direction: column; } .agenda-period { align-items: flex-start; } .agenda-toolbar__right { align-items: stretch; flex-direction: column; } .agenda-search { width: 100%; } .agenda-view-switch { justify-content: stretch; } .agenda-view-switch button { flex: 1; } .agenda-metrics { gap: var(--space-2); } .agenda-metric { align-items: flex-start; gap: var(--space-2); padding: var(--space-3); } .agenda-metric__icon { width: 2rem; height: 2rem; } .agenda-metric span:not(.agenda-metric__icon) { font-size: 0.6875rem; } .agenda-panel__header { padding: var(--space-4); } .agenda-filter-panel { grid-template-columns: 1fr; padding: var(--space-4); } .agenda-filter-panel__actions { grid-column: 1; flex-wrap: wrap; } .agenda-filter-panel__actions > :deep(button) { flex: 1; } .month-calendar { padding: var(--space-2); } .month-day, .month-blank { min-height: 3.5rem; } .month-day { justify-items: center; padding: var(--space-1); } .month-day__events { font-size: 0; } .month-day__events i { width: 7px; height: 7px; } .month-day__empty { display: none; } .week-calendar { grid-template-columns: repeat(7, minmax(7.5rem, 1fr)); } .agenda-panel__footer { align-items: flex-start; flex-direction: column; padding-inline: var(--space-4); } .appointment-details dl { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .agenda-spinner { animation: none; } }
</style>
