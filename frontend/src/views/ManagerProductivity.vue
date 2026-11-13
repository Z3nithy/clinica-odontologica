<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  getManagerProductivity,
  getManagerProductivityRecords,
} from '../services/manager-productivity'
import { getSessionUser } from '../services/auth-session'
import ManagerShell from '../components/ManagerShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const router = useRouter()
const today = new Date()
const canViewProductivity = getSessionUser()?.role === 'manager'
const periodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: '7days', label: 'Últimos 7 dias' },
  { value: '30days', label: 'Últimos 30 dias' },
  { value: 'thisMonth', label: 'Mês atual' },
  { value: 'lastMonth', label: 'Mês anterior' },
  { value: 'custom', label: 'Período personalizado' },
]
const statuses = [
  'Agendada',
  'Confirmada',
  'Aguardando chegada',
  'Em espera',
  'Em atendimento',
  'Concluída',
  'Cancelada',
  'Não compareceu',
  'Reagendada',
]
const period = ref('thisMonth')
const customStart = ref(dateKey(new Date(today.getFullYear(), today.getMonth(), 1)))
const customEnd = ref(dateKey(today))
const filterDraft = ref({ dentistIds: [], status: '', compare: true })
const appliedFilters = ref({ dentistIds: [], status: '', compare: true })
const data = ref(null)
const state = ref('loading')
const errorMessage = ref('')
const lastUpdated = ref(null)
const search = ref('')
const sortBy = ref('completed')
const page = ref(1)
const pageSize = 10
const chartMetric = ref('completed')
const selectedProfessional = ref(null)
const detailsOpen = ref(false)
const recordsOpen = ref(false)
const recordsState = ref('idle')
const recordsError = ref('')
const recordsData = ref(null)
const recordsMetric = ref('')
const recordsPage = ref(0)

function dateKey(value) {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function dateFromKey(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function getRange() {
  const current = new Date()
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate())
  let start
  if (period.value === 'today') start = new Date(end)
  else if (period.value === '7days') {
    start = new Date(end)
    start.setDate(start.getDate() - 6)
  } else if (period.value === '30days') {
    start = new Date(end)
    start.setDate(start.getDate() - 29)
  } else if (period.value === 'lastMonth') {
    start = new Date(current.getFullYear(), current.getMonth() - 1, 1)
    return {
      start: dateKey(start),
      end: dateKey(new Date(current.getFullYear(), current.getMonth(), 0)),
    }
  } else if (period.value === 'custom') {
    return { start: customStart.value, end: customEnd.value }
  } else start = new Date(current.getFullYear(), current.getMonth(), 1)
  return { start: dateKey(start), end: dateKey(end) }
}

const dateLabel = computed(() => new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(today))
const periodLabel = computed(() => {
  if (!data.value) return ''
  const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
  return `${formatter.format(dateFromKey(data.value.start_date))} – ${formatter.format(dateFromKey(data.value.end_date))}`
})
const activeFilterLabels = computed(() => {
  const labels = []
  if (appliedFilters.value.dentistIds.length) {
    const names = data.value?.dentist_options
      .filter((item) => appliedFilters.value.dentistIds.includes(String(item.dentist_id)))
      .map((item) => item.name)
    labels.push(`Profissional: ${names?.join(', ') || 'selecionado'}`)
  }
  if (appliedFilters.value.status) labels.push(`Status: ${appliedFilters.value.status}`)
  if (appliedFilters.value.compare) labels.push('Comparação: período anterior equivalente')
  return labels
})

const metrics = computed(() => data.value?.metrics)
const metricCards = computed(() => {
  const values = metrics.value || {
    total: null,
    new_in_period: null,
    previous_period_new: null,
    with_upcoming_appointments: null,
    incomplete: null,
  }
  return [
    { key: 'total', label: 'Total de pacientes', value: values.total, icon: UsersRound, tone: 'blue', note: 'Todos os registros da clínica; o modelo não possui estado de inatividade.', recordsMetric: 'all' },
    { key: 'new_in_period', label: 'Novos pacientes', value: values.new_in_period, icon: UserRound, tone: 'green', note: 'Pacientes cadastrados no período selecionado.', recordsMetric: 'new' },
    { key: 'with_upcoming_appointments', label: 'Com consultas futuras', value: values.with_upcoming_appointments, icon: CalendarDays, tone: 'violet', note: 'Pessoas distintas com consulta futura não cancelada.', recordsMetric: 'upcoming' },
    { key: 'incomplete', label: 'Cadastros incompletos', value: values.incomplete, icon: AlertCircle, tone: 'amber', note: 'Telefone ausente ou autorização administrativa pendente.', recordsMetric: 'incomplete' },
  ]
})

const timeline = computed(() => data.value?.timeline || [])
const timelineMax = computed(() => Math.max(1, ...timeline.value.flatMap((item) => [
  item.scheduled, item.completed, item.cancelled, item.no_show,
])))
const timelineSeries = [
  { key: 'scheduled', label: 'Agendadas', color: 'var(--color-primary)' },
  { key: 'completed', label: 'Realizadas', color: 'var(--color-success)' },
  { key: 'cancelled', label: 'Canceladas', color: 'var(--color-warning)' },
  { key: 'no_show', label: 'Faltas', color: 'var(--color-danger)' },
]
const chartMetrics = [
  { value: 'completed', label: 'Atendimentos realizados', suffix: '' },
  { value: 'scheduled', label: 'Consultas agendadas', suffix: '' },
  { value: 'completion_rate', label: 'Taxa de realização', suffix: '%' },
  { value: 'cancellation_rate', label: 'Taxa de cancelamento', suffix: '%' },
  { value: 'no_show_rate', label: 'Taxa de faltas', suffix: '%' },
]
const filteredProfessionals = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  const rows = [...(data.value?.professionals || [])].filter((item) =>
    item.name.toLocaleLowerCase('pt-BR').includes(term),
  )
  rows.sort((a, b) => {
    const left = a[sortBy.value]
    const right = b[sortBy.value]
    if (left == null && right == null) return a.name.localeCompare(b.name, 'pt-BR')
    if (left == null) return 1
    if (right == null) return -1
    return typeof left === 'string'
      ? left.localeCompare(right, 'pt-BR')
      : right - left
  })
  return rows
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredProfessionals.value.length / pageSize)))
const pagedProfessionals = computed(() => filteredProfessionals.value.slice(
  (page.value - 1) * pageSize,
  page.value * pageSize,
))
const chartProfessionals = computed(() => {
  const metric = chartMetric.value
  return [...(data.value?.professionals || [])]
    .map((item) => ({ ...item, chartValue: item[metric] }))
    .sort((a, b) => (b.chartValue ?? -1) - (a.chartValue ?? -1))
    .slice(0, 8)
})
const chartProfessionalMax = computed(() => Math.max(
  1,
  ...chartProfessionals.value.map((item) => item.chartValue ?? 0),
))

