<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileClock,
  Plus,
  Search,
  UserRound,
  Users,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  createReceptionPatient,
  getPatientRegistry,
  getReceptionPatientAppointments,
  updateReceptionPatient,
} from '../services/reception'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiFormField from '../components/ui/UiFormField.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiTextarea from '../components/ui/UiTextarea.vue'
import UiToast from '../components/ui/UiToast.vue'

const router = useRouter()
const route = useRoute()
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
const patients = ref([])
const total = ref(0)
const metrics = ref(null)
const requestId = ref(0)
const quickSearch = ref('')
const filterName = ref('')
const filterCpf = ref('')
const filterPhone = ref('')
const createdFrom = ref('')
const createdTo = ref('')
const upcomingFilter = ref('')
const sortBy = ref('created_at')
const appliedFilters = ref({})
const dialogOpen = ref(false)
const isSaving = ref(false)
const attemptedSubmit = ref(false)
const selectedPatient = ref(null)
const form = ref(emptyPatient())
const initialForm = ref('')
const detailOpen = ref(false)
const detailPatient = ref(null)
const history = ref([])
const historyState = ref('idle')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const formDirty = computed(() => JSON.stringify(form.value) !== initialForm.value)

function emptyPatient() {
  return {
    name: '',
    cpf: '',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    administrative_notes: '',
    consent_given: false,
  }
}

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR').format(date)
}

function formatPhone(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value || '—'
}

function validCpf(value) {
  const cpf = value.replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digit = (length) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0)
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

function queryParams(offset = (page.value - 1) * pageSize) {
  return {
    q: quickSearch.value.trim() || undefined,
    name: appliedFilters.value.name || undefined,
    cpf: appliedFilters.value.cpf || undefined,
    phone: appliedFilters.value.phone || undefined,
    created_from: appliedFilters.value.created_from || undefined,
    created_to: appliedFilters.value.created_to || undefined,
    has_upcoming_appointment:
      appliedFilters.value.has_upcoming_appointment === ''
        ? undefined
        : appliedFilters.value.has_upcoming_appointment === 'yes',
    sort_by: sortBy.value,
    offset,
    limit: pageSize,
  }
}

async function loadPatients() {
  const currentRequest = ++requestId.value
  state.value = patients.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getPatientRegistry(queryParams())
    if (currentRequest !== requestId.value) return
    patients.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    state.value = 'ready'
  } catch (error) {
    if (currentRequest !== requestId.value) return
    state.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar os pacientes.')
    showToast(errorMessage.value, 'danger')
  }
}

function applyFilters() {
  appliedFilters.value = {
    name: filterName.value.trim(),
    cpf: filterCpf.value.replace(/\D/g, ''),
    phone: filterPhone.value.replace(/\D/g, ''),
    created_from: createdFrom.value,
    created_to: createdTo.value,
    has_upcoming_appointment: upcomingFilter.value,
  }
  page.value = 1
  void loadPatients()
}

function clearFilters() {
  quickSearch.value = ''
  filterName.value = ''
  filterCpf.value = ''
  filterPhone.value = ''
  createdFrom.value = ''
  createdTo.value = ''
  upcomingFilter.value = ''
  appliedFilters.value = {}
  page.value = 1
  void loadPatients()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadPatients()
}

function openCreateDialog() {
  selectedPatient.value = null
  form.value = emptyPatient()
  initialForm.value = JSON.stringify(form.value)
  attemptedSubmit.value = false
  dialogOpen.value = true
}

function openEditDialog(patient) {
  selectedPatient.value = patient
  form.value = {
    name: patient.name || '',
    cpf: patient.cpf || '',
    birth_date: patient.birth_date || '',
    phone: patient.phone || '',
    email: patient.email || '',
    address: patient.address || '',
    administrative_notes: patient.administrative_notes || '',
    consent_given: Boolean(patient.consent_given),
  }
  initialForm.value = JSON.stringify(form.value)
  attemptedSubmit.value = false
  dialogOpen.value = true
}

function confirmClosePatientForm() {
  return !formDirty.value || window.confirm('Descartar as alterações não salvas?')
}

