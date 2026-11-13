<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  CircleAlert,
  FileBarChart,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  getPatientRegistry,
  getReceptionAppointments,
  getReceptionDentists,
  getReceptionPatients,
} from '../services/reception'
import { getSessionUser } from '../services/auth-session'
import ManagerShell from '../components/ManagerShell.vue'
import UiButton from '../components/ui/UiButton.vue'

const router = useRouter()
const sessionUser = ref(getSessionUser())
const today = new Date()
const selectedPeriod = ref('last7')
const selectedDentist = ref('')
const globalSearch = ref('')
const selectedPatient = ref(null)
const globalPatientResults = ref([])
const globalSearchState = ref('idle')
const customDates = ref({ from: '', to: '' })
const appointments = ref([])
const todayAppointments = ref([])
const dentists = ref([])
const patientTotal = ref(null)
const loadState = ref('loading')
const loadError = ref('')
const partialErrors = ref([])
const lastUpdated = ref(null)
const filtersError = ref('')
const selectedRange = ref(null)
let dashboardRequestId = 0
let globalSearchRequestId = 0
let globalSearchTimer

const dateLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(today),
)
const greeting = computed(() => {
  const hour = today.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
})
const periodLabel = computed(() => {
  if (!selectedRange.value) return ''
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
  return selectedRange.value.from === selectedRange.value.to
    ? format.format(fromDateKey(selectedRange.value.from))
    : `${format.format(fromDateKey(selectedRange.value.from))} – ${format.format(fromDateKey(selectedRange.value.to))}`
})
const filteredAppointments = computed(() => {
  if (!selectedDentist.value) return appointments.value
  return appointments.value.filter(
    (appointment) => String(appointment.dentist_id) === selectedDentist.value,
  )
})
const completedAppointments = computed(() => filteredAppointments.value.filter(
  (appointment) => appointment.status === 'Concluída' && appointment.appointment_date <= dateKey(today),
))
const cancelledAppointments = computed(() => filteredAppointments.value.filter(
  (appointment) => appointment.status === 'Cancelada',
))
const absentAppointments = computed(() => filteredAppointments.value.filter(
  (appointment) => appointment.status === 'Não compareceu',
))
const completedEligibleCount = computed(
  () => completedAppointments.value.length + cancelledAppointments.value.length + absentAppointments.value.length,
)
const completionRate = computed(() => completedEligibleCount.value
  ? Math.round((completedAppointments.value.length / completedEligibleCount.value) * 100)
  : null)
const cancellationRate = computed(() => filteredAppointments.value.length
  ? Math.round((cancelledAppointments.value.length / filteredAppointments.value.length) * 100)
  : null)
const absenceRate = computed(() => completedEligibleCount.value
  ? Math.round((absentAppointments.value.length / completedEligibleCount.value) * 100)
  : null)
const activeDentists = computed(() => selectedDentist.value
  ? dentists.value.filter((dentist) => String(dentist.id) === selectedDentist.value)
  : dentists.value)
