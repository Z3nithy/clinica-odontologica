<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  FileClock,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
  Users,
  XCircle,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import { getReceptionAppointments, getReceptionDentists } from '../services/reception'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiToast from '../components/ui/UiToast.vue'

const router = useRouter()
const today = new Date()
const todayValue = toDateInput(today)
const defaultStart = toDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))
const dateStart = ref(defaultStart)
const dateEnd = ref(todayValue)
const createdStart = ref('')
const createdEnd = ref('')
const searchInput = ref('')
const appliedSearch = ref('')
const dentistInput = ref('')
const statusInput = ref('')
const procedureInput = ref('')
const outcomeFilters = ref([])
const appointments = ref([])
const dentists = ref([])
const state = ref('loading')
const errorMessage = ref('')
const requestId = ref(0)
const sortBy = ref('date-desc')
const page = ref(1)
const pageSize = ref(Number(document.documentElement.dataset.pageSize) || 10)
const selectedAppointment = ref(null)
const detailsOpen = ref(false)
const exportOpen = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
let searchTimer

const procedures = computed(() =>
  [...new Set(appointments.value.map((item) => item.procedure).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  ),
)

const statusOptions = [
  'Agendada',
  'Confirmada',
  'Aguardando chegada',
  'Em espera',
  'Em atendimento',
  'Concluída',
  'Cancelada',
  'Não compareceu',
]

function outcomeLabel(appointment) {
  if (appointment.status === 'Concluída') return 'Concluída'
  if (appointment.status === 'Cancelada') return 'Cancelada'
  if (appointment.status === 'Não compareceu') return 'Falta'
  if (appointment.status === 'Reagendada') return 'Reagendada'
  if (['Agendada', 'Confirmada', 'Aguardando chegada', 'Em espera', 'Em atendimento'].includes(appointment.status)) {
    return 'Em andamento'
  }
  return appointment.status || 'Não informada'
}

function statusVariant(status) {
  if (status === 'Concluída') return 'success'
  if (status === 'Cancelada' || status === 'Falta') return 'danger'
  if (status === 'Reagendada') return 'warning'
  if (status === 'Em andamento') return 'info'
  return 'neutral'
}

const filteredAppointments = computed(() => {
  const query = appliedSearch.value.trim().toLocaleLowerCase('pt-BR')
  const filtered = appointments.value
    .filter((item) => !dentistInput.value || String(item.dentist_id) === dentistInput.value)
    .filter((item) => !statusInput.value || item.status === statusInput.value)
    .filter((item) => !procedureInput.value || item.procedure === procedureInput.value)
    .filter((item) => {
      if (!outcomeFilters.value.length) return true
      const outcome = outcomeLabel(item)
      return outcomeFilters.value.includes(outcome)
    })
    .filter((item) => {
      if (!createdStart.value && !createdEnd.value) return true
      if (!item.created_at) return false
      const createdDate = item.created_at.slice(0, 10)
      return (!createdStart.value || createdDate >= createdStart.value) &&
        (!createdEnd.value || createdDate <= createdEnd.value)
    })
    .filter((item) => {
      if (!query) return true
      return [item.patient_name, item.patient_phone, item.id]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query))
    })

  return filtered.sort((a, b) => {
    if (sortBy.value === 'patient') return a.patient_name.localeCompare(b.patient_name, 'pt-BR')
    if (sortBy.value === 'created') {
      return (b.created_at || '').localeCompare(a.created_at || '')
    }
    if (sortBy.value === 'date-asc') {
      return `${a.appointment_date} ${a.appointment_time}`.localeCompare(
        `${b.appointment_date} ${b.appointment_time}`,
      )
    }
    return `${b.appointment_date} ${b.appointment_time}`.localeCompare(
      `${a.appointment_date} ${a.appointment_time}`,
    )
  })
})

const metrics = computed(() => {
  const rows = filteredAppointments.value
  return [
    { label: 'Total de consultas', value: rows.length, icon: CalendarDays, tone: 'blue' },
    { label: 'Concluídas', value: rows.filter((item) => item.status === 'Concluída').length, icon: CheckCheck, tone: 'green' },
    { label: 'Canceladas', value: rows.filter((item) => item.status === 'Cancelada').length, icon: XCircle, tone: 'red' },
    { label: 'Faltas', value: rows.filter((item) => item.status === 'Não compareceu').length, icon: UserRound, tone: 'amber' },
    { label: 'Reagendadas', value: rows.filter((item) => item.status === 'Reagendada').length, icon: ClipboardList, tone: 'violet' },
  ]
})

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredAppointments.value.length / Number(pageSize.value))),
)
const paginatedAppointments = computed(() => {
  const start = (page.value - 1) * Number(pageSize.value)
  return filteredAppointments.value.slice(start, start + Number(pageSize.value))
})
const exportRows = computed(() => filteredAppointments.value)

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function fromDateInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  const day = value.slice(0, 10)
  return new Intl.DateTimeFormat('pt-BR', options).format(fromDateInput(day))
}

