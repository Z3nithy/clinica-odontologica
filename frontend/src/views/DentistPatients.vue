<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-vue-next'
import { getApiErrorMessage } from '../services/api'
import {
  getDentistPatientAppointments,
  getDentistPatients,
} from '../services/dentist'
import DentistShell from '../components/DentistShell.vue'
import { dentistNavigationRoutes } from '../router/navigation'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const router = useRouter()
const route = useRoute()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const search = ref('')
const filtersOpen = ref(false)
const filtersDraft = reactive({ upcoming: '', lastVisit: '' })
const filters = reactive({ upcoming: '', lastVisit: '' })
const sortBy = ref('name')
const page = ref(1)
const pageSize = ref(10)
const patients = ref([])
const total = ref(0)
const metrics = ref(null)
const state = ref('loading')
const errorMessage = ref('')
const selectedPatient = ref(null)
const detailOpen = ref(false)
const detailTab = ref('overview')
const history = ref([])
const historyState = ref('idle')
let requestId = 0
let searchTimer

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const firstVisible = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0)
const lastVisible = computed(() => Math.min(page.value * pageSize.value, total.value))

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', options).format(parsed)
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function patientAge(birthDate) {
  if (!birthDate) return '—'
  const birth = new Date(`${birthDate}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return '—'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age -= 1
  return age >= 0 ? `${age} anos` : '—'
}

function formatCpf(value) {
  if (!value) return 'Não informado'
  const digits = value.replace(/\D/g, '')
  return digits.length === 11
    ? `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`
    : 'Cadastro disponível'
}

function requestParams() {
  return {
    q: search.value.trim() || undefined,
    has_upcoming_appointment: filters.upcoming === ''
      ? undefined
      : filters.upcoming === 'yes',
    last_visit: filters.lastVisit || undefined,
    sort_by: sortBy.value,
    offset: (page.value - 1) * pageSize.value,
    limit: pageSize.value,
  }
}

async function loadPatients() {
  const currentRequest = ++requestId
  state.value = patients.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getDentistPatients(requestParams())
    if (currentRequest !== requestId) return
    patients.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    state.value = 'ready'
  } catch (error) {
    if (currentRequest !== requestId) return
    state.value = 'error'
    errorMessage.value = error.response?.status === 403
      ? 'Sua conta não tem autorização para consultar esses pacientes.'
      : getApiErrorMessage(error, 'Não foi possível carregar os pacientes.')
  }
}

function applyFilters() {
  Object.assign(filters, filtersDraft)
  page.value = 1
  void loadPatients()
}

function clearFilters() {
  search.value = ''
  Object.assign(filters, { upcoming: '', lastVisit: '' })
  Object.assign(filtersDraft, { upcoming: '', lastVisit: '' })
  sortBy.value = 'name'
  page.value = 1
  void loadPatients()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadPatients()
}

function changePageSize(event) {
  pageSize.value = Number(event.target.value)
  page.value = 1
  void loadPatients()
}

function changeSort(value) {
  sortBy.value = value
  page.value = 1
  void loadPatients()
}

async function openPatient(patient, tab = 'overview') {
  selectedPatient.value = patient
  detailTab.value = tab
  history.value = []
  historyState.value = 'loading'
  detailOpen.value = true
  try {
    history.value = await getDentistPatientAppointments(patient.id)
    historyState.value = history.value.length ? 'ready' : 'empty'
  } catch (error) {
    historyState.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar o histórico de consultas.')
  }
}

function goToNextAppointment(patient) {
  const appointment = patient.next_appointment
  if (!appointment) return
  detailOpen.value = false
  void router.push({
    name: 'dentist-agenda',
    query: {
      date: appointment.appointment_date,
      view: 'day',
      patientId: String(patient.id),
    },
  })
}

function goToOdontogram(patient) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-odontogram',
    query: { patientId: String(patient.id) },
  })
}

function goToTreatmentPlans(patient) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-treatment-plans',
    query: { patientId: String(patient.id), new: '1' },
  })
}

function goToClinicalDocuments(patient) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-clinical-documents',
    query: { patientId: String(patient.id) },
  })
}

function goToAttendanceHistory(patient) {
  detailOpen.value = false
  void router.push({
    name: 'dentist-appointment-history',
    query: { patientId: String(patient.id) },
  })
}

async function openPatientFromRoute() {
  const patientId = Number(route.query.patientId)
  if (patientId <= 0) return
  try {
    const response = await getDentistPatients({ q: String(patientId), limit: 100 })
    const patient = response.items.find((item) => item.id === patientId)
    if (patient) await openPatient(patient)
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível abrir o perfil do paciente.')
  }
}

function handleNavigation(id) {
  if (dentistNavigationRoutes[id]) {
    void router.push({ name: dentistNavigationRoutes[id] })
  }
}

watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    void loadPatients()
  }, 300)
})

onMounted(() => {
  void loadPatients()
  void openPatientFromRoute()
})
onBeforeUnmount(() => {
  requestId += 1
  window.clearTimeout(searchTimer)
})
</script>

<template>
  <div class="dentist-patients-page">
    <DentistShell active-page="patient-list" :date-label="dateLabel" @navigate="handleNavigation" />

    <main class="dentist-patients-main">
      <header class="patients-intro">
        <div>
          <p class="patients-eyebrow">PORTAL CLÍNICO</p>
          <h1>Pacientes</h1>
          <p>Consulte pacientes e acompanhe seus tratamentos</p>
        </div>
        <span class="patients-access-note">
          <ShieldCheck :size="16" aria-hidden="true" />
          Pacientes vinculados à sua agenda
        </span>
      </header>

      <section class="patients-metrics" aria-label="Indicadores de pacientes">
        <article class="patients-metric">
          <span class="patients-metric__icon"><UsersRound :size="18" aria-hidden="true" /></span>
          <div>
            <span>Total de pacientes</span>
            <strong v-if="state === 'ready' || state === 'refreshing'">{{ metrics?.total ?? 0 }}</strong>
            <i v-else class="patients-metric-skeleton" aria-hidden="true"></i>
            <small>com consulta vinculada a você</small>
          </div>
        </article>
        <article class="patients-metric">
          <span class="patients-metric__icon"><FileClock :size="18" aria-hidden="true" /></span>
          <div>
            <span>Em tratamento</span>
            <strong v-if="state === 'ready' || state === 'refreshing'">{{ metrics?.in_treatment ?? '—' }}</strong>
            <i v-else class="patients-metric-skeleton" aria-hidden="true"></i>
            <small>módulo de planos não integrado</small>
          </div>
        </article>
        <article class="patients-metric">
          <span class="patients-metric__icon"><CalendarDays :size="18" aria-hidden="true" /></span>
          <div>
            <span>Com retorno previsto</span>
            <strong v-if="state === 'ready' || state === 'refreshing'">{{ metrics?.with_upcoming_appointments ?? 0 }}</strong>
            <i v-else class="patients-metric-skeleton" aria-hidden="true"></i>
            <small>consulta futura registrada</small>
          </div>
        </article>
        <article class="patients-metric">
          <span class="patients-metric__icon patients-metric__icon--muted"><CircleAlert :size="18" aria-hidden="true" /></span>
          <div>
            <span>Acompanhamento pendente</span>
            <strong v-if="state === 'ready' || state === 'refreshing'">{{ metrics?.with_pending_follow_up ?? '—' }}</strong>
            <i v-else class="patients-metric-skeleton" aria-hidden="true"></i>
            <small>pendências clínicas não integradas</small>
          </div>
        </article>
      </section>

      <section class="patients-panel" aria-labelledby="patient-list-title">
        <div class="patients-panel__heading">
          <div>
            <p class="patients-eyebrow">ACOMPANHAMENTO</p>
            <h2 id="patient-list-title">Pacientes vinculados</h2>
            <p>{{ total }} paciente(s) encontrado(s)</p>
          </div>
          <label class="patients-search">
            <Search :size="18" aria-hidden="true" />
            <span class="visually-hidden">Buscar pacientes por nome, CPF, telefone ou código</span>
            <input
              v-model="search"
              type="search"
              placeholder="Buscar por nome, CPF, telefone ou código do paciente..."
            />
          </label>
        </div>

        <div class="patients-filter-toolbar">
          <button
            class="patients-filter-trigger"
            type="button"
            :aria-expanded="filtersOpen"
            @click="filtersOpen = !filtersOpen"
          >
            <Search :size="16" aria-hidden="true" />
            Filtros
          </button>
          <label class="patients-sort">
            <span>Ordenar por</span>
            <select :value="sortBy" @change="changeSort($event.target.value)">
              <option value="name">Nome</option>
              <option value="last_appointment">Último atendimento</option>
              <option value="next_appointment">Próxima consulta</option>
            </select>
          </label>
        </div>

        <form v-if="filtersOpen" class="patients-filters" @submit.prevent="applyFilters">
          <label>
            <span>Agendamento</span>
            <select v-model="filtersDraft.upcoming">
              <option value="">Todos</option>
              <option value="yes">Com consulta futura</option>
              <option value="no">Sem consulta futura</option>
            </select>
          </label>
          <label>
            <span>Último atendimento</span>
            <select v-model="filtersDraft.lastVisit">
              <option value="">Todos</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="older">Há mais de 90 dias</option>
              <option value="never">Sem atendimento registrado</option>
            </select>
          </label>
          <p class="patients-filter-note">
            Filtros de tratamento e pendências não estão disponíveis: esses dados clínicos ainda não são registrados pelo sistema.
          </p>
          <div class="patients-filter-actions">
            <UiButton type="button" variant="secondary" size="sm" @click="clearFilters">Limpar filtros</UiButton>
            <UiButton type="submit" size="sm">Filtrar</UiButton>
          </div>
        </form>

        <div v-if="state === 'error'" class="patients-state patients-state--error" role="alert">
          <div>
            <strong>{{ errorMessage.includes('autorização') ? 'Acesso não autorizado' : 'Não foi possível atualizar' }}</strong>
            <p>{{ errorMessage }}</p>
          </div>
          <UiButton variant="secondary" @click="loadPatients">
            <template #start><RefreshCw :size="15" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </div>
        <div v-else-if="state === 'loading'" class="patients-loading" role="status" aria-label="Carregando pacientes">
          <span class="visually-hidden">Carregando pacientes...</span>
          <div v-for="item in 5" :key="item" class="patients-skeleton-row">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
        <div v-else-if="!patients.length" class="patients-empty">
          <span class="patients-empty__icon">
            <UsersRound v-if="!search && !filters.upcoming && !filters.lastVisit" :size="22" aria-hidden="true" />
            <Search v-else :size="22" aria-hidden="true" />
          </span>
          <strong>{{ search || filters.upcoming || filters.lastVisit ? 'Nenhum paciente encontrado para esta busca' : 'Nenhum paciente cadastrado ou disponível para consulta' }}</strong>
          <p>Os pacientes aparecem nesta lista quando há uma consulta vinculada à sua agenda.</p>
          <UiButton v-if="search || filters.upcoming || filters.lastVisit" variant="secondary" size="sm" @click="clearFilters">
            Limpar busca e filtros
          </UiButton>
        </div>
        <div v-else class="patients-table-wrap" :aria-busy="state === 'refreshing'">
          <table class="patients-table">
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Identificação</th>
                <th scope="col">Idade</th>
                <th scope="col">Último atendimento</th>
                <th scope="col">Próxima consulta</th>
                <th scope="col">Tratamento</th>
                <th scope="col">Pendências</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="patient in patients" :key="patient.id">
                <td>
                  <div class="patient-name-cell">
                    <UiAvatar :name="patient.name" size="sm" />
                    <div><strong>{{ patient.name }}</strong><span>{{ patient.email || patient.phone }}</span></div>
                  </div>
                </td>
                <td><span class="patient-code">#{{ patient.id }}</span></td>
                <td>{{ patientAge(patient.birth_date) }}</td>
                <td>{{ formatDate(patient.last_appointment_date) }}</td>
                <td>
                  <template v-if="patient.next_appointment">
                    <strong class="patient-next-date">{{ formatDate(patient.next_appointment.appointment_date) }}</strong>
                    <span class="patient-next-time">{{ formatTime(patient.next_appointment.appointment_time) }} · {{ patient.next_appointment.procedure }}</span>
                  </template>
                  <span v-else class="patient-muted">Sem consulta futura</span>
                </td>
                <td><UiBadge variant="neutral">Não disponível</UiBadge></td>
                <td><span class="patient-muted" aria-label="Dados clínicos indisponíveis">Não registrados</span></td>
                <td class="patient-actions-cell">
                  <button class="patient-action-primary" type="button" @click="openPatient(patient)">
                    Ver paciente
                  </button>
                  <details class="patient-actions-menu">
                    <summary :aria-label="`Mais ações para ${patient.name}`">•••</summary>
                    <div class="patient-actions-menu__content">
                      <button type="button" @click="openPatient(patient)">Ver perfil</button>
                      <button
                        type="button"
                        :disabled="!patient.next_appointment"
                        @click="goToNextAppointment(patient)"
                      >Abrir agenda</button>
                      <button type="button" @click="goToOdontogram(patient)">Odontograma</button>
                      <button type="button" @click="goToTreatmentPlans(patient)">Planos de tratamento</button>
                      <button type="button" @click="goToClinicalDocuments(patient)">Receitas e documentos</button>
                      <button type="button" @click="goToAttendanceHistory(patient)">Histórico de atendimentos</button>
                      <span class="patient-menu-note">Prontuário ainda não está integrado. Documentos podem ser salvos como rascunho.</span>
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer v-if="state === 'ready' && total" class="patients-pagination">
          <span>Exibindo {{ firstVisible }}–{{ lastVisible }} de {{ total }}</span>
          <label>
            <span>Por página</span>
            <select :value="pageSize" @change="changePageSize">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
          <div class="patients-pagination__controls">
            <button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="changePage(page - 1)">
              <ChevronLeft :size="17" aria-hidden="true" />
            </button>
            <span>Página {{ page }} de {{ pageCount }}</span>
            <button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="changePage(page + 1)">
              <ChevronRight :size="17" aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>

      <p class="patients-permission-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        A lista inclui apenas pacientes com consultas vinculadas à sua agenda. Dados clínicos e cadastro permanecem nos módulos autorizados da clínica.
      </p>
    </main>

    <UiDialog v-model="detailOpen" title="Perfil do paciente">
      <div v-if="selectedPatient" class="patient-detail">
        <header class="patient-detail__header">
          <UiAvatar :name="selectedPatient.name" size="lg" />
          <div class="patient-detail__identity">
            <h3>{{ selectedPatient.name }}</h3>
            <span>Paciente #{{ selectedPatient.id }} · {{ patientAge(selectedPatient.birth_date) }}</span>
          </div>
          <UiBadge variant="neutral">Dados clínicos indisponíveis</UiBadge>
        </header>
        <dl class="patient-contact-grid">
          <div><dt>Data de nascimento</dt><dd>{{ formatDate(selectedPatient.birth_date) }}</dd></div>
          <div><dt>CPF</dt><dd>{{ formatCpf(selectedPatient.cpf) }}</dd></div>
          <div><dt>Telefone</dt><dd>{{ selectedPatient.phone || 'Não informado' }}</dd></div>
          <div><dt>E-mail</dt><dd>{{ selectedPatient.email || 'Não informado' }}</dd></div>
        </dl>

        <div class="patient-detail-tabs" role="tablist" aria-label="Informações do paciente">
          <button
            id="patient-tab-overview"
            type="button"
            role="tab"
            :aria-selected="detailTab === 'overview'"
            aria-controls="patient-panel-overview"
            @click="detailTab = 'overview'"
          >Visão geral</button>
          <button
            id="patient-tab-history"
            type="button"
            role="tab"
            :aria-selected="detailTab === 'history'"
            aria-controls="patient-panel-history"
            @click="detailTab = 'history'"
          >Consultas</button>
          <button
            id="patient-tab-clinical"
            type="button"
            role="tab"
            :aria-selected="detailTab === 'clinical'"
            aria-controls="patient-panel-clinical"
            @click="detailTab = 'clinical'"
          >Dados clínicos</button>
        </div>

        <section v-if="detailTab === 'overview'" id="patient-panel-overview" role="tabpanel" aria-labelledby="patient-tab-overview" class="patient-detail-panel">
          <div class="patient-summary-card">
            <CalendarDays :size="18" aria-hidden="true" />
            <div>
              <span>Próxima consulta</span>
              <strong v-if="selectedPatient.next_appointment">
                {{ formatDate(selectedPatient.next_appointment.appointment_date) }} às {{ formatTime(selectedPatient.next_appointment.appointment_time) }}
              </strong>
              <strong v-else>Não há consulta futura registrada</strong>
              <small v-if="selectedPatient.next_appointment">{{ selectedPatient.next_appointment.procedure }}</small>
            </div>
            <UiButton
              v-if="selectedPatient.next_appointment"
              size="sm"
              variant="secondary"
              @click="goToNextAppointment(selectedPatient)"
            >Abrir agenda</UiButton>
          </div>
          <div class="patient-summary-card">
            <Clock3 :size="18" aria-hidden="true" />
            <div><span>Último atendimento concluído</span><strong>{{ formatDate(selectedPatient.last_appointment_date) }}</strong></div>
          </div>
          <p class="patient-data-notice">
            <CircleAlert :size="17" aria-hidden="true" />
            O odontograma permite consultar e registrar condições dentárias. Prontuário, planos, alergias e pendências clínicas não estão integrados.
          </p>
          <UiButton variant="secondary" @click="goToOdontogram(selectedPatient)">
            Abrir odontograma
          </UiButton>
          <UiButton variant="secondary" @click="goToClinicalDocuments(selectedPatient)">
            Receitas e documentos
          </UiButton>
          <UiButton variant="secondary" @click="goToAttendanceHistory(selectedPatient)">
            Histórico de atendimentos
          </UiButton>
        </section>

        <section v-else-if="detailTab === 'history'" id="patient-panel-history" role="tabpanel" aria-labelledby="patient-tab-history" class="patient-detail-panel">
          <div v-if="historyState === 'loading'" class="patient-history-state" role="status">Carregando consultas...</div>
          <div v-else-if="historyState === 'error'" class="patient-history-state patient-history-state--error" role="alert">
            <p>{{ errorMessage }}</p>
            <UiButton size="sm" variant="secondary" @click="openPatient(selectedPatient, 'history')">Tentar novamente</UiButton>
          </div>
          <div v-else-if="historyState === 'empty'" class="patient-history-state">
            Nenhuma consulta registrada para este paciente.
          </div>
          <ol v-else class="patient-history-list">
            <li v-for="appointment in history" :key="appointment.id">
              <span class="patient-history-list__date">{{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }}</span>
              <strong>{{ appointment.procedure }}</strong>
              <span>{{ appointment.status }} · {{ appointment.duration_minutes }} min</span>
            </li>
          </ol>
        </section>

        <section v-else id="patient-panel-clinical" role="tabpanel" aria-labelledby="patient-tab-clinical" class="patient-detail-panel">
          <div class="patient-clinical-unavailable">
            <FileText :size="22" aria-hidden="true" />
            <strong>Odontograma disponível</strong>
            <p>Consulte e registre as condições dentárias autorizadas. O prontuário ainda não está integrado; documentos clínicos permitem salvar apenas rascunhos.</p>
            <UiButton size="sm" variant="secondary" @click="goToOdontogram(selectedPatient)">
              Abrir odontograma
            </UiButton>
            <UiButton size="sm" variant="secondary" @click="goToClinicalDocuments(selectedPatient)">
              Receitas e documentos
            </UiButton>
            <UiButton size="sm" variant="secondary" @click="goToAttendanceHistory(selectedPatient)">
              Histórico de atendimentos
            </UiButton>
          </div>
        </section>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped>
.dentist-patients-page { min-height: 100vh; background: var(--color-page); }
.dentist-patients-main { width: min(100%, 96rem); margin-inline: auto; padding: clamp(var(--space-4), 3vw, var(--space-10)); }
.patients-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-5); margin-bottom: var(--space-6); }
.patients-eyebrow { margin: 0 0 var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.patients-intro h1 { margin: 0; color: var(--color-text); font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.4rem); letter-spacing: var(--letter-spacing-tight); }
.patients-intro > div > p:last-child { margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.patients-access-note, .patients-permission-note { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-access-note svg, .patients-permission-note svg { flex: 0 0 auto; color: var(--color-primary); }
.patients-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
.patients-metric { display: flex; min-width: 0; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.patients-metric__icon { display: grid; width: 2.4rem; height: 2.4rem; flex: 0 0 auto; place-items: center; border-radius: var(--radius-sm); background: var(--color-primary-subtle); color: var(--color-primary); }
.patients-metric__icon--muted { background: var(--color-background); color: var(--color-text-muted); }
.patients-metric > div { display: grid; min-width: 0; gap: 2px; }
.patients-metric > div > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.35; }
.patients-metric strong { color: var(--color-text); font-size: var(--font-size-lg); line-height: 1.1; }
.patients-metric-skeleton { width: 2.25rem; height: 1.1rem; border-radius: var(--radius-sm); background: var(--color-background); }
.patients-metric small { color: var(--color-text-muted); font-size: 0.6875rem; line-height: 1.35; }
.patients-panel { min-width: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.patients-panel__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-5); border-bottom: 1px solid var(--color-border); }
.patients-panel__heading h2 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); }
.patients-panel__heading > div > p:last-child { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.patients-search { display: flex; width: min(32rem, 52%); min-height: 2.7rem; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); }
.patients-search:focus-within { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.patients-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-xs); }
.patients-filter-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--color-border); }
.patients-filter-trigger { min-height: 2.25rem; display: inline-flex; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.patients-sort, .patients-pagination label { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-sort select, .patients-pagination select, .patients-filters select { min-height: 2.25rem; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--font-size-xs); }
.patients-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); background: var(--color-background); }
.patients-filters > label { display: grid; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-filter-note { grid-column: 1 / -1; margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.5; }
.patients-filter-actions { display: flex; justify-content: flex-end; gap: var(--space-2); grid-column: 1 / -1; }
.patients-table-wrap { width: 100%; overflow-x: auto; }
.patients-table { width: 100%; border-collapse: collapse; text-align: left; }
.patients-table th { padding: var(--space-3) var(--space-4); background: var(--color-background); color: var(--color-text-secondary); font-size: 0.6875rem; font-weight: var(--font-weight-semibold); white-space: nowrap; }
.patients-table td { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-xs); vertical-align: middle; }
.patients-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary-subtle) 30%, transparent); }
.patient-name-cell { display: flex; min-width: 11rem; align-items: center; gap: var(--space-2); }
.patient-name-cell > div { display: grid; min-width: 0; gap: 2px; }
.patient-name-cell strong { overflow: hidden; color: var(--color-text); font-size: var(--font-size-xs); text-overflow: ellipsis; white-space: nowrap; }
.patient-name-cell span, .patient-next-time { max-width: 14rem; overflow: hidden; color: var(--color-text-muted); font-size: 0.6875rem; text-overflow: ellipsis; white-space: nowrap; }
.patient-code { color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
.patient-next-date { display: block; color: var(--color-text); font-size: var(--font-size-xs); white-space: nowrap; }
.patient-muted { color: var(--color-text-muted); font-size: 0.6875rem; }
.patient-actions-cell { display: flex; align-items: center; gap: var(--space-2); white-space: nowrap; }
.patient-action-primary, .patient-actions-menu summary { min-height: 2rem; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); cursor: pointer; font: inherit; font-size: 0.6875rem; font-weight: var(--font-weight-semibold); }
.patient-actions-menu { position: relative; }
.patient-actions-menu summary { display: grid; min-width: 2rem; place-items: center; color: var(--color-text-secondary); list-style: none; }
.patient-actions-menu summary::-webkit-details-marker { display: none; }
.patient-actions-menu:not([open]) .patient-actions-menu__content { display: none; }
.patient-actions-menu__content { position: absolute; z-index: 4; top: calc(100% + 4px); right: 0; width: 15rem; display: grid; gap: 2px; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-md); }
.patient-actions-menu__content button { min-height: 2.2rem; padding: 0 var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); cursor: pointer; font: inherit; font-size: var(--font-size-xs); text-align: left; }
.patient-actions-menu__content button:hover { background: var(--color-background); }
.patient-actions-menu__content button:disabled { color: var(--color-text-muted); cursor: not-allowed; }
.patient-menu-note { padding: var(--space-2); color: var(--color-text-muted); font-size: 0.6875rem; line-height: 1.4; white-space: normal; }
.patients-loading { padding: var(--space-3) var(--space-5); }
.patients-skeleton-row { display: grid; grid-template-columns: 2fr 1fr 0.7fr 1.2fr 1.6fr 1fr 1fr 1fr; align-items: center; gap: var(--space-3); padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.patients-skeleton-row i { height: 1rem; border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--color-background), var(--color-border), var(--color-background)); background-size: 200% 100%; animation: patient-shimmer 1.4s ease-in-out infinite; }
.patients-state, .patients-empty { min-height: 14rem; display: flex; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-6); color: var(--color-text-secondary); text-align: center; }
.patients-state--error { justify-content: space-between; }
.patients-state strong, .patients-empty strong { color: var(--color-text); }
.patients-state p, .patients-empty p { margin: var(--space-1) 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-empty { flex-direction: column; }
.patients-empty__icon { display: grid; width: 3rem; height: 3rem; place-items: center; border-radius: 50%; background: var(--color-primary-subtle); color: var(--color-primary); }
.patients-pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-pagination__controls { display: flex; align-items: center; gap: var(--space-2); }
.patients-pagination__controls button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-secondary); cursor: pointer; }
.patients-pagination__controls button:disabled { opacity: .45; cursor: not-allowed; }
.patients-permission-note { margin: var(--space-4) 0 0; align-items: flex-start; line-height: 1.5; }
.patient-detail { display: grid; gap: var(--space-4); }
.patient-detail__header { display: flex; align-items: center; gap: var(--space-3); }
.patient-detail__identity { flex: 1; min-width: 0; }
.patient-detail__identity h3 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); overflow-wrap: anywhere; }
.patient-detail__identity span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patient-contact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.patient-contact-grid dt { color: var(--color-text-muted); font-size: 0.6875rem; }
.patient-contact-grid dd { margin: 2px 0 0; color: var(--color-text); font-size: var(--font-size-xs); overflow-wrap: anywhere; }
.patient-detail-tabs { display: flex; gap: var(--space-1); overflow-x: auto; border-bottom: 1px solid var(--color-border); }
.patient-detail-tabs button { min-height: 2.5rem; padding-inline: var(--space-3); border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); white-space: nowrap; }
.patient-detail-tabs button[aria-selected="true"] { border-bottom-color: var(--color-primary); color: var(--color-primary); font-weight: var(--font-weight-semibold); }
.patient-detail-tabs button:focus-visible, .patients-filter-trigger:focus-visible, .patients-pagination button:focus-visible, .patient-action-primary:focus-visible, .patient-actions-menu summary:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.patient-detail-panel { display: grid; gap: var(--space-3); min-height: 9rem; }
.patient-summary-card { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-primary); }
.patient-summary-card > div { flex: 1; display: grid; gap: 2px; }
.patient-summary-card span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patient-summary-card strong { color: var(--color-text); font-size: var(--font-size-sm); }
.patient-summary-card small { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.patient-data-notice { display: flex; gap: var(--space-2); margin: 0; padding: var(--space-3); border-radius: var(--radius-sm); background: var(--color-background); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
.patient-data-notice svg { flex: 0 0 auto; color: var(--color-warning); }
.patient-history-state { min-height: 8rem; display: grid; place-content: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); text-align: center; }
.patient-history-state--error { color: var(--color-danger); }
.patient-history-list { display: grid; gap: var(--space-2); max-height: 18rem; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.patient-history-list li { display: grid; gap: 3px; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.patient-history-list__date, .patient-history-list li > span:last-child { color: var(--color-text-muted); font-size: 0.6875rem; }
.patient-history-list li strong { color: var(--color-text); font-size: var(--font-size-xs); }
.patient-clinical-unavailable { min-height: 9rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); color: var(--color-text-muted); text-align: center; }
.patient-clinical-unavailable strong { color: var(--color-text); font-size: var(--font-size-sm); }
.patient-clinical-unavailable p { max-width: 30rem; margin: 0; font-size: var(--font-size-xs); line-height: 1.5; }
@keyframes patient-shimmer { to { background-position: -200% 0; } }
@media (max-width: 68rem) { .patients-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 42.5rem) {
  .dentist-patients-main { padding: var(--space-4); }
  .patients-intro { align-items: flex-start; flex-direction: column; }
  .patients-metrics { gap: var(--space-2); }
  .patients-metric { align-items: flex-start; gap: var(--space-2); padding: var(--space-3); }
  .patients-metric__icon { width: 2rem; height: 2rem; }
  .patients-metric > div > span { font-size: 0.6875rem; }
  .patients-panel__heading { align-items: stretch; flex-direction: column; padding: var(--space-4); }
  .patients-search { width: 100%; }
  .patients-filter-toolbar { padding-inline: var(--space-4); }
  .patients-filters { grid-template-columns: 1fr; padding: var(--space-4); }
  .patients-filter-note, .patients-filter-actions { grid-column: 1; }
  .patients-filter-actions > :deep(button) { flex: 1; }
  .patients-pagination { align-items: flex-start; flex-wrap: wrap; padding-inline: var(--space-4); }
  .patients-pagination__controls { margin-left: auto; }
  .patient-contact-grid { grid-template-columns: 1fr; }
  .patient-detail__header { flex-wrap: wrap; }
  .patient-detail__header :deep(.ui-badge) { margin-left: 3rem; }
  .patient-summary-card { align-items: flex-start; flex-wrap: wrap; }
  .patients-skeleton-row { grid-template-columns: 1.5fr 1fr 1fr; }
  .patients-skeleton-row i:nth-child(n+4) { display: none; }
  .patients-table { width: 100%; min-width: 0; table-layout: fixed; }
  .patients-table th, .patients-table td { padding-inline: var(--space-2); }
  .patients-table th:nth-child(2), .patients-table td:nth-child(2),
  .patients-table th:nth-child(3), .patients-table td:nth-child(3),
  .patients-table th:nth-child(4), .patients-table td:nth-child(4),
  .patients-table th:nth-child(6), .patients-table td:nth-child(6),
  .patients-table th:nth-child(7), .patients-table td:nth-child(7) { display: none; }
  .patients-table th:nth-child(1), .patients-table td:nth-child(1) { width: 48%; }
  .patients-table th:nth-child(5), .patients-table td:nth-child(5) { width: 32%; }
  .patients-table th:nth-child(8), .patients-table td:nth-child(8) { width: 20%; }
  .patient-name-cell { min-width: 0; }
  .patient-actions-cell { align-items: stretch; flex-direction: column; gap: var(--space-1); overflow: hidden; }
  .patient-action-primary { padding-inline: 2px; font-size: 0.625rem; white-space: normal; }
  .patient-actions-menu summary { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .patients-skeleton-row i { animation: none; } }
</style>