const metrics = computed(() => [
  {
    label: 'Consultas na agenda',
    value: filteredAppointments.value.length,
    detail: 'Registros no período, incluindo todos os status',
    definition: 'Quantidade de registros de consulta na agenda do período selecionado.',
    icon: CalendarDays,
    tone: 'blue',
    target: 'appointments-section',
  },
  {
    label: 'Consultas realizadas',
    value: completedAppointments.value.length,
    detail: completionRate.value === null
      ? 'Sem base suficiente para calcular a taxa'
      : `${completionRate.value}% dos registros concluídos, cancelados ou faltas`,
    definition: 'Consultas com status Concluída e data não futura. A taxa usa como base consultas concluídas, canceladas ou marcadas como não comparecimento.',
    icon: CheckCheck,
    tone: 'green',
    target: 'appointments-section',
  },
  {
    label: 'Cancelamentos',
    value: cancelledAppointments.value.length,
    detail: cancellationRate.value === null ? 'Sem consultas no período' : `${cancellationRate.value}% de todos os registros`,
    definition: 'Consultas cujo status atual é Cancelada. Percentual calculado sobre todos os registros do período.',
    icon: XCircle,
    tone: 'red',
    target: 'appointments-section',
  },
  {
    label: 'Faltas',
    value: absentAppointments.value.length,
    detail: absenceRate.value === null ? 'Sem base elegível para calcular a taxa' : `${absenceRate.value}% dos registros concluídos, cancelados ou faltas`,
    definition: 'Consultas com status Não compareceu. A taxa utiliza a mesma base elegível da taxa de realização.',
    icon: CircleAlert,
    tone: 'amber',
    target: 'appointments-section',
  },
  {
    label: 'Pacientes cadastrados',
    value: patientTotal.value,
    detail: 'Total acumulado na clínica',
    definition: 'Total acumulado de pacientes cadastrados na clínica, sem filtro por período.',
    icon: UsersRound,
    tone: 'violet',
    target: 'patients-section',
  },
  {
    label: 'Profissionais ativos',
    value: activeDentists.value.length,
    detail: 'Dentistas ativos vinculados à clínica',
    definition: 'Quantidade de dentistas ativos retornados pelo cadastro administrativo da clínica.',
    icon: UserRound,
    tone: 'teal',
    target: 'team-section',
  },
])
const statusSummary = computed(() => {
  const statuses = [
    { label: 'Agendada', tone: 'blue' },
    { label: 'Confirmada', tone: 'green' },
    { label: 'Aguardando chegada', tone: 'amber' },
    { label: 'Em espera', tone: 'violet' },
    { label: 'Em atendimento', tone: 'teal' },
    { label: 'Concluída', tone: 'green' },
    { label: 'Cancelada', tone: 'red' },
    { label: 'Não compareceu', tone: 'gray' },
  ]
  const total = filteredAppointments.value.length
  return statuses
    .map((item) => {
      const count = filteredAppointments.value.filter(
        (appointment) => appointment.status === item.label,
      ).length
      return {
        ...item,
        count,
        percent: total ? Math.round((count / total) * 100) : 0,
      }
    })
    .filter((item) => item.count > 0)
})
const chartGroups = computed(() => {
  const range = selectedRange.value
  if (!range) return []
  const firstDay = fromDateKey(range.from)
  const finalDay = fromDateKey(range.to)
  const dayCount = Math.floor((finalDay - firstDay) / 86_400_000) + 1
  const groupMode = dayCount > 120 ? 'month' : dayCount > 21 ? 'week' : 'day'
  const groups = []
  let cursor = firstDay
  while (cursor <= finalDay) {
    const groupStart = new Date(cursor)
    const groupEnd = new Date(cursor)
    if (groupMode === 'month') {
      groupEnd.setMonth(groupEnd.getMonth() + 1, 0)
    } else if (groupMode === 'week') {
      groupEnd.setDate(groupEnd.getDate() + ((7 - groupEnd.getDay()) % 7))
    }
    if (groupEnd > finalDay) groupEnd.setTime(finalDay.getTime())
    const startKey = dateKey(groupStart)
    const endKey = dateKey(groupEnd)
    const groupAppointments = filteredAppointments.value.filter(
      (appointment) => appointment.appointment_date >= startKey && appointment.appointment_date <= endKey,
    )
    groups.push({
      key: startKey,
      label: groupMode === 'day'
        ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(groupStart)
        : groupMode === 'week'
          ? `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(groupStart)}–${new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(groupEnd)}`
          : new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(groupStart),
      scheduled: groupAppointments.length,
      completed: groupAppointments.filter(
        (appointment) => appointment.status === 'Concluída' && appointment.appointment_date <= dateKey(today),
      ).length,
      cancelled: groupAppointments.filter((appointment) => appointment.status === 'Cancelada').length,
      absent: groupAppointments.filter((appointment) => appointment.status === 'Não compareceu').length,
    })
    cursor = new Date(groupEnd)
    cursor.setDate(cursor.getDate() + 1)
  }
  return groups
})
const chartMax = computed(() => Math.max(
  1,
  ...chartGroups.value.flatMap((group) => [group.scheduled, group.completed, group.cancelled, group.absent]),
))
const chartGroupingLabel = computed(() => {
  if (!selectedRange.value) return ''
  const days = Math.floor(
    (fromDateKey(selectedRange.value.to) - fromDateKey(selectedRange.value.from)) / 86_400_000,
  ) + 1
  return days > 120 ? 'por mês' : days > 21 ? 'por semana' : 'por dia'
})
const teamSummary = computed(() => activeDentists.value.map((dentist) => {
  const dentistAppointments = filteredAppointments.value.filter(
    (appointment) => appointment.dentist_id === dentist.id,
  )
  return {
    ...dentist,
    scheduled: dentistAppointments.length,
    completed: dentistAppointments.filter(
      (appointment) => appointment.status === 'Concluída' && appointment.appointment_date <= dateKey(today),
    ).length,
  }
}))
const nextAppointments = computed(() => todayAppointments.value
  .filter((appointment) => appointment.status !== 'Cancelada' && appointment.status !== 'Não compareceu')
  .filter((appointment) => !selectedDentist.value || String(appointment.dentist_id) === selectedDentist.value)
  .filter((appointment) => appointment.appointment_time >= `${new Date().toTimeString().slice(0, 5)}:00`)
  .slice()
  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
  .slice(0, 6))

