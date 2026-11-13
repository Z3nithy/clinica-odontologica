<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileChartColumn,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import { getManagerPatients } from '../services/manager-patients'
import { getManagerProductivity } from '../services/manager-productivity'
import { getSessionUser } from '../services/auth-session'
import ManagerShell from '../components/ManagerShell.vue'
import UiButton from '../components/ui/UiButton.vue'

const router = useRouter()
const canViewReports = getSessionUser()?.role === 'manager'
const today = new Date()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(today)
const pageSize = 10
const startDraft = ref(dateKey(new Date(today.getFullYear(), today.getMonth(), 1)))
const endDraft = ref(dateKey(today))
const professionalDraft = ref([])
const statusDraft = ref('')
const compareDraft = ref(true)
const applied = ref({ start: startDraft.value, end: endDraft.value, dentists: [], status: '', compare: true })
const productivity = ref(null)
const patientSummary = ref(null)
const state = ref('loading')
const errorMessage = ref('')
const refreshedAt = ref(null)
const selectedReport = ref('appointments-evolution')
const search = ref('')
const sortBy = ref('')
const sortDirection = ref('asc')
const page = ref(1)
const exportState = ref('idle')
const exportMessage = ref('')
const filterError = ref('')
const requestId = ref(0)

function dateKey(value) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function dateFromKey(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(dateFromKey(String(value).slice(0, 10)))
}

function formatNumber(value) {
  return value == null ? 'N/D' : new Intl.NumberFormat('pt-BR').format(value)
}

