<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileClock,
  FileText,
  History,
  ListFilter,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { getApiErrorMessage } from '../services/api'
import {
  getDentistAppointmentHistory,
  getDentistPatients,
} from '../services/dentist'
import { dentistNavigationRoutes } from '../router/navigation'
import DentistShell from '../components/DentistShell.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const route = useRoute()
const router = useRouter()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const statuses = [
  'Concluída',
  'Cancelada',
  'Não compareceu',
  'Reagendada',
  'Em atendimento',
  'Em espera',
  'Aguardando chegada',
  'Agendada',
]
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const filters = reactive({
  date_from: '',
  date_to: '',
  patient_id: '',
  status: '',
  procedure: '',
})
const records = ref([])
const metrics = ref(null)
const total = ref(0)
const page = ref(1)
const pageSize = 10
const search = ref('')
const filterPatientSearch = ref('')
const patientOptions = ref([])
const patientMatches = ref([])
const patientSearchState = ref('idle')
const viewMode = ref('table')
const order = ref('desc')
const loadState = ref('loading')
const loadError = ref('')
const filtersOpen = ref(true)
const detailOpen = ref(false)
const selectedAppointment = ref(null)
let requestId = 0
let searchTimer
let patientSearchTimer
let patientRequestId = 0

function localDateInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function initialDateRange() {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 90)
  return {
    date_from: localDateInput(start),
    date_to: localDateInput(today),
  }
}

Object.assign(filters, initialDateRange())

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const firstVisible = computed(() => total.value ? (page.value - 1) * pageSize + 1 : 0)
const lastVisible = computed(() => Math.min(page.value * pageSize, total.value))
const selectedPatient = computed(() =>
  patientOptions.value.find((patient) => String(patient.id) === String(filters.patient_id))
    || patientMatches.value.find((patient) => String(patient.id) === String(filters.patient_id)),
)
const headingPatientName = computed(() => selectedPatient.value?.name || '')
const visibleRecords = computed(() => records.value)
const hasSearchOrFilters = computed(() =>
  Boolean(search.value || filters.patient_id || filters.status || filters.procedure),
)

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed)
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function statusClass(status) {
  if (status === 'Concluída') return 'attendance-status--completed'
  if (status === 'Cancelada' || status === 'Não compareceu') return 'attendance-status--cancelled'
  if (status === 'Em atendimento' || status === 'Em espera') return 'attendance-status--active'
  return 'attendance-status--neutral'
}

function recordStatusLabel(status) {
  const labels = {
    observed: 'Observado',
    planned: 'Planejado',
    in_progress: 'Em andamento',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  }
  return labels[status] || status
}

function surfacesLabel(surfaces) {
  return surfaces?.length ? surfaces.join(', ') : 'Sem superfície informada'
}

function requestParams() {
  return {
    q: search.value.trim() || undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    patient_id: filters.patient_id || undefined,
    appointment_status: filters.status || undefined,
    procedure: filters.procedure.trim() || undefined,
    order: order.value,
    offset: (page.value - 1) * pageSize,
    limit: pageSize,
  }
}

async function loadHistory() {
  const currentRequest = ++requestId
  loadState.value = records.value.length ? 'refreshing' : 'loading'
  loadError.value = ''
  try {
    const response = await getDentistAppointmentHistory(requestParams())
    if (currentRequest !== requestId) return
    records.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    loadState.value = 'ready'
  } catch (error) {
    if (currentRequest !== requestId) return
    loadState.value = 'error'
    loadError.value = error.response?.status === 403
      ? 'Sua conta não tem autorização para consultar este histórico.'
      : getApiErrorMessage(error, 'Não foi possível carregar o histórico de atendimentos.')
  }
}

function applyFilters() {
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    loadState.value = 'error'
    loadError.value = 'A data inicial deve ser anterior ou igual à data final.'
    return
  }
  page.value = 1
  void loadHistory()
}

function clearFilters() {
  Object.assign(filters, { ...initialDateRange(), patient_id: '', status: '', procedure: '' })
  filterPatientSearch.value = ''
  patientMatches.value = []
  search.value = ''
  page.value = 1
  void loadHistory()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadHistory()
}

function changeOrder() {
  order.value = order.value === 'desc' ? 'asc' : 'desc'
  page.value = 1
  void loadHistory()
}

function setViewMode(mode) {
  viewMode.value = mode
}

async function searchPatients(term = filterPatientSearch.value) {
  const currentRequest = ++patientRequestId
  const normalized = term.trim()
  if (!normalized) {
    patientMatches.value = []
    patientSearchState.value = 'idle'
    return
  }
  patientSearchState.value = 'loading'
  try {
    const response = await getDentistPatients({ q: normalized, limit: 20 })
    if (currentRequest !== patientRequestId) return
    patientMatches.value = response.items
    patientSearchState.value = response.items.length ? 'ready' : 'empty'
  } catch (error) {
    if (currentRequest !== patientRequestId) return
    patientSearchState.value = 'error'
    loadError.value = getApiErrorMessage(error, 'Não foi possível buscar pacientes autorizados.')
  }
}

function schedulePatientSearch() {
  window.clearTimeout(patientSearchTimer)
  patientSearchTimer = window.setTimeout(() => void searchPatients(), 250)
}