function patientPayload() {
  return {
    name: form.value.name.trim(),
    cpf: form.value.cpf.trim() || null,
    birth_date: form.value.birth_date || null,
    phone: form.value.phone,
    email: form.value.email.trim() || null,
    address: form.value.address.trim() || null,
    administrative_notes: form.value.administrative_notes.trim() || null,
    consent_given: form.value.consent_given,
  }
}

async function savePatient(scheduleAfterSave = false) {
  attemptedSubmit.value = true
  const phoneDigits = form.value.phone.replace(/\D/g, '')
  const emailValid =
    !form.value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())
  const cpfValid = !form.value.cpf || validCpf(form.value.cpf)
  if (
    form.value.name.trim().length < 2 ||
    phoneDigits.length < 10 ||
    phoneDigits.length > 13 ||
    !emailValid ||
    !cpfValid ||
    !form.value.consent_given
  ) {
    return
  }
  isSaving.value = true
  try {
    const patient = selectedPatient.value
      ? await updateReceptionPatient(selectedPatient.value.id, patientPayload())
      : await createReceptionPatient(patientPayload())
    dialogOpen.value = false
    showToast(
      selectedPatient.value ? 'Cadastro atualizado com sucesso.' : 'Paciente cadastrado com sucesso.',
      'success',
    )
    await loadPatients()
    if (scheduleAfterSave && !selectedPatient.value) {
      await router.push({
        name: 'reception-agenda',
        query: { patientId: String(patient.id), date: toDateInput(today) },
      })
    }
  } catch (error) {
    showToast(
      getApiErrorMessage(
        error,
        error.response?.status === 409
          ? 'Já existe um cadastro com esses dados nesta clínica.'
          : 'Não foi possível salvar o cadastro.',
      ),
      'danger',
    )
  } finally {
    isSaving.value = false
  }
}

async function openDetails(patient) {
  detailPatient.value = patient
  history.value = []
  historyState.value = 'loading'
  detailOpen.value = true
  try {
    history.value = await getReceptionPatientAppointments(patient.id)
    historyState.value = history.value.length ? 'ready' : 'empty'
  } catch (error) {
    historyState.value = 'error'
    showToast(getApiErrorMessage(error, 'Não foi possível carregar o histórico administrativo.'), 'danger')
  }
}

function schedulePatient(patient) {
  void router.push({
    name: 'reception-agenda',
    query: { patientId: String(patient.id), date: toDateInput(today) },
  })
}

function handleNavigation(id) {
  if (id === 'overview') void router.push({ name: 'reception-dashboard' })
  else if (id === 'schedule') void router.push({ name: 'reception-agenda' })
  else if (id === 'checkin') void router.push({ name: 'reception-checkin' })
  else if (id === 'confirmations') void router.push({ name: 'reception-confirmations' })
  else if (id === 'history') void router.push({ name: 'reception-history' })
  else if (id === 'patient-list') return
  else showToast('Esta área ainda não está disponível.', 'info')
}

function appointmentStatusVariant(status) {
  if (status === 'Concluída' || status === 'Confirmada') return 'success'
  if (status === 'Cancelada' || status === 'Não compareceu') return 'danger'
  if (status === 'Em espera' || status === 'Aguardando chegada') return 'warning'
  return 'info'
}

onMounted(async () => {
  await loadPatients()
  const patientId = route.query.patientId
  if (typeof patientId !== 'string' || !/^\d+$/.test(patientId)) return
  let patient = patients.value.find((item) => item.id === Number(patientId))
  if (!patient) {
    try {
      const result = await getPatientRegistry({ q: patientId, limit: 1, offset: 0 })
      patient = result.items.find((item) => item.id === Number(patientId))
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível localizar o cadastro do paciente.'), 'danger')
      return
    }
  }
  if (patient) void openDetails(patient)
  else showToast('Cadastro do paciente não encontrado.', 'warning')
})
</script>