function formatPercent(value) {
  return value == null ? 'N/A' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`
}

function formatHours(value) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value || 0)} h`
}

function metricValue(item) {
  if (item.value == null) return 'N/A'
  if (item.key.endsWith('_rate')) return formatPercent(item.value)
  if (item.key === 'planned_completed_hours') return formatHours(item.value)
  return item.value
}

function metricComparison(key) {
  const current = metrics.value?.[key]
  const previous = data.value?.previous_metrics?.[key]
  if (!appliedFilters.value.compare || current == null || previous == null) return ''
  if (key.endsWith('_rate')) {
    const delta = current - previous
    return `${delta > 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(delta)} p.p. vs. período anterior`
  }
  const delta = current - previous
  return `${delta > 0 ? '+' : ''}${delta} vs. período anterior`
}

async function loadProductivity() {
  if (!canViewProductivity) {
    state.value = 'denied'
    return
  }
  const range = getRange()
  if (!range.start || !range.end || range.end < range.start) {
    state.value = 'error'
    errorMessage.value = 'Revise o período: a data final precisa ser igual ou posterior à inicial.'
    return
  }
  state.value = data.value ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getManagerProductivity({
      start_date: range.start,
      end_date: range.end,
      compare: appliedFilters.value.compare,
      dentist_ids: appliedFilters.value.dentistIds.join(',') || undefined,
      status: appliedFilters.value.status || undefined,
    })
    data.value = response
    lastUpdated.value = new Date()
    state.value = 'ready'
    page.value = 1
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar os indicadores da equipe.')
    state.value = error.response?.status === 403 ? 'denied' : 'error'
  }
}

function applyFilters() {
  appliedFilters.value = {
    dentistIds: [...filterDraft.value.dentistIds],
    status: filterDraft.value.status,
    compare: filterDraft.value.compare,
  }
  void loadProductivity()
}

function clearFilters() {
  period.value = 'thisMonth'
  customStart.value = dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
  customEnd.value = dateKey(today)
  filterDraft.value = { dentistIds: [], status: '', compare: true }
  appliedFilters.value = { dentistIds: [], status: '', compare: true }
  void loadProductivity()
}

function navigateShell(id) {
  const routes = {
    overview: 'manager-dashboard',
    schedule: 'manager-agenda',
    team: 'manager-team',
    productivity: 'manager-productivity',
    settings: 'manager-settings',
  }
  if (id === 'productivity') window.scrollTo({ top: 0, behavior: 'auto' })
  else if (routes[id]) void router.push({ name: routes[id] })
}

function openProfessional(professional) {
  selectedProfessional.value = professional
  detailsOpen.value = true
}

async function openRecords(metric) {
  recordsMetric.value = metric
  recordsPage.value = 0
  recordsOpen.value = true
  await loadRecords()
}

