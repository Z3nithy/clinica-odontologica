<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import { createReceptionPatient, updateReceptionPatient } from '../services/reception'
import { getManagerPatient, getManagerPatients } from '../services/manager-patients'
import { getSessionUser } from '../services/auth-session'
import ManagerShell from '../components/ManagerShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const router = useRouter()
const canViewPatients = getSessionUser()?.role === 'manager'
const canManagePatients = canViewPatients
const today = new Date()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(today)
const pageSize = 10
const page = ref(1)
const state = ref('loading')
const errorMessage = ref('')
const filterError = ref('')
const patients = ref([])
const total = ref(0)
const metrics = ref(null)
const requestId = ref(0)
const searchDraft = ref('')
const filterFrom = ref('')
const filterTo = ref('')
const upcomingDraft = ref('')
const completenessDraft = ref('')
const sortDraft = ref('created_at')
const sortOrderDraft = ref('desc')
const appliedFilters = ref({
  q: '',
  created_from: '',
  created_to: '',
  has_upcoming_appointment: '',
  incomplete: '',
  sort_by: 'created_at',
  sort_order: 'desc',
})
const detailsOpen = ref(false)
const detailState = ref('idle')
const detailError = ref('')
const selectedPatient = ref(null)
const formOpen = ref(false)
const formError = ref('')
const formPending = ref(false)
const formRef = ref(null)
const editingPatient = ref(null)
const form = ref(emptyForm())
const initialForm = ref('')

function emptyForm() {
  return {
    name: '',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    consent_given: false,
  }
}

function dateKey(value) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(parsed)
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value || '—'
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(value || 0)
}