function dateKey(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function fromDateKey(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function getRange() {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let start = new Date(end)
  if (selectedPeriod.value === 'last7') {
    start.setDate(start.getDate() - 6)
  } else if (selectedPeriod.value === 'last30') {
    start.setDate(start.getDate() - 29)
  } else if (selectedPeriod.value === 'currentMonth') {
    start = new Date(end.getFullYear(), end.getMonth(), 1)
  } else if (selectedPeriod.value === 'previousMonth') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
    end.setDate(0)
  } else if (selectedPeriod.value === 'custom') {
    if (!customDates.value.from || !customDates.value.to) {
      filtersError.value = 'Informe as duas datas do período personalizado.'
      return null
    }
    if (customDates.value.from > customDates.value.to) {
      filtersError.value = 'A data final deve ser igual ou posterior à inicial.'
      return null
    }
    return { from: customDates.value.from, to: customDates.value.to }
  }
  filtersError.value = ''
  return { from: dateKey(start), to: dateKey(end) }
}

const pageSearchResults = computed(() => {
  const query = globalSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (!query) return []
  return [
    { label: 'Dashboard do Gestor', route: 'manager-dashboard' },
    { label: 'Visão Geral da Agenda', route: 'manager-agenda' },
    { label: 'Gestão de Usuários e Equipe', route: 'manager-team' },
    { label: 'Produtividade da Equipe', route: 'manager-productivity' },
    { label: 'Gestão de Pacientes', route: 'manager-patients' },
    { label: 'Relatórios Gerenciais', route: 'manager-reports' },
    { label: 'Configurações', route: 'manager-settings' },
  ].filter((page) => page.label.toLocaleLowerCase('pt-BR').includes(query))
})
const professionalSearchResults = computed(() => {
  const query = globalSearch.value.trim().toLocaleLowerCase('pt-BR')
  if (query.length < 2) return []
  return dentists.value.filter((dentist) =>
    dentist.name.toLocaleLowerCase('pt-BR').includes(query),
  ).slice(0, 5)
})

async function searchPatients() {
  const query = globalSearch.value.trim()
  const requestId = ++globalSearchRequestId
  if (query.length < 2) {
    globalPatientResults.value = []
    globalSearchState.value = 'idle'
    return
  }
  globalSearchState.value = 'loading'
  try {
    const patients = await getReceptionPatients(query)
    if (requestId !== globalSearchRequestId) return
    globalPatientResults.value = patients.slice(0, 5).map(({ id, name }) => ({ id, name }))
    globalSearchState.value = globalPatientResults.value.length ? 'ready' : 'empty'
  } catch {
    if (requestId !== globalSearchRequestId) return
    globalPatientResults.value = []
    globalSearchState.value = 'error'
  }
}

function handleGlobalSearchInput() {
  window.clearTimeout(globalSearchTimer)
  globalSearchTimer = window.setTimeout(() => {
    void searchPatients()
  }, 250)
}

function selectPatientResult(patient) {
  selectedPatient.value = patient
  globalSearch.value = patient.name
  globalSearchState.value = 'idle'
  globalPatientResults.value = []
  void loadDashboard()
}

function selectProfessionalResult(dentist) {
  selectedDentist.value = String(dentist.id)
  globalSearch.value = ''
  selectedPatient.value = null
  globalPatientResults.value = []
  globalSearchState.value = 'idle'
  void loadDashboard()
}

function clearGlobalSearch() {
  globalSearch.value = ''
  selectedPatient.value = null
  globalPatientResults.value = []
  globalSearchState.value = 'idle'
  globalSearchRequestId += 1
  void loadDashboard()
}

function selectPageResult(routeName) {
  globalSearch.value = ''
  globalPatientResults.value = []
  globalSearchState.value = 'idle'
  void router.push({ name: routeName })
}

async function loadDashboard() {
  filtersError.value = ''
  const range = getRange()
  if (!range) return
  const requestId = ++dashboardRequestId
  selectedRange.value = range
  loadState.value = 'loading'
  loadError.value = ''
  partialErrors.value = []

  const requests = await Promise.allSettled([
    getReceptionAppointments({
      date: range.from,
      date_to: range.to,
      dentist_id: selectedDentist.value ? Number(selectedDentist.value) : undefined,
      patient_id: selectedPatient.value?.id,
    }),
    range.from <= dateKey(today) && range.to >= dateKey(today)
      ? Promise.resolve(null)
      : getReceptionAppointments({
          date: dateKey(today),
          dentist_id: selectedDentist.value ? Number(selectedDentist.value) : undefined,
          patient_id: selectedPatient.value?.id,
        }),
    getPatientRegistry({ limit: 1 }),
    getReceptionDentists(),
  ])
  if (requestId !== dashboardRequestId) return
  const [appointmentResult, todayResult, patientResult, dentistResult] = requests
  if (appointmentResult.status === 'fulfilled') {
    appointments.value = appointmentResult.value.items
  } else {
    appointments.value = []
    loadError.value = getApiErrorMessage(
      appointmentResult.reason,
      'Não foi possível carregar os dados da agenda.',
    )
  }
  if (todayResult.status === 'fulfilled') {
    todayAppointments.value = todayResult.value?.items || appointments.value.filter(
      (appointment) => appointment.appointment_date === dateKey(today),
    )
  } else {
    todayAppointments.value = []
    partialErrors.value.push('Resumo da agenda de hoje')
  }
  if (patientResult.status === 'fulfilled') {
    patientTotal.value = patientResult.value.metrics.total
  } else {
    patientTotal.value = null
    partialErrors.value.push('Total de pacientes cadastrados')
  }
  if (dentistResult.status === 'fulfilled') {
    dentists.value = dentistResult.value
  } else {
    dentists.value = []
    partialErrors.value.push('Lista de profissionais ativos')
  }
  const hasSuccessfulResponse = appointmentResult.status === 'fulfilled'
    || (todayResult.status === 'fulfilled' && todayResult.value !== null)
    || patientResult.status === 'fulfilled'
    || dentistResult.status === 'fulfilled'
  if (hasSuccessfulResponse) lastUpdated.value = new Date()
  loadState.value = loadError.value ? 'error' : 'ready'
}

function applyFilters() {
  void loadDashboard()
}

function clearFilters() {
  selectedPeriod.value = 'last7'
  selectedDentist.value = ''
  selectedPatient.value = null
  globalSearch.value = ''
  globalPatientResults.value = []
  globalSearchState.value = 'idle'
  globalSearchRequestId += 1
  customDates.value = { from: '', to: '' }
  void loadDashboard()
}

function scrollToSection(sectionId) {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  document.getElementById(sectionId)?.scrollIntoView({ behavior, block: 'start' })
}

function navigateToSettings() {
  void router.push({ name: 'manager-settings' })
}

function navigateShell(id) {
  if (id === 'settings') navigateToSettings()
  if (id === 'schedule') void router.push({ name: 'manager-agenda' })
  if (id === 'team') void router.push({ name: 'manager-team' })
  if (id === 'productivity') void router.push({ name: 'manager-productivity' })
  if (id === 'patients') void router.push({ name: 'manager-patients' })
  if (id === 'reports') void router.push({ name: 'manager-reports' })
  if (id === 'overview') {
    globalSearch.value = ''
    globalPatientResults.value = []
    globalSearchState.value = 'idle'
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    window.scrollTo({ top: 0, behavior })
  }
}

function formatTime(value) {
  return String(value || '').slice(0, 5)
}

function formatUpdatedAt(value) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(value)
    : 'Ainda não atualizado'
}

function barHeight(value) {
  return value ? `${Math.max(4, (value / chartMax.value) * 100)}%` : '0%'
}

onMounted(() => {
  void loadDashboard()
})

onBeforeUnmount(() => {
  window.clearTimeout(globalSearchTimer)
  dashboardRequestId += 1
  globalSearchRequestId += 1
})
</script>