<template>
  <div class="patients-page">
    <ReceptionShell
      active-page="patient-list"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="patients-main">
      <section class="patients-intro" aria-labelledby="patients-title">
        <div>
          <p class="patients-eyebrow">GESTÃO DA CLÍNICA</p>
          <h1 id="patients-title">Pacientes</h1>
          <p>Gerencie os cadastros e as informações dos pacientes</p>
        </div>
        <UiButton @click="openCreateDialog">
          <template #start><Plus :size="17" aria-hidden="true" /></template>
          Novo paciente
        </UiButton>
      </section>

      <section class="patients-metrics" aria-label="Resumo de pacientes">
        <article class="patients-metric">
          <span class="patients-metric__icon patients-metric__icon--blue"><Users :size="18" aria-hidden="true" /></span>
          <div><span>Total de pacientes</span><strong>{{ metrics?.total ?? '—' }}</strong></div>
        </article>
        <article class="patients-metric">
          <span class="patients-metric__icon patients-metric__icon--green"><UserRound :size="18" aria-hidden="true" /></span>
          <div><span>Cadastrados neste mês</span><strong>{{ metrics?.registered_this_month ?? '—' }}</strong></div>
        </article>
        <article class="patients-metric">
          <span class="patients-metric__icon patients-metric__icon--violet"><CalendarDays :size="18" aria-hidden="true" /></span>
          <div><span>Com consulta futura</span><strong>{{ metrics?.with_upcoming_appointments ?? '—' }}</strong></div>
        </article>
        <article class="patients-metric patients-metric--unavailable" title="Este dado ainda não é fornecido pelo sistema">
          <span class="patients-metric__icon patients-metric__icon--amber"><CircleAlert :size="18" aria-hidden="true" /></span>
          <div><span>Precisam de atualização</span><strong aria-label="Dado indisponível">—</strong></div>
        </article>
      </section>

      <section class="patients-panel" aria-labelledby="patients-list-title">
        <div class="patients-panel__heading">
          <div>
            <p class="patients-eyebrow">CADASTROS</p>
            <h2 id="patients-list-title">Lista de pacientes</h2>
            <p>{{ total }} registro(s) encontrado(s)</p>
          </div>
          <label class="patients-search">
            <Search :size="17" aria-hidden="true" />
            <span class="visually-hidden">Pesquisa rápida</span>
            <input
              v-model="quickSearch"
              type="search"
              placeholder="Nome, telefone, CPF ou código..."
              @keyup.enter="applyFilters"
            />
          </label>
        </div>

        <form class="patients-filters" @submit.prevent="applyFilters">
          <label class="patients-filter">
            <span>Nome</span>
            <input v-model="filterName" type="search" autocomplete="off" />
          </label>
          <label class="patients-filter">
            <span>CPF</span>
            <input v-model="filterCpf" inputmode="numeric" autocomplete="off" />
          </label>
          <label class="patients-filter">
            <span>Telefone</span>
            <input v-model="filterPhone" type="tel" autocomplete="off" />
          </label>
          <label class="patients-filter">
            <span>Cadastro a partir de</span>
            <input v-model="createdFrom" type="date" />
          </label>
          <label class="patients-filter">
            <span>Até</span>
            <input v-model="createdTo" type="date" />
          </label>
          <label class="patients-filter">
            <span>Consulta futura</span>
            <select v-model="upcomingFilter">
              <option value="">Todos</option>
              <option value="yes">Com consulta futura</option>
              <option value="no">Sem consulta futura</option>
            </select>
          </label>
          <label class="patients-filter patients-filter--sort">
            <span>Ordenar por</span>
            <select v-model="sortBy" @change="page = 1; loadPatients()">
              <option value="created_at">Cadastro recente</option>
              <option value="name">Nome</option>
            </select>
          </label>
          <div class="patients-filter-actions">
            <UiButton type="submit" size="sm">Filtrar</UiButton>
            <UiButton type="button" size="sm" variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
          </div>
        </form>

        <div v-if="state === 'loading'" class="patients-state" role="status">
          <span class="patients-spinner" aria-hidden="true"></span>
          <strong>Carregando pacientes</strong>
        </div>
        <div v-else-if="state === 'error'" class="patients-state patients-state--error" role="alert">
          <CircleAlert :size="24" aria-hidden="true" />
          <strong>Não foi possível carregar a lista</strong>
          <p>{{ errorMessage }}</p>
          <UiButton variant="secondary" size="sm" @click="loadPatients">Tentar novamente</UiButton>
        </div>
        <div v-else-if="!patients.length" class="patients-state">
          <Users :size="26" aria-hidden="true" />
          <strong>{{ metrics?.total ? 'Nenhum paciente encontrado' : 'Ainda não há pacientes cadastrados' }}</strong>
          <p>{{ metrics?.total ? 'Ajuste os filtros e tente novamente.' : 'Cadastre o primeiro paciente para organizar os registros da clínica.' }}</p>
          <UiButton v-if="!metrics?.total" size="sm" @click="openCreateDialog">Cadastrar paciente</UiButton>
        </div>

        <template v-else>
          <div class="patients-table-wrap" :aria-busy="state === 'refreshing'">
            <table class="patients-table">
              <thead>
                <tr>
                  <th scope="col">Paciente</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Nascimento</th>
                  <th scope="col">Cadastro</th>
                  <th scope="col">Última consulta</th>
                  <th scope="col">Cadastro</th>
                  <th scope="col"><span class="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="patient in patients" :key="patient.id">
                  <td data-label="Paciente">
                    <button class="patient-cell" type="button" @click="openDetails(patient)">
                      <UiAvatar :name="patient.name" size="sm" />
                      <span><strong>{{ patient.name }}</strong><small>ID {{ patient.id }}</small></span>
                    </button>
                  </td>
                  <td data-label="Telefone">{{ formatPhone(patient.phone) }}</td>
                  <td data-label="E-mail" class="patient-email">{{ patient.email || '—' }}</td>
                  <td data-label="Nascimento">{{ formatDate(patient.birth_date) }}</td>
                  <td data-label="Cadastro">{{ formatDate(patient.created_at) }}</td>
                  <td data-label="Última consulta">{{ formatDate(patient.last_appointment_date) }}</td>
                  <td data-label="Situação">
                    <UiBadge :variant="patient.consent_given ? 'success' : 'warning'">
                      {{ patient.consent_given ? 'Autorização registrada' : 'Autorização pendente' }}
                    </UiBadge>
                  </td>
                  <td data-label="Ações" class="patient-actions">
                    <button class="patient-action" type="button" :aria-label="`Ver cadastro de ${patient.name}`" @click="openDetails(patient)">Ver</button>
                    <button class="patient-action" type="button" :aria-label="`Editar cadastro de ${patient.name}`" @click="openEditDialog(patient)">Editar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="patients-cards">
            <article v-for="patient in patients" :key="patient.id" class="patient-card">
              <div class="patient-card__heading">
                <UiAvatar :name="patient.name" size="sm" />
                <div><strong>{{ patient.name }}</strong><span>ID {{ patient.id }}</span></div>
                <UiBadge :variant="patient.consent_given ? 'success' : 'warning'">
                  {{ patient.consent_given ? 'Autorização registrada' : 'Pendente' }}
                </UiBadge>
              </div>
              <dl>
                <div><dt>Telefone</dt><dd>{{ formatPhone(patient.phone) }}</dd></div>
                <div><dt>E-mail</dt><dd>{{ patient.email || '—' }}</dd></div>
                <div><dt>Nascimento</dt><dd>{{ formatDate(patient.birth_date) }}</dd></div>
                <div><dt>Cadastro</dt><dd>{{ formatDate(patient.created_at) }}</dd></div>
              </dl>
              <div class="patient-card__actions">
                <UiButton size="sm" variant="secondary" @click="openDetails(patient)">Ver cadastro</UiButton>
                <UiButton size="sm" @click="openEditDialog(patient)">Editar</UiButton>
              </div>
            </article>
          </div>
          <nav class="patients-pagination" aria-label="Paginação de pacientes">
            <span>Mostrando {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} de {{ total }}</span>
            <div>
              <button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="17" /></button>
              <span>Página {{ page }} de {{ pageCount }}</span>
              <button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="changePage(page + 1)"><ChevronRight :size="17" /></button>
            </div>
          </nav>
        </template>
      </section>

      <footer class="patients-footer">
        <span><FileClock :size="14" aria-hidden="true" /> Acesso restrito aos dados administrativos autorizados.</span>
        <span>Zen · Gestão odontológica</span>
      </footer>
    </main>

    <UiDialog
      v-model="dialogOpen"
      :title="selectedPatient ? 'Editar cadastro' : 'Novo paciente'"
      :before-close="confirmClosePatientForm"
    >
      <form class="patient-form" novalidate @submit.prevent="savePatient">
        <p class="patient-form__notice">Informe somente os dados necessários para o cadastro administrativo.</p>
        <h3>Dados pessoais e contato</h3>
        <div class="patient-form__grid">
          <UiFormField
            label="Nome completo"
            required
            :error="attemptedSubmit && form.name.trim().length < 2 ? 'Informe o nome completo.' : ''"
          >
            <template #default="{ id, describedBy, invalid }">
              <UiInput :id="id" v-model="form.name" autocomplete="name" required :aria-describedby="describedBy" :invalid="invalid" />
            </template>
          </UiFormField>
          <UiFormField
            label="CPF"
            hint="Opcional, se necessário à clínica."
            :error="attemptedSubmit && form.cpf && !validCpf(form.cpf) ? 'Confira o CPF informado.' : ''"
          >
            <template #default="{ id, describedBy, invalid }">
              <UiInput :id="id" v-model="form.cpf" inputmode="numeric" autocomplete="off" :aria-describedby="describedBy" :invalid="invalid" />
            </template>
          </UiFormField>
          <UiFormField label="Data de nascimento">
            <template #default="{ id }"><UiInput :id="id" v-model="form.birth_date" type="date" /></template>
          </UiFormField>
          <UiFormField
            label="Telefone principal"
            required
            :error="attemptedSubmit && !/^\d{10,13}$/.test(form.phone.replace(/\D/g, '')) ? 'Informe um telefone válido com DDD.' : ''"
          >
            <template #default="{ id, describedBy, invalid }">
              <UiInput :id="id" v-model="form.phone" type="tel" autocomplete="tel" placeholder="(00) 00000-0000" required :aria-describedby="describedBy" :invalid="invalid" />
            </template>
          </UiFormField>
          <UiFormField
            label="E-mail"
            :error="attemptedSubmit && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? 'Informe um e-mail válido.' : ''"
          >
            <template #default="{ id, describedBy, invalid }">
              <UiInput :id="id" v-model="form.email" type="email" autocomplete="email" :aria-describedby="describedBy" :invalid="invalid" />
            </template>
          </UiFormField>
          <UiFormField label="Endereço">
            <template #default="{ id }"><UiInput :id="id" v-model="form.address" autocomplete="street-address" /></template>
          </UiFormField>
        </div>
        <UiFormField label="Observações administrativas">
          <template #default="{ id }"><UiTextarea :id="id" v-model="form.administrative_notes" :rows="3" /></template>
        </UiFormField>
        <label class="patient-consent">
          <input v-model="form.consent_given" type="checkbox" />
          <span>Autorização para registro administrativo confirmada conforme a política aplicável.</span>
        </label>
        <p v-if="attemptedSubmit && !form.consent_given" class="patient-form__error" role="alert">
          Confirme a autorização para registrar os dados.
        </p>
        <div class="patient-form__actions">
          <UiButton variant="secondary" @click="confirmClosePatientForm() && (dialogOpen = false)">Cancelar</UiButton>
          <UiButton v-if="!selectedPatient" variant="secondary" :loading="isSaving" @click="savePatient(true)">Salvar e agendar</UiButton>
          <UiButton type="submit" :loading="isSaving">{{ selectedPatient ? 'Salvar alterações' : 'Salvar paciente' }}</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="detailOpen" :title="detailPatient?.name || 'Dados do paciente'">
      <div v-if="detailPatient" class="patient-detail">
        <div class="patient-detail__identity">
          <UiAvatar :name="detailPatient.name" size="lg" />
          <div><strong>{{ detailPatient.name }}</strong><span>Paciente ID {{ detailPatient.id }}</span></div>
          <UiBadge :variant="detailPatient.consent_given ? 'success' : 'warning'">
            {{ detailPatient.consent_given ? 'Autorização registrada' : 'Autorização pendente' }}
          </UiBadge>
        </div>
        <dl class="patient-detail__grid">
          <div><dt>Telefone</dt><dd>{{ formatPhone(detailPatient.phone) }}</dd></div>
          <div><dt>E-mail</dt><dd>{{ detailPatient.email || 'Não informado' }}</dd></div>
          <div><dt>CPF</dt><dd>{{ detailPatient.cpf || 'Não informado' }}</dd></div>
          <div><dt>Nascimento</dt><dd>{{ formatDate(detailPatient.birth_date) }}</dd></div>
          <div><dt>Data do cadastro</dt><dd>{{ formatDate(detailPatient.created_at) }}</dd></div>
          <div><dt>Última consulta</dt><dd>{{ formatDate(detailPatient.last_appointment_date) }}</dd></div>
          <div class="patient-detail__wide"><dt>Endereço</dt><dd>{{ detailPatient.address || 'Não informado' }}</dd></div>
          <div class="patient-detail__wide"><dt>Observações administrativas</dt><dd>{{ detailPatient.administrative_notes || 'Nenhuma observação registrada.' }}</dd></div>
        </dl>
        <section class="patient-history" aria-labelledby="patient-history-title">
          <h3 id="patient-history-title">Histórico administrativo de consultas</h3>
          <div v-if="historyState === 'loading'" class="patient-history__state" role="status">Carregando histórico...</div>
          <div v-else-if="historyState === 'error'" class="patient-history__state" role="alert">Não foi possível carregar o histórico. Tente novamente mais tarde.</div>
          <div v-else-if="historyState === 'empty'" class="patient-history__state">Nenhuma consulta vinculada ao cadastro.</div>
          <ul v-else class="patient-history__list">
            <li v-for="appointment in history" :key="appointment.id">
              <span class="patient-history__date">{{ formatDate(appointment.appointment_date) }} · {{ appointment.appointment_time.slice(0, 5) }}</span>
              <span><strong>{{ appointment.procedure }}</strong><small>{{ appointment.dentist_name }}</small></span>
              <UiBadge :variant="appointmentStatusVariant(appointment.status)">{{ appointment.status }}</UiBadge>
            </li>
          </ul>
        </section>
        <p class="patient-detail__notice">Este histórico contém somente dados administrativos. Informações clínicas e prontuários não são exibidos neste perfil.</p>
        <div class="patient-form__actions">
          <UiButton variant="secondary" @click="openEditDialog(detailPatient); detailOpen = false">Editar cadastro</UiButton>
          <UiButton @click="schedulePatient(detailPatient)">Novo agendamento</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiToast :key="toastKey" v-model="toastVisible" :message="toastMessage" :variant="toastVariant" />
  </div>