function choosePatient(patient) {
  patientRequestId += 1
  filters.patient_id = String(patient.id)
  filterPatientSearch.value = patient.name
  patientOptions.value = [patient]
  patientMatches.value = []
  patientSearchState.value = 'ready'
}

function clearSelectedPatient() {
  filters.patient_id = ''
  filterPatientSearch.value = ''
  patientOptions.value = []
  patientMatches.value = []
  patientSearchState.value = 'idle'
}

async function loadPatientFromRoute(patientId) {
  const id = Number(patientId)
  if (!Number.isInteger(id) || id < 1) return
  filterPatientSearch.value = String(id)
  await searchPatients(String(id))
  const patient = patientMatches.value.find((item) => item.id === id)
  if (patient) {
    choosePatient(patient)
    page.value = 1
    await loadHistory()
  } else if (patientSearchState.value === 'empty') {
    loadError.value = 'O paciente não está disponível na sua lista de atendimentos autorizados.'
  }
}

function openDetails(appointment) {
  selectedAppointment.value = appointment
  detailOpen.value = true
}

function openPatientProfile(appointment) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-patients',
    query: { patientId: String(appointment.patient_id) },
  })
}

function openOdontogram(appointment) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-odontogram',
    query: {
      patientId: String(appointment.patient_id),
      appointmentId: String(appointment.id),
    },
  })
}

function openPatientPlans(appointment) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-treatment-plans',
    query: { patientId: String(appointment.patient_id) },
  })
}

function openDocuments() {
  detailOpen.value = false
  void router.push({ name: 'dentist-clinical-documents' })
}

function handleNavigation(id) {
  const routeName = dentistNavigationRoutes[id]
  if (routeName) void router.push({ name: routeName })
}

function printAppointment(appointment) {
  selectedAppointment.value = appointment
  detailOpen.value = true
  window.setTimeout(() => window.print(), 100)
}

watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    void loadHistory()
  }, 300)
})

watch(
  () => route.query.patientId,
  (patientId) => {
    if (patientId) void loadPatientFromRoute(patientId)
    else if (filters.patient_id) {
      clearSelectedPatient()
      void loadHistory()
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    const response = await getDentistPatients({ limit: 100 })
    patientOptions.value = response.items
    if (!route.query.patientId) void loadHistory()
  } catch {
    if (!route.query.patientId) void loadHistory()
  }
})

onBeforeUnmount(() => {
  requestId += 1
  patientRequestId += 1
  window.clearTimeout(searchTimer)
  window.clearTimeout(patientSearchTimer)
})
</script>