<template>
  <div class="manager-dashboard">
    <ManagerShell
      active-page="overview"
      :date-label="dateLabel"
      @navigate="navigateShell"
    />

    <main class="manager-main">
      <header class="manager-intro">
        <div>
          <p class="manager-eyebrow">PORTAL DO GESTOR</p>
          <h1>Dashboard do Gestor</h1>
          <p>{{ greeting }}, {{ sessionUser?.name || 'gestor' }}. Acompanhe a operação da clínica.</p>
        </div>
        <div class="manager-intro__date">
          <CalendarDays :size="17" aria-hidden="true" />
          <span>{{ dateLabel }}</span>
        </div>
      </header>

      <section class="manager-quick-actions" aria-labelledby="manager-quick-title">
        <div class="manager-section-heading">
          <div>
            <p class="manager-eyebrow">ACESSO RÁPIDO</p>
            <h2 id="manager-quick-title">Ações rápidas</h2>
          </div>
        </div>
        <div class="manager-quick-grid">
          <button type="button" class="manager-quick-action" @click="router.push({ name: 'manager-agenda' })">
            <span class="manager-quick-action__icon manager-tone--blue"><CalendarRange :size="19" aria-hidden="true" /></span>
            <span><strong>Agenda do dia</strong><small>Ver próximas consultas</small></span>
          </button>
          <button type="button" class="manager-quick-action" @click="scrollToSection('patients-section')">
            <span class="manager-quick-action__icon manager-tone--violet"><UsersRound :size="19" aria-hidden="true" /></span>
            <span><strong>Pacientes</strong><small>Consultar total cadastrado</small></span>
          </button>
          <button type="button" class="manager-quick-action" @click="scrollToSection('team-section')">
            <span class="manager-quick-action__icon manager-tone--teal"><UserRound :size="19" aria-hidden="true" /></span>
            <span><strong>Equipe</strong><small>Acompanhar consultas por dentista</small></span>
          </button>
          <button type="button" class="manager-quick-action" @click="navigateToSettings">
            <span class="manager-quick-action__icon manager-tone--slate"><Settings :size="19" aria-hidden="true" /></span>
            <span><strong>Configurações</strong><small>Preferências da conta</small></span>
          </button>
          <div class="manager-quick-action manager-quick-action--disabled" aria-disabled="true">
            <span class="manager-quick-action__icon manager-tone--amber"><FileBarChart :size="19" aria-hidden="true" /></span>
            <span><strong>Relatórios</strong><small>Indisponível nesta versão</small></span>
          </div>
          <div class="manager-quick-action manager-quick-action--disabled" aria-disabled="true">
            <span class="manager-quick-action__icon manager-tone--gray"><CircleAlert :size="19" aria-hidden="true" /></span>
            <span><strong>Central de notificações</strong><small>Não integrada ao sistema</small></span>
          </div>
        </div>
        <div class="manager-global-search">
          <label for="manager-global-search-input">Busca rápida</label>
          <div class="manager-global-search__input-wrap">
            <Search :size="17" aria-hidden="true" />
            <input
              id="manager-global-search-input"
              v-model="globalSearch"
              type="search"
              placeholder="Buscar páginas, pacientes ou profissionais..."
              autocomplete="off"
              @input="handleGlobalSearchInput"
            >
            <button
              v-if="globalSearch"
              type="button"
              aria-label="Limpar busca"
              @click="clearGlobalSearch"
            >
              <X :size="16" aria-hidden="true" />
            </button>
          </div>
          <div v-if="globalSearch.trim()" class="manager-search-results" aria-live="polite">
            <p v-if="pageSearchResults.length" class="manager-search-results__category">Páginas</p>
            <button
              v-for="page in pageSearchResults"
              :key="page.route"
              type="button"
              class="manager-search-results__item"
              @click="selectPageResult(page.route)"
            >
              {{ page.label }}
            </button>
            <p v-if="professionalSearchResults.length" class="manager-search-results__category">Profissionais</p>
            <button
              v-for="dentist in professionalSearchResults"
              :key="dentist.id"
              type="button"
              class="manager-search-results__item"
              @click="selectProfessionalResult(dentist)"
            >
              {{ dentist.name }} <small>Dentista ativo</small>
            </button>
            <p v-if="globalSearchState === 'loading'" class="manager-search-results__message">Buscando pacientes autorizados…</p>
            <template v-else-if="globalPatientResults.length">
              <p class="manager-search-results__category">Pacientes</p>
              <button
                v-for="patient in globalPatientResults"
                :key="patient.id"
                type="button"
                class="manager-search-results__item"
                @click="selectPatientResult(patient)"
              >
                {{ patient.name }} <small>Filtrar indicadores e agenda</small>
              </button>
            </template>
            <p v-else-if="globalSearchState === 'empty'" class="manager-search-results__message">Nenhum paciente autorizado encontrado.</p>
            <p v-else-if="globalSearchState === 'error'" class="manager-search-results__message">Não foi possível pesquisar pacientes.</p>
            <p
              v-else-if="globalSearch.trim().length >= 2 && !pageSearchResults.length && !professionalSearchResults.length"
              class="manager-search-results__message"
            >
              Buscando registros autorizados…
            </p>
          </div>
          <p v-if="selectedPatient" class="manager-global-search__active">
            Indicadores filtrados pelo paciente “{{ selectedPatient.name }}”.
            <button type="button" @click="clearGlobalSearch">Remover filtro</button>
          </p>
        </div>
      </section>

      <section class="manager-filters" aria-labelledby="manager-filters-title">
        <div class="manager-filter-heading">
          <div>
            <h2 id="manager-filters-title">Visão operacional</h2>
            <p v-if="periodLabel">Período: {{ periodLabel }}</p>
          </div>
          <span class="manager-updated">
            <RefreshCw :size="14" aria-hidden="true" />
            Última atualização: {{ formatUpdatedAt(lastUpdated) }}
            <button type="button" class="manager-refresh-button" :disabled="loadState === 'loading'" @click="loadDashboard">
              Atualizar
            </button>
          </span>
        </div>
        <form class="manager-filter-form" @submit.prevent="applyFilters">
          <label class="manager-filter-field">
            <span>Período</span>
            <select v-model="selectedPeriod">
              <option value="today">Hoje</option>
              <option value="last7">Últimos 7 dias</option>
              <option value="last30">Últimos 30 dias</option>
              <option value="currentMonth">Mês atual</option>
              <option value="previousMonth">Mês anterior</option>
              <option value="custom">Intervalo personalizado</option>
            </select>
          </label>
          <template v-if="selectedPeriod === 'custom'">
            <label class="manager-filter-field">
              <span>Data inicial</span>
              <input v-model="customDates.from" type="date" required>
            </label>
            <label class="manager-filter-field">
              <span>Data final</span>
              <input v-model="customDates.to" type="date" required>
            </label>
          </template>
          <label class="manager-filter-field">
            <span>Profissional</span>
            <select v-model="selectedDentist">
              <option value="">Todos os profissionais</option>
              <option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">
                {{ dentist.name }}
              </option>
            </select>
          </label>
          <div class="manager-filter-actions">
            <UiButton type="button" variant="secondary" size="sm" @click="clearFilters">
              Limpar filtros
            </UiButton>
            <UiButton type="submit" size="sm">Aplicar filtros</UiButton>
          </div>
        </form>
        <p v-if="filtersError" class="manager-filter-error" role="alert">{{ filtersError }}</p>
        <p class="manager-filter-note">
          A clínica não oferece seleção por unidade; os dados abaixo abrangem a clínica vinculada à sua conta.
        </p>
      </section>

      <div v-if="loadError" class="manager-alert manager-alert--error" role="alert">
        <CircleAlert :size="18" aria-hidden="true" />
        <div><strong>Não foi possível atualizar os indicadores da agenda.</strong><p>{{ loadError }}</p></div>
        <UiButton variant="secondary" size="sm" @click="loadDashboard">Tentar novamente</UiButton>
      </div>
      <div v-if="partialErrors.length" class="manager-alert manager-alert--partial" role="status">
        <ShieldCheck :size="18" aria-hidden="true" />
        <p>Dados parciais: não foi possível carregar {{ partialErrors.join(', ') }}.</p>
        <UiButton variant="secondary" size="sm" @click="loadDashboard">Atualizar</UiButton>
      </div>

      <section class="manager-metrics" aria-label="Indicadores operacionais">
        <article v-for="metric in metrics" :key="metric.label" class="manager-metric-card">
          <div class="manager-metric-card__top">
            <span class="manager-metric-card__icon" :class="`manager-tone--${metric.tone}`">
              <component :is="metric.icon" :size="19" aria-hidden="true" />
            </span>
            <span class="manager-metric-card__definition" tabindex="0" :aria-label="metric.definition" :title="metric.definition">i</span>
          </div>
          <p>{{ metric.label }}</p>
          <strong v-if="loadState === 'loading'" class="manager-skeleton" aria-label="Carregando indicador"></strong>
          <strong v-else>{{
            loadState === 'error' && metric.label !== 'Pacientes cadastrados' && metric.label !== 'Profissionais ativos'
              || partialErrors.includes('Lista de profissionais ativos') && metric.label === 'Profissionais ativos'
              ? '—'
              : metric.value === null ? '—' : metric.value
          }}</strong>
          <small>{{ metric.detail }}</small>
          <button
            v-if="metric.target"
            class="manager-metric-card__link"
            type="button"
            @click="scrollToSection(metric.target)"
          >
            Consultar seção <span aria-hidden="true">→</span>
          </button>
        </article>
      </section>

      <div class="manager-content-grid">
        <section class="manager-panel manager-panel--chart" aria-labelledby="activity-chart-title">
          <div class="manager-section-heading">
            <div>
              <p class="manager-eyebrow">TENDÊNCIA DO PERÍODO</p>
              <h2 id="activity-chart-title">Consultas ao longo do tempo</h2>
            </div>
            <Activity :size="20" aria-hidden="true" class="manager-panel-heading-icon" />
          </div>
          <div class="manager-chart-legend" aria-label="Legenda do gráfico">
            <span><i class="manager-chart-dot manager-chart-dot--scheduled"></i>Na agenda</span>
            <span><i class="manager-chart-dot manager-chart-dot--completed"></i>Realizadas</span>
            <span><i class="manager-chart-dot manager-chart-dot--cancelled"></i>Canceladas</span>
            <span><i class="manager-chart-dot manager-chart-dot--absent"></i>Faltas</span>
          </div>
          <div v-if="loadState === 'loading'" class="manager-chart-skeleton" role="status" aria-label="Carregando gráfico"></div>
          <div v-else-if="loadState === 'error'" class="manager-empty">
            Gráfico indisponível porque os dados da agenda não puderam ser carregados.
          </div>
          <div v-else-if="!filteredAppointments.length" class="manager-empty">
            Nenhuma consulta encontrada para o período selecionado.
          </div>
          <div v-else class="manager-chart" role="img" :aria-label="`Gráfico de consultas de ${periodLabel}`">
            <div class="manager-chart__grid">
              <div v-for="group in chartGroups" :key="group.key" class="manager-chart__group">
                <div class="manager-chart__bars">
                  <span
                    class="manager-chart__bar manager-chart__bar--scheduled"
                    :style="{ height: barHeight(group.scheduled) }"
                    :title="`${group.label}: ${group.scheduled} na agenda`"
                  ></span>
                  <span
                    class="manager-chart__bar manager-chart__bar--completed"
                    :style="{ height: barHeight(group.completed) }"
                    :title="`${group.label}: ${group.completed} realizadas`"
                  ></span>
                  <span
                    class="manager-chart__bar manager-chart__bar--cancelled"
                    :style="{ height: barHeight(group.cancelled) }"
                    :title="`${group.label}: ${group.cancelled} canceladas`"
                  ></span>
                  <span
                    class="manager-chart__bar manager-chart__bar--absent"
                    :style="{ height: barHeight(group.absent) }"
                    :title="`${group.label}: ${group.absent} faltas`"
                  ></span>
                </div>
                <small>{{ group.label }}</small>
              </div>
            </div>
          </div>
          <p class="manager-chart-note">
            Agrupamento {{ chartGroupingLabel }}. Consultas realizadas só incluem status Concluída em datas não futuras.
          </p>
        </section>

        <section class="manager-panel" aria-labelledby="status-summary-title">
          <div class="manager-section-heading">
            <div>
              <p class="manager-eyebrow">DISTRIBUIÇÃO</p>
              <h2 id="status-summary-title">Status das consultas</h2>
            </div>
          </div>
          <div v-if="loadState === 'loading'" class="manager-list-skeleton" role="status" aria-label="Carregando status"></div>
          <div v-else-if="loadState === 'error'" class="manager-empty">Distribuição indisponível porque os dados da agenda não puderam ser carregados.</div>
          <div v-else-if="!statusSummary.length" class="manager-empty">Sem consultas para distribuir neste período.</div>
          <ul v-else class="manager-status-list">
            <li v-for="status in statusSummary" :key="status.label">
              <span class="manager-status-dot" :class="`manager-status-dot--${status.tone}`"></span>
              <span>{{ status.label }}</span>
              <strong>{{ status.count }}</strong>
              <small>{{ status.percent }}%</small>
            </li>
          </ul>
          <p class="manager-chart-note">Cada consulta aparece em uma única categoria, conforme o status atual.</p>
        </section>
      </div>

      <div class="manager-content-grid manager-content-grid--lower">
        <section id="appointments-section" class="manager-panel" aria-labelledby="today-agenda-title">
          <div class="manager-section-heading">
            <div>
              <p class="manager-eyebrow">OPERAÇÃO DE HOJE</p>
              <h2 id="today-agenda-title">Próximas consultas</h2>
            </div>
            <span class="manager-count">{{ nextAppointments.length }}</span>
          </div>
          <div v-if="loadState === 'loading'" class="manager-list-skeleton" role="status" aria-label="Carregando agenda"></div>
          <div v-else-if="partialErrors.includes('Resumo da agenda de hoje')" class="manager-empty">Não foi possível carregar a agenda de hoje.</div>
          <div v-else-if="!nextAppointments.length" class="manager-empty">Não há próximas consultas para hoje.</div>
          <div v-else class="manager-appointments">
            <article v-for="appointment in nextAppointments" :key="appointment.id" class="manager-appointment">
              <time>{{ formatTime(appointment.appointment_time) }}</time>
              <div class="manager-appointment__content">
                <strong>{{ appointment.patient_name }}</strong>
                <span>{{ appointment.procedure }} · {{ appointment.dentist_name }}</span>
              </div>
              <span class="manager-status-badge">{{ appointment.status }}</span>
            </article>
          </div>
          <p class="manager-data-note">Resumo administrativo da agenda; informações clínicas não são exibidas.</p>
        </section>

        <section id="team-section" class="manager-panel" aria-labelledby="team-summary-title">
          <div class="manager-section-heading">
            <div>
              <p class="manager-eyebrow">EQUIPE ATIVA</p>
              <h2 id="team-summary-title">Resumo por profissional</h2>
            </div>
            <UserRound :size="20" aria-hidden="true" class="manager-panel-heading-icon" />
          </div>
          <div v-if="loadState === 'loading'" class="manager-list-skeleton" role="status" aria-label="Carregando equipe"></div>
          <div v-else-if="partialErrors.includes('Lista de profissionais ativos')" class="manager-empty">Não foi possível carregar a equipe.</div>
          <div v-else-if="!teamSummary.length" class="manager-empty">Nenhum dentista ativo retornado pelo cadastro.</div>
          <div v-else class="manager-team-list">
            <article v-for="dentist in teamSummary" :key="dentist.id" class="manager-team-item">
              <div class="manager-team-item__identity">
                <span class="manager-team-avatar">{{ dentist.name?.slice(0, 1)?.toUpperCase() || 'D' }}</span>
                <div><strong>{{ dentist.name }}</strong><small>Dentista ativo</small></div>
              </div>
              <div class="manager-team-item__metrics">
                <span><strong>{{ dentist.scheduled }}</strong><small>na agenda</small></span>
                <span><strong>{{ dentist.completed }}</strong><small>realizadas</small></span>
              </div>
            </article>
          </div>
          <p class="manager-data-note">Os números descrevem volume da agenda, não qualidade clínica ou desempenho.</p>
        </section>
      </div>

      <section id="patients-section" class="manager-patient-summary" aria-labelledby="patient-summary-title">
        <div class="manager-patient-summary__icon"><UsersRound :size="22" aria-hidden="true" /></div>
        <div>
          <p class="manager-eyebrow">CADASTRO ADMINISTRATIVO</p>
          <h2 id="patient-summary-title">Pacientes cadastrados</h2>
          <p>Total acumulado na clínica, independente do período selecionado.</p>
        </div>
        <strong v-if="loadState === 'loading'" class="manager-skeleton" aria-label="Carregando total de pacientes"></strong>
        <strong v-else>{{ patientTotal === null ? '—' : patientTotal }}</strong>
      </section>

      <section class="manager-alerts" aria-labelledby="manager-alerts-title">
        <div class="manager-alerts__icon"><ShieldCheck :size="20" aria-hidden="true" /></div>
        <div>
          <h2 id="manager-alerts-title">Alertas administrativos</h2>
          <p>Não há regras de alerta configuradas para confirmação, cancelamentos ou cadastros incompletos. Nenhuma pendência foi presumida.</p>
        </div>
      </section>
      <p class="manager-footer-note">
        Dados restritos à clínica vinculada à sua conta e exibidos no fuso local do navegador. Filtros de unidade, notificações não lidas e relatórios gerenciais ainda não estão integrados.
      </p>
    </main>
  </div>
