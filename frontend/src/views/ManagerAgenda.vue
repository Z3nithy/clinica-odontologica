<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CalendarDays,
  CalendarRange,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import { getReceptionAppointments, getReceptionDentists } from '../services/reception'
import ManagerShell from '../components/ManagerShell.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const route = useRoute()
const router = useRouter()
const today = new Date()
const selectedDate = ref(validDateQuery(route.query.date) ? String(route.query.date) : dateKey(today))
const viewMode = ref(['day', 'week', 'month'].includes(route.query.view) ? String(route.query.view) : 'week')
const selectedDentist = ref(
  typeof route.query.dentist_id === 'string' ? route.query.dentist_id : '',
)
const selectedStatus = ref(typeof route.query.status === 'string' ? route.query.status : '')
const lastValidDate = ref(selectedDate.value)
const dateInputError = ref('')
const appointments = ref([])
const dentists = ref([])
const state = ref('loading')
const errorMessage = ref('')
const partialError = ref('')
const selectedAppointment = ref(null)
const detailsOpen = ref(false)
const lastUpdated = ref(null)
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
let loadRequestId = 0

function dateKey(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function fromDateKey(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function validDateQuery(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(fromDateKey(value).getTime())
    && dateKey(fromDateKey(value)) === value
}

const dateLabel = computed(() => new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(today))

const range = computed(() => {
  const anchor = fromDateKey(selectedDate.value)
  if (viewMode.value === 'day') return { start: anchor, end: anchor }
  if (viewMode.value === 'week') {
    const start = new Date(anchor)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { start, end }
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  return { start, end }
})

const rangeKeys = computed(() => ({
  start: dateKey(range.value.start),
  end: dateKey(range.value.end),
}))

const periodTitle = computed(() => {
  if (viewMode.value === 'day') {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(range.value.start)
  }
  if (viewMode.value === 'month') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(range.value.start)
  }
  const format = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
  return `${format.format(range.value.start)} – ${format.format(range.value.end)}`
})

const filteredAppointments = computed(() => appointments.value
  .filter((appointment) => !selectedDentist.value || String(appointment.dentist_id) === selectedDentist.value)
  .filter((appointment) => !selectedStatus.value || appointment.status === selectedStatus.value)
  .slice()
  .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`)))

const groupedDays = computed(() => {
  const days = []
  for (let cursor = new Date(range.value.start); cursor <= range.value.end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor)
    days.push({
      key,
      date: new Date(cursor),
      items: filteredAppointments.value.filter((appointment) => appointment.appointment_date === key),
    })
  }
  return days
})

const calendarDays = computed(() => {
  if (viewMode.value !== 'month') return groupedDays.value
  const leadingDays = (range.value.start.getDay() + 6) % 7
  return [
    ...Array.from({ length: leadingDays }, (_, index) => ({ key: `blank-${index}`, blank: true, items: [] })),
    ...groupedDays.value,
  ]
})

const visibleAppointments = computed(() => {
  if (viewMode.value === 'day') {
    return filteredAppointments.value.filter((appointment) => appointment.appointment_date === selectedDate.value)
  }
  return filteredAppointments.value
})

const pendingConfirmations = computed(() => visibleAppointments.value.filter(
  (appointment) => appointment.confirmation_status === 'Pendente' && appointment.status !== 'Cancelada',
))
const cancelledAppointments = computed(() => visibleAppointments.value.filter(
  (appointment) => appointment.status === 'Cancelada',
))
const completedAppointments = computed(() => visibleAppointments.value.filter(
  (appointment) => appointment.status === 'Concluída' && appointment.appointment_date <= dateKey(today),
))
const metrics = computed(() => [
  {
    label: 'Consultas no período',
    value: visibleAppointments.value.length,
    icon: CalendarDays,
    tone: 'blue',
    description: 'Agendamentos encontrados no intervalo, incluindo todos os status atuais.',
  },
  {
    label: 'Aguardando confirmação',
    value: pendingConfirmations.value.length,
    icon: CircleAlert,
    tone: 'amber',
    description: 'Consultas com confirmação pendente, exceto consultas canceladas.',
  },
  {
    label: 'Concluídas',
    value: completedAppointments.value.length,
    icon: CheckCheck,
    tone: 'green',
    description: 'Consultas com status Concluída e data não futura.',
  },
  {
    label: 'Canceladas',
    value: cancelledAppointments.value.length,
    icon: XCircle,
    tone: 'red',
    description: 'Consultas cujo status atual é Cancelada.',
  },
])

const appointmentConflicts = computed(() => {
  const conflicts = []
  const grouped = new Map()
  for (const appointment of filteredAppointments.value) {
    if (['Cancelada', 'Não compareceu'].includes(appointment.status)) continue
    const key = `${appointment.appointment_date}:${appointment.dentist_id}`
    grouped.set(key, [...(grouped.get(key) || []), appointment])
  }
  for (const items of grouped.values()) {
    const sorted = items.slice().sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
    for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
      const first = sorted[firstIndex]
      const firstStart = timeToMinutes(first.appointment_time)
      const firstEnd = firstStart + first.duration_minutes
      for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
        const second = sorted[secondIndex]
        const secondStart = timeToMinutes(second.appointment_time)
        if (secondStart >= firstEnd) break
        conflicts.push({ first, second })
      }
    }
  }
  return conflicts
})

const statusClass = (status) => {
  if (status === 'Concluída' || status === 'Confirmada') return 'manager-agenda-status--positive'
  if (status === 'Cancelada' || status === 'Não compareceu') return 'manager-agenda-status--negative'
  if (status === 'Em atendimento' || status === 'Em espera' || status === 'Aguardando chegada') {
    return 'manager-agenda-status--attention'
  }
  return 'manager-agenda-status--neutral'
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function formatTime(value) {
  return String(value || '').slice(0, 5)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(fromDateKey(value))
}

function formatWeekday(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(value).replace('.', '')
}

function formatDateDay(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(value)
}

function appointmentEnd(appointment) {
  const end = timeToMinutes(appointment.appointment_time) + appointment.duration_minutes
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

async function loadAgenda() {
  const currentRequest = ++loadRequestId
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  partialError.value = ''
  const requests = await Promise.allSettled([
    getReceptionAppointments({
      date: rangeKeys.value.start,
      date_to: rangeKeys.value.end,
      dentist_id: selectedDentist.value ? Number(selectedDentist.value) : undefined,
      status: selectedStatus.value || undefined,
    }),
    dentists.value.length ? Promise.resolve(dentists.value) : getReceptionDentists(),
  ])
  if (currentRequest !== loadRequestId) return
  const [appointmentsResult, dentistsResult] = requests
  if (appointmentsResult.status === 'rejected') {
    errorMessage.value = getApiErrorMessage(
      appointmentsResult.reason,
      'Não foi possível carregar os agendamentos autorizados.',
    )
    state.value = 'error'
    return
  }
  appointments.value = appointmentsResult.value.items
  if (dentistsResult.status === 'fulfilled') {
    dentists.value = dentistsResult.value
  } else {
    partialError.value = getApiErrorMessage(dentistsResult.reason, 'A lista de profissionais não pôde ser carregada.')
  }
  lastUpdated.value = new Date()
  state.value = 'ready'
}

function setView(mode) {
  viewMode.value = mode
  void updateRouteQuery()
  void loadAgenda()
}

function movePeriod(direction) {
  const date = fromDateKey(selectedDate.value)
  if (viewMode.value === 'day') date.setDate(date.getDate() + direction)
  else if (viewMode.value === 'week') date.setDate(date.getDate() + direction * 7)
  else date.setMonth(date.getMonth() + direction, 1)
  selectedDate.value = dateKey(date)
  lastValidDate.value = selectedDate.value
  dateInputError.value = ''
  void updateRouteQuery()
  void loadAgenda()
}

function goToToday() {
  selectedDate.value = dateKey(today)
  lastValidDate.value = selectedDate.value
  dateInputError.value = ''
  void updateRouteQuery()
  void loadAgenda()
}

async function updateRouteQuery() {
  await router.replace({
    name: 'manager-agenda',
    query: {
      date: selectedDate.value,
      view: viewMode.value,
      ...(selectedDentist.value ? { dentist_id: selectedDentist.value } : {}),
      ...(selectedStatus.value ? { status: selectedStatus.value } : {}),
    },
  })
}

function applyFilters() {
  if (!validDateQuery(selectedDate.value)) {
    selectedDate.value = lastValidDate.value
    dateInputError.value = 'Selecione uma data válida para consultar a agenda.'
    return
  }
  lastValidDate.value = selectedDate.value
  dateInputError.value = ''
  void updateRouteQuery()
  void loadAgenda()
}

function handleDateChange() {
  applyFilters()
}

function clearFilters() {
  selectedDentist.value = ''
  selectedStatus.value = ''
  void updateRouteQuery()
  void loadAgenda()
}

function showDetails(appointment) {
  selectedAppointment.value = appointment
  detailsOpen.value = true
}

function openDay(day) {
  if (!day?.key || day.blank) return
  selectedDate.value = day.key
  lastValidDate.value = selectedDate.value
  dateInputError.value = ''
  viewMode.value = 'day'
  void updateRouteQuery()
  void loadAgenda()
}

function navigateShell(id) {
  if (id === 'overview') void router.push({ name: 'manager-dashboard' })
  if (id === 'schedule') window.scrollTo({ top: 0, behavior: 'auto' })
  if (id === 'team') void router.push({ name: 'manager-team' })
  if (id === 'productivity') void router.push({ name: 'manager-productivity' })
  if (id === 'patients') void router.push({ name: 'manager-patients' })
  if (id === 'reports') void router.push({ name: 'manager-reports' })
  if (id === 'settings') void router.push({ name: 'manager-settings' })
}

onMounted(() => {
  void loadAgenda()
})

onBeforeUnmount(() => {
  loadRequestId += 1
})
</script>

<template>
  <div class="manager-agenda-page">
    <ManagerShell
      active-page="schedule"
      :date-label="dateLabel"
      @navigate="navigateShell"
    />

    <main class="manager-agenda-main">
      <header class="manager-agenda-intro">
        <div>
          <p class="manager-agenda-eyebrow">PORTAL DO GESTOR</p>
          <h1>Visão Geral da Agenda</h1>
          <p>Acompanhe os agendamentos e a disponibilidade da clínica</p>
        </div>
        <span class="manager-agenda-readonly">
          <ShieldCheck :size="16" aria-hidden="true" />
          Consulta gerencial · somente leitura
        </span>
      </header>

      <section class="manager-agenda-filter-panel" aria-label="Filtros e controles da agenda">
        <div class="manager-agenda-toolbar">
          <div class="manager-agenda-period-navigation">
            <button type="button" class="manager-agenda-icon-button" aria-label="Período anterior" @click="movePeriod(-1)">
              <ChevronLeft :size="18" aria-hidden="true" />
            </button>
            <button type="button" class="manager-agenda-today" @click="goToToday">Hoje</button>
            <button type="button" class="manager-agenda-icon-button" aria-label="Próximo período" @click="movePeriod(1)">
              <ChevronRight :size="18" aria-hidden="true" />
            </button>
            <label class="manager-agenda-date">
              <CalendarDays :size="16" aria-hidden="true" />
              <span class="visually-hidden">Selecionar data</span>
              <input v-model="selectedDate" type="date" required :aria-invalid="Boolean(dateInputError)" @change="handleDateChange">
            </label>
          </div>
          <div class="manager-agenda-view-switch" role="group" aria-label="Visualização da agenda">
            <button type="button" :aria-pressed="viewMode === 'day'" @click="setView('day')">Dia</button>
            <button type="button" :aria-pressed="viewMode === 'week'" @click="setView('week')">Semana</button>
            <button type="button" :aria-pressed="viewMode === 'month'" @click="setView('month')">Mês</button>
          </div>
          <button
            type="button"
            class="manager-agenda-icon-button"
            aria-label="Atualizar agenda"
            :disabled="state === 'loading' || state === 'refreshing'"
            @click="loadAgenda"
          >
            <RefreshCw :size="17" :class="{ 'manager-agenda-spin': state === 'refreshing' }" aria-hidden="true" />
          </button>
        </div>
        <p v-if="dateInputError" class="manager-agenda-date-error" role="alert">{{ dateInputError }}</p>
        <form class="manager-agenda-filters" @submit.prevent="applyFilters">
          <label>
            <span>Profissional</span>
            <select v-model="selectedDentist">
              <option value="">Todos os profissionais</option>
              <option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">
                {{ dentist.name }}
              </option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select v-model="selectedStatus">
              <option value="">Todos os status</option>
              <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <div class="manager-agenda-filter-actions">
            <UiButton type="button" size="sm" variant="secondary" @click="clearFilters">Limpar</UiButton>
            <UiButton type="submit" size="sm">Aplicar filtros</UiButton>
          </div>
        </form>
        <div class="manager-agenda-limitation">
          <Info :size="16" aria-hidden="true" />
          <p>
            <strong>Unidade e ocupação:</strong> o sistema possui somente uma unidade vinculada por clínica e não fornece configuração de expediente ou capacidade para calcular ocupação. Por isso, esses filtros e percentuais não são estimados.
          </p>
        </div>
      </section>

      <section class="manager-agenda-metrics" aria-label="Indicadores do período">
        <article v-for="metric in metrics" :key="metric.label" class="manager-agenda-metric">
          <div class="manager-agenda-metric__top">
            <span class="manager-agenda-metric__icon" :class="`manager-agenda-tone--${metric.tone}`">
              <component :is="metric.icon" :size="18" aria-hidden="true" />
            </span>
            <span class="manager-agenda-help" tabindex="0" :title="metric.description" :aria-label="metric.description">i</span>
          </div>
          <span>{{ metric.label }}</span>
          <strong v-if="state === 'loading' || state === 'refreshing'" class="manager-agenda-skeleton" aria-label="Carregando indicador"></strong>
          <strong v-else>{{ state === 'error' ? '—' : metric.value }}</strong>
        </article>
      </section>

      <div v-if="partialError" class="manager-agenda-notice" role="status">
        <CircleAlert :size="17" aria-hidden="true" />
        <span>{{ partialError }}</span>
      </div>
      <div v-if="appointmentConflicts.length && state === 'ready'" class="manager-agenda-notice manager-agenda-notice--warning" role="status">
        <CircleAlert :size="17" aria-hidden="true" />
        <span>{{ appointmentConflicts.length }} sobreposição(ões) de horário detectada(s) para o mesmo profissional. Confira os detalhes; durações seguem o cadastro da agenda.</span>
      </div>

      <section class="manager-agenda-calendar-panel" aria-labelledby="manager-calendar-title">
        <div class="manager-agenda-calendar-header">
          <div>
            <p class="manager-agenda-eyebrow">AGENDA DA CLÍNICA</p>
            <h2 id="manager-calendar-title">{{ periodTitle }}</h2>
            <p>{{ visibleAppointments.length }} compromisso(s) no período visível</p>
          </div>
          <span class="manager-agenda-updated">
            {{ lastUpdated ? `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(lastUpdated)}` : 'Aguardando atualização' }}
          </span>
        </div>

        <div v-if="state === 'loading'" class="manager-agenda-calendar-skeleton" role="status" aria-label="Carregando agenda"></div>
        <div v-else-if="state === 'error'" class="manager-agenda-state manager-agenda-state--error" role="alert">
          <CircleAlert :size="24" aria-hidden="true" />
          <strong>Não foi possível carregar os agendamentos</strong>
          <p>{{ errorMessage }}</p>
          <UiButton variant="secondary" @click="loadAgenda">Tentar novamente</UiButton>
        </div>
        <template v-else>
          <div v-if="!visibleAppointments.length && viewMode === 'day'" class="manager-agenda-empty">
            <CalendarRange :size="24" aria-hidden="true" />
            <strong>Nenhum compromisso encontrado</strong>
            <p>Experimente outro período ou ajuste os filtros.</p>
          </div>

          <div v-else-if="viewMode === 'day'" class="manager-agenda-list">
            <article
              v-for="appointment in visibleAppointments"
              :key="appointment.id"
              class="manager-agenda-appointment"
              tabindex="0"
              role="button"
              :aria-label="`Ver consulta de ${appointment.patient_name} às ${formatTime(appointment.appointment_time)}`"
              @click="showDetails(appointment)"
              @keydown.enter.prevent="showDetails(appointment)"
              @keydown.space.prevent="showDetails(appointment)"
            >
              <time>{{ formatTime(appointment.appointment_time) }}</time>
              <span class="manager-agenda-appointment__duration">{{ appointment.duration_minutes }} min</span>
              <div class="manager-agenda-appointment__details">
                <strong>{{ appointment.patient_name }}</strong>
                <span>{{ appointment.procedure }} · {{ appointment.dentist_name }}</span>
              </div>
              <span class="manager-agenda-status" :class="statusClass(appointment.status)">{{ appointment.status }}</span>
            </article>
          </div>

          <div v-else-if="viewMode === 'week'" class="manager-agenda-week">
            <p v-if="!visibleAppointments.length" class="manager-agenda-empty-note" role="status">
              Nenhum compromisso encontrado. Selecione outro período ou ajuste os filtros.
            </p>
            <section
              v-for="day in groupedDays"
              :key="day.key"
              class="manager-agenda-week__day"
              :class="{ 'manager-agenda-week__day--today': day.key === dateKey(today), 'manager-agenda-week__day--selected': day.key === selectedDate }"
            >
              <button type="button" class="manager-agenda-week__heading" @click="openDay(day)">
                <span>{{ formatWeekday(day.date) }}</span>
                <strong>{{ formatDateDay(day.date) }}</strong>
                <small>{{ day.items.length }} consultas</small>
              </button>
              <button
                v-for="appointment in day.items"
                :key="appointment.id"
                type="button"
                class="manager-agenda-week__appointment"
                :class="statusClass(appointment.status)"
                @click="showDetails(appointment)"
              >
                <time>{{ formatTime(appointment.appointment_time) }}</time>
                <strong>{{ appointment.patient_name }}</strong>
                <small>{{ appointment.dentist_name }}</small>
                <span>{{ appointment.status }}</span>
              </button>
              <p v-if="!day.items.length" class="manager-agenda-week__empty">Sem consultas</p>
            </section>
          </div>

          <div v-else class="manager-agenda-month">
            <p v-if="!visibleAppointments.length" class="manager-agenda-empty-note" role="status">
              Nenhum compromisso encontrado. Selecione outro período ou ajuste os filtros.
            </p>
            <span v-for="weekday in ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']" :key="weekday" class="manager-agenda-month__weekday">{{ weekday }}</span>
            <div
              v-for="day in calendarDays"
              :key="day.key"
              class="manager-agenda-month__day"
              :class="{
                'manager-agenda-month__day--blank': day.blank,
                'manager-agenda-month__day--today': day.key === dateKey(today),
                'manager-agenda-month__day--selected': day.key === selectedDate,
              }"
            >
              <template v-if="!day.blank">
                <button type="button" class="manager-agenda-month__date" @click="openDay(day)">
                  {{ formatDateDay(day.date) }}
                </button>
                <button
                  v-for="appointment in day.items.slice(0, 3)"
                  :key="appointment.id"
                  type="button"
                  class="manager-agenda-month__item"
                  :class="statusClass(appointment.status)"
                  :aria-label="`${formatTime(appointment.appointment_time)} · ${appointment.patient_name} · ${appointment.status}`"
                  :title="`${formatTime(appointment.appointment_time)} · ${appointment.patient_name} · ${appointment.status}`"
                  @click="showDetails(appointment)"
                >
                  <time>{{ formatTime(appointment.appointment_time) }}</time>
                  <span>{{ appointment.patient_name }}</span>
                </button>
                <small v-if="day.items.length > 3" class="manager-agenda-month__more">+{{ day.items.length - 3 }} consultas</small>
              </template>
            </div>
          </div>
        </template>

        <div v-if="state === 'ready'" class="manager-agenda-legend" aria-label="Legenda de status">
          <span><i class="manager-agenda-legend__dot manager-agenda-legend__dot--positive"></i>Confirmada / Concluída</span>
          <span><i class="manager-agenda-legend__dot manager-agenda-legend__dot--neutral"></i>Agendada / em espera</span>
          <span><i class="manager-agenda-legend__dot manager-agenda-legend__dot--attention"></i>Aguardando / em atendimento</span>
          <span><i class="manager-agenda-legend__dot manager-agenda-legend__dot--negative"></i>Cancelada / falta</span>
        </div>
      </section>

      <section class="manager-agenda-operations" aria-labelledby="manager-operations-title">
        <div class="manager-agenda-operations__heading">
          <div>
            <p class="manager-agenda-eyebrow">ACOMPANHAMENTO</p>
            <h2 id="manager-operations-title">Ocorrências do período</h2>
          </div>
        </div>
        <div v-if="state === 'loading'" class="manager-agenda-calendar-skeleton manager-agenda-calendar-skeleton--short" role="status" aria-label="Carregando ocorrências"></div>
        <template v-else-if="state === 'ready'">
          <article v-if="pendingConfirmations.length" class="manager-agenda-occurrence">
            <span class="manager-agenda-occurrence__icon manager-agenda-tone--amber"><CircleAlert :size="18" aria-hidden="true" /></span>
            <div>
              <strong>{{ pendingConfirmations.length }} consulta(s) aguardando confirmação</strong>
              <p>Registros marcados como pendentes, sem considerar consultas canceladas.</p>
            </div>
          </article>
          <article v-if="appointmentConflicts.length" class="manager-agenda-occurrence manager-agenda-occurrence--warning">
            <span class="manager-agenda-occurrence__icon manager-agenda-tone--red"><Clock3 :size="18" aria-hidden="true" /></span>
            <div>
              <strong>{{ appointmentConflicts.length }} sobreposição(ões) no mesmo profissional</strong>
              <p>O intervalo foi comparado usando início e duração cadastrados na agenda; revise os registros antes de qualquer ajuste.</p>
            </div>
          </article>
          <p v-if="!pendingConfirmations.length && !appointmentConflicts.length" class="manager-agenda-no-occurrence">
            Nenhuma pendência de confirmação ou sobreposição de horário detectada neste período.
          </p>
        </template>
      </section>
      <p class="manager-agenda-footer">
        Consulta gerencial restrita à clínica vinculada à sua conta. Esta tela não permite criar, editar, confirmar, cancelar ou reagendar consultas.
      </p>
    </main>

    <UiDialog v-model="detailsOpen" title="Detalhes do compromisso">
      <template v-if="selectedAppointment">
        <dl class="manager-agenda-details">
          <div><dt>Código</dt><dd>#{{ selectedAppointment.id }}</dd></div>
          <div><dt>Data</dt><dd>{{ formatDate(selectedAppointment.appointment_date) }}</dd></div>
          <div><dt>Horário previsto</dt><dd>{{ formatTime(selectedAppointment.appointment_time) }}–{{ appointmentEnd(selectedAppointment) }} · {{ selectedAppointment.duration_minutes }} min</dd></div>
          <div><dt>Paciente</dt><dd>{{ selectedAppointment.patient_name }} · #{{ selectedAppointment.patient_id }}</dd></div>
          <div><dt>Profissional</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
          <div><dt>Tipo / procedimento previsto</dt><dd>{{ selectedAppointment.procedure }}</dd></div>
          <div><dt>Status atual</dt><dd><span class="manager-agenda-status" :class="statusClass(selectedAppointment.status)">{{ selectedAppointment.status }}</span></dd></div>
          <div><dt>Confirmação</dt><dd>{{ selectedAppointment.confirmation_status }}</dd></div>
          <div><dt>Chegada registrada</dt><dd>{{ selectedAppointment.arrival_at ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedAppointment.arrival_at)) : 'Sem horário de chegada registrado' }}</dd></div>
        </dl>
        <p class="manager-agenda-details-note">
          <ShieldCheck :size="15" aria-hidden="true" />
          Horários previstos da agenda; nenhum registro clínico é exibido neste painel gerencial.
        </p>
      </template>
      <template #footer>
        <UiButton variant="secondary" @click="detailsOpen = false">Fechar</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.manager-agenda-page {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
}

.manager-agenda-main {
  display: grid;
  width: min(100% - 3rem, 88rem);
  gap: var(--space-5);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-10);
}

.manager-agenda-intro,
.manager-agenda-toolbar,
.manager-agenda-period-navigation,
.manager-agenda-calendar-header,
.manager-agenda-metric__top,
.manager-agenda-appointment,
.manager-agenda-operations__heading,
.manager-agenda-occurrence,
.manager-agenda-details-note {
  display: flex;
  align-items: center;
}

.manager-agenda-intro,
.manager-agenda-calendar-header {
  justify-content: space-between;
  gap: var(--space-4);
}

.manager-agenda-eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.manager-agenda-intro h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.7rem, 3vw, 2.25rem);
  letter-spacing: -0.035em;
}

.manager-agenda-intro p:not(.manager-agenda-eyebrow) {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}

.manager-agenda-readonly,
.manager-agenda-updated {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-agenda-filter-panel,
.manager-agenda-calendar-panel,
.manager-agenda-operations {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-agenda-toolbar {
  justify-content: space-between;
  gap: var(--space-3);
}

.manager-agenda-period-navigation {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.manager-agenda-icon-button,
.manager-agenda-today {
  display: inline-grid;
  min-width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
}

.manager-agenda-today {
  padding-inline: var(--space-3);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.manager-agenda-icon-button:hover,
.manager-agenda-today:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}

.manager-agenda-icon-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.manager-agenda-date {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
}

.manager-agenda-date input {
  width: 8.5rem;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
}

.manager-agenda-date-error {
  margin: calc(-1 * var(--space-2)) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}

.manager-agenda-view-switch {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.manager-agenda-view-switch button {
  min-height: 2rem;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
}

.manager-agenda-view-switch button[aria-pressed='true'] {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  font-weight: var(--font-weight-semibold);
}

.manager-agenda-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.manager-agenda-filters > label {
  display: grid;
  min-width: 12rem;
  flex: 1 1 12rem;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-agenda-filters select {
  min-height: 2.65rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.manager-agenda-filter-actions {
  display: flex;
  gap: var(--space-2);
}

.manager-agenda-limitation {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.manager-agenda-limitation svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: var(--color-primary);
}

.manager-agenda-limitation p {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.manager-agenda-limitation strong {
  color: var(--color-text);
}

.manager-agenda-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.manager-agenda-metric {
  display: grid;
  min-height: 8rem;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-agenda-metric__top {
  justify-content: space-between;
}

.manager-agenda-metric__icon,
.manager-agenda-occurrence__icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
}

.manager-agenda-help {
  display: inline-grid;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  cursor: help;
  font-size: var(--font-size-xs);
}

.manager-agenda-metric > span:not(.manager-agenda-metric__icon) {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-agenda-metric > strong {
  font-family: var(--font-heading);
  font-size: 1.65rem;
  line-height: 1.1;
}

.manager-agenda-tone--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.manager-agenda-tone--green { background: var(--color-success-subtle); color: var(--color-success); }
.manager-agenda-tone--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.manager-agenda-tone--red { background: var(--color-danger-subtle); color: var(--color-danger); }

.manager-agenda-calendar-header h2,
.manager-agenda-operations h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  letter-spacing: -0.02em;
}

.manager-agenda-calendar-header > div > p:last-child {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-agenda-calendar-skeleton {
  min-height: 24rem;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--color-background), var(--color-border), var(--color-background));
  background-size: 200% 100%;
  animation: manager-agenda-shimmer 1.4s ease-in-out infinite;
}

.manager-agenda-calendar-skeleton--short {
  min-height: 5rem;
}

.manager-agenda-state,
.manager-agenda-empty {
  display: grid;
  min-height: 14rem;
  justify-items: center;
  align-content: center;
  gap: var(--space-2);
  padding: var(--space-5);
  color: var(--color-text-secondary);
  text-align: center;
}

.manager-agenda-state strong,
.manager-agenda-empty strong {
  color: var(--color-text);
}

.manager-agenda-state p,
.manager-agenda-empty p {
  margin: 0;
  font-size: var(--font-size-sm);
}

.manager-agenda-empty-note {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-agenda-state--error > svg,
.manager-agenda-notice {
  color: var(--color-danger);
}

.manager-agenda-list {
  display: grid;
}

.manager-agenda-appointment {
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.manager-agenda-appointment:hover,
.manager-agenda-appointment:focus-visible {
  outline: 0;
  background: var(--color-background);
}

.manager-agenda-appointment time {
  min-width: 3.25rem;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.manager-agenda-appointment__duration {
  min-width: 3.6rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-agenda-appointment__details {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: var(--space-1);
}

.manager-agenda-appointment__details strong,
.manager-agenda-appointment__details span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-agenda-appointment__details strong {
  font-size: var(--font-size-sm);
}

.manager-agenda-appointment__details span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-agenda-status,
.manager-agenda-week__appointment > span {
  display: inline-flex;
  max-width: 11rem;
  align-items: center;
  padding: 0.25rem 0.55rem;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
}

.manager-agenda-status--positive {
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
}

.manager-agenda-status--negative {
  border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.manager-agenda-status--attention {
  border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border));
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.manager-agenda-status--neutral {
  border-color: var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.manager-agenda-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
}

.manager-agenda-week__day {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.manager-agenda-week__day--today {
  border-color: var(--color-primary);
}

.manager-agenda-week__day--selected {
  background: var(--color-primary-subtle);
}

.manager-agenda-week__heading {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.manager-agenda-week__heading span,
.manager-agenda-week__heading small {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-agenda-week__heading strong {
  font-size: var(--font-size-lg);
}

.manager-agenda-week__appointment {
  display: grid;
  min-width: 0;
  gap: 0.2rem;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.manager-agenda-week__appointment time {
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.manager-agenda-week__appointment strong,
.manager-agenda-week__appointment small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-agenda-week__appointment strong {
  font-size: var(--font-size-xs);
}

.manager-agenda-week__appointment small {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
}

.manager-agenda-week__appointment > span {
  justify-self: start;
  padding: 0.1rem 0.35rem;
  font-size: 0.62rem;
}

.manager-agenda-week__empty {
  margin: 0;
  padding: var(--space-2) 0;
  color: var(--color-text-muted);
  font-size: 0.65rem;
  text-align: center;
}

.manager-agenda-month {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-border);
}

.manager-agenda-month__weekday {
  padding: var(--space-2);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-align: center;
}

.manager-agenda-month__day {
  display: grid;
  min-width: 0;
  min-height: 6rem;
  align-content: start;
  gap: 0.25rem;
  padding: 0.3rem;
  background: var(--color-surface);
}

.manager-agenda-month__day--today {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.manager-agenda-month__day--selected {
  background: var(--color-primary-subtle);
}

.manager-agenda-month__date {
  justify-self: start;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-xs);
}

.manager-agenda-month__item {
  display: flex;
  min-width: 0;
  gap: 0.2rem;
  padding: 0.2rem 0.25rem;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 3px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.62rem;
  text-align: left;
}

.manager-agenda-month__item time {
  flex: 0 0 auto;
  font-weight: var(--font-weight-bold);
}

.manager-agenda-month__item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-agenda-month__more {
  color: var(--color-text-secondary);
  font-size: 0.62rem;
}

.manager-agenda-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.manager-agenda-legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-agenda-legend__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: var(--radius-pill);
}

.manager-agenda-legend__dot--positive { background: var(--color-success); }
.manager-agenda-legend__dot--neutral { background: var(--color-text-muted); }
.manager-agenda-legend__dot--attention { background: var(--color-warning); }
.manager-agenda-legend__dot--negative { background: var(--color-danger); }

.manager-agenda-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-danger-subtle);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.manager-agenda-notice > svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
}

.manager-agenda-notice--warning {
  border-color: color-mix(in srgb, var(--color-warning) 40%, var(--color-border));
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.manager-agenda-operations__heading {
  justify-content: space-between;
}

.manager-agenda-occurrence {
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.manager-agenda-occurrence--warning {
  border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
}

.manager-agenda-occurrence > div {
  min-width: 0;
}

.manager-agenda-occurrence strong {
  font-size: var(--font-size-sm);
}

.manager-agenda-occurrence p,
.manager-agenda-no-occurrence {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.manager-agenda-footer {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  text-align: center;
}

.manager-agenda-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.manager-agenda-details > div {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.manager-agenda-details dt {
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-agenda-details dd {
  margin: 0;
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.manager-agenda-details-note {
  gap: var(--space-2);
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.manager-agenda-details-note svg {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.manager-agenda-spin {
  animation: manager-agenda-rotate 0.8s linear infinite;
}

.manager-agenda-skeleton {
  display: block;
  width: 4rem;
  height: 1.6rem;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-background), var(--color-border), var(--color-background));
  background-size: 200% 100%;
  animation: manager-agenda-shimmer 1.4s ease-in-out infinite;
}

@keyframes manager-agenda-rotate {
  to { transform: rotate(360deg); }
}

@keyframes manager-agenda-shimmer {
  to { background-position: -200% 0; }
}

.manager-agenda-page :focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@media (max-width: 70rem) {
  .manager-agenda-week {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 48rem) {
  .manager-agenda-main {
    width: min(100% - 1.5rem, 88rem);
    gap: var(--space-4);
    padding-top: var(--space-5);
  }

  .manager-agenda-intro,
  .manager-agenda-calendar-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-agenda-filter-panel,
  .manager-agenda-calendar-panel,
  .manager-agenda-operations {
    padding: var(--space-4);
  }

  .manager-agenda-toolbar {
    flex-wrap: wrap;
  }

  .manager-agenda-date {
    width: 100%;
    order: 2;
  }

  .manager-agenda-date input {
    width: 100%;
  }

  .manager-agenda-view-switch {
    margin-left: auto;
  }

  .manager-agenda-filters > label {
    width: 100%;
  }

  .manager-agenda-filter-actions {
    width: 100%;
  }

  .manager-agenda-filter-actions > * {
    flex: 1;
  }

  .manager-agenda-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-agenda-week {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-agenda-month__day {
    min-height: 4.5rem;
    padding: 0.2rem;
  }

  .manager-agenda-month__item {
    justify-content: center;
    min-height: 0.55rem;
    width: 0.55rem;
    padding: 0;
    border-radius: var(--radius-pill);
    background: var(--color-primary);
  }

  .manager-agenda-month__item time,
  .manager-agenda-month__item span,
  .manager-agenda-month__more {
    display: none;
  }

  .manager-agenda-appointment {
    flex-wrap: wrap;
  }

  .manager-agenda-appointment__details {
    flex-basis: calc(100% - 8rem);
  }

  .manager-agenda-status {
    margin-left: 6.5rem;
  }
}

@media (max-width: 28rem) {
  .manager-agenda-metrics {
    grid-template-columns: 1fr;
  }

  .manager-agenda-week {
    grid-template-columns: 1fr;
  }

  .manager-agenda-month {
    gap: 1px;
  }

  .manager-agenda-month__weekday {
    padding: 0.35rem 0.1rem;
    font-size: 0.65rem;
  }

  .manager-agenda-month__day {
    min-height: 3.5rem;
  }

  .manager-agenda-details {
    grid-template-columns: 1fr;
  }

  .manager-agenda-readonly {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .manager-agenda-calendar-skeleton,
  .manager-agenda-skeleton,
  .manager-agenda-spin {
    animation: none;
  }

  .manager-agenda-appointment {
    transition-duration: 0.01ms !important;
  }
}
</style>