<template>
  <div class="attendance-history-page">
    <DentistShell
      active-page="history"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="attendance-history-main">
      <header class="attendance-history-intro">
        <div>
          <p class="history-eyebrow">PORTAL CLÍNICO</p>
          <h1>Histórico de Atendimentos</h1>
          <p v-if="headingPatientName">
            Consultas anteriores de <strong>{{ headingPatientName }}</strong>
          </p>
          <p v-else>Consulte consultas anteriores e acompanhe a evolução clínica dos pacientes</p>
        </div>
        <div class="history-intro-note">
          <ShieldCheck :size="16" aria-hidden="true" />
          <span>Consulta somente leitura · sua agenda</span>
        </div>
      </header>

      <section class="history-source-note" aria-label="Limite do histórico">
        <CircleAlert :size="18" aria-hidden="true" />
        <p>
          Esta tela consulta dados da agenda e registros autorizados do odontograma; não substitui o
          prontuário. Evoluções, documentos emitidos e estados históricos do odontograma não estão
          disponíveis neste sistema.
        </p>
      </section>

      <section class="history-metrics" aria-label="Indicadores do período filtrado">
        <article class="history-metric">
          <span class="history-metric__icon"><CalendarDays :size="18" aria-hidden="true" /></span>
          <div>
            <span>Atendimentos realizados</span>
            <strong v-if="metrics">{{ metrics.completed_attendances }}</strong>
            <i v-else class="history-metric__skeleton" aria-hidden="true"></i>
            <small>com situação concluída no período</small>
          </div>
        </article>
        <article class="history-metric">
          <span class="history-metric__icon history-metric__icon--blue"><UsersRound :size="18" aria-hidden="true" /></span>
          <div>
            <span>Pacientes atendidos</span>
            <strong v-if="metrics">{{ metrics.patients_attended }}</strong>
            <i v-else class="history-metric__skeleton" aria-hidden="true"></i>
            <small>pacientes distintos com consulta concluída</small>
          </div>
        </article>
        <article class="history-metric">
          <span class="history-metric__icon history-metric__icon--green"><Activity :size="18" aria-hidden="true" /></span>
          <div>
            <span>Procedimentos registrados</span>
            <strong v-if="metrics">{{ metrics.completed_procedures_registered }}</strong>
            <i v-else class="history-metric__skeleton" aria-hidden="true"></i>
            <small>concluídos e vinculados ao odontograma</small>
          </div>
        </article>
        <article class="history-metric">
          <span class="history-metric__icon history-metric__icon--muted"><FileClock :size="18" aria-hidden="true" /></span>
          <div>
            <span>Pendências de documentação</span>
            <strong v-if="metrics">{{ metrics.documentation_pending ?? '—' }}</strong>
            <i v-else class="history-metric__skeleton" aria-hidden="true"></i>
            <small>regra de pendência não configurada</small>
          </div>
        </article>
      </section>

      <section class="history-panel" aria-labelledby="history-list-title">
        <div class="history-panel__heading">
          <div>
            <p class="history-eyebrow">CONSULTA HISTÓRICA</p>
            <h2 id="history-list-title">
              {{ headingPatientName ? `Atendimentos de ${headingPatientName}` : 'Atendimentos' }}
            </h2>
            <p>{{ total }} registro(s) no período selecionado</p>
          </div>
          <label class="history-search">
            <Search :size="17" aria-hidden="true" />
            <span class="visually-hidden">Buscar por paciente, procedimento ou código do atendimento</span>
            <input
              v-model="search"
              type="search"
              placeholder="Buscar por paciente, procedimento ou código do atendimento..."
            />
            <button v-if="search" type="button" aria-label="Limpar pesquisa" @click="search = ''">
              <X :size="15" aria-hidden="true" />
            </button>
          </label>
        </div>

        <div class="history-toolbar">
          <button
            class="history-filter-toggle"
            type="button"
            :aria-expanded="filtersOpen"
            @click="filtersOpen = !filtersOpen"
          >
            <ListFilter :size="16" aria-hidden="true" />
            {{ filtersOpen ? 'Ocultar filtros' : 'Filtros' }}
            <ChevronDown :size="15" :class="{ 'is-rotated': filtersOpen }" aria-hidden="true" />
          </button>
          <div class="history-view-switch" role="group" aria-label="Formato da listagem">
            <button type="button" :aria-pressed="viewMode === 'table'" @click="setViewMode('table')">Tabela</button>
            <button type="button" :aria-pressed="viewMode === 'timeline'" @click="setViewMode('timeline')">Linha do tempo</button>
          </div>
          <button class="history-order-button" type="button" @click="changeOrder">
            <History :size="15" aria-hidden="true" />
            {{ order === 'desc' ? 'Mais recentes' : 'Mais antigos' }}
          </button>
        </div>

        <form v-if="filtersOpen" class="history-filters" @submit.prevent="applyFilters">
          <label class="history-filter-field">
            <span>Data inicial</span>
            <input v-model="filters.date_from" type="date" :max="filters.date_to || undefined" />
          </label>
          <label class="history-filter-field">
            <span>Data final</span>
            <input v-model="filters.date_to" type="date" :min="filters.date_from || undefined" />
          </label>
          <div class="history-filter-field history-filter-field--patient">
            <label for="history-patient-search">Paciente autorizado</label>
            <input
              id="history-patient-search"
              v-model="filterPatientSearch"
              type="search"
              autocomplete="off"
              placeholder="Buscar paciente pelo nome ou código"
              @input="schedulePatientSearch"
            />
            <ul v-if="patientMatches.length" class="history-patient-results">
              <li v-for="patient in patientMatches" :key="patient.id">
                <button type="button" @click="choosePatient(patient)">{{ patient.name }} <small>#{{ patient.id }}</small></button>
              </li>
            </ul>
            <small v-if="patientSearchState === 'loading'" class="history-filter-help">Buscando...</small>
            <small v-else-if="patientSearchState === 'empty'" class="history-filter-help">Nenhum paciente autorizado encontrado.</small>
            <span v-if="selectedPatient" class="history-selected-patient">
              {{ selectedPatient.name }} · #{{ selectedPatient.id }}
              <button type="button" aria-label="Remover filtro de paciente" @click="clearSelectedPatient"><X :size="13" aria-hidden="true" /></button>
            </span>
          </div>
          <label class="history-filter-field">
            <span>Situação</span>
            <select v-model="filters.status">
              <option value="">Todas as situações</option>
              <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="history-filter-field history-filter-field--procedure">
            <span>Procedimento previsto na agenda</span>
            <input v-model="filters.procedure" type="search" placeholder="Filtrar por procedimento" />
          </label>
          <p class="history-filter-note">
            Apenas seus atendimentos estão disponíveis. O sistema não oferece seleção de outros profissionais nem regras de documentação pendente.
          </p>
          <div class="history-filter-actions">
            <UiButton type="button" variant="secondary" size="sm" @click="clearFilters">Limpar filtros</UiButton>
            <UiButton type="submit" size="sm">Filtrar</UiButton>
          </div>
        </form>

        <div v-if="loadState === 'error'" class="history-state history-state--error" role="alert">
          <CircleAlert :size="22" aria-hidden="true" />
          <strong>{{ loadError.includes('autorização') ? 'Acesso não autorizado' : 'Não foi possível atualizar o histórico' }}</strong>
          <p>{{ loadError }}</p>
          <UiButton variant="secondary" @click="loadHistory">
            <template #start><RefreshCw :size="15" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </div>
        <div v-else-if="loadState === 'loading'" class="history-loading" role="status" aria-label="Carregando atendimentos">
          <span class="visually-hidden">Carregando atendimentos...</span>
          <i v-for="row in 5" :key="row"></i>
        </div>
        <div v-else-if="!records.length" class="history-empty">
          <span><CalendarDays :size="22" aria-hidden="true" /></span>
          <strong>{{ hasSearchOrFilters ? 'Nenhum atendimento encontrado' : 'Nenhum atendimento no período' }}</strong>
          <p>{{ search ? 'Ajuste a busca ou limpe o termo para consultar outros registros.' : 'Não há atendimentos autorizados para as datas e filtros selecionados.' }}</p>
          <UiButton v-if="search" size="sm" variant="secondary" @click="search = ''">Limpar pesquisa</UiButton>
        </div>

        <div v-else-if="viewMode === 'table'" class="history-table-wrap" :aria-busy="loadState === 'refreshing'">
          <table class="history-table">
            <thead>
              <tr>
                <th scope="col">Data e horário</th>
                <th scope="col">Paciente</th>
                <th scope="col">Tipo / procedimento</th>
                <th scope="col">Procedimentos registrados</th>
                <th scope="col">Profissional</th>
                <th scope="col">Situação</th>
                <th scope="col">Registro clínico</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="appointment in visibleRecords" :key="appointment.id">
                <td><strong>{{ formatDate(appointment.appointment_date) }}</strong><span>{{ formatTime(appointment.appointment_time) }} · {{ appointment.duration_minutes }} min</span></td>
                <td><button class="history-patient-link" type="button" @click="openPatientProfile(appointment)">{{ appointment.patient_name }} <small>#{{ appointment.patient_id }}</small></button></td>
                <td><span class="history-procedure">{{ appointment.procedure || 'Não informado' }}</span></td>
                <td>
                  <template v-if="appointment.status === 'Concluída' && appointment.procedure_count">
                    <strong>{{ appointment.procedure_count }} concluído(s)</strong>
                    <small>{{ appointment.chart_entries.filter((entry) => entry.record_type === 'procedure' && entry.status === 'completed').map((entry) => entry.label).join(', ') }}</small>
                  </template>
                  <span v-else-if="appointment.status === 'Concluída'">Sem procedimento concluído vinculado</span>
                  <span v-else class="history-muted">Não consta execução registrada</span>
                </td>
                <td>{{ appointment.dentist_name }}</td>
                <td><span class="attendance-status" :class="statusClass(appointment.status)">{{ appointment.status }}</span></td>
                <td>
                  <span class="history-record-status">{{ appointment.chart_entries.length ? 'Odontograma vinculado' : 'Sem registro vinculado' }}</span>
                  <small>pendência: não configurada</small>
                </td>
                <td><button class="history-detail-button" type="button" @click="openDetails(appointment)">Ver detalhes</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <ol v-else class="history-timeline" :aria-busy="loadState === 'refreshing'">
          <li v-for="appointment in visibleRecords" :key="appointment.id" class="history-timeline__item">
            <span class="history-timeline__dot" :class="statusClass(appointment.status)" aria-hidden="true"></span>
            <article>
              <div class="history-timeline__top">
                <div>
                  <time :datetime="`${appointment.appointment_date}T${appointment.appointment_time}`">{{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }}</time>
                  <h3>{{ appointment.procedure || 'Atendimento sem procedimento informado' }}</h3>
                </div>
                <span class="attendance-status" :class="statusClass(appointment.status)">{{ appointment.status }}</span>
              </div>
              <p><button class="history-patient-link" type="button" @click="openPatientProfile(appointment)">{{ appointment.patient_name }} <small>#{{ appointment.patient_id }}</small></button> · {{ appointment.dentist_name }}</p>
              <p v-if="appointment.procedure_count">{{ appointment.procedure_count }} procedimento(s) concluído(s) registrados no odontograma.</p>
              <p v-else>Não há procedimentos concluídos vinculados a este atendimento.</p>
              <button class="history-detail-button" type="button" @click="openDetails(appointment)">Ver detalhes</button>
            </article>
          </li>
        </ol>

        <footer v-if="total && loadState !== 'error'" class="history-pagination">
          <span>Exibindo {{ firstVisible }}–{{ lastVisible }} de {{ total }}</span>
          <div>
            <button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="17" aria-hidden="true" /></button>
            <span>Página {{ page }} de {{ pageCount }}</span>
            <button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="changePage(page + 1)"><ChevronRight :size="17" aria-hidden="true" /></button>
          </div>
        </footer>
      </section>
    </main>

    <UiDialog v-model="detailOpen" title="Detalhes do atendimento">
      <div v-if="selectedAppointment" class="history-detail">
        <header class="history-detail__header">
          <div>
            <p class="history-eyebrow">ATENDIMENTO #{{ selectedAppointment.id }}</p>
            <h3>{{ selectedAppointment.procedure || 'Procedimento não informado' }}</h3>
            <p>{{ formatDate(selectedAppointment.appointment_date) }} às {{ formatTime(selectedAppointment.appointment_time) }} · {{ selectedAppointment.duration_minutes }} min</p>
          </div>
          <span class="attendance-status" :class="statusClass(selectedAppointment.status)">{{ selectedAppointment.status }}</span>
        </header>

        <section class="history-detail__section">
          <h4>Resumo do atendimento</h4>
          <dl class="history-detail__grid">
            <div><dt>Paciente</dt><dd>{{ selectedAppointment.patient_name }} · #{{ selectedAppointment.patient_id }}</dd></div>
            <div><dt>Profissional responsável</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
            <div><dt>Tipo / procedimento previsto</dt><dd>{{ selectedAppointment.procedure || 'Não informado na agenda' }}</dd></div>
            <div><dt>Chegada registrada</dt><dd>{{ selectedAppointment.arrival_at ? formatDateTime(selectedAppointment.arrival_at) : 'Sem horário de chegada registrado' }}</dd></div>
            <div><dt>Confirmação</dt><dd>{{ selectedAppointment.confirmation_status || 'Não informado' }}</dd></div>
            <div><dt>Duração prevista</dt><dd>{{ selectedAppointment.duration_minutes }} minutos</dd></div>
          </dl>
          <p class="history-detail__hint">A agenda não armazena horário efetivo de início/fim nem motivo clínico da consulta.</p>
        </section>

        <section class="history-detail__section">
          <div class="history-detail__section-heading">
            <h4>Procedimentos e registros vinculados</h4>
            <span>{{ selectedAppointment.procedure_count }} procedimento(s) concluído(s)</span>
          </div>
          <p v-if="selectedAppointment.status !== 'Concluída'" class="history-detail__hint">
            Este atendimento não está concluído; os dados da agenda não comprovam execução de procedimentos.
          </p>
          <p v-else-if="!selectedAppointment.chart_entries.length" class="history-detail__hint">
            Não há registro de odontograma vinculado a este atendimento.
          </p>
          <ul v-else class="history-record-list">
            <li v-for="entry in selectedAppointment.chart_entries" :key="entry.id">
              <span class="history-record-list__icon"><Activity :size="16" aria-hidden="true" /></span>
              <div>
                <strong>{{ entry.label }}</strong>
                <span>Dente {{ entry.tooth_number }} · superfícies {{ surfacesLabel(entry.surfaces) }} · {{ recordStatusLabel(entry.status) }}</span>
                <small>{{ entry.dentist_name }} · {{ formatDate(entry.record_date) }}<template v-if="entry.supersedes_entry_id"> · retifica registro #{{ entry.supersedes_entry_id }}</template><template v-if="entry.is_superseded"> · substituído por retificação posterior</template></small>
                <p v-if="entry.note">{{ entry.note }}</p>
              </div>
            </li>
          </ul>
          <p v-if="selectedAppointment.clinical_records_with_notes_count" class="history-detail__hint">
            {{ selectedAppointment.clinical_records_with_notes_count }} registro(s) do odontograma contêm observações. Evoluções do prontuário não estão disponíveis nesta aplicação.
          </p>
        </section>

        <section class="history-detail__section">
          <h4>Documentos e pendências</h4>
          <p v-if="selectedAppointment.document_drafts.length" class="history-detail__hint">
            Há rascunhos vinculados a este atendimento. Eles não foram emitidos e não são documentos oficiais.
          </p>
          <ul v-if="selectedAppointment.document_drafts.length" class="history-draft-list">
            <li v-for="document in selectedAppointment.document_drafts" :key="document.id">
              <FileText :size="16" aria-hidden="true" />
              <span>{{ document.title }}</span>
              <small>Rascunho · {{ formatDate(document.updated_at) }}</small>
            </li>
          </ul>
          <p v-else class="history-detail__hint">Nenhum rascunho foi vinculado a este atendimento.</p>
          <p class="history-detail__hint">Pendências de evolução/documentação não são calculadas: a clínica ainda não configurou essas regras nem possui módulo de prontuário integrado.</p>
        </section>

        <section class="history-detail__section">
          <h4>Contexto clínico</h4>
          <p class="history-detail__hint">O odontograma abaixo é a representação atual do paciente, não uma reprodução histórica da data da consulta.</p>
          <div class="history-detail__actions">
            <UiButton size="sm" variant="secondary" @click="openPatientProfile(selectedAppointment)">Abrir perfil do paciente</UiButton>
            <UiButton size="sm" variant="secondary" @click="openOdontogram(selectedAppointment)">Ver odontograma atual</UiButton>
            <UiButton size="sm" variant="secondary" @click="openPatientPlans(selectedAppointment)">Planos do paciente</UiButton>
            <UiButton size="sm" variant="secondary" @click="openDocuments">Central de documentos</UiButton>
          </div>
        </section>
        <footer class="history-detail__footer">
          <span>Consulta somente leitura · prontuário oficial não integrado</span>
          <UiButton size="sm" variant="secondary" @click="printAppointment(selectedAppointment)">
            <template #start><Printer :size="15" aria-hidden="true" /></template>
            Imprimir resumo
          </UiButton>
        </footer>
      </div>
    </UiDialog>

    <section v-if="selectedAppointment" class="history-print-view" aria-label="Resumo impresso do atendimento">
      <div class="history-print-view__watermark">RESUMO DE CONSULTA · NÃO SUBSTITUI O PRONTUÁRIO</div>
      <header>
        <p>ZEN · PORTAL CLÍNICO</p>
        <span>Histórico de Atendimentos · #{{ selectedAppointment.id }}</span>
      </header>
      <h1>{{ selectedAppointment.procedure || 'Atendimento' }}</h1>
      <p>{{ formatDate(selectedAppointment.appointment_date) }} às {{ formatTime(selectedAppointment.appointment_time) }} · {{ selectedAppointment.status }}</p>
      <p>Paciente: {{ selectedAppointment.patient_name }} · Dentista: {{ selectedAppointment.dentist_name }}</p>
      <h2>Registros de odontograma vinculados</h2>
      <ul>
        <li v-for="entry in selectedAppointment.chart_entries" :key="entry.id">
          {{ entry.label }} · dente {{ entry.tooth_number }} · {{ recordStatusLabel(entry.status) }} · {{ formatDate(entry.record_date) }}
        </li>
        <li v-if="!selectedAppointment.chart_entries.length">Nenhum registro vinculado.</li>
      </ul>
      <footer>Relatório de consulta histórica; não é prontuário, atestado, receita ou documento clínico emitido.</footer>
    </section>
  </div>