</template>

<style scoped>
.manager-dashboard {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
}

.manager-main {
  display: grid;
  width: min(100% - 3rem, 88rem);
  gap: var(--space-6);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-10);
}

.manager-intro,
.manager-filter-heading,
.manager-section-heading,
.manager-quick-action,
.manager-metric-card__top,
.manager-appointment,
.manager-team-item,
.manager-team-item__identity,
.manager-team-item__metrics,
.manager-patient-summary,
.manager-alerts,
.manager-updated {
  display: flex;
  align-items: center;
}

.manager-intro,
.manager-filter-heading,
.manager-section-heading {
  justify-content: space-between;
  gap: var(--space-4);
}

.manager-intro h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.7rem, 3vw, 2.25rem);
  letter-spacing: -0.035em;
}

.manager-intro p:not(.manager-eyebrow) {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}

.manager-eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.manager-intro__date,
.manager-updated {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-quick-actions,
.manager-filters,
.manager-panel,
.manager-patient-summary,
.manager-alerts {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-quick-actions {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.manager-section-heading h2,
.manager-filter-heading h2,
.manager-patient-summary h2,
.manager-alerts h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  letter-spacing: -0.02em;
}

.manager-quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.manager-quick-action {
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transition-fast), background var(--transition-fast), transform var(--transition-fast);
}

button.manager-quick-action:hover {
  transform: translateY(-1px);
  border-color: var(--color-primary);
  background: var(--color-background);
}

.manager-quick-action:focus-visible,
.manager-metric-card__link:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.manager-quick-action > span:last-child {
  display: grid;
  min-width: 0;
  gap: 0.2rem;
}

.manager-quick-action strong {
  overflow: hidden;
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-quick-action small,
.manager-metric-card small {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.manager-quick-action__icon,
.manager-metric-card__icon,
.manager-patient-summary__icon,
.manager-alerts__icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
}

.manager-quick-action--disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.manager-global-search {
  position: relative;
  display: grid;
  max-width: 42rem;
  gap: var(--space-2);
}

.manager-global-search > label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-global-search__input-wrap {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.manager-global-search__input-wrap:focus-within {
  border-color: var(--color-primary);
  outline: 3px solid var(--color-blue-100);
  outline-offset: 1px;
}

.manager-global-search__input-wrap input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
}

.manager-global-search__input-wrap button {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.manager-global-search__input-wrap button:hover {
  background: var(--color-background);
}

.manager-search-results {
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + var(--space-1));
  right: 0;
  left: 0;
  display: grid;
  max-height: 20rem;
  overflow: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.manager-search-results__category {
  margin: var(--space-2) var(--space-2) var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.manager-search-results__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
}

.manager-search-results__item:hover,
.manager-search-results__item:focus-visible {
  background: var(--color-background);
}

.manager-search-results__item small,
.manager-search-results__message {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-refresh-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
}

.manager-refresh-button:disabled {
  color: var(--color-text-muted);
  cursor: wait;
}

.manager-search-results__message {
  margin: var(--space-2);
}

.manager-global-search__active {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-global-search__active button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
}

.manager-tone--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.manager-tone--green { background: var(--color-success-subtle); color: var(--color-success); }
.manager-tone--red { background: var(--color-danger-subtle); color: var(--color-danger); }
.manager-tone--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.manager-tone--violet { background: var(--color-violet-subtle); color: var(--color-violet); }
.manager-tone--teal { background: var(--color-success-subtle); color: var(--color-success); }
.manager-tone--slate,
.manager-tone--gray { background: var(--color-background); color: var(--color-text-secondary); }

.manager-filters {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.manager-filter-heading h2 {
  font-size: var(--font-size-md);
}

.manager-filter-heading p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-updated {
  font-size: var(--font-size-xs);
}

.manager-filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
}

.manager-filter-field {
  display: grid;
  min-width: 12rem;
  flex: 1 1 12rem;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-filter-field select,
.manager-filter-field input {
  min-height: 2.65rem;
  width: 100%;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.manager-filter-field :focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.manager-filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.manager-filter-note,
.manager-filter-error,
.manager-chart-note,
.manager-data-note,
.manager-footer-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.manager-filter-error {
  color: var(--color-danger);
}

.manager-alert {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid;
  border-radius: var(--radius-md);
}

.manager-alert--error {
  border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.manager-alert--partial {
  border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.manager-alert > div,
.manager-alert > p {
  flex: 1;
  margin: 0;
}

.manager-alert p {
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
}

.manager-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.manager-metric-card {
  display: grid;
  min-height: 11rem;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-metric-card__top {
  justify-content: space-between;
}

.manager-metric-card__icon {
  width: 2.35rem;
  height: 2.35rem;
}

.manager-metric-card__definition {
  display: inline-grid;
  width: 1.3rem;
  height: 1.3rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  cursor: help;
  font-size: var(--font-size-xs);
}

.manager-metric-card p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-metric-card > strong {
  font-family: var(--font-heading);
  font-size: 1.8rem;
  line-height: 1.1;
}

.manager-metric-card__link {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(18rem, 1fr);
  gap: var(--space-4);
}

.manager-panel {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--space-4);
  padding: var(--space-5);
  scroll-margin-top: var(--space-5);
}

.manager-panel-heading-icon {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.manager-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.manager-chart-dot,
.manager-status-dot {
  width: 0.55rem;
  height: 0.55rem;
  flex: 0 0 auto;
  border-radius: var(--radius-pill);
}

.manager-chart-dot--scheduled,
.manager-chart__bar--scheduled { background: var(--color-blue-500); }
.manager-chart-dot--completed,
.manager-chart__bar--completed { background: var(--color-success); }
.manager-chart-dot--cancelled,
.manager-chart__bar--cancelled { background: var(--color-danger); }
.manager-chart-dot--absent,
.manager-chart__bar--absent { background: var(--color-warning); }

.manager-chart {
  min-width: 0;
  overflow-x: auto;
}

.manager-chart__grid {
  display: flex;
  min-width: 32rem;
  height: 13rem;
  align-items: stretch;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(25% - 1px),
    var(--color-border) 25%
  );
}

.manager-chart__group {
  display: grid;
  min-width: 1.5rem;
  flex: 1 0 1.5rem;
  grid-template-rows: 1fr auto;
  gap: var(--space-2);
  text-align: center;
}

.manager-chart__bars {
  display: flex;
  height: 100%;
  align-items: end;
  justify-content: center;
  gap: 2px;
}

.manager-chart__bar {
  width: min(0.52rem, 22%);
  min-height: 0;
  border-radius: 3px 3px 0 0;
}

.manager-chart__group small {
  color: var(--color-text-muted);
  font-size: 0.65rem;
  white-space: nowrap;
}

.manager-status-list,
.manager-appointments,
.manager-team-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.manager-status-list li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.manager-status-dot--blue { background: var(--color-blue-500); }
.manager-status-dot--green { background: var(--color-success); }
.manager-status-dot--amber { background: var(--color-warning); }
.manager-status-dot--violet { background: #6941c6; }
.manager-status-dot--teal { background: #087f78; }
.manager-status-dot--red { background: var(--color-danger); }
.manager-status-dot--gray { background: var(--color-text-muted); }

.manager-status-list strong {
  font-variant-numeric: tabular-nums;
}

.manager-status-list small {
  min-width: 2.3rem;
  color: var(--color-text-muted);
  text-align: right;
}

.manager-empty {
  display: grid;
  min-height: 8rem;
  place-items: center;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.manager-content-grid--lower {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.manager-count {
  display: inline-grid;
  min-width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.manager-appointment {
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.manager-appointment time {
  min-width: 3.2rem;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.manager-appointment__content {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: var(--space-1);
}

.manager-appointment__content strong,
.manager-appointment__content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-appointment__content strong {
  font-size: var(--font-size-sm);
}

.manager-appointment__content span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-status-badge {
  max-width: 7rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-pill);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: 0.68rem;
  text-align: center;
}

.manager-team-item {
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
}

.manager-team-item__identity {
  min-width: 0;
  gap: var(--space-2);
}

.manager-team-avatar {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-weight: var(--font-weight-bold);
}

.manager-team-item__identity > div,
.manager-team-item__metrics span {
  display: grid;
  gap: 0.15rem;
}

.manager-team-item__identity strong {
  overflow: hidden;
  max-width: 11rem;
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-team-item__identity small,
.manager-team-item__metrics small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-team-item__metrics {
  gap: var(--space-3);
  text-align: right;
}

.manager-team-item__metrics strong {
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.manager-patient-summary {
  gap: var(--space-4);
  padding: var(--space-5);
  scroll-margin-top: var(--space-5);
}

.manager-patient-summary__icon {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-patient-summary > div:nth-child(2) {
  flex: 1;
}

.manager-patient-summary h2 {
  font-size: var(--font-size-md);
}

.manager-patient-summary p:not(.manager-eyebrow) {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-patient-summary > strong {
  font-family: var(--font-heading);
  font-size: 1.8rem;
}

.manager-alerts {
  gap: var(--space-3);
  padding: var(--space-4);
}

.manager-alerts__icon {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.manager-alerts h2 {
  font-size: var(--font-size-md);
}

.manager-alerts p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.manager-footer-note {
  text-align: center;
}

.manager-skeleton,
.manager-chart-skeleton,
.manager-list-skeleton {
  display: block;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-background), var(--color-border), var(--color-background));
  background-size: 200% 100%;
  animation: manager-skeleton-shimmer 1.4s ease-in-out infinite;
}

.manager-skeleton {
  width: 4.5rem;
  height: 1.8rem;
}

.manager-chart-skeleton {
  min-height: 13rem;
}

.manager-list-skeleton {
  min-height: 9rem;
}

@keyframes manager-skeleton-shimmer {
  to { background-position: -200% 0; }
}

@media (max-width: 64rem) {
  .manager-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 42.5rem) {
  .manager-main {
    width: min(100% - 1.5rem, 88rem);
    gap: var(--space-4);
    padding-top: var(--space-5);
  }

  .manager-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-intro__date {
    font-size: var(--font-size-xs);
  }

  .manager-quick-actions,
  .manager-filters,
  .manager-panel {
    padding: var(--space-4);
  }

  .manager-quick-grid,
  .manager-metrics,
  .manager-content-grid--lower {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-filter-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-updated {
    font-size: 0.7rem;
  }

  .manager-filter-form,
  .manager-filter-field {
    width: 100%;
  }

  .manager-filter-actions {
    width: 100%;
  }

  .manager-alert {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .manager-alert > div,
  .manager-alert > p {
    min-width: 0;
    flex-basis: calc(100% - 2rem);
  }

  .manager-alert > button {
    margin-left: 2rem;
  }

  .manager-appointment {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .manager-appointment__content {
    flex-basis: calc(100% - 5rem);
  }

  .manager-status-badge {
    margin-left: 3.2rem;
  }

  .manager-team-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-team-item__metrics {
    padding-left: 2.8rem;
  }

  .manager-patient-summary {
    flex-wrap: wrap;
    padding: var(--space-4);
  }

  .manager-patient-summary > div:nth-child(2) {
    flex-basis: calc(100% - 4rem);
  }

  .manager-patient-summary > strong {
    margin-left: 3.5rem;
  }

  .manager-alerts {
    align-items: flex-start;
    padding: var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .manager-quick-action,
  .manager-skeleton,
  .manager-chart-skeleton,
  .manager-list-skeleton {
    animation: none;
    transition-duration: 0.01ms !important;
  }
}
</style>