function formatPercent(value) {
  return value == null ? 'N/D' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`
}

const dateRangeLabel = computed(() => `${formatDate(applied.value.start)} – ${formatDate(applied.value.end)}`)
const activeFilters = computed(() => [
  `Período: ${dateRangeLabel.value}`,
  applied.value.dentists.length ? `Profissionais: ${applied.value.dentists.map((id) => productivity.value?.dentist_options.find((item) => String(item.dentist_id) === id)?.name || 'selecionado').join(', ')}` : '',
  applied.value.status ? `Status: ${applied.value.status}` : '',
  applied.value.compare ? `Comparação: ${formatDate(productivity.value?.previous_start_date)} – ${formatDate(productivity.value?.previous_end_date)}` : '',
].filter(Boolean))

const categories = [
  {
    id: 'agenda',
    title: 'Agenda e consultas',
    description: 'Volume, status e evolução da agenda.',
    icon: CalendarDays,
    reports: [
      { id: 'appointments-evolution', title: 'Evolução das consultas', description: 'Consultas agendadas, concluídas, canceladas e faltas ao longo do período.', chart: 'timeline' },
      { id: 'appointments-status', title: 'Distribuição por status', description: 'Quantidade de consultas por status registrado na agenda.', chart: 'status' },
      { id: 'appointments-professional', title: 'Consultas por profissional', description: 'Comparação de consultas e resultados operacionais entre profissionais.', chart: 'professional' },
    ],
  },
  {
    id: 'attendances',
    title: 'Atendimentos',
    description: 'Atendimentos registrados como concluídos.',
    icon: Activity,
    reports: [
      { id: 'completed-evolution', title: 'Atendimentos concluídos por período', description: 'Evolução dos registros de consulta com status Concluída.', chart: 'timeline-completed' },
      { id: 'completed-professional', title: 'Atendimentos por profissional', description: 'Atendimentos concluídos por profissional no intervalo selecionado.', chart: 'completed-professional' },
    ],
  },
  {
    id: 'patients',
    title: 'Pacientes',
    description: 'Novos cadastros e consultas futuras.',
    icon: UsersRound,
    reports: [
      { id: 'patients-overview', title: 'Resumo da base de pacientes', description: 'Total cadastrado, novos no período, consultas futuras e cadastros incompletos.', chart: 'patients' },
    ],
  },
  {
    id: 'team',
    title: 'Produtividade da equipe',
    description: 'Indicadores operacionais comparáveis por profissional.',
    icon: ChartColumn,
    reports: [
      { id: 'team-completion', title: 'Realização por profissional', description: 'Consultas elegíveis e taxa de realização segundo a regra da tela de produtividade.', chart: 'completion' },
      { id: 'team-cancellations', title: 'Cancelamentos e faltas por profissional', description: 'Contagens de cancelamentos e não comparecimentos registrados.', chart: 'cancellations' },
    ],
  },
  {
    id: 'occurrences',
    title: 'Cancelamentos e faltas',
    description: 'Ocorrências operacionais registradas na agenda.',
    icon: AlertCircle,
    reports: [
      { id: 'occurrences-period', title: 'Ocorrências por período', description: 'Distribuição temporal de cancelamentos e faltas.', chart: 'occurrences-timeline' },
      { id: 'occurrences-professional', title: 'Ocorrências por profissional', description: 'Distribuição registrada por profissional, sem inferir causas ou qualidade.', chart: 'cancellations' },
    ],
  },
]

const allReports = computed(() => categories.flatMap((category) => category.reports.map((report) => ({ ...report, category: category.title }))))
const report = computed(() => allReports.value.find((item) => item.id === selectedReport.value) || allReports.value[0])

function columnsForReport(id) {
  if (id === 'appointments-evolution') {
    return [
      { key: 'label', label: 'Período', type: 'text' },
      { key: 'scheduled', label: 'Agendadas', type: 'number' },
      { key: 'completed', label: 'Concluídas', type: 'number' },
      { key: 'cancelled', label: 'Canceladas', type: 'number' },
      { key: 'no_show', label: 'Faltas', type: 'number' },
    ]
  }
  if (id === 'completed-evolution') return [
    { key: 'label', label: 'Período', type: 'text' },
    { key: 'completed', label: 'Atendimentos concluídos', type: 'number' },
  ]
  if (id === 'occurrences-period') return [
    { key: 'label', label: 'Período', type: 'text' },
    { key: 'cancelled', label: 'Canceladas', type: 'number' },
    { key: 'no_show', label: 'Faltas', type: 'number' },
  ]
  if (id === 'appointments-status') return [
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'count', label: 'Consultas', type: 'number' },
  ]
  if (id === 'patients-overview') return [
    { key: 'indicator', label: 'Indicador', type: 'text' },
    { key: 'value', label: 'Valor', type: 'number' },
    { key: 'definition', label: 'Definição', type: 'text' },
  ]
  if (['team-completion'].includes(id)) return [
    { key: 'name', label: 'Profissional', type: 'text' },
    { key: 'eligible', label: 'Elegíveis', type: 'number' },
    { key: 'completed', label: 'Concluídas', type: 'number' },
    { key: 'completion_rate', label: 'Taxa de realização', type: 'percent' },
  ]
  if (id === 'completed-professional') return [
    { key: 'name', label: 'Profissional', type: 'text' },
    { key: 'completed', label: 'Atendimentos concluídos', type: 'number' },
  ]
  if (['team-cancellations', 'occurrences-professional'].includes(id)) return [
    { key: 'name', label: 'Profissional', type: 'text' },
    { key: 'cancelled', label: 'Canceladas', type: 'number' },
    { key: 'no_show', label: 'Faltas', type: 'number' },
  ]
  return [
    { key: 'name', label: 'Profissional', type: 'text' },
    { key: 'scheduled', label: 'Agendadas', type: 'number' },
    { key: 'completed', label: 'Concluídas', type: 'number' },
    { key: 'cancelled', label: 'Canceladas', type: 'number' },
    { key: 'no_show', label: 'Faltas', type: 'number' },
    { key: 'completion_rate', label: 'Realização', type: 'percent' },
  ]
}

function rowsForReport(id) {
  if (!productivity.value) return []
  if (['appointments-evolution', 'completed-evolution', 'occurrences-period'].includes(id)) {
    return productivity.value.timeline.map((item) => ({
      ...item,
      scheduled: id === 'completed-evolution' ? undefined : item.scheduled,
      completed: id === 'occurrences-period' ? undefined : item.completed,
      cancelled: id === 'completed-evolution' ? undefined : item.cancelled,
      no_show: id === 'completed-evolution' ? undefined : item.no_show,
    }))
  }
  if (id === 'appointments-status') return productivity.value.status_counts
  if (id === 'patients-overview') {
    const m = patientSummary.value?.metrics
    if (!m) return []
    return [
      { indicator: 'Total de pacientes', value: m.total, definition: 'Todos os registros válidos da clínica.' },
      { indicator: 'Novos pacientes no período', value: m.new_in_period, definition: `Cadastro entre ${dateRangeLabel.value}.` },
      { indicator: 'Com consultas futuras', value: m.with_upcoming_appointments, definition: 'Pacientes distintos com consulta futura não cancelada.' },
      { indicator: 'Cadastros incompletos', value: m.incomplete, definition: 'Telefone ausente ou autorização administrativa pendente.' },
    ]
  }
  if (id === 'team-completion') return productivity.value.professionals.map((item) => ({ ...item }))
  if (['team-cancellations', 'occurrences-professional'].includes(id)) return productivity.value.professionals.map((item) => ({ ...item }))
  return productivity.value.professionals.map((item) => ({ ...item }))
}

const columns = computed(() => columnsForReport(report.value.id))
const isTimelineChart = computed(() => ['appointments-evolution', 'completed-evolution', 'occurrences-period'].includes(report.value.id))
const reportRows = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  let rows = rowsForReport(report.value.id)
  if (term) rows = rows.filter((row) => columns.value.some((column) =>
    String(row[column.key] ?? '').toLocaleLowerCase('pt-BR').includes(term),
  ))
  const currentSort = sortBy.value
  if (currentSort) {
    rows = [...rows].sort((a, b) => {
      const left = a[currentSort]
      const right = b[currentSort]
      const result = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR')
      return sortDirection.value === 'asc' ? result : -result
    })
  }
  return rows
})
const pageCount = computed(() => Math.max(1, Math.ceil(reportRows.value.length / pageSize)))
const pagedRows = computed(() => reportRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const chartRows = computed(() => {
  const rows = [...reportRows.value]
  if (isTimelineChart.value) rows.sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length <= 14) return rows
  return Array.from({ length: 14 }, (_, index) => rows[Math.round(index * (rows.length - 1) / 13)])
})
const chartSeries = computed(() => {
  if (report.value.id === 'appointments-evolution' || report.value.id === 'appointments-professional') return [
    { key: 'scheduled', label: 'Agendadas', color: 'blue' },
    { key: 'completed', label: 'Concluídas', color: 'green' },
    { key: 'cancelled', label: 'Canceladas', color: 'amber' },
    { key: 'no_show', label: 'Faltas', color: 'rose' },
  ]
  if (report.value.id === 'completed-evolution' || report.value.id === 'team-completion') {
    return [{ key: 'completed', label: 'Concluídas', color: 'blue' }]
  }
  if (report.value.id === 'completed-professional') return [{ key: 'completed', label: 'Concluídas', color: 'blue' }]
  if (report.value.id === 'occurrences-period' || ['team-cancellations', 'occurrences-professional'].includes(report.value.id)) return [
    { key: 'cancelled', label: 'Canceladas', color: 'amber' },
    { key: 'no_show', label: 'Faltas', color: 'rose' },
  ]
  if (report.value.id === 'appointments-status') return [{ key: 'count', label: 'Consultas', color: 'blue' }]
  return [{ key: 'value', label: 'Pacientes', color: 'blue' }]
})
const chartMax = computed(() => Math.max(
  1,
  ...chartRows.value.flatMap((row) => chartSeries.value.map((series) => row[series.key] || 0)),
))
const chartWidth = computed(() => Math.max(320, chartRows.value.length * 56))
const reportRecordCount = computed(() => reportRows.value.length)

const summaryCards = computed(() => {
  const appointmentMetrics = productivity.value?.metrics
  const patients = patientSummary.value?.metrics
  return [
    { label: 'Consultas agendadas', value: appointmentMetrics?.scheduled, icon: CalendarDays, color: 'blue', note: 'Exclui canceladas e reagendadas.' },
    { label: 'Atendimentos concluídos', value: appointmentMetrics?.completed, icon: Activity, color: 'green', note: 'Status registrado como Concluída.' },
    { label: 'Consultas canceladas', value: appointmentMetrics?.cancelled, icon: AlertCircle, color: 'amber', note: 'Status registrado como Cancelada.' },
    { label: 'Faltas registradas', value: appointmentMetrics?.no_show, icon: AlertCircle, color: 'rose', note: 'Status registrado como Não compareceu.' },
    { label: 'Novos pacientes', value: patients?.new_in_period, icon: UsersRound, color: 'violet', note: 'Cadastros no intervalo selecionado.' },
    { label: 'Taxa de realização', value: appointmentMetrics?.completion_rate, icon: ChartColumn, color: 'teal', note: 'Concluídas ÷ base elegível; futuras em aberto excluídas.' },
    { label: 'Taxa de cancelamento', value: appointmentMetrics?.cancellation_rate, icon: AlertCircle, color: 'amber', note: 'Canceladas ÷ base elegível.' },
    { label: 'Taxa de faltas', value: appointmentMetrics?.no_show_rate, icon: AlertCircle, color: 'rose', note: 'Faltas ÷ base elegível.' },
  ]
})

function summaryValue(card) {
  if (card.value == null) return 'N/D'
  if (card.label.startsWith('Taxa')) return formatPercent(card.value)
  return formatNumber(card.value)
}

function comparisonFor(metric) {
  if (!applied.value.compare || !productivity.value?.previous_metrics) return ''
  const current = productivity.value.metrics?.[metric]
  const previous = productivity.value.previous_metrics?.[metric]
  if (current == null || previous == null) return 'Comparação indisponível para este recorte.'
  if (metric.endsWith('_rate')) {
    const delta = current - previous
    return `${delta > 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(delta)} p.p. no período equivalente`
  }
  const delta = current - previous
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)} vs. período equivalente`
}