async function loadRecords() {
  if (!data.value || !recordsMetric.value) return
  recordsState.value = 'loading'
  recordsError.value = ''
  try {
    recordsData.value = await getManagerProductivityRecords({
      start_date: data.value.start_date,
      end_date: data.value.end_date,
      metric: recordsMetric.value,
      dentist_ids: appliedFilters.value.dentistIds.join(',') || undefined,
      status: appliedFilters.value.status || undefined,
      offset: recordsPage.value * 20,
      limit: 20,
    })
    recordsState.value = 'ready'
  } catch (error) {
    recordsError.value = getApiErrorMessage(error, 'Não foi possível carregar as consultas deste indicador.')
    recordsState.value = 'error'
  }
}

function goToAgenda(record) {
  const query = {
    date: record.appointment_date,
    view: 'day',
    dentist_id: String(record.dentist_id),
    status: record.status,
  }
  void router.push({ name: 'manager-agenda', query })
}

function setSort(key) {
  sortBy.value = key
  page.value = 1
}

function setChartHeight(value) {
  return { height: `${Math.max(3, (value / timelineMax.value) * 100)}%` }
}

function setProfessionalWidth(value) {
  return { width: `${value == null ? 0 : Math.max(0, (value / chartProfessionalMax.value) * 100)}%` }
}

function openProfessionalAgenda() {
  if (!selectedProfessional.value || !data.value) return
  void router.push({
    name: 'manager-agenda',
    query: {
      date: data.value.start_date,
      view: 'day',
      dentist_id: String(selectedProfessional.value.dentist_id),
    },
  })
}

onMounted(() => {
  void loadProductivity()
})
</script>