</template>

<style scoped>
.patients-page{min-height:100vh;background:var(--color-page,#f5f7fb);color:var(--color-text,#193343)}
.patients-main{width:min(100% - 2 * clamp(var(--space-4),4vw,var(--space-10)),90rem);margin-inline:auto;padding-block:var(--space-6) var(--space-8)}
.patients-intro,.patients-panel__heading,.patients-metric,.patients-pagination,.patients-pagination>div,.patients-footer,.patient-cell,.patient-card__heading,.patient-card__actions,.patient-detail__identity,.patient-history__list li{display:flex;align-items:center}
.patients-intro{justify-content:space-between;gap:var(--space-5);margin-bottom:var(--space-6)}
.patients-eyebrow{margin:0 0 var(--space-1);color:var(--color-primary);font-size:.6875rem;font-weight:var(--font-weight-bold);letter-spacing:var(--letter-spacing-wide)}
.patients-intro h1{margin:0;font-family:var(--font-heading);font-size:clamp(1.5rem,2.5vw,1.875rem);font-weight:var(--font-weight-semibold);letter-spacing:var(--letter-spacing-tight);line-height:var(--line-height-tight)}
.patients-intro>div>p:last-child{margin:.5rem 0 0;color:var(--color-text-secondary);font-size:var(--font-size-sm)}
.patients-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-4);margin-bottom:var(--space-5)}
.patients-metric,.patients-panel{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-sm)}
.patients-metric{min-width:0;min-height:6rem;gap:var(--space-3);padding:var(--space-4)}
.patients-metric__icon{display:grid;width:2.5rem;height:2.5rem;flex:0 0 auto;place-items:center;border-radius:var(--radius-md)}
.patients-metric__icon--blue{background:var(--color-blue-50);color:var(--color-primary)}.patients-metric__icon--green{background:var(--color-success-subtle);color:var(--color-success-strong)}.patients-metric__icon--violet{background:var(--color-violet-subtle);color:var(--color-violet)}.patients-metric__icon--amber{background:var(--color-warning-subtle);color:var(--color-warning)}
.patients-metric>div{display:grid;min-width:0;gap:.2rem}.patients-metric>div>span{color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.3}.patients-metric strong{font-family:var(--font-heading);font-size:var(--font-size-2xl);font-weight:var(--font-weight-semibold);line-height:1.15}
.patients-metric--unavailable{cursor:help}
.patients-panel{min-width:0;padding:var(--space-5)}
.patients-panel__heading{justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-4)}
.patients-panel__heading h2{margin:0;font-family:var(--font-heading);font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold)}
.patients-panel__heading>div>p:last-child{margin:.25rem 0 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.patients-search{display:flex;width:min(100%,24rem);min-height:2.65rem;align-items:center;gap:.55rem;padding-inline:.75rem;border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-muted)}
.patients-search:focus-within{border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-focus-ring)}
.patients-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-sm)}
.patients-search input::placeholder{color:var(--color-text-muted)}
.patients-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-3);margin-bottom:var(--space-4);padding:var(--space-3);border-radius:var(--radius-md);background:var(--color-page,#f5f7fb)}
.patients-filter{display:grid;min-width:0;gap:.3rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);font-weight:var(--font-weight-medium)}
.patients-filter input,.patients-filter select{width:100%;min-width:0;height:2.5rem;padding-inline:.65rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:var(--font-size-sm)}
.patients-filter input:focus-visible,.patients-filter select:focus-visible,.patients-search input:focus-visible{outline:3px solid var(--color-blue-300);outline-offset:2px}
.patients-filter-actions{display:flex;align-items:flex-end;gap:.5rem}
.patients-state{display:grid;min-height:14rem;align-content:center;justify-items:center;gap:var(--space-2);color:var(--color-text-secondary);text-align:center}
.patients-state>svg{color:var(--color-primary)}.patients-state strong{color:var(--color-text);font-size:var(--font-size-sm)}.patients-state p{max-width:32rem;margin:0 0 var(--space-2);font-size:var(--font-size-sm)}
.patients-state--error>svg{color:var(--color-danger)}
.patients-spinner{width:1.5rem;height:1.5rem;border:2px solid var(--color-blue-100);border-top-color:var(--color-primary);border-radius:50%;animation:patients-spin .7s linear infinite}
@keyframes patients-spin{to{transform:rotate(360deg)}}
.patients-table-wrap{overflow-x:auto}
.patients-table{width:100%;border-collapse:collapse;text-align:left;font-size:var(--font-size-xs)}
.patients-table th{padding:.7rem .6rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-size:.68rem;font-weight:var(--font-weight-semibold);white-space:nowrap}
.patients-table td{padding:.7rem .6rem;border-bottom:1px solid var(--color-gray-100);color:var(--color-text-secondary);vertical-align:middle}
.patients-table tbody tr:hover{background:var(--color-page,#f5f7fb)}
.patient-cell{gap:.65rem;padding:0;border:0;background:transparent;color:var(--color-text);text-align:left;cursor:pointer}
.patient-cell>span{display:grid;min-width:7rem;gap:.15rem}.patient-cell strong{font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold)}.patient-cell small{color:var(--color-text-muted);font-size:.65rem}
.patient-email{max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.patient-actions{white-space:nowrap}
.patient-action{padding:.35rem .45rem;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-primary);font:inherit;font-weight:var(--font-weight-semibold);cursor:pointer}
.patient-action:hover{background:var(--color-blue-50)}
.patients-cards{display:none}
.patients-pagination{justify-content:space-between;gap:var(--space-3);padding-top:var(--space-4);color:var(--color-text-muted);font-size:var(--font-size-xs)}
.patients-pagination>div{gap:.75rem}
.patients-pagination button{display:grid;width:2.25rem;height:2.25rem;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer}
.patients-pagination button:disabled{opacity:.45;cursor:not-allowed}
.patients-pagination button:focus-visible,.patient-action:focus-visible,.patient-cell:focus-visible{outline:3px solid var(--color-blue-300);outline-offset:2px}
.patients-footer{justify-content:space-between;gap:var(--space-3);padding:var(--space-4) 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.patients-footer span{display:flex;align-items:center;gap:.4rem}
.patient-form{display:grid;gap:var(--space-4)}
.patient-form__notice,.patient-detail__notice{margin:0;padding:.75rem;border-radius:var(--radius-sm);background:var(--color-blue-50);color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5}
.patient-form h3,.patient-history h3{margin:0;font-family:var(--font-heading);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold)}
.patient-form__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)}
.patient-consent{display:flex;align-items:flex-start;gap:.6rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5;cursor:pointer}.patient-consent input{width:1rem;height:1rem;flex:0 0 auto;margin:.1rem 0 0;accent-color:var(--color-primary)}
.patient-form__error{margin:-.75rem 0 0;color:var(--color-danger);font-size:var(--font-size-xs)}
.patient-form__actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:var(--space-2);padding-top:var(--space-2)}
.patient-detail{display:grid;gap:var(--space-4)}
.patient-detail__identity{gap:var(--space-3);flex-wrap:wrap}
.patient-detail__identity>div{display:grid;flex:1;gap:.2rem}.patient-detail__identity>div strong{color:var(--color-text)}.patient-detail__identity>div span{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.patient-detail__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin:0}
.patient-detail__grid div{min-width:0}.patient-detail__grid dt{color:var(--color-text-muted);font-size:var(--font-size-xs)}.patient-detail__grid dd{margin:.25rem 0 0;color:var(--color-text);font-size:var(--font-size-sm);overflow-wrap:anywhere}
.patient-detail__wide{grid-column:1/-1}
.patient-history{display:grid;gap:var(--space-2)}
.patient-history__state{padding:.8rem;border-radius:var(--radius-sm);background:var(--color-page,#f5f7fb);color:var(--color-text-secondary);font-size:var(--font-size-xs)}
.patient-history__list{display:grid;max-height:16rem;gap:.4rem;overflow:auto;margin:0;padding:0;list-style:none}
.patient-history__list li{justify-content:space-between;gap:.75rem;padding:.65rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:var(--font-size-xs)}
.patient-history__date{min-width:7.5rem;color:var(--color-text-secondary)}
.patient-history__list li>span:nth-child(2){display:grid;flex:1;gap:.15rem}.patient-history__list small{color:var(--color-text-muted)}
@media(max-width:1100px){.patients-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.patients-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.patients-table{min-width:900px}}
@media(max-width:720px){.patients-main{width:calc(100% - 2 * var(--space-3));padding-block:var(--space-4)}.patients-intro{align-items:flex-start;flex-direction:column;gap:var(--space-3)}.patients-intro>.button{width:100%}.patients-metrics{gap:var(--space-2)}.patients-metric{min-height:5rem;padding:var(--space-3)}.patients-metric__icon{width:2.1rem;height:2.1rem}.patients-metric strong{font-size:var(--font-size-xl)}.patients-panel{padding:var(--space-3)}.patients-panel__heading{align-items:stretch;flex-direction:column}.patients-search{width:100%}.patients-filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);padding:var(--space-2)}.patients-filter-actions{grid-column:1/-1}.patients-table-wrap{display:none}.patients-cards{display:grid;gap:var(--space-3)}.patient-card{display:grid;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface)}.patient-card__heading{gap:.6rem;flex-wrap:wrap}.patient-card__heading>div{display:grid;min-width:0;flex:1;gap:.15rem}.patient-card__heading>div strong{overflow-wrap:anywhere;font-size:var(--font-size-sm)}.patient-card__heading>div span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.patient-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin:0}.patient-card dl div{min-width:0}.patient-card dt{color:var(--color-text-muted);font-size:.68rem}.patient-card dd{margin:.15rem 0 0;overflow-wrap:anywhere;color:var(--color-text);font-size:var(--font-size-xs)}.patient-card__actions>*{flex:1}.patients-pagination{align-items:flex-start;flex-direction:column}.patients-pagination>div{width:100%;justify-content:space-between}.patients-footer{align-items:flex-start;flex-direction:column}.patient-form__grid,.patient-detail__grid{grid-template-columns:minmax(0,1fr)}.patient-detail__wide{grid-column:auto}.patient-history__list li{align-items:flex-start;flex-wrap:wrap}.patient-history__date{min-width:unset}.patient-history__list li>span:nth-child(2){min-width:calc(100% - 1rem)}}
@media(max-width:420px){.patients-metrics{grid-template-columns:minmax(0,1fr)}.patients-filters{grid-template-columns:minmax(0,1fr)}.patients-filter-actions{grid-column:auto}.patients-filter-actions>*{flex:1}.patient-form__actions>*{flex:1}}
@media(prefers-reduced-motion:reduce){.patients-page *, .patients-page *::before,.patients-page *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