function summaryComparison(card) {
  const map = {
    'Consultas agendadas': 'scheduled',
    'Atendimentos concluídos': 'completed',
    'Consultas canceladas': 'cancelled',
    'Faltas registradas': 'no_show',
    'Taxa de realização': 'completion_rate',
    'Taxa de cancelamento': 'cancellation_rate',
    'Taxa de faltas': 'no_show_rate',
  }
  if (card.label === 'Novos pacientes') {
    if (!applied.value.compare) return ''
    const metrics = patientSummary.value?.metrics
    if (metrics?.previous_period_new == null || metrics.new_in_period == null) return 'Comparação indisponível.'
    const delta = metrics.new_in_period - metrics.previous_period_new
    return `${delta > 0 ? '+' : ''}${formatNumber(delta)} vs. período equivalente`
  }
  return map[card.label] ? comparisonFor(map[card.label]) : ''
}

function columnValue(row, column) {
  const value = row[column.key]
  if (value == null) return '—'
  if (column.type === 'percent') return formatPercent(value)
  if (column.type === 'number') return formatNumber(value)
  return value
}

function chartLabel(row) {
  return row.label || row.status || row.indicator || row.name
}

function lineX(index) {
  return chartRows.value.length === 1
    ? chartWidth.value / 2
    : 18 + index * (chartWidth.value - 36) / (chartRows.value.length - 1)
}

function lineY(value) {
  return 152 - ((value || 0) / chartMax.value) * 120
}

function linePoints(series) {
  return chartRows.value
    .map((row, index) => `${lineX(index)},${lineY(row[series.key])}`)
    .join(' ')
}