<template>
  <div class="manager-productivity-page">
    <ManagerShell active-page="productivity" :date-label="dateLabel" @navigate="navigateShell" />

    <main class="manager-productivity-main">
      <header class="productivity-intro">
        <div>
          <p class="productivity-eyebrow">PORTAL DO GESTOR</p>
          <h1>Produtividade da Equipe</h1>
          <p>Acompanhe os indicadores operacionais dos profissionais</p>
        </div>
      </header>

      <section class="productivity-panel" aria-label="Filtros de análise">
        <div class="productivity-filter-grid">
          <label>
            <span>Período</span>
            <select v-model="period">
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="period === 'custom'">
            <span>De</span>
            <input v-model="customStart" type="date" aria-label="Data inicial">
          </label>
          <label v-if="period === 'custom'">
            <span>Até</span>
            <input v-model="customEnd" type="date" aria-label="Data final">
          </label>
          <label>
            <span>Profissionais <small>(Ctrl/Cmd para múltiplos)</small></span>
            <select v-model="filterDraft.dentistIds" multiple size="3" aria-label="Filtrar por profissional">
              <option v-for="professional in data?.dentist_options || []" :key="professional.dentist_id" :value="String(professional.dentist_id)">
                {{ professional.name }}{{ professional.active ? '' : ' · inativo' }}
              </option>
            </select>
          </label>
          <label>
            <span>Status da consulta</span>
            <select v-model="filterDraft.status">
              <option value="">Todos os status</option>
              <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="productivity-compare">
            <input v-model="filterDraft.compare" type="checkbox">
            <span>Comparar com período anterior equivalente</span>
          </label>
          <div class="productivity-filter-actions">
            <UiButton @click="applyFilters">Aplicar filtros</UiButton>
            <UiButton variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
          </div>
        </div>
        <div v-if="activeFilterLabels.length" class="productivity-active-filters" aria-live="polite">
          <span>Filtros ativos</span>
          <span v-for="label in activeFilterLabels" :key="label" class="productivity-filter-chip">{{ label }}</span>
        </div>
        <p v-if="appliedFilters.status" class="productivity-filter-note">
          As taxas ficam como N/A ao filtrar um único status, pois o filtro altera a base de comparação.
        </p>
      </section>

      <section v-if="state === 'denied'" class="productivity-state" role="alert">
        <ShieldCheck :size="26" aria-hidden="true" />
        <strong>Acesso restrito</strong>
        <p>Os indicadores de produtividade estão disponíveis apenas para gestores autorizados.</p>
      </section>
      <section v-else-if="state === 'error'" class="productivity-state productivity-state--error" role="alert">
        <AlertCircle :size="26" aria-hidden="true" />
        <strong>Não foi possível carregar os dados</strong>
        <p>{{ errorMessage }}</p>
        <UiButton variant="secondary" @click="loadProductivity"><RefreshCw :size="16" aria-hidden="true" /> Tentar novamente</UiButton>
      </section>
      <template v-else>
        <section class="productivity-metrics" aria-label="Indicadores principais" :aria-busy="state === 'loading' || state === 'refreshing'">
          <article v-for="card in metricCards" :key="card.key" class="productivity-metric" :class="`productivity-tone--${card.tone}`">
            <div class="productivity-metric__top">
              <span class="productivity-metric__icon"><component :is="card.icon" :size="19" aria-hidden="true" /></span>
              <span class="productivity-metric__info" :title="card.note" :aria-label="card.note"><Info :size="15" aria-hidden="true" /></span>
            </div>
            <span class="productivity-metric__label">{{ card.label }}</span>
            <strong v-if="state === 'loading'" class="productivity-skeleton" aria-label="Carregando"></strong>
            <strong v-else>{{ metricValue(card) }}</strong>
            <span class="productivity-metric__note">{{ card.note }}</span>
            <span v-if="metricComparison(card.key)" class="productivity-metric__comparison">{{ metricComparison(card.key) }}</span>
            <button v-if="card.recordsMetric && !(appliedFilters.status && card.key.endsWith('_rate'))" type="button" class="productivity-metric__link" @click="openRecords(card.recordsMetric)">
              Ver consultas <ChevronRight :size="14" aria-hidden="true" />
            </button>
          </article>
        </section>

        <section v-if="state === 'ready' && !metrics?.appointments_total" class="productivity-empty" role="status">
          <CalendarDays :size="24" aria-hidden="true" />
          <div><strong>Nenhuma consulta encontrada neste recorte</strong><p>Ajuste o período, status ou profissionais para analisar outros dados.</p></div>
        </section>

        <section class="productivity-charts">
          <article class="productivity-panel productivity-chart-card" aria-labelledby="team-trend-title">
            <div class="productivity-section-heading">
              <div><h2 id="team-trend-title">Evolução da equipe</h2><p>Volume de consultas por {{ data?.group_by === 'day' ? 'dia' : data?.group_by === 'week' ? 'semana' : 'mês' }}</p></div>
              <Activity :size="19" aria-hidden="true" />
            </div>
            <div v-if="state === 'loading'" class="productivity-chart-loading" role="status">Carregando evolução…</div>
            <div v-else-if="!timeline.length || !metrics?.appointments_total" class="productivity-chart-empty">Sem consultas para representar no gráfico.</div>
            <template v-else>
              <div class="productivity-legend" aria-label="Legenda do gráfico">
                <span v-for="series in timelineSeries" :key="series.key"><i :style="{ background: series.color }"></i>{{ series.label }}</span>
              </div>
              <div class="productivity-timeline" role="list" aria-label="Evolução de consultas por período">
                <div v-for="point in timeline" :key="point.date" class="productivity-timeline__group" role="listitem" :aria-label="`${point.label}: ${point.scheduled} agendadas, ${point.completed} realizadas, ${point.cancelled} canceladas, ${point.no_show} faltas`">
                  <div class="productivity-timeline__bars">
                    <span v-for="series in timelineSeries" :key="series.key" class="productivity-timeline__bar" :style="{ ...setChartHeight(point[series.key]), background: series.color }" :title="`${point.label} · ${series.label}: ${point[series.key]}`"></span>
                  </div>
                  <span class="productivity-timeline__label">{{ point.label }}</span>
                </div>
              </div>
            </template>
          </article>

          <article class="productivity-panel productivity-chart-card" aria-labelledby="professional-chart-title">
            <div class="productivity-section-heading">
              <div><h2 id="professional-chart-title">Comparativo por profissional</h2><p>Ordenado pelo indicador selecionado</p></div>
              <UsersRound :size="19" aria-hidden="true" />
            </div>
            <label class="productivity-chart-select">
              <span>Indicador</span>
              <select v-model="chartMetric">
                <option v-for="option in chartMetrics" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <div v-if="state === 'loading'" class="productivity-chart-loading" role="status">Carregando profissionais…</div>
            <div v-else-if="!chartProfessionals.length" class="productivity-chart-empty">Nenhum profissional neste filtro.</div>
            <ol v-else class="productivity-professional-chart">
              <li v-for="professional in chartProfessionals" :key="professional.dentist_id">
                <button type="button" class="productivity-chart-person" @click="openProfessional(professional)">{{ professional.name }}</button>
                <span class="productivity-chart-track"><i :style="setProfessionalWidth(professional.chartValue)"></i></span>
                <strong>{{ chartMetric.endsWith('_rate') ? formatPercent(professional.chartValue) : professional.chartValue ?? 'N/A' }}</strong>
              </li>
            </ol>
          </article>
        </section>

        <section class="productivity-panel productivity-table-panel" aria-labelledby="productivity-table-title">
          <div class="productivity-section-heading productivity-table-heading">
            <div><h2 id="productivity-table-title">Desempenho operacional</h2><p>{{ filteredProfessionals.length }} profissional(is) incluído(s) no escopo da clínica</p></div>
            <label class="productivity-table-search">
              <Search :size="16" aria-hidden="true" />
              <input v-model="search" type="search" placeholder="Buscar profissional" @input="page = 1">
            </label>
          </div>
          <div v-if="state === 'loading'" class="productivity-table-loading" role="status" aria-label="Carregando dados"><span v-for="item in 4" :key="item"></span></div>
          <div v-else-if="!pagedProfessionals.length" class="productivity-chart-empty">Nenhum profissional corresponde à busca.</div>
          <div v-else class="productivity-table-wrap">
            <table class="productivity-table">
              <thead><tr>
                <th scope="col">Profissional</th>
                <th scope="col"><button type="button" @click="setSort('scheduled')">Agendadas <ChevronDown :size="14" aria-hidden="true" /></button></th>
                <th scope="col"><button type="button" @click="setSort('completed')">Realizadas <ChevronDown :size="14" aria-hidden="true" /></button></th>
                <th scope="col"><button type="button" @click="setSort('completion_rate')">Realização <ChevronDown :size="14" aria-hidden="true" /></button></th>
                <th scope="col"><button type="button" @click="setSort('cancelled')">Cancelamentos <ChevronDown :size="14" aria-hidden="true" /></button></th>
                <th scope="col"><button type="button" @click="setSort('no_show')">Faltas <ChevronDown :size="14" aria-hidden="true" /></button></th>
                <th scope="col">Ocupação</th>
                <th scope="col">Horas previstas</th>
                <th scope="col">Detalhes</th>
              </tr></thead>
              <tbody>
                <tr v-for="professional in pagedProfessionals" :key="professional.dentist_id">
                  <td><button type="button" class="productivity-table-person" @click="openProfessional(professional)"><UiAvatar :name="professional.name" size="sm" /><span>{{ professional.name }}<small v-if="!professional.active">Conta inativa</small></span></button></td>
                  <td>{{ professional.scheduled }}</td><td>{{ professional.completed }}</td>
                  <td>{{ formatPercent(professional.completion_rate) }}</td><td>{{ professional.cancelled }}</td><td>{{ professional.no_show }}</td>
                  <td><span class="productivity-unavailable" title="Não há disponibilidade de agenda cadastrada">N/D</span></td>
                  <td>{{ formatHours(professional.planned_completed_hours) }}</td>
                  <td><button class="productivity-detail-button" type="button" @click="openProfessional(professional)">Ver detalhes</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="productivity-mobile-cards">
            <article v-for="professional in pagedProfessionals" :key="professional.dentist_id" class="productivity-mobile-card">
              <button type="button" class="productivity-table-person" @click="openProfessional(professional)"><UiAvatar :name="professional.name" size="sm" /><span>{{ professional.name }}<small>{{ professional.active ? 'Ativo' : 'Conta inativa' }}</small></span></button>
              <dl><div><dt>Agendadas</dt><dd>{{ professional.scheduled }}</dd></div><div><dt>Realizadas</dt><dd>{{ professional.completed }}</dd></div><div><dt>Realização</dt><dd>{{ formatPercent(professional.completion_rate) }}</dd></div><div><dt>Cancelamentos</dt><dd>{{ professional.cancelled }}</dd></div><div><dt>Faltas</dt><dd>{{ professional.no_show }}</dd></div><div><dt>Ocupação</dt><dd>N/D</dd></div></dl>
              <button class="productivity-detail-button" type="button" @click="openProfessional(professional)">Ver detalhes</button>
            </article>
          </div>
          <footer class="productivity-pagination">
            <span>Página {{ page }} de {{ pageCount }}</span>
            <div><button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="page -= 1"><ChevronLeft :size="17" aria-hidden="true" /></button><button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="page += 1"><ChevronRight :size="17" aria-hidden="true" /></button></div>
          </footer>
        </section>

        <aside class="productivity-notes" aria-label="Critérios e limitações dos indicadores">
          <Info :size="19" aria-hidden="true" />
          <div>
            <strong>Como interpretar estes dados</strong>
            <p>As taxas usam consultas não marcadas como “Reagendada”, já ocorridas ou com resultado terminal; consultas futuras ainda em aberto ficam fora do denominador. Cancelamentos e faltas permanecem na base. A contagem de agendadas exclui canceladas e reagendadas. Ao filtrar um único status, as taxas ficam como N/A para evitar uma base parcial. Horas são a duração planejada das consultas concluídas, não tempo efetivamente registrado. Ocupação não é calculada porque não há disponibilidade individual cadastrada. Unidade, especialidade, motivos, alertas de desempenho e exportação não estão disponíveis nesta versão.</p>
          </div>
        </aside>
        <p v-if="lastUpdated" class="productivity-updated">Dados atualizados em {{ new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(lastUpdated) }}. Somente dados operacionais da clínica vinculada.</p>
      </template>
    </main>

    <UiDialog v-model="detailsOpen" title="Detalhes de produtividade">
      <template v-if="selectedProfessional">
        <div class="productivity-detail-header">
          <UiAvatar :name="selectedProfessional.name" size="lg" />
          <div><h3>{{ selectedProfessional.name }}</h3><span>{{ periodLabel }}</span></div>
        </div>
        <dl class="productivity-detail-grid">
          <div><dt>Consultas agendadas</dt><dd>{{ selectedProfessional.scheduled }}</dd></div>
          <div><dt>Atendimentos realizados</dt><dd>{{ selectedProfessional.completed }}</dd></div>
          <div><dt>Taxa de realização</dt><dd>{{ formatPercent(selectedProfessional.completion_rate) }}</dd></div>
          <div><dt>Cancelamentos</dt><dd>{{ selectedProfessional.cancelled }}</dd></div>
          <div><dt>Faltas registradas</dt><dd>{{ selectedProfessional.no_show }}</dd></div>
          <div><dt>Horas previstas (concluídas)</dt><dd>{{ formatHours(selectedProfessional.planned_completed_hours) }}</dd></div>
          <div><dt>Ocupação da agenda</dt><dd>N/D — disponibilidade não cadastrada</dd></div>
        </dl>
        <p class="productivity-detail-note">Os números são agregados e não incluem dados clínicos do paciente. Para consultar os registros da agenda, abra a visão gerencial; ela preserva os controles de acesso existentes.</p>
        <div class="productivity-detail-actions">
          <UiButton @click="detailsOpen = false; openProfessionalAgenda()">Consultar agenda</UiButton>
          <UiButton variant="secondary" @click="detailsOpen = false">Voltar à tabela</UiButton>
        </div>
      </template>
      <template #footer><span></span></template>
    </UiDialog>

    <UiDialog v-model="recordsOpen" title="Consultas incluídas no indicador">
      <p class="productivity-records-intro">
        {{ recordsData?.total || 0 }} registro(s) de
        {{ recordsMetric === 'scheduled' ? 'consultas agendadas' : recordsMetric === 'eligible' ? 'consultas elegíveis usadas na base das taxas' : recordsMetric === 'completed' ? 'atendimentos realizados' : recordsMetric === 'cancelled' ? 'cancelamentos' : 'faltas' }}
        no período {{ periodLabel }}. Dados clínicos e de pacientes não são exibidos aqui.
      </p>
      <div v-if="recordsState === 'loading'" class="productivity-chart-loading" role="status">Carregando consultas…</div>
      <div v-else-if="recordsState === 'error'" class="productivity-state productivity-state--error" role="alert">
        <AlertCircle :size="22" aria-hidden="true" /><p>{{ recordsError }}</p><UiButton variant="secondary" @click="loadRecords">Tentar novamente</UiButton>
      </div>
      <div v-else-if="!recordsData?.items.length" class="productivity-chart-empty">Nenhuma consulta corresponde ao indicador e filtros atuais.</div>
      <div v-else class="productivity-records-list">
        <article v-for="record in recordsData.items" :key="record.appointment_id">
          <div><strong>{{ record.dentist_name }}</strong><span>{{ new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(dateFromKey(record.appointment_date)) }} · {{ record.appointment_time.slice(0, 5) }}</span><small>{{ record.status }} · {{ record.duration_minutes }} min previstos</small></div>
          <button type="button" class="productivity-detail-button" @click="goToAgenda(record); recordsOpen = false">Abrir agenda</button>
        </article>
        <footer class="productivity-pagination">
          <span>{{ recordsData.offset + 1 }}–{{ Math.min(recordsData.offset + recordsData.items.length, recordsData.total) }} de {{ recordsData.total }}</span>
          <div><button type="button" aria-label="Consultas anteriores" :disabled="recordsPage === 0" @click="recordsPage -= 1; loadRecords()"><ChevronLeft :size="17" aria-hidden="true" /></button><button type="button" aria-label="Próximas consultas" :disabled="recordsData.offset + recordsData.items.length >= recordsData.total" @click="recordsPage += 1; loadRecords()"><ChevronRight :size="17" aria-hidden="true" /></button></div>
        </footer>
      </div>
      <template #footer><UiButton variant="secondary" @click="recordsOpen = false">Fechar</UiButton></template>
    </UiDialog>
  </div>