function formatTimestamp(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
}

function formatTime(value) {
  return value ? value.slice(0, 5) : '—'
}

function formatPhone(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value || '—'
}

function dateRangeLabel() {
  if (!dateStart.value || !dateEnd.value) return 'Selecione o período'
  return `${formatDate(dateStart.value)} – ${formatDate(dateEnd.value)}`
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function loadAppointments() {
  if (!dateStart.value || !dateEnd.value || dateEnd.value < dateStart.value) {
    requestId.value += 1
    state.value = 'error'
    errorMessage.value = 'Informe um intervalo válido para as datas da consulta.'
    showToast(errorMessage.value, 'danger')
    return
  }
  if (createdStart.value && createdEnd.value && createdEnd.value < createdStart.value) {
    requestId.value += 1
    state.value = 'error'
    errorMessage.value = 'A data final de criação deve ser igual ou posterior à inicial.'
    showToast(errorMessage.value, 'danger')
    return
  }
  const id = ++requestId.value
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getReceptionAppointments({
      date: dateStart.value,
      date_to: dateEnd.value,
      q: appliedSearch.value || undefined,
      dentist_id: dentistInput.value ? Number(dentistInput.value) : undefined,
      status: statusInput.value || undefined,
      created_from: createdStart.value || undefined,
      created_to: createdEnd.value || undefined,
    })
    if (id !== requestId.value) return
    appointments.value = response.items
    state.value = 'ready'
    page.value = 1
  } catch (error) {
    if (id !== requestId.value) return
    state.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar o histórico.')
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

function applyFilters() {
  appliedSearch.value = searchInput.value.trim()
  void loadAppointments()
}

function clearFilters() {
  dateStart.value = defaultStart
  dateEnd.value = todayValue
  createdStart.value = ''
  createdEnd.value = ''
  searchInput.value = ''
  appliedSearch.value = ''
  dentistInput.value = ''
  statusInput.value = ''
  procedureInput.value = ''
  outcomeFilters.value = []
  sortBy.value = 'date-desc'
  page.value = 1
  void loadAppointments()
}

function openDetails(appointment) {
  selectedAppointment.value = appointment
  detailsOpen.value = true
}

function goToPatient(appointment) {
  void router.push({
    name: 'reception-patients',
    query: { patientId: String(appointment.patient_id) },
  })
}

function reschedule(appointment) {
  if (!canReschedule(appointment)) return
  void router.push({
    name: 'reception-agenda',
    query: { editAppointmentId: String(appointment.id), date: appointment.appointment_date },
  })
}

function canReschedule(appointment) {
  return !['Cancelada', 'Concluída', 'Não compareceu', 'Reagendada', 'Em espera', 'Em atendimento'].includes(
    appointment.status,
  )
}

function bookReturn(appointment) {
  void router.push({
    name: 'reception-agenda',
    query: { patientId: String(appointment.patient_id) },
  })
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

async function exportHistory() {
  if (exportRows.value.length > 100 && !window.confirm(`Exportar ${exportRows.value.length} registros filtrados? O arquivo contém dados pessoais de contato.`)) {
    exportOpen.value = false
    return
  }
  const headers = [
    'Código da consulta',
    'Data da consulta',
    'Horário',
    'Paciente',
    'Telefone',
    'Dentista',
    'Procedimento',
    'Status',
    'Criada em',
  ]
  const lines = exportRows.value.map((item) =>
    [
      item.id,
      item.appointment_date,
      formatTime(item.appointment_time),
      item.patient_name,
      item.patient_phone,
      item.dentist_name,
      item.procedure,
      outcomeLabel(item),
      formatTimestamp(item.created_at),
    ]
      .map(csvCell)
      .join(','),
  )
  const csv = `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `historico-consultas-${dateStart.value}-${dateEnd.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
  exportOpen.value = false
  showToast(`${exportRows.value.length} registro(s) exportado(s) para CSV.`, 'success')
}

function handleNavigation(id) {
  if (id === 'overview') void router.push({ name: 'reception-dashboard' })
  else if (id === 'schedule') void router.push({ name: 'reception-agenda' })
  else if (id === 'patient-list') void router.push({ name: 'reception-patients' })
  else if (id === 'checkin') void router.push({ name: 'reception-checkin' })
  else if (id === 'confirmations') void router.push({ name: 'reception-confirmations' })
  else if (id !== 'history') showToast('Esta área ainda não está disponível.', 'info')
}

function pageStart() {
  return filteredAppointments.value.length ? (page.value - 1) * Number(pageSize.value) + 1 : 0
}

watch([dateStart, dateEnd], () => void loadAppointments())
watch([dentistInput, statusInput, procedureInput, createdStart, createdEnd, outcomeFilters], () => {
  page.value = 1
})
watch(sortBy, () => {
  page.value = 1
})
watch(pageSize, () => {
  page.value = 1
})
watch(searchInput, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(applyFilters, 350)
})
watch(filteredAppointments, () => {
  if (page.value > pageCount.value) page.value = pageCount.value
})

onMounted(() => {
  void loadAppointments()
  void loadDentists()
})

onBeforeUnmount(() => {
  requestId.value += 1
  clearTimeout(searchTimer)
})
</script>

<template>
  <div class="history-page">
    <ReceptionShell
      active-page="history"
      :date-label="dateRangeLabel()"
      @navigate="handleNavigation"
    />

    <main class="history-main">
      <section class="history-intro" aria-labelledby="history-title">
        <div>
          <p class="history-eyebrow">REGISTROS DA CLÍNICA</p>
          <h1 id="history-title">Histórico de Consultas</h1>
          <p>Consulte atendimentos anteriores e acompanhe o histórico dos agendamentos</p>
        </div>
        <div class="history-intro__actions">
          <UiButton variant="secondary" :disabled="!filteredAppointments.length" @click="exportOpen = true">
            <template #start><Download :size="16" aria-hidden="true" /></template>
            Exportar histórico
          </UiButton>
          <UiButton @click="router.push({ name: 'reception-agenda', query: { create: '1' } })">
            <template #start><CalendarDays :size="16" aria-hidden="true" /></template>
            Nova consulta
          </UiButton>
        </div>
      </section>

      <section class="history-search-bar" aria-label="Busca e período do histórico">
        <label class="history-search">
          <Search :size="17" aria-hidden="true" />
          <span class="visually-hidden">Buscar por nome, CPF, telefone ou código da consulta</span>
          <input v-model="searchInput" type="search" placeholder="Nome, CPF, telefone ou código da consulta..." />
        </label>
        <label class="history-date">
          <span class="visually-hidden">Data inicial da consulta</span>
          <input v-model="dateStart" type="date" :max="dateEnd || undefined" />
        </label>
        <span class="history-date-separator" aria-hidden="true">até</span>
        <label class="history-date">
          <span class="visually-hidden">Data final da consulta</span>
          <input v-model="dateEnd" type="date" :min="dateStart || undefined" />
        </label>
        <button class="history-refresh" type="button" aria-label="Atualizar histórico" :disabled="state === 'refreshing'" @click="loadAppointments">
          <RefreshCw :size="17" :class="{ 'history-spin': state === 'refreshing' }" />
        </button>
      </section>

      <section class="history-metrics" aria-label="Indicadores do período">
        <article v-for="metric in metrics" :key="metric.label" class="history-metric">
          <span :class="`history-metric__icon history-metric__icon--${metric.tone}`">
            <component :is="metric.icon" :size="18" aria-hidden="true" />
          </span>
          <div><span>{{ metric.label }}</span><strong>{{ state === 'loading' ? '—' : metric.value }}</strong></div>
        </article>
      </section>
      <p class="history-notice">
        <CircleAlert :size="15" aria-hidden="true" />
        Faltas e cancelamentos refletem apenas status registrados pela clínica. A API atual não mantém histórico de remarcações nem registro de alterações por usuário.
      </p>

      <section class="history-panel" aria-labelledby="history-list-title">
        <div class="history-panel__heading">
          <div>
            <p class="history-eyebrow">CONSULTAS REALIZADAS E REGISTROS</p>
            <h2 id="history-list-title">Histórico da agenda</h2>
            <p>{{ filteredAppointments.length }} resultado(s) · {{ dateRangeLabel() }}</p>
          </div>
          <div class="history-outcome-toggles" aria-label="Filtrar consultas encerradas">
            <label><input v-model="outcomeFilters" type="checkbox" value="Cancelada" /> Canceladas</label>
            <label><input v-model="outcomeFilters" type="checkbox" value="Falta" /> Faltas</label>
            <label><input v-model="outcomeFilters" type="checkbox" value="Reagendada" /> Reagendadas</label>
          </div>
        </div>

        <div class="history-filters" aria-label="Filtros avançados">
          <label class="history-filter">
            <Stethoscope :size="15" aria-hidden="true" />
            <span class="visually-hidden">Dentista responsável</span>
            <select v-model="dentistInput">
              <option value="">Todos os dentistas</option>
              <option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">{{ dentist.name }}</option>
            </select>
          </label>
          <label class="history-filter">
            <CheckCheck :size="15" aria-hidden="true" />
            <span class="visually-hidden">Status da consulta</span>
            <select v-model="statusInput">
              <option value="">Todos os status</option>
              <option v-for="status in statusOptions" :key="status">{{ status }}</option>
            </select>
          </label>
          <label class="history-filter">
            <ClipboardList :size="15" aria-hidden="true" />
            <span class="visually-hidden">Procedimento</span>
            <select v-model="procedureInput">
              <option value="">Todos os procedimentos</option>
              <option v-for="procedure in procedures" :key="procedure">{{ procedure }}</option>
            </select>
          </label>
          <label class="history-filter history-filter--date">
            <span>Agendada de</span>
            <input v-model="createdStart" type="date" :max="createdEnd || undefined" />
          </label>
          <label class="history-filter history-filter--date">
            <span>até</span>
            <input v-model="createdEnd" type="date" :min="createdStart || undefined" />
          </label>
          <UiButton size="sm" variant="secondary" @click="applyFilters">Aplicar filtros</UiButton>
          <UiButton size="sm" variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
        </div>

        <div class="history-table-toolbar">
          <span>{{ filteredAppointments.length }} consulta(s) encontrada(s)</span>
          <div>
            <label>Ordenar por
              <select v-model="sortBy">
                <option value="date-desc">Data mais recente</option>
                <option value="date-asc">Data mais antiga</option>
                <option value="patient">Paciente</option>
                <option value="created">Cadastro mais recente</option>
              </select>
            </label>
            <label>Exibir
              <select v-model="pageSize">
                <option :value="10">10</option><option :value="25">25</option><option :value="50">50</option>
              </select>
              por página
            </label>
          </div>
        </div>

        <div v-if="state === 'loading'" class="history-state" role="status">
          <span class="history-spinner" aria-hidden="true"></span><strong>Carregando histórico</strong>
        </div>
        <div v-else-if="state === 'error'" class="history-state history-state--error" role="alert">
          <CircleAlert :size="25" aria-hidden="true" /><strong>Não foi possível carregar o histórico</strong>
          <p>{{ errorMessage }}</p><UiButton size="sm" variant="secondary" @click="loadAppointments">Tentar novamente</UiButton>
        </div>
        <div v-else-if="!filteredAppointments.length" class="history-state">
          <FileClock :size="27" aria-hidden="true" />
          <strong>{{ appointments.length ? 'Nenhum resultado para estes filtros' : 'Nenhum registro neste período' }}</strong>
          <p>{{ appointments.length ? 'Ajuste os filtros ou o intervalo de datas.' : 'Selecione outro período para consultar a agenda.' }}</p>
        </div>
        <div v-else class="history-table-wrap" :aria-busy="state === 'refreshing'">
          <table class="history-table">
            <thead>
              <tr>
                <th scope="col">Código</th><th scope="col">Data / horário</th><th scope="col">Paciente</th>
                <th scope="col">Telefone</th><th scope="col">Dentista</th><th scope="col">Procedimento</th>
                <th scope="col">Status final</th><th scope="col">Criada em</th><th scope="col">Atualizada</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="appointment in paginatedAppointments" :key="appointment.id">
                <td data-label="Código"><strong>#{{ appointment.id }}</strong></td>
                <td data-label="Data / horário"><strong>{{ formatDate(appointment.appointment_date) }}</strong><small>{{ formatTime(appointment.appointment_time) }}</small></td>
                <td data-label="Paciente"><span class="history-patient"><UiAvatar :name="appointment.patient_name" size="sm" /><strong>{{ appointment.patient_name }}</strong></span></td>
                <td data-label="Telefone">{{ formatPhone(appointment.patient_phone) }}</td>
                <td data-label="Dentista">{{ appointment.dentist_name }}</td>
                <td data-label="Procedimento">{{ appointment.procedure }}</td>
                <td data-label="Status final"><UiBadge :variant="statusVariant(outcomeLabel(appointment))">{{ outcomeLabel(appointment) }}</UiBadge></td>
                <td data-label="Criada em">{{ formatTimestamp(appointment.created_at) }}</td>
                <td data-label="Atualizada" class="history-muted">—</td>
                <td data-label="Ações" class="history-actions">
                  <button class="history-action" type="button" :aria-label="`Ver detalhes da consulta ${appointment.id}`" @click="openDetails(appointment)"><Search :size="16" aria-hidden="true" /></button>
                  <button class="history-action" type="button" :aria-label="`Ver paciente ${appointment.patient_name}`" @click="goToPatient(appointment)"><Users :size="16" aria-hidden="true" /></button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="history-cards">
            <article v-for="appointment in paginatedAppointments" :key="appointment.id" class="history-card">
              <div class="history-card__heading">
                <UiAvatar :name="appointment.patient_name" size="sm" />
                <div><strong>{{ appointment.patient_name }}</strong><span>Consulta #{{ appointment.id }} · {{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }}</span></div>
                <UiBadge :variant="statusVariant(outcomeLabel(appointment))">{{ outcomeLabel(appointment) }}</UiBadge>
              </div>
              <dl>
                <div><dt>Telefone</dt><dd>{{ formatPhone(appointment.patient_phone) }}</dd></div>
                <div><dt>Dentista</dt><dd>{{ appointment.dentist_name }}</dd></div>
                <div><dt>Procedimento</dt><dd>{{ appointment.procedure }}</dd></div>
                <div><dt>Criada em</dt><dd>{{ formatTimestamp(appointment.created_at) }}</dd></div>
              </dl>
              <div class="history-card__actions">
                <UiButton size="sm" variant="secondary" @click="openDetails(appointment)">Ver detalhes</UiButton>
                <UiButton size="sm" variant="secondary" @click="goToPatient(appointment)">Ver paciente</UiButton>
              </div>
            </article>
          </div>
          <div class="history-pagination">
            <span>Exibindo {{ pageStart() }}–{{ Math.min(page * Number(pageSize), filteredAppointments.length) }} de {{ filteredAppointments.length }}</span>
            <div>
              <UiButton size="sm" variant="secondary" :disabled="page <= 1" @click="page -= 1"><ChevronLeft :size="15" aria-hidden="true" /> Anterior</UiButton>
              <span>Página {{ page }} de {{ pageCount }}</span>
              <UiButton size="sm" variant="secondary" :disabled="page >= pageCount" @click="page += 1">Próxima <ChevronRight :size="15" aria-hidden="true" /></UiButton>
            </div>
          </div>
        </div>
      </section>

      <footer class="history-footer">
        <span><Clock3 :size="14" aria-hidden="true" /> Dados administrativos da agenda, sem informações clínicas.</span>
        <span>Zen · Gestão odontológica</span>
      </footer>
    </main>

    <UiDialog v-model="detailsOpen" title="Detalhes do histórico da consulta">
      <div v-if="selectedAppointment" class="history-detail">
        <div class="history-detail__identity">
          <UiAvatar :name="selectedAppointment.patient_name" size="lg" />
          <div><strong>{{ selectedAppointment.patient_name }}</strong><span>Consulta #{{ selectedAppointment.id }} · Paciente #{{ selectedAppointment.patient_id }}</span></div>
          <UiBadge :variant="statusVariant(outcomeLabel(selectedAppointment))">{{ outcomeLabel(selectedAppointment) }}</UiBadge>
        </div>
        <section class="history-detail__section">
          <h3>Dados do agendamento</h3>
          <dl class="history-detail__grid">
            <div><dt>Data e horário</dt><dd>{{ formatDate(selectedAppointment.appointment_date, { dateStyle: 'long' }) }} · {{ formatTime(selectedAppointment.appointment_time) }}</dd></div>
            <div><dt>Duração prevista</dt><dd>{{ selectedAppointment.duration_minutes }} minutos</dd></div>
            <div><dt>Dentista</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
            <div><dt>Procedimento</dt><dd>{{ selectedAppointment.procedure }}</dd></div>
            <div><dt>Status operacional</dt><dd>{{ selectedAppointment.status }}</dd></div>
            <div><dt>Confirmação</dt><dd>{{ selectedAppointment.confirmation_status }}</dd></div>
          </dl>
        </section>
        <section class="history-detail__section">
          <h3>Paciente</h3>
          <dl class="history-detail__grid">
            <div><dt>Nome</dt><dd>{{ selectedAppointment.patient_name }}</dd></div>
            <div><dt>Telefone</dt><dd>{{ formatPhone(selectedAppointment.patient_phone) }}</dd></div>
            <div><dt>Identificador</dt><dd>#{{ selectedAppointment.patient_id }}</dd></div>
          </dl>
        </section>
        <section class="history-detail__section">
          <h3>Informações administrativas</h3>
          <dl class="history-detail__grid">
            <div><dt>Agendamento criado</dt><dd>{{ formatTimestamp(selectedAppointment.created_at) }}</dd></div>
            <div><dt>Última atualização</dt><dd>Não disponível na API atual</dd></div>
            <div><dt>Usuário que criou</dt><dd>Não disponível na API atual</dd></div>
            <div><dt>Check-in</dt><dd>{{ selectedAppointment.arrival_at ? formatTimestamp(selectedAppointment.arrival_at) : 'Não registrado' }}</dd></div>
            <div class="history-detail__wide"><dt>Observações administrativas</dt><dd>{{ selectedAppointment.administrative_notes || 'Nenhuma observação registrada.' }}</dd></div>
          </dl>
        </section>
        <section class="history-detail__section">
          <h3>Linha do tempo disponível</h3>
          <ol class="history-timeline">
            <li v-if="selectedAppointment.created_at"><span class="history-timeline__dot"></span><div><strong>Consulta agendada</strong><p>{{ formatTimestamp(selectedAppointment.created_at) }} · responsável não registrado</p></div></li>
            <li v-if="selectedAppointment.arrival_at"><span class="history-timeline__dot history-timeline__dot--success"></span><div><strong>Check-in realizado</strong><p>{{ formatTimestamp(selectedAppointment.arrival_at) }} · usuário não registrado</p></div></li>
            <li v-if="selectedAppointment.confirmation_status && selectedAppointment.confirmation_status !== 'Pendente'"><span class="history-timeline__dot history-timeline__dot--info"></span><div><strong>Confirmação atual: {{ selectedAppointment.confirmation_status }}</strong><p>O horário do registro não está disponível.</p></div></li>
          </ol>
          <p v-if="!selectedAppointment.created_at && !selectedAppointment.arrival_at" class="history-detail__empty">Não há eventos com data e hora disponíveis para esta consulta.</p>
          <p class="history-detail__notice">A API ainda não preserva alterações anteriores de data, horário ou status; por isso, esta tela mostra somente eventos com registro verificável e não inventa remarcações ou usuários responsáveis.</p>
        </section>
        <div class="history-detail__actions">
          <UiButton variant="secondary" @click="goToPatient(selectedAppointment)">Abrir cadastro do paciente</UiButton>
          <UiButton v-if="canReschedule(selectedAppointment)" variant="secondary" @click="reschedule(selectedAppointment)">Reagendar</UiButton>
          <UiButton v-if="selectedAppointment.status === 'Concluída'" @click="bookReturn(selectedAppointment)">Agendar retorno</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiDialog v-model="exportOpen" title="Exportar histórico">
      <div class="history-export-confirm">
        <p>O arquivo CSV conterá os {{ exportRows.length }} registros filtrados, incluindo nome e telefone do paciente. Use e armazene o arquivo conforme as permissões e a política de proteção de dados da clínica.</p>
        <div class="history-detail__actions">
          <UiButton variant="secondary" @click="exportOpen = false">Cancelar</UiButton>
          <UiButton @click="exportHistory"><Download :size="16" aria-hidden="true" /> Exportar CSV</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiToast :key="toastKey" v-model="toastVisible" :message="toastMessage" :variant="toastVariant" />
  </div>
</template>

<style scoped>
.history-page{min-height:100vh;background:var(--color-page,#f5f7fb);color:var(--color-text,#193343)}
.history-main{width:min(100% - 2 * clamp(var(--space-4),4vw,var(--space-10)),92rem);margin-inline:auto;padding-block:var(--space-6) var(--space-8)}
.history-intro,.history-intro__actions,.history-search-bar,.history-search,.history-metrics,.history-metric,.history-panel__heading,.history-filters,.history-filter,.history-table-toolbar,.history-patient,.history-actions,.history-pagination,.history-card__heading,.history-card__actions,.history-detail__identity,.history-detail__actions,.history-footer{display:flex;align-items:center}
.history-intro{justify-content:space-between;gap:var(--space-5);margin-bottom:var(--space-5)}
.history-intro__actions{gap:var(--space-2);flex-wrap:wrap}
.history-eyebrow{margin:0 0 var(--space-1);color:var(--color-primary);font-size:.6875rem;font-weight:var(--font-weight-bold);letter-spacing:var(--letter-spacing-wide)}
.history-intro h1{margin:0;font-family:var(--font-heading);font-size:clamp(1.5rem,2.5vw,1.875rem);font-weight:var(--font-weight-semibold);letter-spacing:var(--letter-spacing-tight);line-height:var(--line-height-tight)}
.history-intro>div>p:last-child{margin:.5rem 0 0;color:var(--color-text-secondary);font-size:var(--font-size-sm)}
.history-search-bar{gap:var(--space-2);margin-bottom:var(--space-4);flex-wrap:wrap}
.history-search,.history-date{min-height:2.7rem;gap:.55rem;padding-inline:.75rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-secondary)}
.history-search{flex:1;min-width:min(100%,18rem)}
.history-search input,.history-date input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-xs)}
.history-date{width:10rem}.history-date-separator{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-refresh,.history-action{display:grid;flex:none;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer}
.history-refresh{width:2.65rem;height:2.65rem}.history-action{width:2rem;height:2rem}
.history-refresh:hover,.history-action:hover{border-color:var(--color-primary);background:var(--color-blue-50);color:var(--color-primary)}
.history-refresh:disabled{cursor:wait;opacity:.6}.history-spin{animation:history-spin .8s linear infinite}@keyframes history-spin{to{transform:rotate(360deg)}}
.history-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--space-3);margin-bottom:var(--space-3)}
.history-metric{min-width:0;min-height:5.8rem;gap:var(--space-3);padding:var(--space-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-xs)}
.history-metric__icon{display:grid;width:2.5rem;height:2.5rem;flex:none;place-items:center;border-radius:var(--radius-sm)}
.history-metric__icon--blue{background:var(--color-blue-50);color:var(--color-primary)}.history-metric__icon--green{background:var(--color-success-subtle);color:var(--color-success-strong)}.history-metric__icon--red{background:var(--color-danger-subtle);color:var(--color-danger)}.history-metric__icon--amber{background:var(--color-warning-subtle);color:var(--color-warning)}.history-metric__icon--violet{background:var(--color-violet-subtle);color:var(--color-violet)}
.history-metric div{display:grid;min-width:0;gap:.2rem}.history-metric div>span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.history-metric strong{color:var(--color-text);font-size:var(--font-size-xl);line-height:1.1}
.history-notice{display:flex;align-items:flex-start;gap:.5rem;margin:0 0 var(--space-5);color:var(--color-text-muted);font-size:var(--font-size-xs);line-height:1.5}.history-notice svg{flex:none;color:var(--color-primary)}
.history-panel{overflow:hidden;padding:var(--space-5);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-xs)}
.history-panel__heading{justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-4)}
.history-panel__heading h2{margin:0;font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold)}
.history-panel__heading>div>p:last-child{margin:.35rem 0 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-created-toggle{display:flex;align-items:center;gap:.45rem;color:var(--color-text-secondary);font-size:var(--font-size-xs)}
.history-filters{gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-4)}
.history-filter{min-height:2.35rem;gap:.4rem;padding:0 .65rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-muted)}
.history-filter select,.history-filter input{max-width:13rem;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text-secondary);font:inherit;font-size:var(--font-size-xs)}
.history-filter--date span{white-space:nowrap;font-size:var(--font-size-xs)}
.history-table-toolbar{justify-content:space-between;gap:var(--space-3);padding:.75rem 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-table-toolbar>div{display:flex;align-items:center;gap:var(--space-3)}
.history-table-toolbar label{display:flex;align-items:center;gap:.4rem}
.history-table-toolbar select{max-width:10rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:.35rem;background:var(--color-surface);color:var(--color-text-secondary);font:inherit}
.history-table-wrap{width:100%;overflow-x:auto}
.history-table{width:100%;border-collapse:collapse;text-align:left;font-size:var(--font-size-xs)}
.history-table th{padding:.7rem .55rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-weight:var(--font-weight-medium);white-space:nowrap}
.history-table td{padding:.7rem .55rem;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);vertical-align:middle}
.history-table tbody tr:last-child td{border-bottom:0}.history-table td strong{color:var(--color-text);font-weight:var(--font-weight-medium)}.history-table td small{display:block;margin-top:.18rem;color:var(--color-text-muted)}
.history-patient{gap:.5rem;min-width:9rem;white-space:nowrap}.history-muted{color:var(--color-text-muted)!important}
.history-actions{justify-content:flex-end;gap:.35rem;white-space:nowrap}
.history-cards{display:none}
.history-pagination{justify-content:space-between;gap:var(--space-3);padding-top:var(--space-4);color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-pagination>div{display:flex;align-items:center;gap:.5rem}
.history-state{display:grid;min-height:13rem;align-content:center;justify-items:center;gap:.55rem;color:var(--color-text-muted);text-align:center}
.history-state strong{color:var(--color-text);font-size:var(--font-size-sm)}.history-state p{max-width:30rem;margin:0 0 .3rem;font-size:var(--font-size-xs)}.history-state--error>svg{color:var(--color-danger)}
.history-spinner{width:1.4rem;height:1.4rem;border:2px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;animation:history-spin .7s linear infinite}
.history-footer{justify-content:space-between;gap:var(--space-3);padding:var(--space-4) 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-detail{display:grid;gap:var(--space-4)}
.history-detail__identity{gap:var(--space-3);padding-bottom:var(--space-3);border-bottom:1px solid var(--color-border)}
.history-detail__identity>div{display:grid;flex:1;gap:.15rem}.history-detail__identity strong{color:var(--color-text);font-size:var(--font-size-base)}.history-detail__identity span{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-detail__section{display:grid;gap:var(--space-3)}.history-detail__section h3{margin:0;color:var(--color-text);font-size:var(--font-size-sm)}
.history-detail__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin:0}
.history-detail__grid div{min-width:0}.history-detail__grid dt{color:var(--color-text-muted);font-size:var(--font-size-xs)}.history-detail__grid dd{margin:.25rem 0 0;color:var(--color-text);font-size:var(--font-size-sm);overflow-wrap:anywhere}.history-detail__wide{grid-column:1/-1}
.history-timeline{display:grid;gap:var(--space-3);margin:0;padding:0;list-style:none}
.history-timeline li{display:flex;align-items:flex-start;gap:.75rem}
.history-timeline__dot{width:.65rem;height:.65rem;flex:none;margin:.3rem .2rem 0;border-radius:50%;background:var(--color-primary);box-shadow:0 0 0 4px var(--color-blue-50)}
.history-timeline__dot--success{background:var(--color-success);box-shadow:0 0 0 4px var(--color-success-subtle)}.history-timeline__dot--info{background:var(--color-warning);box-shadow:0 0 0 4px var(--color-warning-subtle)}
.history-timeline li>div{display:grid;gap:.15rem}.history-timeline strong{color:var(--color-text);font-size:var(--font-size-xs)}.history-timeline p,.history-detail__empty{margin:0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.history-detail__notice{margin:0;padding:.75rem;border-radius:var(--radius-sm);background:var(--color-warning-subtle);color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5}
.history-detail__actions{justify-content:flex-end;gap:var(--space-2);flex-wrap:wrap}
.history-export-confirm{display:grid;gap:var(--space-4)}.history-export-confirm>p{margin:0;color:var(--color-text-secondary);font-size:var(--font-size-sm);line-height:1.55}
.history-page :deep(button),.history-page :deep(input),.history-page :deep(select),.history-page :deep(textarea){font-family:inherit}
.history-page :deep(button:focus-visible),.history-page input:focus-visible,.history-page select:focus-visible{outline:3px solid color-mix(in srgb,var(--color-primary) 42%,transparent);outline-offset:2px}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1250px){.history-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.history-table{min-width:76rem}}
@media(max-width:720px){.history-main{width:calc(100% - 2 * var(--space-3));padding-block:var(--space-4)}.history-intro{align-items:flex-start;flex-direction:column;gap:var(--space-3)}.history-intro__actions{width:100%}.history-intro__actions>*{flex:1}.history-search-bar{display:grid;grid-template-columns:minmax(0,1fr) auto}.history-search{grid-column:1/-1}.history-date{width:auto;min-width:0}.history-date-separator{display:none}.history-refresh{grid-column:2;grid-row:3}.history-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2)}.history-metric{min-height:5rem;padding:var(--space-3);gap:.65rem}.history-metric__icon{width:2.1rem;height:2.1rem}.history-metric strong{font-size:var(--font-size-lg)}.history-panel{padding:var(--space-3)}.history-panel__heading{align-items:flex-start}.history-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.history-filter{min-width:0}.history-filter select,.history-filter input{max-width:100%;width:100%}.history-filters :deep(button){grid-column:1/-1;justify-self:end}.history-table-toolbar{align-items:flex-start;flex-direction:column}.history-table-toolbar>div{width:100%;justify-content:space-between}.history-table{display:none}.history-cards{display:grid;gap:var(--space-3)}.history-card{display:grid;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)}.history-card__heading{gap:.6rem}.history-card__heading>div{display:grid;flex:1;min-width:0;gap:.15rem}.history-card__heading strong{color:var(--color-text);font-size:var(--font-size-sm)}.history-card__heading span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.history-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:0}.history-card dl div{min-width:0}.history-card dt{color:var(--color-text-muted);font-size:.68rem}.history-card dd{margin:.15rem 0 0;color:var(--color-text);font-size:var(--font-size-xs);overflow-wrap:anywhere}.history-card__actions{flex-wrap:wrap;gap:.4rem}.history-pagination{align-items:flex-start;flex-direction:column}.history-footer{align-items:flex-start;flex-direction:column}.history-detail__grid{grid-template-columns:minmax(0,1fr)}.history-detail__wide{grid-column:auto}.history-detail__actions>*{flex:1}}
@media(max-width:420px){.history-intro__actions{align-items:stretch;flex-direction:column}.history-search-bar{grid-template-columns:minmax(0,1fr) auto}.history-date input{font-size:.68rem}.history-metrics{gap:.5rem}.history-metric{align-items:flex-start;padding:.65rem}.history-metric__icon{width:1.85rem;height:1.85rem}.history-metric div>span{font-size:.67rem}.history-filters{grid-template-columns:minmax(0,1fr)}.history-filters :deep(button){grid-column:auto}.history-card__heading{flex-wrap:wrap}.history-card__heading .ui-badge{margin-left:2.5rem}.history-card__actions>*{flex:1}.history-table-toolbar>div{align-items:flex-start;flex-direction:column}.history-detail__actions{align-items:stretch;flex-direction:column}}
@media(prefers-reduced-motion:reduce){.history-page *, .history-page *:before,.history-page *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