function setSort(key) {
  if (sortBy.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  else {
    sortBy.value = key
    sortDirection.value = 'asc'
  }
  page.value = 1
}

function selectReport(reportId) {
  selectedReport.value = reportId
  page.value = 1
  search.value = ''
  sortBy.value = ''
}

async function loadReports() {
  if (!canViewReports) {
    state.value = 'denied'
    return
  }
  if (!startDraft.value || !endDraft.value || startDraft.value > endDraft.value) {
    filterError.value = 'Informe um intervalo válido: a data inicial deve ser anterior ou igual à final.'
    return
  }
  const duration = (dateFromKey(endDraft.value) - dateFromKey(startDraft.value)) / 86400000 + 1
  if (duration > 366) {
    filterError.value = 'O período máximo para relatórios é de 366 dias.'
    return
  }
  filterError.value = ''
  const currentRequest = ++requestId.value
  state.value = productivity.value ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const parameters = {
      start_date: startDraft.value,
      end_date: endDraft.value,
      compare: compareDraft.value,
      dentist_ids: professionalDraft.value.join(',') || undefined,
      status: statusDraft.value || undefined,
    }
    const [productivityResponse, patientResponse] = await Promise.all([
      getManagerProductivity(parameters),
      getManagerPatients({
        created_from: startDraft.value,
        created_to: endDraft.value,
        limit: 1,
        offset: 0,
      }),
    ])
    if (currentRequest !== requestId.value) return
    productivity.value = productivityResponse
    patientSummary.value = patientResponse
    applied.value = {
      start: startDraft.value,
      end: endDraft.value,
      dentists: [...professionalDraft.value],
      status: statusDraft.value,
      compare: compareDraft.value,
    }
    refreshedAt.value = new Date()
    state.value = 'ready'
    page.value = 1
  } catch (error) {
    if (currentRequest !== requestId.value) return
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar os relatórios gerenciais.')
    state.value = error.response?.status === 403 ? 'denied' : 'error'
  }
}

function applyFilters() {
  void loadReports()
}

function clearFilters() {
  startDraft.value = dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
  endDraft.value = dateKey(today)
  professionalDraft.value = []
  statusDraft.value = ''
  compareDraft.value = true
  search.value = ''
  filterError.value = ''
  void loadReports()
}