</template>

<style scoped>
.manager-productivity-page { min-height: 100vh; background: var(--color-background); color: var(--color-text); }
.manager-productivity-main { display: grid; width: min(100% - 3rem, 88rem); gap: var(--space-5); margin: 0 auto; padding: var(--space-8) 0 var(--space-10); }
.productivity-intro, .productivity-section-heading, .productivity-metric__top, .productivity-pagination, .productivity-pagination > div, .productivity-detail-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.productivity-intro { align-items: flex-end; }
.productivity-intro h1 { margin: 0; font-family: var(--font-heading); font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.15; }
.productivity-intro p:not(.productivity-eyebrow) { margin: var(--space-2) 0 0; color: var(--color-text-secondary); }
.productivity-eyebrow { margin: 0 0 var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: .08em; }
.productivity-panel, .productivity-metric { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.productivity-filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; gap: var(--space-3); }
.productivity-filter-grid > label, .productivity-chart-select { display: grid; min-width: 0; gap: var(--space-2); }
.productivity-filter-grid > label > span, .productivity-chart-select > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.productivity-filter-grid select, .productivity-filter-grid input[type="date"], .productivity-chart-select select { width: 100%; min-height: 2.7rem; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; }
.productivity-filter-grid select[multiple] { min-height: 5.2rem; padding: var(--space-2); }
.productivity-filter-grid small { font-weight: var(--font-weight-normal); }
.productivity-compare { display: flex !important; min-height: 2.7rem; align-items: center; gap: var(--space-2) !important; }
.productivity-compare input { width: 1rem; height: 1rem; accent-color: var(--color-primary); }
.productivity-compare span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-filter-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.productivity-active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-filter-chip { padding: .25rem .55rem; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-background); }
.productivity-filter-note { margin: var(--space-3) 0 0; color: var(--color-warning); font-size: var(--font-size-xs); }
.productivity-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.productivity-metric { display: grid; align-content: start; gap: var(--space-2); padding: var(--space-4); }
.productivity-metric__top { justify-content: flex-start; }
.productivity-metric__icon { display: grid; width: 2.4rem; height: 2.4rem; place-items: center; border-radius: var(--radius-md); }
.productivity-tone--blue .productivity-metric__icon { background: var(--color-primary-subtle); color: var(--color-primary); }
.productivity-tone--green .productivity-metric__icon { background: var(--color-success-subtle); color: var(--color-success); }
.productivity-tone--teal .productivity-metric__icon { background: var(--color-primary-subtle); color: var(--color-primary); }
.productivity-tone--amber .productivity-metric__icon { background: var(--color-warning-subtle); color: var(--color-warning); }
.productivity-tone--rose .productivity-metric__icon { background: var(--color-danger-subtle); color: var(--color-danger); }
.productivity-tone--slate .productivity-metric__icon { background: var(--color-surface-muted); color: var(--color-text-secondary); }
.productivity-tone--violet .productivity-metric__icon { background: var(--color-blue-50); color: var(--color-blue-800); }
.productivity-metric__info { margin-left: auto; color: var(--color-text-muted); cursor: help; }
.productivity-metric__label { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.productivity-metric > strong { font-family: var(--font-heading); font-size: 1.55rem; }
.productivity-metric__note, .productivity-metric__comparison { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.45; }
.productivity-metric__comparison { color: var(--color-primary); }
.productivity-metric__link { display: inline-flex; width: fit-content; align-items: center; gap: .15rem; padding: 0; border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.productivity-charts { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(20rem, .8fr); gap: var(--space-4); }
.productivity-chart-card { min-height: 20rem; }
.productivity-section-heading { align-items: flex-start; margin-bottom: var(--space-4); }
.productivity-section-heading h2 { margin: 0; font-size: var(--font-size-lg); }
.productivity-section-heading p { margin: .25rem 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-section-heading > svg { flex: 0 0 auto; color: var(--color-primary); }
.productivity-legend { display: flex; flex-wrap: wrap; gap: var(--space-3); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-legend span { display: inline-flex; align-items: center; gap: .35rem; }
.productivity-legend i { width: .55rem; height: .55rem; border-radius: 50%; }
.productivity-timeline { display: flex; height: 12rem; align-items: stretch; gap: var(--space-2); overflow-x: auto; margin-top: var(--space-4); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.productivity-timeline__group { display: grid; min-width: 2.4rem; flex: 1 0 2.4rem; grid-template-rows: 1fr auto; text-align: center; }
.productivity-timeline__bars { display: flex; align-items: flex-end; justify-content: center; gap: 2px; min-height: 0; border-bottom: 1px dashed var(--color-border); }
.productivity-timeline__bar { width: min(20%, .8rem); min-height: 2px; border-radius: 3px 3px 0 0; }
.productivity-timeline__label { padding-top: .4rem; color: var(--color-text-muted); font-size: .65rem; white-space: nowrap; }
.productivity-chart-select { max-width: 17rem; margin-bottom: var(--space-4); }
.productivity-professional-chart { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.productivity-professional-chart li { display: grid; grid-template-columns: minmax(7rem, .8fr) minmax(4rem, 1fr) 3.4rem; align-items: center; gap: var(--space-2); }
.productivity-chart-person { overflow: hidden; padding: 0; border: 0; background: none; color: var(--color-text); cursor: pointer; font: inherit; font-size: var(--font-size-xs); text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.productivity-chart-track { height: .55rem; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-surface-muted); }
.productivity-chart-track i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.productivity-professional-chart strong { font-size: var(--font-size-xs); text-align: right; }
.productivity-chart-empty, .productivity-chart-loading { display: grid; min-height: 10rem; place-items: center; color: var(--color-text-muted); font-size: var(--font-size-sm); text-align: center; }
.productivity-table-heading { align-items: center; flex-wrap: wrap; }
.productivity-table-search { display: flex; min-width: min(100%, 16rem); min-height: 2.6rem; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.productivity-table-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.productivity-table-wrap { overflow-x: auto; }
.productivity-table { width: 100%; border-collapse: collapse; text-align: left; }
.productivity-table th, .productivity-table td { padding: var(--space-3); border-bottom: 1px solid var(--color-border); font-size: var(--font-size-xs); white-space: nowrap; }
.productivity-table th { color: var(--color-text-secondary); font-weight: var(--font-weight-semibold); }
.productivity-table th button { display: inline-flex; align-items: center; gap: .15rem; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; }
.productivity-table-person { display: inline-flex; align-items: center; gap: var(--space-2); padding: 0; border: 0; background: none; color: var(--color-text); cursor: pointer; text-align: left; }
.productivity-table-person > span:last-child { display: grid; gap: .15rem; font-size: var(--font-size-xs); }
.productivity-table-person small { color: var(--color-text-muted); font-size: .68rem; }
.productivity-detail-button { padding: .35rem .55rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.productivity-unavailable { color: var(--color-text-muted); }
.productivity-mobile-cards { display: none; }
.productivity-pagination { padding-top: var(--space-3); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-pagination > div { gap: var(--space-1); }
.productivity-pagination button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.productivity-pagination button:disabled { cursor: not-allowed; opacity: .45; }
.productivity-notes { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); }
.productivity-notes > svg { flex: 0 0 auto; margin-top: .1rem; color: var(--color-primary); }
.productivity-notes strong { color: var(--color-text); font-size: var(--font-size-sm); }
.productivity-notes p, .productivity-detail-note { margin: .3rem 0 0; font-size: var(--font-size-xs); line-height: 1.55; }
.productivity-updated { margin: calc(-1 * var(--space-3)) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); text-align: right; }
.productivity-state, .productivity-empty { display: flex; min-height: 11rem; align-items: center; justify-content: center; flex-direction: column; gap: var(--space-2); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); color: var(--color-text-secondary); text-align: center; }
.productivity-state > svg, .productivity-empty > svg { color: var(--color-primary); }
.productivity-state strong, .productivity-empty strong { color: var(--color-text); }
.productivity-state p, .productivity-empty p { max-width: 34rem; margin: 0; font-size: var(--font-size-sm); }
.productivity-state--error > svg { color: var(--color-danger); }
.productivity-empty { min-height: 5.5rem; flex-direction: row; justify-content: flex-start; padding: var(--space-4); text-align: left; }
.productivity-skeleton { width: 3rem; height: 1.5rem; border-radius: var(--radius-sm); background: var(--color-surface-muted); animation: productivity-pulse 1.2s ease-in-out infinite alternate; }
.productivity-table-loading { display: grid; gap: var(--space-2); }
.productivity-table-loading span { min-height: 2.6rem; border-radius: var(--radius-sm); background: var(--color-surface-muted); animation: productivity-pulse 1.2s ease-in-out infinite alternate; }
.productivity-detail-header { justify-content: flex-start; padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
.productivity-detail-header h3 { margin: 0; font-size: var(--font-size-md); }
.productivity-detail-header span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: var(--space-4) 0; }
.productivity-detail-grid > div { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.productivity-detail-grid dt { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-detail-grid dd { margin: .3rem 0 0; font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
.productivity-detail-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.productivity-records-intro { margin: 0 0 var(--space-3); color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.5; }
.productivity-records-list { display: grid; gap: var(--space-2); }
.productivity-records-list article { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.productivity-records-list article > div { display: grid; min-width: 0; gap: .2rem; }
.productivity-records-list article strong { font-size: var(--font-size-sm); }
.productivity-records-list article span, .productivity-records-list article small { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.productivity-records-list article .productivity-detail-button { flex: 0 0 auto; }
.manager-productivity-page :focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
@keyframes productivity-pulse { to { opacity: .55; } }
@media (max-width: 64rem) {
  .productivity-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .productivity-charts { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 48rem) {
  .manager-productivity-main { width: min(100% - 1.5rem, 88rem); gap: var(--space-4); padding-top: var(--space-5); }
  .productivity-intro { align-items: flex-start; flex-direction: column; }
  .productivity-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .productivity-filter-actions { grid-column: 1 / -1; }
  .productivity-filter-actions > * { flex: 1; }
  .productivity-panel { padding: var(--space-4); }
  .productivity-table-wrap { display: none; }
  .productivity-mobile-cards { display: grid; gap: var(--space-3); }
  .productivity-mobile-card { display: grid; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .productivity-mobile-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
  .productivity-mobile-card dl > div { padding: .5rem; border-radius: var(--radius-sm); background: var(--color-background); }
  .productivity-mobile-card dt { color: var(--color-text-secondary); font-size: .68rem; }
  .productivity-mobile-card dd { margin: .2rem 0 0; font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
  .productivity-mobile-card > .productivity-detail-button { min-height: 2.6rem; }
}
@media (max-width: 30rem) {
  .productivity-filter-grid, .productivity-metrics { grid-template-columns: 1fr; }
  .productivity-filter-actions { flex-direction: column; }
  .productivity-section-heading { align-items: flex-start; }
  .productivity-detail-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .productivity-skeleton, .productivity-table-loading span { animation: none; }
}
</style>