</template>

<style scoped>
.attendance-history-page { min-height: 100vh; background: var(--color-background); color: var(--color-text); }
.attendance-history-main { width: min(100% - 3rem, 1280px); margin-inline: auto; padding: 2rem 0 3rem; }
.attendance-history-intro, .history-panel__heading, .history-toolbar, .history-filter-actions, .history-pagination, .history-pagination > div, .history-timeline__top, .history-detail__header, .history-detail__section-heading, .history-detail__footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.attendance-history-intro { margin-bottom: 1.3rem; }
.history-eyebrow { margin: 0 0 .4rem; color: var(--color-text-muted); font-size: .68rem; font-weight: 750; letter-spacing: .11em; }
.attendance-history-intro h1 { margin: 0; font-size: clamp(1.7rem, 3vw, 2.25rem); letter-spacing: -.045em; line-height: 1.15; }
.attendance-history-intro > div > p:last-child { margin: .55rem 0 0; color: var(--color-text-secondary); font-size: .9rem; }
.attendance-history-intro > div > p strong { color: var(--color-text); }
.history-intro-note { display: flex; align-items: center; gap: .45rem; color: var(--color-text-muted); font-size: .75rem; }
.history-intro-note svg { color: var(--color-success); }
.history-source-note { display: flex; align-items: flex-start; gap: .65rem; padding: .8rem 1rem; border: 1px solid var(--color-primary); border-radius: var(--radius-lg); background: var(--color-primary-subtle); color: var(--color-primary); }
.history-source-note svg { flex: 0 0 auto; margin-top: .08rem; }
.history-source-note p { margin: 0; color: var(--color-text-secondary); font-size: .75rem; line-height: 1.55; }
.history-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .85rem; margin: 1rem 0 1.25rem; }
.history-metric { display: flex; min-height: 105px; align-items: flex-start; gap: .75rem; padding: .95rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.history-metric__icon { display: grid; width: 2.2rem; height: 2.2rem; flex: 0 0 auto; place-items: center; border-radius: .7rem; background: var(--color-primary-subtle); color: var(--color-primary); }
.history-metric__icon--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.history-metric__icon--green { background: var(--color-success-subtle); color: var(--color-success); }
.history-metric__icon--muted { background: var(--color-surface-muted); color: var(--color-text-muted); }
.history-metric > div { display: grid; gap: .18rem; }
.history-metric > div > span { color: var(--color-text-secondary); font-size: .72rem; }
.history-metric strong { font-size: 1.4rem; letter-spacing: -.035em; }
.history-metric small { color: var(--color-text-muted); font-size: .64rem; line-height: 1.4; }
.history-metric__skeleton { width: 2.5rem; height: 1.3rem; border-radius: .35rem; background: var(--color-surface-subtle); animation: history-pulse 1.2s ease-in-out infinite; }
.history-panel { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-xl); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.history-panel__heading { align-items: flex-end; padding: 1.2rem; }
.history-panel__heading h2 { margin: 0; font-size: 1.12rem; letter-spacing: -.025em; }
.history-panel__heading > div > p:last-child { margin: .35rem 0 0; color: var(--color-text-secondary); font-size: .75rem; }
.history-search { display: flex; width: min(100%, 28rem); align-items: center; gap: .55rem; padding: .6rem .7rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.history-search:focus-within { border-color: var(--color-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-focus) 15%, transparent); }
.history-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: .73rem; }
.history-search button { display: grid; width: 1.6rem; height: 1.6rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.history-toolbar { justify-content: flex-start; flex-wrap: wrap; padding: .65rem 1.2rem; border-block: 1px solid var(--color-border); }
.history-filter-toggle, .history-order-button { display: inline-flex; min-height: 2.2rem; align-items: center; gap: .4rem; padding: .35rem .55rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); font: inherit; font-size: .7rem; cursor: pointer; }
.history-filter-toggle:hover, .history-order-button:hover { border-color: var(--color-primary); color: var(--color-primary); }
.history-filter-toggle > svg:last-child { transition: transform 140ms ease; }
.history-filter-toggle > svg.is-rotated { transform: rotate(180deg); }
.history-view-switch { display: flex; padding: .2rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-background); }
.history-view-switch button { min-height: 1.8rem; padding: .25rem .55rem; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); font: inherit; font-size: .68rem; cursor: pointer; }
.history-view-switch button[aria-pressed="true"] { background: var(--color-surface); box-shadow: var(--shadow-sm); color: var(--color-primary); font-weight: 700; }
.history-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; padding: 1rem 1.2rem; border-bottom: 1px solid var(--color-border); background: var(--color-surface-subtle); }
.history-filter-field { position: relative; display: grid; min-width: 0; align-content: start; gap: .35rem; }
.history-filter-field > span, .history-filter-field > label { color: var(--color-text-secondary); font-size: .68rem; font-weight: 700; }
.history-filter-field input, .history-filter-field select { width: 100%; min-height: 2.45rem; padding: .55rem .65rem; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: .72rem; }
.history-filter-field input:focus, .history-filter-field select:focus, .history-patient-results button:focus-visible { border-color: var(--color-focus); outline: 3px solid color-mix(in srgb, var(--color-focus) 18%, transparent); }
.history-filter-field--patient { grid-column: span 2; }
.history-filter-field--procedure { grid-column: span 2; }
.history-filter-help { color: var(--color-text-muted); font-size: .65rem; }
.history-selected-patient { display: flex; align-items: center; justify-content: space-between; gap: .45rem; padding: .35rem .55rem; border: 1px solid var(--color-success); border-radius: var(--radius-sm); background: var(--color-success-subtle); color: var(--color-success-strong); font-size: .66rem; }
.history-selected-patient button { display: grid; width: 1.5rem; height: 1.5rem; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; cursor: pointer; }
.history-patient-results { position: absolute; z-index: 4; top: calc(100% - .1rem); right: 0; left: 0; max-height: 12rem; overflow: auto; margin: 0; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-md); list-style: none; }
.history-patient-results button { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: .55rem .65rem; border: 0; border-bottom: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: .72rem; text-align: left; cursor: pointer; }
.history-patient-results button:hover { background: var(--color-primary-subtle); }
.history-patient-results small { color: var(--color-text-muted); }
.history-filter-note { grid-column: 1 / -1; margin: 0; color: var(--color-text-muted); font-size: .66rem; line-height: 1.5; }
.history-filter-actions { grid-column: 1 / -1; justify-content: flex-end; }
.history-state, .history-empty { display: grid; min-height: 240px; justify-items: center; align-content: center; gap: .55rem; padding: 1.5rem; border-top: 1px solid var(--color-border); text-align: center; }
.history-state--error { color: var(--color-danger); }
.history-state strong, .history-empty strong { color: var(--color-text); font-size: .9rem; }
.history-state p, .history-empty p { max-width: 32rem; margin: 0; color: var(--color-text-secondary); font-size: .74rem; line-height: 1.5; }
.history-empty > span { display: grid; width: 3rem; height: 3rem; place-items: center; border-radius: var(--radius-lg); background: var(--color-primary-subtle); color: var(--color-primary); }
.history-loading { display: grid; gap: .55rem; padding: 1rem 1.2rem; }
.history-loading i { display: block; height: 4rem; border-radius: var(--radius-md); background: linear-gradient(90deg, var(--color-surface-muted), var(--color-surface-subtle), var(--color-surface-muted)); background-size: 200% 100%; animation: history-shimmer 1.3s linear infinite; }
.history-table-wrap { width: 100%; overflow-x: auto; }
.history-table { width: 100%; border-collapse: collapse; text-align: left; }
.history-table th { padding: .65rem .7rem; border-bottom: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text-muted); font-size: .64rem; font-weight: 750; white-space: nowrap; }
.history-table td { min-width: 6rem; padding: .75rem .7rem; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: .68rem; vertical-align: middle; }
.history-table tbody tr:last-child td { border-bottom: 0; }
.history-table td:first-child { min-width: 8rem; }
.history-table td:first-child strong, .history-table td:first-child span, .history-table td small { display: block; }
.history-table td:first-child span, .history-table td small { margin-top: .2rem; color: var(--color-text-muted); font-size: .62rem; }
.history-table td:nth-child(4) { min-width: 9rem; max-width: 14rem; }
.history-table td:nth-child(4) small { overflow: hidden; text-overflow: ellipsis; }
.history-patient-link { padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; font-size: .7rem; font-weight: 750; text-align: left; cursor: pointer; }
.history-patient-link small { display: inline !important; color: var(--color-text-muted); font-weight: 500; }
.history-patient-link:hover { text-decoration: underline; }
.history-procedure { color: var(--color-text); font-weight: 650; }
.history-muted { color: var(--color-text-muted); }
.attendance-status { display: inline-flex; max-width: 10rem; align-items: center; gap: .3rem; padding: .28rem .48rem; border-radius: var(--radius-pill); font-size: .63rem; font-weight: 750; white-space: nowrap; }
.attendance-status::before { width: .38rem; height: .38rem; border-radius: 50%; background: currentColor; content: ''; }
.attendance-status--completed { background: var(--color-success-subtle); color: var(--color-success-strong); }
.attendance-status--cancelled { background: var(--color-danger-subtle); color: var(--color-danger); }
.attendance-status--active { background: var(--color-warning-subtle); color: var(--color-warning); }
.attendance-status--neutral { background: var(--color-surface-muted); color: var(--color-text-secondary); }
.history-record-status { display: block; font-size: .66rem; }
.history-detail-button { padding: .42rem .58rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-primary); font: inherit; font-size: .66rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
.history-detail-button:hover { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.history-timeline { display: grid; gap: 0; margin: 0; padding: 1.25rem 1.5rem 1.25rem 2rem; list-style: none; }
.history-timeline__item { position: relative; padding: 0 0 1rem 1.25rem; border-left: 2px solid var(--color-border); }
.history-timeline__item:last-child { border-left-color: transparent; }
.history-timeline__dot { position: absolute; top: .25rem; left: -.43rem; width: .75rem; height: .75rem; border: 2px solid var(--color-surface); border-radius: 50%; box-shadow: 0 0 0 1px currentColor; }
.history-timeline__dot.attendance-status--completed { background: var(--color-success); }
.history-timeline__dot.attendance-status--cancelled { background: var(--color-danger); }
.history-timeline__dot.attendance-status--active { background: var(--color-warning); }
.history-timeline__dot.attendance-status--neutral { background: var(--color-gray-400); }
.history-timeline article { padding: .9rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.history-timeline__top { align-items: flex-start; }
.history-timeline time { color: var(--color-text-muted); font-size: .68rem; }
.history-timeline h3 { margin: .25rem 0 0; font-size: .86rem; }
.history-timeline article > p { margin: .45rem 0; color: var(--color-text-secondary); font-size: .7rem; }
.history-pagination { padding: .8rem 1.2rem; border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: .68rem; }
.history-pagination > div { gap: .55rem; }
.history-pagination button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.history-pagination button:disabled { opacity: .45; cursor: not-allowed; }
.history-detail { display: grid; gap: 1rem; }
.history-detail__header { align-items: flex-start; padding-bottom: .85rem; border-bottom: 1px solid var(--color-border); }
.history-detail__header h3 { margin: 0; font-size: 1rem; }
.history-detail__header > div > p:last-child { margin: .35rem 0 0; color: var(--color-text-secondary); font-size: .72rem; }
.history-detail__section { display: grid; gap: .65rem; }
.history-detail__section h4 { margin: 0; font-size: .82rem; }
.history-detail__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; margin: 0; }
.history-detail__grid > div { display: grid; gap: .2rem; }
.history-detail__grid dt { color: var(--color-text-muted); font-size: .64rem; }
.history-detail__grid dd { margin: 0; color: var(--color-text); font-size: .72rem; }
.history-detail__hint { margin: 0; color: var(--color-text-secondary); font-size: .68rem; line-height: 1.5; }
.history-detail__section-heading > span { color: var(--color-text-muted); font-size: .66rem; }
.history-record-list, .history-draft-list { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
.history-record-list li { display: flex; align-items: flex-start; gap: .55rem; padding: .65rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.history-record-list__icon { display: grid; width: 1.8rem; height: 1.8rem; flex: 0 0 auto; place-items: center; border-radius: var(--radius-sm); background: var(--color-primary-subtle); color: var(--color-primary); }
.history-record-list li > div { display: grid; gap: .2rem; }
.history-record-list li strong { font-size: .73rem; }
.history-record-list li span, .history-record-list li small { color: var(--color-text-muted); font-size: .65rem; }
.history-record-list li p { margin: .25rem 0 0; color: var(--color-text-secondary); font-size: .7rem; white-space: pre-wrap; }
.history-draft-list li { display: flex; align-items: center; gap: .45rem; color: var(--color-text-secondary); font-size: .68rem; }
.history-draft-list li svg { color: var(--color-warning); }
.history-draft-list li small { margin-left: auto; color: var(--color-text-muted); }
.history-detail__actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.history-detail__footer { padding-top: .8rem; border-top: 1px solid var(--color-border); }
.history-detail__footer > span { color: var(--color-text-muted); font-size: .64rem; }
.history-print-view { display: none; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
@keyframes history-pulse { 50% { opacity: .45; } }
@keyframes history-shimmer { to { background-position: -200% 0; } }
@media (max-width: 1000px) { .history-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) {
  .attendance-history-main { width: min(100% - 1.25rem, 1280px); padding-top: 1.25rem; }
  .attendance-history-intro, .history-panel__heading { align-items: flex-start; flex-direction: column; }
  .history-intro-note { align-self: flex-start; }
  .history-metrics { grid-template-columns: 1fr; }
  .history-metric { min-height: 82px; }
  .history-search { width: 100%; }
  .history-toolbar { align-items: flex-start; }
  .history-view-switch { margin-left: auto; }
  .history-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: .8rem; }
  .history-filter-field--patient, .history-filter-field--procedure { grid-column: 1 / -1; }
  .history-table { min-width: 1050px; }
  .history-timeline { padding-inline: 1.2rem .75rem; }
  .history-timeline__top { flex-direction: column; gap: .5rem; }
  .history-pagination { align-items: flex-start; flex-direction: column; }
  .history-detail__grid { grid-template-columns: 1fr; }
  .history-detail__footer { align-items: flex-start; flex-direction: column; }
  .history-draft-list li { align-items: flex-start; flex-wrap: wrap; }
  .history-draft-list li small { width: 100%; margin-left: 1.4rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
@media print {
  @page { margin: 18mm; }
  .attendance-history-page > :not(.history-print-view) { display: none !important; }
  .history-print-view { position: relative; display: block !important; color: #17212b; font-family: Arial, sans-serif; }
  .history-print-view header { display: grid; gap: .25rem; padding-bottom: 1rem; border-bottom: 1px solid #9aa5b1; }
  .history-print-view header p { margin: 0; font-size: 10pt; font-weight: 700; letter-spacing: .12em; }
  .history-print-view h1 { margin: 1.4rem 0 .5rem; font-size: 18pt; }
  .history-print-view h2 { margin-top: 1.5rem; font-size: 12pt; }
  .history-print-view li, .history-print-view > p { font-size: 10pt; line-height: 1.55; }
  .history-print-view footer { margin-top: 2.5rem; padding-top: .7rem; border-top: 1px solid #9aa5b1; font-size: 9pt; }
  .history-print-view__watermark { position: absolute; top: 45%; right: 0; left: 0; transform: rotate(-24deg); color: rgb(180 35 24 / 14%); font-size: 27pt; font-weight: 800; text-align: center; }
}
</style>