function paramsFor(offset = (page.value - 1) * pageSize) {
  const active = appliedFilters.value
  return {
    q: active.q || undefined,
    created_from: active.created_from || undefined,
    created_to: active.created_to || undefined,
    has_upcoming_appointment: active.has_upcoming_appointment === ''
      ? undefined
      : active.has_upcoming_appointment === 'yes',
    incomplete: active.incomplete === ''
      ? undefined
      : active.incomplete === 'yes',
    sort_by: active.sort_by,
    sort_order: active.sort_order,
    offset,
    limit: pageSize,
  }
}

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const activeFilterLabels = computed(() => {
  const active = appliedFilters.value
  const labels = []
  if (active.q) labels.push(`Busca: ${active.q}`)
  if (active.created_from) labels.push(`Cadastro desde ${formatDate(active.created_from)}`)
  if (active.created_to) labels.push(`Cadastro até ${formatDate(active.created_to)}`)
  if (active.has_upcoming_appointment === 'yes') labels.push('Com consulta futura')
  if (active.has_upcoming_appointment === 'no') labels.push('Sem consulta futura')
  if (active.incomplete === 'yes') labels.push('Cadastro incompleto')
  if (active.incomplete === 'no') labels.push('Cadastro completo')
  return labels
})
const newPatientDelta = computed(() => {
  if (!metrics.value || metrics.value.previous_period_new == null) return ''
  const delta = metrics.value.new_in_period - metrics.value.previous_period_new
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)} vs. período anterior`
})
const formDirty = computed(() => JSON.stringify(form.value) !== initialForm.value)

async function loadPatients() {
  if (!canViewPatients) {
    state.value = 'denied'
    return
  }
  const currentRequest = ++requestId.value
  state.value = patients.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getManagerPatients(paramsFor())
    if (currentRequest !== requestId.value) return
    patients.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    state.value = 'ready'
  } catch (error) {
    if (currentRequest !== requestId.value) return
    state.value = error.response?.status === 403 ? 'denied' : 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar os pacientes.')
  }
}

function applyFilters() {
  if (filterFrom.value && filterTo.value && filterFrom.value > filterTo.value) {
    filterError.value = 'A data inicial do cadastro deve ser igual ou anterior à data final.'
    return
  }
  filterError.value = ''
  appliedFilters.value = {
    q: searchDraft.value.trim(),
    created_from: filterFrom.value,
    created_to: filterTo.value,
    has_upcoming_appointment: upcomingDraft.value,
    incomplete: completenessDraft.value,
    sort_by: sortDraft.value,
    sort_order: sortOrderDraft.value,
  }
  page.value = 1
  void loadPatients()
}

function clearFilters() {
  filterError.value = ''
  searchDraft.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  upcomingDraft.value = ''
  completenessDraft.value = ''
  sortDraft.value = 'created_at'
  sortOrderDraft.value = 'desc'
  appliedFilters.value = {
    q: '',
    created_from: '',
    created_to: '',
    has_upcoming_appointment: '',
    incomplete: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  }
  page.value = 1
  void loadPatients()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadPatients()
}

function openMetricFilter(filter) {
  searchDraft.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  if (filter === 'new') {
    filterFrom.value = dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
    filterTo.value = dateKey(today)
  }
  upcomingDraft.value = filter === 'upcoming' ? 'yes' : ''
  completenessDraft.value = filter === 'incomplete' ? 'yes' : ''
  sortDraft.value = 'created_at'
  sortOrderDraft.value = 'desc'
  applyFilters()
  document.querySelector('.manager-patients-panel')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })
}

function openCreate() {
  if (!canManagePatients) return
  editingPatient.value = null
  form.value = emptyForm()
  initialForm.value = JSON.stringify(form.value)
  formError.value = ''
  formOpen.value = true
}

async function openDetails(patient) {
  detailsOpen.value = true
  detailState.value = 'loading'
  detailError.value = ''
  try {
    selectedPatient.value = await getManagerPatient(patient.id, {
      created_from: appliedFilters.value.created_from || undefined,
      created_to: appliedFilters.value.created_to || undefined,
    })
    detailState.value = 'ready'
  } catch (error) {
    detailError.value = getApiErrorMessage(error, 'Não foi possível carregar os dados administrativos.')
    detailState.value = error.response?.status === 403 ? 'denied' : 'error'
  }
}

function openEdit() {
  if (!canManagePatients || !selectedPatient.value) return
  editingPatient.value = selectedPatient.value
  form.value = {
    name: selectedPatient.value.name || '',
    birth_date: selectedPatient.value.birth_date || '',
    phone: selectedPatient.value.phone || '',
    email: selectedPatient.value.email || '',
    address: selectedPatient.value.address || '',
    consent_given: Boolean(selectedPatient.value.consent_given),
  }
  initialForm.value = JSON.stringify(form.value)
  formError.value = ''
  formOpen.value = true
}

function confirmFormClose() {
  return !formDirty.value || window.confirm('Descartar as alterações não salvas?')
}

async function savePatient() {
  if (!canManagePatients || !formRef.value?.reportValidity()) return
  formError.value = ''
  const phoneDigits = form.value.phone.replace(/\D/g, '')
  const emailValid = !form.value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())
  if (form.value.name.trim().length < 2 || phoneDigits.length < 10 || phoneDigits.length > 13 || !emailValid) {
    formError.value = 'Revise o nome, o telefone com DDD e o formato do e-mail.'
    return
  }
  formPending.value = true
  const payload = {
    name: form.value.name.trim(),
    birth_date: form.value.birth_date || null,
    phone: form.value.phone,
    email: form.value.email.trim() || null,
    address: form.value.address.trim() || null,
    consent_given: form.value.consent_given,
  }
  try {
    if (editingPatient.value) {
      await updateReceptionPatient(editingPatient.value.id, payload)
    } else {
      await createReceptionPatient({ ...payload, cpf: null, administrative_notes: null })
    }
    formOpen.value = false
    detailsOpen.value = false
    page.value = editingPatient.value ? page.value : 1
    await loadPatients()
  } catch (error) {
    formError.value = getApiErrorMessage(
      error,
      error.response?.status === 409
        ? 'Este paciente já possui cadastro na clínica.'
        : 'Não foi possível salvar o cadastro. Confira os dados e tente novamente.',
    )
  } finally {
    formPending.value = false
  }
}

function goToAgenda(patient) {
  const appointmentDate = patient.next_appointment_date || patient.last_appointment_date || dateKey(today)
  void router.push({ name: 'manager-agenda', query: { date: appointmentDate, view: 'day' } })
}

function navigateShell(id) {
  const routes = {
    overview: 'manager-dashboard',
    schedule: 'manager-agenda',
    team: 'manager-team',
    productivity: 'manager-productivity',
    patients: 'manager-patients',
    settings: 'manager-settings',
  }
  if (id === 'patients') window.scrollTo({ top: 0, behavior: 'auto' })
  else if (routes[id]) void router.push({ name: routes[id] })
}

onMounted(() => {
  void loadPatients()
})
</script>

<template>
  <div class="manager-patients-page">
    <ManagerShell active-page="patients" :date-label="dateLabel" @navigate="navigateShell" />

    <main class="manager-patients-main">
      <header class="manager-patients-intro">
        <div>
          <p class="patients-eyebrow">PORTAL DO GESTOR</p>
          <h1>Gestão de Pacientes</h1>
          <p>Acompanhe e consulte a base de pacientes da clínica</p>
        </div>
        <div class="patients-intro-actions">
          <UiButton v-if="canManagePatients" @click="openCreate">
            <template #start><Plus :size="17" aria-hidden="true" /></template>
            Novo paciente
          </UiButton>
          <UiButton variant="secondary" @click="router.push({ name: 'manager-agenda' })">
            <template #start><CalendarRange :size="17" aria-hidden="true" /></template>
            Visão Geral da Agenda
          </UiButton>
        </div>
      </header>

      <section v-if="state === 'denied'" class="patients-state" role="alert">
        <ShieldCheck :size="26" aria-hidden="true" /><strong>Acesso restrito</strong>
        <p>Esta área é exclusiva para gestores autorizados.</p>
      </section>
      <section v-else-if="state === 'error'" class="patients-state patients-state--error" role="alert">
        <AlertCircle :size="26" aria-hidden="true" /><strong>Não foi possível carregar os pacientes</strong>
        <p>{{ errorMessage }}</p><UiButton variant="secondary" @click="loadPatients"><RefreshCw :size="16" /> Tentar novamente</UiButton>
      </section>
      <template v-else>
        <section class="patients-metrics" aria-label="Indicadores da base de pacientes" :aria-busy="state === 'loading' || state === 'refreshing'">
          <article class="patients-metric">
            <span class="patients-metric__icon patients-metric__icon--blue"><UsersRound :size="19" aria-hidden="true" /></span>
            <div><span>Total de pacientes</span><strong v-if="state === 'loading'" class="patients-skeleton" aria-label="Carregando"></strong><strong v-else>{{ formatNumber(metrics?.total) }}</strong><small>Todos os registros da clínica.</small></div>
            <button type="button" aria-label="Ver todos os pacientes" @click="openMetricFilter('all')">Ver base</button>
          </article>
          <article class="patients-metric">
            <span class="patients-metric__icon patients-metric__icon--green"><UserRound :size="19" aria-hidden="true" /></span>
            <div><span>Novos pacientes</span><strong v-if="state === 'loading'" class="patients-skeleton" aria-label="Carregando"></strong><strong v-else>{{ formatNumber(metrics?.new_in_period) }}</strong><small>No período do filtro. {{ newPatientDelta }}</small></div>
            <button type="button" aria-label="Consultar novos pacientes" @click="openMetricFilter('new')">Aplicar período</button>
          </article>
          <article class="patients-metric">
            <span class="patients-metric__icon patients-metric__icon--violet"><CalendarDays :size="19" aria-hidden="true" /></span>
            <div><span>Com consultas futuras</span><strong v-if="state === 'loading'" class="patients-skeleton" aria-label="Carregando"></strong><strong v-else>{{ formatNumber(metrics?.with_upcoming_appointments) }}</strong><small>Pessoas distintas com consulta não cancelada.</small></div>
            <button type="button" aria-label="Ver pacientes com consulta futura" @click="openMetricFilter('upcoming')">Ver pacientes</button>
          </article>
          <article class="patients-metric">
            <span class="patients-metric__icon patients-metric__icon--amber"><CircleAlert :size="19" aria-hidden="true" /></span>
            <div><span>Cadastros incompletos</span><strong v-if="state === 'loading'" class="patients-skeleton" aria-label="Carregando"></strong><strong v-else>{{ formatNumber(metrics?.incomplete) }}</strong><small>Telefone ausente ou autorização pendente.</small></div>
            <button type="button" aria-label="Ver cadastros incompletos" @click="openMetricFilter('incomplete')">Ver cadastros</button>
          </article>
        </section>

        <section class="manager-patients-panel" aria-labelledby="patients-list-title">
          <header class="patients-panel-heading">
            <div><p class="patients-eyebrow">BASE ADMINISTRATIVA</p><h2 id="patients-list-title">Pacientes da clínica</h2><p>{{ total }} resultado(s) para os filtros atuais</p></div>
            <span class="patients-scope"><ShieldCheck :size="15" aria-hidden="true" /> Somente dados da clínica vinculada</span>
          </header>

          <div class="patients-search-row">
            <label class="patients-search">
              <span>Buscar por nome, código ou telefone</span>
              <span class="patients-search-input"><Search :size="17" aria-hidden="true" /><input v-model="searchDraft" type="search" autocomplete="off" placeholder="Digite um nome, ID ou telefone" @keyup.enter="applyFilters"></span>
            </label>
          </div>
          <form class="patients-filters" @submit.prevent="applyFilters">
            <label><span>Cadastro desde</span><input v-model="filterFrom" type="date" :aria-invalid="Boolean(filterError)" :aria-describedby="filterError ? 'patients-filter-error' : undefined"></label>
            <label><span>Até</span><input v-model="filterTo" type="date" :aria-invalid="Boolean(filterError)" :aria-describedby="filterError ? 'patients-filter-error' : undefined"></label>
            <label><span>Consulta futura</span><select v-model="upcomingDraft"><option value="">Todos</option><option value="yes">Com consulta futura</option><option value="no">Sem consulta futura</option></select></label>
            <label><span>Completude cadastral</span><select v-model="completenessDraft"><option value="">Todos</option><option value="yes">Incompleto</option><option value="no">Completo</option></select></label>
            <label><span>Ordenar por</span><select v-model="sortDraft"><option value="created_at">Data de cadastro</option><option value="name">Nome</option><option value="last_appointment">Última consulta</option></select></label>
            <label><span>Ordem</span><select v-model="sortOrderDraft"><option value="desc">Mais recentes / maior primeiro</option><option value="asc">Mais antigos / menor primeiro</option></select></label>
            <div class="patients-filter-actions"><UiButton type="submit" size="sm">Aplicar filtros</UiButton><UiButton type="button" size="sm" variant="secondary" @click="clearFilters">Limpar filtros</UiButton></div>
          </form>
          <p v-if="filterError" id="patients-filter-error" class="patients-filter-error" role="alert">{{ filterError }}</p>

          <div v-if="activeFilterLabels.length" class="patients-active-filters" aria-live="polite">
            <strong>Filtros ativos</strong><span v-for="label in activeFilterLabels" :key="label">{{ label }}</span>
          </div>

          <div v-if="state === 'loading'" class="patients-loading" role="status" aria-label="Carregando pacientes"><span v-for="item in 4" :key="item"></span></div>
          <div v-else-if="state === 'ready' && !patients.length" class="patients-state">
            <UsersRound :size="25" aria-hidden="true" />
            <strong>{{ metrics?.total ? 'Nenhum paciente corresponde aos filtros' : 'Ainda não há pacientes cadastrados' }}</strong>
            <p>{{ metrics?.total ? 'Altere os filtros e tente novamente.' : 'Os pacientes cadastrados pelos módulos autorizados aparecerão aqui.' }}</p>
            <UiButton v-if="!metrics?.total && canManagePatients" size="sm" @click="openCreate">Novo paciente</UiButton>
          </div>
          <template v-else-if="patients.length">
            <div class="patients-table-wrap" :aria-busy="state === 'refreshing'">
              <table class="patients-table">
                <thead><tr>
                  <th scope="col"><button type="button" @click="sortDraft = 'name'; sortOrderDraft = sortOrderDraft === 'asc' ? 'desc' : 'asc'; applyFilters()">Paciente <ChevronDown :size="14" aria-hidden="true" /></button></th>
                  <th scope="col">Código</th><th scope="col">Telefone</th>
                  <th scope="col"><button type="button" @click="sortDraft = 'created_at'; sortOrderDraft = sortOrderDraft === 'asc' ? 'desc' : 'asc'; applyFilters()">Cadastro <ChevronDown :size="14" aria-hidden="true" /></button></th>
                  <th scope="col"><button type="button" @click="sortDraft = 'last_appointment'; sortOrderDraft = sortOrderDraft === 'asc' ? 'desc' : 'asc'; applyFilters()">Última consulta <ChevronDown :size="14" aria-hidden="true" /></button></th>
                  <th scope="col">Próxima consulta</th><th scope="col">Cadastro</th><th scope="col">Ações</th>
                </tr></thead>
                <tbody><tr v-for="patient in patients" :key="patient.id">
                  <td><button class="patient-person" type="button" @click="openDetails(patient)"><UiAvatar :name="patient.name" size="sm" /><span><strong>{{ patient.name }}</strong><small>ID {{ patient.id }}</small></span></button></td>
                  <td>{{ patient.id }}</td><td>{{ formatPhone(patient.phone) }}</td><td>{{ formatDate(patient.created_at) }}</td>
                  <td>{{ formatDate(patient.last_appointment_date) }}</td><td>{{ formatDate(patient.next_appointment_date) }}</td>
                  <td><span class="patient-completeness" :class="{ 'patient-completeness--incomplete': patient.incomplete_fields.length }">{{ patient.incomplete_fields.length ? 'Incompleto' : 'Completo' }}</span></td>
                  <td><button class="patient-action" type="button" @click="openDetails(patient)">Detalhes</button></td>
                </tr></tbody>
              </table>
            </div>
            <div class="patients-mobile-cards">
              <article v-for="patient in patients" :key="patient.id" class="patient-mobile-card">
                <button class="patient-person" type="button" @click="openDetails(patient)"><UiAvatar :name="patient.name" size="sm" /><span><strong>{{ patient.name }}</strong><small>ID {{ patient.id }} · {{ patient.incomplete_fields.length ? 'Cadastro incompleto' : 'Cadastro completo' }}</small></span></button>
                <dl><div><dt>Telefone</dt><dd>{{ formatPhone(patient.phone) }}</dd></div><div><dt>Cadastro</dt><dd>{{ formatDate(patient.created_at) }}</dd></div><div><dt>Última consulta</dt><dd>{{ formatDate(patient.last_appointment_date) }}</dd></div><div><dt>Próxima consulta</dt><dd>{{ formatDate(patient.next_appointment_date) }}</dd></div></dl>
                <button class="patient-action" type="button" @click="openDetails(patient)">Ver dados administrativos</button>
              </article>
            </div>
            <footer class="patients-pagination"><span>Mostrando {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} de {{ total }}</span><div><button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="17" aria-hidden="true" /></button><span>Página {{ page }} de {{ pageCount }}</span><button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="changePage(page + 1)"><ChevronRight :size="17" aria-hidden="true" /></button></div></footer>
          </template>
        </section>

        <aside class="patients-disclaimer"><Info :size="18" aria-hidden="true" /><p>O modelo atual não possui estado de inatividade, unidade adicional ou regra clínica de retorno. “Incompleto” considera telefone ausente ou autorização administrativa pendente; não representa qualidade ou necessidade clínica. CPF não é usado na busca nem exibido nesta tela.</p></aside>
      </template>
    </main>

    <UiDialog v-model="detailsOpen" title="Dados administrativos do paciente">
      <div v-if="detailState === 'loading'" class="patients-state" role="status">Carregando dados administrativos…</div>
      <div v-else-if="detailState === 'error' || detailState === 'denied'" class="patients-state patients-state--error" role="alert"><AlertCircle :size="22" aria-hidden="true" /><p>{{ detailError || 'Acesso negado.' }}</p></div>
      <template v-else-if="selectedPatient">
        <div class="patient-detail-header"><UiAvatar :name="selectedPatient.name" size="lg" /><div><h3>{{ selectedPatient.name }}</h3><span>Código {{ selectedPatient.id }}</span></div><span class="patient-completeness" :class="{ 'patient-completeness--incomplete': selectedPatient.incomplete_fields.length }">{{ selectedPatient.incomplete_fields.length ? 'Incompleto' : 'Completo' }}</span></div>
        <h3 class="patient-detail-section">Dados cadastrais</h3>
        <dl class="patient-detail-grid">
          <div><dt>Telefone</dt><dd>{{ formatPhone(selectedPatient.phone) }}</dd></div><div><dt>E-mail</dt><dd>{{ selectedPatient.email || 'Não informado' }}</dd></div>
          <div><dt>Data de nascimento</dt><dd>{{ formatDate(selectedPatient.birth_date) }}</dd></div><div><dt>CPF</dt><dd>{{ selectedPatient.cpf_masked || 'Não informado' }}</dd></div>
          <div><dt>Cadastro</dt><dd>{{ formatDate(selectedPatient.created_at) }}</dd></div><div><dt>Autorização administrativa</dt><dd>{{ selectedPatient.consent_given ? 'Registrada' : 'Pendente' }}</dd></div>
          <div class="patient-detail-grid__wide"><dt>Endereço</dt><dd>{{ selectedPatient.address || 'Não informado' }}</dd></div>
          <div class="patient-detail-grid__wide"><dt>Campos pendentes</dt><dd>{{ selectedPatient.incomplete_fields.length ? selectedPatient.incomplete_fields.join(', ') : 'Nenhum campo obrigatório pendente' }}</dd></div>
        </dl>
        <h3 class="patient-detail-section">Resumo de consultas</h3>
        <dl class="patient-detail-grid">
          <div><dt>Última consulta concluída</dt><dd>{{ formatDate(selectedPatient.last_appointment_date) }}</dd></div><div><dt>Próxima consulta não cancelada</dt><dd>{{ formatDate(selectedPatient.next_appointment_date) }}</dd></div>
          <div><dt>Consultas no período do filtro</dt><dd>{{ selectedPatient.appointments_in_period }}</dd></div>
        </dl>
        <p class="patient-detail-note">Esta tela não apresenta prontuário, diagnóstico, prescrição ou anotação clínica.</p>
        <div class="patient-detail-actions">
          <UiButton v-if="canManagePatients" variant="secondary" @click="openEdit">Editar dados administrativos</UiButton>
          <UiButton @click="goToAgenda(selectedPatient); detailsOpen = false">Consultar agenda relacionada</UiButton>
          <UiButton variant="tertiary" @click="detailsOpen = false">Voltar à listagem</UiButton>
        </div>
      </template>
      <template #footer><span></span></template>
    </UiDialog>

    <UiDialog v-model="formOpen" :title="editingPatient ? 'Editar dados administrativos' : 'Novo paciente'" :before-close="confirmFormClose">
      <form ref="formRef" class="patient-form" @submit.prevent="savePatient">
        <p class="patient-form-note">Os dados são salvos no cadastro oficial compartilhado com a recepção. CPF e anotações clínicas não são coletados nesta tela.</p>
        <label><span>Nome completo <b>*</b></span><input v-model="form.name" type="text" minlength="2" maxlength="160" autocomplete="name" required></label>
        <div class="patient-form-grid">
          <label><span>Data de nascimento</span><input v-model="form.birth_date" type="date"></label>
          <label><span>Telefone com DDD <b>*</b></span><input v-model="form.phone" type="tel" inputmode="tel" minlength="10" maxlength="18" autocomplete="tel" required></label>
          <label><span>E-mail</span><input v-model="form.email" type="email" maxlength="254" autocomplete="email"></label>
          <label><span>Endereço</span><input v-model="form.address" type="text" maxlength="240" autocomplete="street-address"></label>
        </div>
        <label class="patient-consent"><input v-model="form.consent_given" type="checkbox"><span>Autorização administrativa registrada conforme o cadastro da clínica.</span></label>
        <p v-if="formError" class="patient-form-error" role="alert">{{ formError }}</p>
        <div class="patient-detail-actions"><UiButton type="button" variant="secondary" @click="formOpen = false">Cancelar</UiButton><UiButton type="submit" :loading="formPending">{{ editingPatient ? 'Salvar alterações' : 'Cadastrar paciente' }}</UiButton></div>
      </form>
      <template #footer><span></span></template>
    </UiDialog>
  </div>
</template>

<style scoped>
.manager-patients-page { min-height: 100vh; background: var(--color-background); color: var(--color-text); }
.manager-patients-main { display: grid; width: min(100% - 3rem, 88rem); gap: var(--space-5); margin: 0 auto; padding: var(--space-8) 0 var(--space-10); }
.manager-patients-intro, .patients-panel-heading, .patients-pagination, .patients-pagination > div, .patient-detail-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.manager-patients-intro { align-items: flex-end; }
.manager-patients-intro h1 { margin: 0; font-family: var(--font-heading); font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.15; }
.manager-patients-intro > div:first-child > p:last-child { margin: var(--space-2) 0 0; color: var(--color-text-secondary); }
.patients-eyebrow { margin: 0 0 var(--space-2); color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: .08em; }
.patients-intro-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.patients-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.patients-metric, .manager-patients-panel { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.patients-metric { display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: start; gap: var(--space-3); }
.patients-metric > div { display: grid; min-width: 0; gap: var(--space-1); }
.patients-metric > div > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.patients-metric > div > strong { font-family: var(--font-heading); font-size: 1.55rem; }
.patients-metric > div > small { color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.45; }
.patients-metric > button { grid-column: 2; justify-self: start; padding: 0; border: 0; background: none; color: var(--color-primary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); text-align: left; }
.patients-metric__icon { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: var(--radius-md); }
.patients-metric__icon--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.patients-metric__icon--green { background: var(--color-success-subtle); color: var(--color-success); }
.patients-metric__icon--violet { background: var(--color-violet-subtle); color: var(--color-violet); }
.patients-metric__icon--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.patients-skeleton { width: 3rem; height: 1.4rem; border-radius: var(--radius-sm); background: var(--color-surface-muted); animation: patients-pulse 1.2s ease-in-out infinite alternate; }
.patients-panel-heading { align-items: flex-start; margin-bottom: var(--space-4); }
.patients-panel-heading h2 { margin: 0; font-size: var(--font-size-lg); }
.patients-panel-heading p:not(.patients-eyebrow) { margin: .25rem 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-scope { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-scope svg { color: var(--color-primary); }
.patients-search-row { margin-bottom: var(--space-3); }
.patients-search { display: grid; max-width: 34rem; gap: var(--space-2); }
.patients-search > span:first-child, .patients-filters label > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.patients-search-input { display: flex; min-height: 2.7rem; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.patients-search-input:focus-within { border-color: var(--color-focus); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent); }
.patients-search-input input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.patients-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: var(--space-3); }
.patients-filters label { display: grid; min-width: 0; gap: var(--space-2); }
.patients-filters select, .patients-filters input { width: 100%; min-height: 2.65rem; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.patients-filter-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.patients-filter-error { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: var(--font-size-sm); }
.patients-filters input[aria-invalid="true"] { border-color: var(--color-danger); }
.patients-active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: var(--space-3) 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-active-filters span { padding: .25rem .55rem; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-background); }
.patients-table-wrap { overflow-x: auto; margin-top: var(--space-4); }
.patients-table { width: 100%; border-collapse: collapse; text-align: left; }
.patients-table th, .patients-table td { padding: var(--space-3); border-bottom: 1px solid var(--color-border); font-size: var(--font-size-xs); white-space: nowrap; }
.patients-table th { color: var(--color-text-secondary); font-weight: var(--font-weight-semibold); }
.patients-table th button { display: inline-flex; align-items: center; gap: .15rem; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; }
.patient-person { display: inline-flex; align-items: center; gap: var(--space-2); padding: 0; border: 0; background: none; color: var(--color-text); cursor: pointer; text-align: left; }
.patient-person > span:last-child { display: grid; gap: .15rem; }
.patient-person strong { font-size: var(--font-size-xs); }
.patient-person small { color: var(--color-text-muted); font-size: .68rem; }
.patient-completeness { display: inline-flex; padding: .25rem .55rem; border: 1px solid color-mix(in srgb, var(--color-success) 35%, var(--color-border)); border-radius: var(--radius-pill); background: var(--color-success-subtle); color: var(--color-success-strong); font-size: var(--font-size-xs); }
.patient-completeness--incomplete { border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); background: var(--color-warning-subtle); color: var(--color-warning); }
.patient-action { min-height: 2rem; padding: .35rem .65rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.patients-mobile-cards { display: none; }
.patients-pagination { padding-top: var(--space-4); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patients-pagination > div { gap: var(--space-2); }
.patients-pagination button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.patients-pagination button:disabled { cursor: not-allowed; opacity: .45; }
.patients-state { display: grid; min-height: 12rem; justify-items: center; align-content: center; gap: var(--space-2); padding: var(--space-5); color: var(--color-text-secondary); text-align: center; }
.patients-state > svg { color: var(--color-primary); }
.patients-state strong { color: var(--color-text); }
.patients-state p { max-width: 34rem; margin: 0; font-size: var(--font-size-sm); }
.patients-state--error > svg { color: var(--color-danger); }
.patients-loading { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
.patients-loading span { min-height: 3.2rem; border-radius: var(--radius-sm); background: var(--color-surface-muted); animation: patients-pulse 1.2s ease-in-out infinite alternate; }
.patients-disclaimer { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); }
.patients-disclaimer svg { flex: 0 0 auto; color: var(--color-primary); }
.patients-disclaimer p { margin: 0; font-size: var(--font-size-xs); line-height: 1.55; }
.patient-detail-header { justify-content: flex-start; padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
.patient-detail-header > div { display: grid; min-width: 0; flex: 1; gap: .2rem; }
.patient-detail-header h3 { margin: 0; font-size: var(--font-size-md); }
.patient-detail-header > div > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patient-detail-section { margin: var(--space-4) 0 var(--space-2); font-size: var(--font-size-sm); }
.patient-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.patient-detail-grid > div { min-width: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.patient-detail-grid dt { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.patient-detail-grid dd { overflow-wrap: anywhere; margin: .25rem 0 0; font-size: var(--font-size-sm); }
.patient-detail-grid__wide { grid-column: 1 / -1; }
.patient-detail-note, .patient-form-note { color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
.patient-detail-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.patient-form { display: grid; gap: var(--space-3); }
.patient-form > label, .patient-form-grid > label { display: grid; gap: var(--space-2); }
.patient-form label > span { color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.patient-form label b { color: var(--color-danger); }
.patient-form input:not([type="checkbox"]) { width: 100%; min-height: 2.65rem; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; }
.patient-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.patient-consent { display: flex !important; align-items: flex-start; gap: var(--space-2) !important; }
.patient-consent input { margin-top: .2rem; accent-color: var(--color-primary); }
.patient-form-error { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); }
.manager-patients-page :focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
@keyframes patients-pulse { to { opacity: .55; } }
@media (max-width: 64rem) {
  .patients-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .patients-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 48rem) {
  .manager-patients-main { width: min(100% - 1.5rem, 88rem); gap: var(--space-4); padding-top: var(--space-5); }
  .manager-patients-intro { align-items: flex-start; flex-direction: column; }
  .patients-intro-actions { width: 100%; }
  .patients-intro-actions > * { flex: 1; }
  .manager-patients-panel { padding: var(--space-4); }
  .patients-panel-heading { flex-direction: column; }
  .patients-table-wrap { display: none; }
  .patients-mobile-cards { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
  .patient-mobile-card { display: grid; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .patient-mobile-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
  .patient-mobile-card dl > div { min-width: 0; padding: .5rem; border-radius: var(--radius-sm); background: var(--color-background); }
  .patient-mobile-card dt { color: var(--color-text-secondary); font-size: .68rem; }
  .patient-mobile-card dd { overflow-wrap: anywhere; margin: .2rem 0 0; font-size: var(--font-size-xs); }
  .patient-mobile-card > .patient-action { min-height: 2.6rem; }
}
@media (max-width: 30rem) {
  .patients-metrics, .patients-filters, .patient-form-grid, .patient-detail-grid { grid-template-columns: 1fr; }
  .patients-filter-actions { grid-column: 1 / -1; }
  .patients-filter-actions > * { flex: 1; }
  .patients-pagination { align-items: flex-start; flex-direction: column; }
  .patients-intro-actions { flex-direction: column; }
  .patients-intro-actions > * { width: 100%; }
  .patient-detail-grid__wide { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .patients-skeleton, .patients-loading span { animation: none; }
}
</style>