function csvEscape(value) {
  let text = String(value ?? '')
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

async function exportCsv() {
  exportMessage.value = ''
  exportState.value = 'processing'
  await new Promise((resolve) => window.requestAnimationFrame(resolve))
  try {
    const header = columns.value.map((column) => column.label)
    const lines = reportRows.value.map((row) => columns.value.map((column) => {
      const value = row[column.key]
      return csvEscape(column.type === 'percent' && value != null ? `${value}%` : value)
    }).join(';'))
    const content = `\uFEFF${[header.map(csvEscape).join(';'), ...lines].join('\r\n')}`
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `zen-${report.value.id}-${applied.value.start}-${applied.value.end}.csv`
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    exportState.value = 'success'
    exportMessage.value = 'Relatório CSV gerado com os dados agregados carregados e filtros aplicados.'
    window.setTimeout(() => {
      exportState.value = 'idle'
      exportMessage.value = ''
    }, 5000)
  } catch {
    exportState.value = 'error'
    exportMessage.value = 'Não foi possível gerar o CSV neste navegador.'
  }
}

function navigateShell(id) {
  const routes = {
    overview: 'manager-dashboard',
    schedule: 'manager-agenda',
    team: 'manager-team',
    productivity: 'manager-productivity',
    patients: 'manager-patients',
    reports: 'manager-reports',
    settings: 'manager-settings',
  }
  if (id === 'reports') window.scrollTo({ top: 0, behavior: 'auto' })
  else if (routes[id]) void router.push({ name: routes[id] })
}

onMounted(() => {
  void loadReports()
})
</script>

<template>
  <div class="manager-reports-page">
    <ManagerShell active-page="reports" :date-label="dateLabel" @navigate="navigateShell" />

    <main class="manager-reports-main">
      <header class="reports-intro">
        <div><p class="reports-eyebrow">PORTAL DO GESTOR</p><h1>Relatórios Gerenciais</h1><p>Consulte e analise os resultados operacionais da clínica</p></div>
        <UiButton :disabled="state !== 'ready' || !reportRows.length || exportState === 'processing'" @click="exportCsv">
          <template #start><Download :size="17" aria-hidden="true" /></template>
          {{ exportState === 'processing' ? 'Preparando CSV…' : 'Exportar relatório CSV' }}
        </UiButton>
      </header>

      <section v-if="state === 'denied'" class="reports-state" role="alert"><ShieldCheck :size="26" aria-hidden="true" /><strong>Acesso restrito</strong><p>Relatórios gerenciais estão disponíveis somente para gestores autorizados.</p></section>
      <section v-else-if="state === 'error'" class="reports-state reports-state--error" role="alert"><AlertCircle :size="26" aria-hidden="true" /><strong>Não foi possível carregar os relatórios</strong><p>{{ errorMessage }}</p><UiButton variant="secondary" @click="loadReports"><RefreshCw :size="16" aria-hidden="true" /> Tentar novamente</UiButton></section>
      <template v-else>
        <section class="reports-filter-panel" aria-label="Filtros gerais">
          <div class="reports-filter-grid">
            <label><span>Período inicial</span><input v-model="startDraft" type="date" :aria-invalid="Boolean(filterError)" :aria-describedby="filterError ? 'reports-filter-error' : undefined"></label>
            <label><span>Período final</span><input v-model="endDraft" type="date" :aria-invalid="Boolean(filterError)" :aria-describedby="filterError ? 'reports-filter-error' : undefined"></label>
            <label><span>Profissionais <small>(Ctrl/Cmd para múltiplos)</small></span><select v-model="professionalDraft" multiple size="3"><option v-for="dentist in productivity?.dentist_options || []" :key="dentist.dentist_id" :value="String(dentist.dentist_id)">{{ dentist.name }}</option></select></label>
            <label><span>Status de consulta</span><select v-model="statusDraft"><option value="">Todos os status</option><option v-for="status in productivity?.available_statuses || []" :key="status" :value="status">{{ status }}</option></select></label>
            <label class="reports-compare"><input v-model="compareDraft" type="checkbox"><span>Comparar ao período anterior equivalente</span></label>
            <div class="reports-filter-actions"><UiButton @click="applyFilters">Aplicar filtros</UiButton><UiButton variant="secondary" @click="clearFilters">Limpar filtros</UiButton></div>
          </div>
          <p v-if="filterError" id="reports-filter-error" class="reports-filter-error" role="alert">{{ filterError }}</p>
          <div class="reports-active-filters" aria-live="polite"><strong>Filtros aplicados</strong><span v-for="filter in activeFilters" :key="filter">{{ filter }}</span></div>
          <p class="reports-period-limit">Intervalo máximo: 366 dias. Unidade adicional e faturamento não estão disponíveis neste sistema.</p>
        </section>
        <p v-if="state === 'refreshing'" class="reports-refreshing" role="status"><RefreshCw :size="15" aria-hidden="true" /> Atualizando relatórios…</p>

        <section class="reports-summary" aria-label="Indicadores resumidos" :aria-busy="state === 'loading' || state === 'refreshing'">
          <article v-for="card in summaryCards" :key="card.label" class="reports-summary-card">
            <span class="reports-summary-icon" :class="`reports-summary-icon--${card.color}`"><component :is="card.icon" :size="18" aria-hidden="true" /></span>
            <div><span>{{ card.label }}</span><strong v-if="state === 'loading'" class="reports-skeleton" aria-label="Carregando indicador"></strong><strong v-else>{{ summaryValue(card) }}</strong><small>{{ card.note }}</small>            <small v-if="state === 'ready' && applied.compare && summaryComparison(card)">{{ summaryComparison(card) }}</small></div>
          </article>
        </section>

        <section class="reports-catalog" aria-label="Catálogo de relatórios">
          <header><div><h2>Catálogo de relatórios</h2><p>Selecione uma análise para consultar os dados agregados.</p></div><FileChartColumn :size="20" aria-hidden="true" /></header>
          <nav class="reports-category-tabs" aria-label="Categorias de relatório">
            <button v-for="category in categories" :key="category.id" type="button" :aria-current="category.reports.some((item) => item.id === selectedReport) ? 'page' : undefined" :class="{ 'reports-category-tab--active': category.reports.some((item) => item.id === selectedReport) }" @click="selectReport(category.reports[0].id)">
              <component :is="category.icon" :size="17" aria-hidden="true" /><span>{{ category.title }}</span>
            </button>
          </nav>
          <div class="reports-report-cards">
            <button v-for="item in categories.find((category) => category.reports.some((entry) => entry.id === selectedReport))?.reports" :key="item.id" type="button" class="reports-report-card" :class="{ 'reports-report-card--active': selectedReport === item.id }" @click="selectReport(item.id)">
              <strong>{{ item.title }}</strong><span>{{ item.description }}</span>
            </button>
          </div>
        </section>

        <section class="reports-detail-panel" aria-labelledby="selected-report-title" :aria-busy="state === 'loading' || state === 'refreshing'">
          <header class="reports-detail-heading">
            <div><p class="reports-eyebrow">{{ report.category }}</p><h2 id="selected-report-title">{{ report.title }}</h2><p>{{ report.description }}</p></div>
            <div class="reports-detail-meta"><span>{{ dateRangeLabel }}</span><small>{{ reportRecordCount }} linha(s) · {{ refreshedAt ? `consultado ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(refreshedAt)}` : 'carregando' }}</small></div>
          </header>
          <div v-if="applied.compare && productivity?.previous_metrics" class="reports-comparison" role="status"><Info :size="16" aria-hidden="true" /><span>Comparação operacional: {{ formatDate(productivity.previous_start_date) }} a {{ formatDate(productivity.previous_end_date) }}. As diferenças são mostradas nos indicadores acima; pacientes usam comparação equivalente da data de cadastro.</span></div>
          <div class="reports-chart-area">
            <div class="reports-chart-heading"><div><h3>{{ isTimelineChart ? 'Evolução ao longo do tempo' : report.id.includes('patient') ? 'Resumo do período' : 'Distribuição dos resultados' }}</h3><p>Visualização agregada; sem dados pessoais de pacientes.<template v-if="isTimelineChart && reportRecordCount > chartRows.length"> Exibindo {{ chartRows.length }} pontos distribuídos; a tabela contém todos os períodos.</template></p></div><span>{{ reportRows.length }} ponto(s)</span></div>
            <div class="reports-chart-legend" aria-label="Legenda do gráfico"><span v-for="series in chartSeries" :key="series.key"><i :class="`reports-legend-dot--${series.color}`"></i>{{ series.label }}</span></div>
            <div v-if="state === 'loading'" class="reports-chart-empty" role="status">Carregando dados do relatório…</div>
            <div v-else-if="!chartRows.length" class="reports-chart-empty">Nenhum resultado encontrado para os filtros selecionados.</div>
            <div v-else-if="isTimelineChart" class="reports-line-scroll">
              <svg class="reports-line-chart" role="img" :aria-label="`Gráfico de evolução: ${report.title}`" :viewBox="`0 0 ${chartWidth} 180`" :style="{ width: `${chartWidth}px` }">
                <line v-for="level in [32, 92, 152]" :key="level" x1="12" :x2="chartWidth - 12" :y1="level" :y2="level" class="reports-line-grid" />
                <g v-for="series in chartSeries" :key="series.key">
                  <polyline :class="`reports-line--${series.color}`" :points="linePoints(series)" />
                  <circle v-for="(row, index) in chartRows" :key="`${series.key}-${row.date}`" :class="`reports-point--${series.color}`" :cx="lineX(index)" :cy="lineY(row[series.key])" r="3.5">
                    <title>{{ chartLabel(row) }} — {{ series.label }}: {{ formatNumber(row[series.key]) }}</title>
                  </circle>
                </g>
              </svg>
              <div class="reports-line-labels" :style="{ width: `${chartWidth}px`, gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }">
                <span v-for="row in chartRows" :key="row.date">{{ chartLabel(row) }}</span>
              </div>
            </div>
            <div v-else class="reports-bars" :aria-label="`Gráfico: ${report.title}`">
              <div v-for="row in chartRows" :key="row.date || row.status || row.indicator || row.dentist_id" class="reports-bar-item">
                <span class="reports-bar-group" :aria-label="chartLabel(row)">
                  <span v-for="series in chartSeries" :key="series.key" class="reports-bar-track" :title="`${series.label}: ${formatNumber(row[series.key])}`"><i :class="`reports-bar--${series.color}`" :style="{ height: `${Math.max(3, ((row[series.key] || 0) / chartMax) * 100)}%` }"></i></span>
                </span>
                <span class="reports-bar-label">{{ chartLabel(row) }}</span>
              </div>
            </div>
          </div>
          <div class="reports-table-heading">
            <div><h3>Resultados</h3><p>{{ reportRecordCount }} registro(s) agregado(s) para a consulta atual.</p></div>
            <label class="reports-search"><Search :size="16" aria-hidden="true" /><input v-model="search" type="search" placeholder="Buscar nos resultados" @input="page = 1"></label>
          </div>
          <div v-if="state === 'loading'" class="reports-table-loading" role="status"><span v-for="item in 3" :key="item"></span></div>
          <div v-else-if="!pagedRows.length" class="reports-empty"><strong>Nenhum resultado encontrado para os filtros selecionados.</strong><p>Limpe ou ajuste os filtros para tentar novamente.</p><UiButton variant="secondary" size="sm" @click="clearFilters">Limpar filtros</UiButton></div>
          <div v-else class="reports-table-wrap"><table class="reports-table"><thead><tr><th v-for="column in columns" :key="column.key" scope="col"><button type="button" @click="setSort(column.key)">{{ column.label }}<ChevronDown :size="14" aria-hidden="true" /></button></th></tr></thead><tbody><tr v-for="(row, index) in pagedRows" :key="row.date || row.status || row.indicator || row.dentist_id || index"><td v-for="column in columns" :key="column.key">{{ columnValue(row, column) }}</td></tr></tbody></table></div>
          <footer class="reports-pagination"><span>Página {{ page }} de {{ pageCount }}</span><div><button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="page -= 1"><ChevronLeft :size="17" aria-hidden="true" /></button><button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="page += 1"><ChevronRight :size="17" aria-hidden="true" /></button></div></footer>
        </section>

        <aside class="reports-disclaimer"><Info :size="18" aria-hidden="true" /><p>As contagens seguem os status registrados na agenda; “Reagendada” não integra as taxas e consultas futuras em aberto não entram na base das taxas. As horas não são exibidas porque o sistema registra duração planejada, não duração efetiva. Não há unidade múltipla, dados estruturados de motivos, módulo financeiro ou exportação server-side. O CSV contém somente os dados agregados desta tabela.</p></aside>
        <p v-if="exportMessage" class="reports-export-message" :class="`reports-export-message--${exportState}`" role="status">{{ exportMessage }}</p>
        <p v-if="refreshedAt" class="reports-updated">Dados consultados em {{ new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(refreshedAt) }}.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.manager-reports-page { min-height: 100vh; background: var(--color-background); color: var(--color-text); }
.manager-reports-main { display: grid; width: min(100% - 3rem, 88rem); gap: var(--space-5); margin: 0 auto; padding: var(--space-8) 0 var(--space-10); }
.reports-intro, .reports-detail-heading, .reports-chart-heading, .reports-table-heading, .reports-pagination, .reports-pagination > div, .reports-catalog > header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.reports-intro { align-items: flex-end; }
.reports-intro h1 { margin: 0; font-family: var(--font-heading); font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.15; }
.reports-intro > div > p:last-child { margin: var(--space-2) 0 0; color: var(--color-text-secondary); }
.reports-eyebrow { margin: 0 0 var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: .08em; }
.reports-filter-panel, .reports-catalog, .reports-detail-panel, .reports-summary-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.reports-filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; gap: var(--space-3); }
.reports-filter-grid > label { display: grid; min-width: 0; gap: var(--space-2); }
.reports-filter-grid > label > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.reports-filter-grid small { font-weight: var(--font-weight-normal); }
.reports-filter-grid select, .reports-filter-grid input[type="date"] { width: 100%; min-height: 2.65rem; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.reports-filter-grid select[multiple] { min-height: 5rem; padding: var(--space-2); }
.reports-compare { display: flex !important; min-height: 2.65rem; align-items: center; gap: var(--space-2) !important; }
.reports-compare input { width: 1rem; height: 1rem; accent-color: var(--color-primary); }
.reports-compare span { color: var(--color-text-secondary); font-size: var(--font-size-xs) !important; font-weight: var(--font-weight-normal) !important; }
.reports-filter-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.reports-filter-error { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: var(--font-size-sm); }
.reports-filter-grid input[aria-invalid="true"] { border-color: var(--color-danger); }
.reports-refreshing { display: flex; align-items: center; gap: var(--space-2); margin: calc(-1 * var(--space-3)) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-active-filters span { padding: .25rem .55rem; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-background); }
.reports-period-limit { margin: var(--space-3) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.reports-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.reports-summary-card { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4); }
.reports-summary-card > div { display: grid; min-width: 0; gap: var(--space-1); }
.reports-summary-card > div > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.reports-summary-card > div > strong { font-family: var(--font-heading); font-size: 1.45rem; }
.reports-summary-card small { color: var(--color-text-muted); font-size: .68rem; line-height: 1.4; }
.reports-summary-icon { display: grid; width: 2.35rem; height: 2.35rem; flex: 0 0 auto; place-items: center; border-radius: var(--radius-md); }
.reports-summary-icon--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.reports-summary-icon--green { background: var(--color-success-subtle); color: var(--color-success); }
.reports-summary-icon--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.reports-summary-icon--rose { background: var(--color-danger-subtle); color: var(--color-danger); }
.reports-summary-icon--violet { background: var(--color-violet-subtle); color: var(--color-violet); }
.reports-summary-icon--teal { background: var(--color-primary-subtle); color: var(--color-primary); }
.reports-catalog > header { align-items: flex-start; margin-bottom: var(--space-4); }
.reports-catalog > header h2, .reports-detail-heading h2 { margin: 0; font-size: var(--font-size-lg); }
.reports-catalog > header p, .reports-detail-heading > div:first-child > p:last-child { margin: .25rem 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-catalog > header > svg { color: var(--color-primary); }
.reports-category-tabs { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.reports-category-tabs button { display: inline-flex; min-height: 2.5rem; flex: 0 0 auto; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.reports-category-tabs button[aria-current="page"] { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); }
.reports-category-tabs button:focus-visible, .reports-report-card:focus-visible, .reports-table th button:focus-visible, .reports-pagination button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.reports-report-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); padding-top: var(--space-4); }
.reports-report-card { display: grid; align-content: start; gap: var(--space-2); min-height: 6.2rem; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); cursor: pointer; text-align: left; }
.reports-report-card:hover, .reports-report-card--active { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.reports-report-card strong { font-size: var(--font-size-sm); }
.reports-report-card span { color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.45; }
.reports-detail-heading { align-items: flex-start; }
.reports-detail-heading > div:first-child { min-width: 0; }
.reports-detail-meta { display: grid; flex: 0 0 auto; gap: .25rem; text-align: right; }
.reports-detail-meta span { font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.reports-detail-meta small { color: var(--color-text-muted); font-size: .68rem; }
.reports-comparison { display: flex; align-items: flex-start; gap: var(--space-2); margin: var(--space-4) 0; padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-background); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
.reports-comparison svg { flex: 0 0 auto; color: var(--color-primary); }
.reports-chart-area { margin-top: var(--space-4); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.reports-chart-heading { align-items: flex-start; margin-bottom: var(--space-3); }
.reports-chart-heading h3, .reports-table-heading h3 { margin: 0; font-size: var(--font-size-sm); }
.reports-chart-heading p, .reports-table-heading p { margin: .2rem 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-chart-heading > span { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.reports-chart-legend { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-chart-legend span { display: inline-flex; align-items: center; gap: .35rem; }
.reports-chart-legend i { width: .55rem; height: .55rem; border-radius: 50%; }
.reports-legend-dot--blue { background: var(--color-primary); }
.reports-legend-dot--green { background: var(--color-success); }
.reports-legend-dot--amber { background: var(--color-warning); }
.reports-legend-dot--rose { background: var(--color-danger); }
.reports-bars { display: flex; min-height: 13rem; align-items: stretch; gap: var(--space-3); overflow-x: auto; padding: var(--space-3) var(--space-1) 0; border-bottom: 1px solid var(--color-border); }
.reports-bar-item { display: grid; min-width: 3.2rem; flex: 1 0 3.2rem; grid-template-rows: auto 1fr auto; justify-items: center; gap: .35rem; }
.reports-bar-group { display: flex; width: 100%; height: 100%; align-items: flex-end; justify-content: center; gap: .15rem; }
.reports-bar-track { display: flex; width: min(.55rem, 25%); height: 100%; align-items: flex-end; overflow: hidden; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--color-surface-muted); }
.reports-bar-track i { display: block; width: 100%; min-height: 2px; border-radius: inherit; }
.reports-bar--blue { background: var(--color-primary); }
.reports-bar--green { background: var(--color-success); }
.reports-bar--amber { background: var(--color-warning); }
.reports-bar--rose { background: var(--color-danger); }
.reports-bar-label { max-width: 5rem; overflow: hidden; color: var(--color-text-muted); font-size: .65rem; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.reports-line-scroll { overflow-x: auto; padding-bottom: var(--space-2); }
.reports-line-chart { display: block; height: 11.25rem; max-width: none; overflow: visible; }
.reports-line-grid { stroke: var(--color-border); stroke-width: 1; }
.reports-line-chart polyline { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.reports-line--blue { stroke: var(--color-primary); }
.reports-line--green { stroke: var(--color-success); }
.reports-line--amber { stroke: var(--color-warning); }
.reports-line--rose { stroke: var(--color-danger); }
.reports-line-chart circle { stroke: var(--color-surface); stroke-width: 2; }
.reports-point--blue { fill: var(--color-primary); }
.reports-point--green { fill: var(--color-success); }
.reports-point--amber { fill: var(--color-warning); }
.reports-point--rose { fill: var(--color-danger); }
.reports-line-labels { display: grid; gap: .25rem; padding: 0 .4rem; }
.reports-line-labels span { min-width: 0; overflow: hidden; color: var(--color-text-muted); font-size: .65rem; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.reports-chart-empty { display: grid; min-height: 12rem; place-items: center; color: var(--color-text-muted); font-size: var(--font-size-sm); text-align: center; }
.reports-table-heading { align-items: center; flex-wrap: wrap; margin: var(--space-5) 0 var(--space-3); }
.reports-search { display: flex; min-width: min(100%, 16rem); min-height: 2.5rem; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.reports-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.reports-table-wrap { overflow-x: auto; }
.reports-table { width: 100%; border-collapse: collapse; text-align: left; }
.reports-table th, .reports-table td { padding: var(--space-3); border-bottom: 1px solid var(--color-border); font-size: var(--font-size-xs); }
.reports-table th { color: var(--color-text-secondary); white-space: nowrap; }
.reports-table th button { display: inline-flex; align-items: center; gap: .2rem; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; }
.reports-pagination { padding-top: var(--space-3); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.reports-pagination > div { gap: var(--space-1); }
.reports-pagination button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.reports-pagination button:disabled { cursor: not-allowed; opacity: .45; }
.reports-empty, .reports-state { display: grid; min-height: 12rem; justify-items: center; align-content: center; gap: var(--space-2); padding: var(--space-5); color: var(--color-text-secondary); text-align: center; }
.reports-empty strong, .reports-state strong { color: var(--color-text); }
.reports-empty p, .reports-state p { margin: 0; font-size: var(--font-size-sm); }
.reports-state > svg { color: var(--color-primary); }
.reports-state--error > svg { color: var(--color-danger); }
.reports-table-loading { display: grid; gap: var(--space-2); }
.reports-table-loading span { min-height: 2.8rem; border-radius: var(--radius-sm); background: var(--color-surface-muted); animation: reports-pulse 1.2s ease-in-out infinite alternate; }
.reports-disclaimer { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); }
.reports-disclaimer svg { flex: 0 0 auto; color: var(--color-primary); }
.reports-disclaimer p { margin: 0; font-size: var(--font-size-xs); line-height: 1.55; }
.reports-export-message { margin: 0; padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--font-size-sm); }
.reports-export-message--success { background: var(--color-success-subtle); color: var(--color-success-strong); }
.reports-export-message--error { background: var(--color-danger-subtle); color: var(--color-danger); }
.reports-updated { margin: calc(-1 * var(--space-3)) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); text-align: right; }
.manager-reports-page :focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
@keyframes reports-pulse { to { opacity: .55; } }
@media (max-width: 64rem) { .reports-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reports-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 48rem) {
  .manager-reports-main { width: min(100% - 1.5rem, 88rem); gap: var(--space-4); padding-top: var(--space-5); }
  .reports-intro { align-items: flex-start; flex-direction: column; }
  .reports-filter-panel, .reports-catalog, .reports-detail-panel { padding: var(--space-4); }
  .reports-filter-actions { grid-column: 1 / -1; }
  .reports-filter-actions > * { flex: 1; }
  .reports-report-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .reports-detail-heading { flex-direction: column; }
  .reports-detail-meta { text-align: left; }
}
@media (max-width: 30rem) {
  .reports-summary, .reports-filter-grid, .reports-report-cards { grid-template-columns: 1fr; }
  .reports-filter-actions { flex-direction: column; }
  .reports-summary-card { min-height: 6.5rem; }
  .reports-chart-area { padding: var(--space-3); }
}
@media (prefers-reduced-motion: reduce) { .reports-table-loading span { animation: none; } }
</style>
