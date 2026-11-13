<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  History,
  Info,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Undo2,
} from 'lucide-vue-next'
import DentistShell from '../components/DentistShell.vue'
import { dentistNavigationRoutes } from '../router/navigation'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiToothIcon from '../components/ui/UiToothIcon.vue'
import { getApiErrorMessage } from '../services/api'
import { getSessionUser } from '../services/auth-session'
import {
  createDentistPatientOdontogramEntry,
  getDentistPatientOdontogram,
  getDentistPatientOdontogramHistory,
  getDentistPatients,
} from '../services/dentist'

const route = useRoute()
const router = useRouter()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const permanentUpper = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const permanentLower = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
const primaryUpper = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65']
const primaryLower = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75']
const conditionOptions = [
  'Cárie',
  'Restauração existente',
  'Fratura ou alteração estrutural',
  'Ausência dentária',
  'Dente incluso ou impactado',
  'Tratamento endodôntico registrado',
  'Coroa ou prótese',
  'Implante',
]
const surfaceNames = {
  M: 'Mesial',
  D: 'Distal',
  B: 'Vestibular',
  L: 'Lingual',
  P: 'Palatina',
  O: 'Oclusal',
  I: 'Incisal',
}
const statusNames = {
  observed: 'Condição registrada',
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}
const patientSearch = ref('')
const patientOptions = ref([])
const patientSearchState = ref('idle')
const patientSearchError = ref('')
const patientPickerOpen = ref(false)
const chart = ref(null)
const currentUser = getSessionUser()
const chartState = ref('empty')
const chartError = ref('')
const selectedTooth = ref('')
const selectedSurfaceFilter = ref('')
const pendingEntries = ref([])
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')
const dentition = ref('permanent')
const region = ref('all')
const informationLayer = ref('all')
const dialogLegendOpen = ref(false)
const dialogHistoryOpen = ref(false)
const dialogRecordOpen = ref(false)
const recordFormTouched = ref(false)
const supersedesEntryId = ref(null)
const historyEntries = ref([])
const historyState = ref('idle')
const historyError = ref('')
const historyFilters = reactive({ tooth_number: '', record_type: '', dentist_id: '', since: '', until: '' })
const recordDraft = reactive({
  record_type: 'condition',
  label: '',
  status: 'observed',
  surfaces: [],
  note: '',
  record_date: getLocalDateKey(),
  appointment_id: '',
})
let patientSearchTimer
let patientRequestId = 0
let chartRequestId = 0
let historyRequestId = 0

const patientId = computed(() => Number(route.query.patientId) || null)
const isDirty = computed(() => pendingEntries.value.length > 0)
const hasUnsavedChanges = computed(() => isDirty.value || dialogRecordOpen.value)
const patientAge = computed(() => {
  const birthDate = chart.value?.patient.birth_date
  if (!birthDate) return null
  const birth = new Date(`${birthDate}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age -= 1
  return age >= 0 ? age : null
})
const visibleArches = computed(() => {
  const arches = []
  if (dentition.value !== 'primary') {
    arches.push(
      { id: 'permanent-upper', label: 'Arcada superior · permanente', upper: true, teeth: permanentUpper },
      { id: 'permanent-lower', label: 'Arcada inferior · permanente', upper: false, teeth: permanentLower },
    )
  }
  if (dentition.value !== 'permanent') {
    arches.push(
      { id: 'primary-upper', label: 'Arcada superior · decídua', upper: true, teeth: primaryUpper },
      { id: 'primary-lower', label: 'Arcada inferior · decídua', upper: false, teeth: primaryLower },
    )
  }
  return region.value === 'all'
    ? arches
    : arches.filter((arch) => (region.value === 'upper') === arch.upper)
})
const activeAppointment = computed(() => {
  const current = new Date()
  const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
  return chart.value?.appointments.find((appointment) =>
    appointment.appointment_date === today
    && ['Em atendimento', 'Em espera'].includes(appointment.status),
  )
})
const selectedToothEntries = computed(() => entriesForTooth(selectedTooth.value))
const selectedToothAllEntries = computed(() => allEntriesForTooth(selectedTooth.value))
const hasVisibleRecords = computed(() => chart.value?.entries.length > 0)
const chartLastUpdated = computed(() => {
  const value = chart.value?.patient.last_updated
  if (!value) return 'Sem registros anteriores'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
})
const canChooseSurface = computed(
  () => recordDraft.record_type === 'condition'
    ? !['Ausência dentária', 'Dente incluso ou impactado'].includes(recordDraft.label)
    : true,
)
const historyDentists = computed(() => {
  const providers = new Map()
  for (const entry of chart.value?.entries || []) providers.set(entry.dentist_id, entry.dentist_name)
  return [...providers].map(([id, name]) => ({ id, name }))
})
const appointmentOptions = computed(() => {
  const allAppointments = chart.value?.appointments || []
  return recordDraft.status === 'completed'
    ? allAppointments.filter((appointment) => appointment.status === 'Concluída')
    : allAppointments
})
const procedureStatusOptions = computed(() => {
  if (!supersedesEntryId.value) {
    return [
      { value: 'planned', label: 'Planejado' },
      { value: 'in_progress', label: 'Em andamento' },
      { value: 'completed', label: 'Concluído' },
      { value: 'cancelled', label: 'Cancelado' },
    ]
  }
  const previous = chart.value?.entries.find((entry) => entry.id === supersedesEntryId.value)
  return previous?.status === 'planned'
    ? [
        { value: 'in_progress', label: 'Em andamento' },
        { value: 'completed', label: 'Concluído' },
        { value: 'cancelled', label: 'Cancelado' },
      ]
    : [
        { value: 'completed', label: 'Concluído' },
        { value: 'cancelled', label: 'Cancelado' },
      ]
})

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(parsed)
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function getLocalDateKey() {
  const current = new Date()
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
}

function toothName(number) {
  const position = Number(number[1])
  const primary = Number(number[0]) >= 5
  const names = primary
    ? ['incisivo central', 'incisivo lateral', 'canino', 'primeiro molar', 'segundo molar']
    : ['incisivo central', 'incisivo lateral', 'canino', 'primeiro pré-molar', 'segundo pré-molar', 'primeiro molar', 'segundo molar', 'terceiro molar']
  return `${names[position - 1]} ${primary ? 'decíduo' : 'permanente'}`
}

function entriesForTooth(number) {
  return allEntriesForTooth(number).filter((entry) => {
    if (
      selectedSurfaceFilter.value
      && entry.surfaces?.length
      && !entry.surfaces.includes(selectedSurfaceFilter.value)
    ) return false
    if (informationLayer.value === 'all') return true
    if (informationLayer.value === 'conditions') return entry.record_type === 'condition'
    if (informationLayer.value === 'planned') return entry.status === 'planned' || entry.status === 'in_progress'
    return entry.status === 'completed'
  })
}

function allEntriesForTooth(number) {
  if (!chart.value || !number) return []
  const supersededIds = new Set([
    ...chart.value.entries,
    ...pendingEntries.value,
  ].map((entry) => entry.supersedes_entry_id).filter(Boolean))
  return [
    ...chart.value.entries.filter((entry) =>
      entry.tooth_number === number && !supersededIds.has(entry.id),
    ),
    ...pendingEntries.value.filter((entry) => entry.tooth_number === number),
  ]
}

function toothState(number) {
  const records = entriesForTooth(number)
  if (records.some((entry) => entry.label === 'Ausência dentária')) return 'absent'
  if (records.some((entry) => entry._pending)) return 'pending'
  if (records.some((entry) => entry.status === 'completed')) return 'completed'
  if (records.some((entry) => entry.status === 'planned' || entry.status === 'in_progress')) return 'planned'
  if (records.some((entry) => entry.status === 'cancelled')) return 'cancelled'
  if (records.length) return 'condition'
  return 'clear'
}

function toothDescription(number) {
  const records = entriesForTooth(number)
  const summary = records.length
    ? `${records.length} registro(s): ${records.map((entry) => entry.label).join(', ')}`
    : 'Sem registros'
  return `Dente ${number}, ${toothName(number)}. ${summary}.`
}

async function searchPatients() {
  const currentRequest = ++patientRequestId
  patientSearchState.value = 'loading'
  patientSearchError.value = ''
  try {
    const response = await getDentistPatients({
      q: patientSearch.value.trim() || undefined,
      limit: 100,
      sort_by: 'name',
    })
    if (currentRequest !== patientRequestId) return
    patientOptions.value = response.items
    patientSearchState.value = response.items.length ? 'ready' : 'empty'
  } catch (error) {
    if (currentRequest !== patientRequestId) return
    patientSearchState.value = 'error'
    patientSearchError.value = getApiErrorMessage(error, 'Não foi possível buscar pacientes autorizados.')
  }
}

function openPatientPicker() {
  patientPickerOpen.value = true
  if (patientSearchState.value === 'idle') void searchPatients()
}

function requestPatientSearch() {
  window.clearTimeout(patientSearchTimer)
  patientSearchTimer = window.setTimeout(() => void searchPatients(), 250)
}

async function loadChart(id) {
  const currentRequest = ++chartRequestId
  selectedTooth.value = ''
  chart.value = null
  saveError.value = ''
  saveSuccess.value = ''
  if (!id) {
    chartState.value = 'empty'
    return
  }
  chartState.value = 'loading'
  try {
    chart.value = await getDentistPatientOdontogram(id)
    if (currentRequest !== chartRequestId) return
    chartState.value = 'ready'
  } catch (error) {
    if (currentRequest !== chartRequestId) return
    chartState.value = 'error'
    chartError.value = error.response?.status === 403 || error.response?.status === 404
      ? 'Você não tem autorização para consultar o odontograma deste paciente.'
      : getApiErrorMessage(error, 'Não foi possível carregar o odontograma.')
  }
}

async function selectPatient(patient) {
  if (patientId.value === patient.id) {
    patientPickerOpen.value = false
    return
  }
  if (hasUnsavedChanges.value && !window.confirm('Há alterações não salvas. Deseja descartá-las e trocar de paciente?')) return
  pendingEntries.value = []
  dialogRecordOpen.value = false
  patientPickerOpen.value = false
  patientSearch.value = ''
  await router.push({ name: 'dentist-odontogram', query: { patientId: String(patient.id) } })
}

function selectTooth(number) {
  selectedTooth.value = number
  selectedSurfaceFilter.value = ''
  saveError.value = ''
}

function resetRecordDraft() {
  supersedesEntryId.value = null
  Object.assign(recordDraft, {
    record_type: 'condition',
    label: '',
    status: 'observed',
    surfaces: [],
    note: '',
    record_date: getLocalDateKey(),
    appointment_id: '',
  })
}

function openRecordForm(type) {
  if (!selectedTooth.value || !chart.value) return
  resetRecordDraft()
  recordDraft.record_type = type
  recordDraft.label = type === 'condition' ? conditionOptions[0] : ''
  recordDraft.status = type === 'condition' ? 'observed' : 'planned'
  recordFormTouched.value = false
  const appointmentContext = Number(route.query.appointmentId)
  if (chart.value.appointments.some((appointment) => appointment.id === appointmentContext)) {
    recordDraft.appointment_id = String(appointmentContext)
  }
  dialogRecordOpen.value = true
}

function closeRecordForm() {
  if (
    recordFormTouched.value
    && !window.confirm('Há alterações no formulário que ainda não foram adicionadas. Deseja descartá-las?')
  ) return false
  dialogRecordOpen.value = false
  recordFormTouched.value = false
  return true
}

function updateProcedureStatus(entry) {
  if (!['planned', 'in_progress'].includes(entry.status) || entry._pending) return
  openRecordForm('procedure')
  supersedesEntryId.value = entry.id
  recordDraft.label = entry.label
  recordDraft.status = entry.status === 'planned' ? 'in_progress' : 'completed'
  recordDraft.surfaces = [...entry.surfaces]
  recordDraft.note = entry.note || ''
  recordDraft.appointment_id = entry.appointment_id ? String(entry.appointment_id) : ''
}

function toggleSurface(surface) {
  if (!canChooseSurface.value) return
  recordDraft.surfaces = recordDraft.surfaces.includes(surface)
    ? recordDraft.surfaces.filter((item) => item !== surface)
    : [...recordDraft.surfaces, surface]
}

function currentSurfaces() {
  const isAnterior = Number(selectedTooth.value[1]) <= 3
  const palatal = ['1', '2', '5', '6'].includes(selectedTooth.value[0])
  return isAnterior
    ? ['M', 'D', 'B', palatal ? 'P' : 'L', 'I']
    : ['M', 'D', 'B', palatal ? 'P' : 'L', 'O']
}

function queueRecord() {
  if (saving.value || !recordDraft.label.trim()) return
  if (recordDraft.status === 'completed' && !recordDraft.appointment_id) return
  pendingEntries.value.push({
    request_id: crypto.randomUUID(),
    supersedes_entry_id: supersedesEntryId.value,
    expected_latest_id: chart.value.latest_entry_id,
    tooth_number: selectedTooth.value,
    record_type: recordDraft.record_type,
    label: recordDraft.label.trim(),
    status: recordDraft.status,
    surfaces: canChooseSurface.value ? [...recordDraft.surfaces] : [],
    note: recordDraft.note.trim() || null,
    record_date: recordDraft.record_date,
    appointment_id: recordDraft.appointment_id ? Number(recordDraft.appointment_id) : null,
    created_at: new Date().toISOString(),
    dentist_name: 'Você',
    _pending: true,
  })
  dialogRecordOpen.value = false
  recordFormTouched.value = false
  saveError.value = ''
  saveSuccess.value = ''
}

function undoLastChange() {
  if (!pendingEntries.value.length) return
  pendingEntries.value.pop()
  saveError.value = ''
  saveSuccess.value = ''
}

async function saveChanges() {
  if (saving.value || !pendingEntries.value.length || !chart.value) return
  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''
  try {
    while (pendingEntries.value.length) {
      const draft = pendingEntries.value[0]
      const saved = await createDentistPatientOdontogramEntry(chart.value.patient.id, {
        ...draft,
        expected_latest_id: chart.value.latest_entry_id,
        _pending: undefined,
        created_at: undefined,
        dentist_name: undefined,
      })
      chart.value.entries.unshift(saved)
      chart.value.latest_entry_id = saved.id
      chart.value.patient.last_updated = saved.created_at
      pendingEntries.value.shift()
    }
    saveSuccess.value = 'Alterações gravadas no histórico do odontograma.'
  } catch (error) {
    saveError.value = error.response?.status === 409
      ? 'Este odontograma mudou em outra sessão. Os registros pendentes foram preservados; atualize e tente novamente.'
      : getApiErrorMessage(error, 'Não foi possível salvar. Os registros pendentes foram preservados para nova tentativa.')
    if (error.response?.status === 409) await loadChart(patientId.value)
  } finally {
    saving.value = false
  }
}

async function reloadChart() {
  await loadChart(patientId.value)
}

async function openHistory() {
  if (!chart.value) return
  dialogHistoryOpen.value = true
  await loadHistory()
}

async function loadHistory() {
  const currentRequest = ++historyRequestId
  historyState.value = 'loading'
  historyError.value = ''
  const params = Object.fromEntries(
    Object.entries(historyFilters).filter(([, value]) => value),
  )
  try {
    historyEntries.value = await getDentistPatientOdontogramHistory(
      chart.value.patient.id,
      params,
    )
    if (currentRequest === historyRequestId) {
      historyState.value = historyEntries.value.length ? 'ready' : 'empty'
    }
  } catch (error) {
    if (currentRequest !== historyRequestId) return
    historyState.value = 'error'
    historyError.value = getApiErrorMessage(error, 'Não foi possível carregar o histórico.')
  }
}

function openPatientProfile() {
  if (!chart.value) return
  void router.push({
    name: 'dentist-patients',
    query: { patientId: String(chart.value.patient.id) },
  })
}

function handleNavigation(id) {
  const route = dentistNavigationRoutes[id]
  if (route && id !== 'odontogram' && hasUnsavedChanges.value) {
    if (!window.confirm('Há alterações não salvas. Deseja sair sem salvar?')) return
    pendingEntries.value = []
    dialogRecordOpen.value = false
  }
  if (route) void router.push({ name: route })
}

watch(patientSearch, requestPatientSearch)
watch(
  () => route.query.patientId,
  (value) => void loadChart(Number(value) || null),
  { immediate: true },
)
watch(
  () => recordDraft.record_type,
  (value) => {
    recordDraft.status = value === 'condition' ? 'observed' : 'planned'
  },
)
watch(
  () => recordDraft.status,
  (value) => {
    if (
      value === 'completed'
      && !chart.value?.appointments.some((appointment) =>
        String(appointment.id) === recordDraft.appointment_id
        && appointment.status === 'Concluída',
      )
    ) recordDraft.appointment_id = ''
  },
)
watch(
  () => recordDraft.label,
  () => {
    if (!canChooseSurface.value) recordDraft.surfaces = []
  },
)

onBeforeRouteLeave(() => {
  if (!hasUnsavedChanges.value) return true
  const shouldLeave = window.confirm('Há alterações não salvas. Deseja sair sem salvar?')
  if (shouldLeave) {
    pendingEntries.value = []
    dialogRecordOpen.value = false
  }
  return shouldLeave
})

onBeforeRouteUpdate((to) => {
  const nextPatientId = Number(to.query.patientId) || null
  if (nextPatientId === patientId.value || !hasUnsavedChanges.value) return true
  const shouldChange = window.confirm('Há alterações não salvas. Deseja descartá-las e trocar de paciente?')
  if (shouldChange) {
    pendingEntries.value = []
    dialogRecordOpen.value = false
  }
  return shouldChange
})

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  chartRequestId += 1
  patientRequestId += 1
  historyRequestId += 1
  window.clearTimeout(patientSearchTimer)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="dentist-odontogram-page">
    <DentistShell active-page="odontogram" :date-label="dateLabel" @navigate="handleNavigation" />

    <main class="odontogram-main">
      <header class="odontogram-intro">
        <div>
          <p class="odontogram-eyebrow">PORTAL CLÍNICO</p>
          <h1>Odontograma</h1>
          <p>Visualize e registre as condições odontológicas do paciente</p>
        </div>
        <span class="odontogram-access-note">
          <ShieldCheck :size="16" aria-hidden="true" />
          Acesso restrito aos pacientes da sua agenda
        </span>
      </header>

      <section v-if="!patientId" class="odontogram-picker-card" aria-labelledby="select-patient-title">
        <span class="odontogram-empty-icon"><Search :size="24" aria-hidden="true" /></span>
        <h2 id="select-patient-title">Selecione um paciente para visualizar o odontograma.</h2>
        <p>Busque pacientes autorizados vinculados à sua agenda.</p>
        <label class="odontogram-patient-search">
          <Search :size="18" aria-hidden="true" />
          <span class="visually-hidden">Buscar paciente por nome, CPF, telefone ou código</span>
          <input
            v-model="patientSearch"
            type="search"
            placeholder="Buscar paciente por nome, CPF, telefone ou código..."
            autocomplete="off"
          />
        </label>
        <div v-if="patientSearchState === 'loading'" class="odontogram-search-state" role="status">
          Buscando pacientes autorizados...
        </div>
        <div v-else-if="patientSearchState === 'error'" class="odontogram-search-state odontogram-search-state--error" role="alert">
          <span>{{ patientSearchError }}</span>
          <UiButton variant="secondary" size="sm" @click="searchPatients">
            <template #start><RefreshCw :size="14" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </div>
        <p v-else-if="patientSearchState === 'empty'" class="odontogram-search-state">
          Nenhum paciente encontrado. Confirme se há consultas vinculadas à sua agenda.
        </p>
        <ul v-else-if="patientSearchState === 'ready'" class="odontogram-patient-results" aria-label="Pacientes autorizados">
          <li v-for="patient in patientOptions" :key="patient.id">
            <button type="button" @click="selectPatient(patient)">
              <UiAvatar :name="patient.name" size="sm" />
              <span><strong>{{ patient.name }}</strong><small>Paciente #{{ patient.id }}</small></span>
              <span class="odontogram-patient-results__action">Abrir <ChevronDown :size="14" aria-hidden="true" /></span>
            </button>
          </li>
        </ul>
      </section>

      <template v-else>
        <section v-if="chartState === 'loading'" class="odontogram-loading" role="status" aria-label="Carregando odontograma">
          <span></span><span></span><span></span>
        </section>
        <section v-else-if="chartState === 'error'" class="odontogram-state odontogram-state--error" role="alert">
          <AlertCircle :size="22" aria-hidden="true" />
          <div><strong>Odontograma indisponível</strong><p>{{ chartError }}</p></div>
          <UiButton variant="secondary" @click="reloadChart">
            <template #start><RefreshCw :size="15" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </section>
        <template v-else-if="chart">
          <section class="odontogram-patient-card" aria-label="Paciente selecionado">
            <div class="odontogram-patient-identity">
              <UiAvatar :name="chart.patient.name" size="lg" />
              <div>
                <span class="odontogram-eyebrow">PACIENTE SELECIONADO</span>
                <h2>{{ chart.patient.name }}</h2>
                <p>
                  <span>Paciente #{{ chart.patient.id }}</span>
                  <span v-if="patientAge !== null">{{ patientAge }} anos</span>
                  <span v-if="chart.patient.birth_date">Nascimento {{ formatDate(chart.patient.birth_date) }}</span>
                  <span v-if="currentUser?.name">Dentista: {{ currentUser.name }}</span>
                </p>
              </div>
            </div>
            <div class="odontogram-patient-meta">
              <span><Clock3 :size="15" aria-hidden="true" /> Atualizado: {{ chartLastUpdated }}</span>
              <UiBadge v-if="activeAppointment" variant="info">
                {{ activeAppointment.status === 'Em espera' ? 'Aguardando atendimento' : activeAppointment.status }} · {{ activeAppointment.appointment_time.slice(0, 5) }}
              </UiBadge>
              <UiButton variant="tertiary" size="sm" @click="openPatientProfile">Voltar ao perfil</UiButton>
              <UiButton variant="secondary" size="sm" @click="openPatientPicker">Selecionar paciente</UiButton>
            </div>
          </section>

          <section v-if="patientPickerOpen" class="odontogram-inline-picker" aria-label="Selecionar outro paciente">
            <label class="odontogram-patient-search">
              <Search :size="18" aria-hidden="true" />
              <span class="visually-hidden">Buscar outro paciente</span>
              <input v-model="patientSearch" type="search" placeholder="Buscar outro paciente..." autocomplete="off" />
            </label>
            <button class="odontogram-picker-close" type="button" @click="patientPickerOpen = false">Cancelar</button>
            <ul v-if="patientSearchState === 'ready'" class="odontogram-patient-results">
              <li v-for="patient in patientOptions" :key="patient.id">
                <button type="button" @click="selectPatient(patient)">
                  <UiAvatar :name="patient.name" size="sm" />
                  <span><strong>{{ patient.name }}</strong><small>Paciente #{{ patient.id }}</small></span>
                </button>
              </li>
            </ul>
            <p v-else-if="patientSearchState === 'empty'" class="odontogram-search-state">Nenhum paciente encontrado.</p>
            <p v-else-if="patientSearchState === 'error'" class="odontogram-search-state odontogram-search-state--error">{{ patientSearchError }}</p>
            <p v-else-if="patientSearchState === 'loading'" class="odontogram-search-state" role="status">Buscando...</p>
          </section>

          <section class="odontogram-workspace">
            <div class="odontogram-chart-panel">
              <div class="odontogram-toolbar">
                <label>
                  <span>Dentição</span>
                  <select v-model="dentition">
                    <option value="permanent">Permanente</option>
                    <option value="primary">Decídua</option>
                    <option value="both">Ambas</option>
                  </select>
                </label>
                <label>
                  <span>Região</span>
                  <select v-model="region">
                    <option value="all">Odontograma completo</option>
                    <option value="upper">Arcada superior</option>
                    <option value="lower">Arcada inferior</option>
                  </select>
                </label>
                <label>
                  <span>Camada</span>
                  <select v-model="informationLayer">
                    <option value="all">Visão combinada</option>
                    <option value="conditions">Condições clínicas</option>
                    <option value="planned">Procedimentos planejados</option>
                    <option value="completed">Procedimentos concluídos</option>
                  </select>
                </label>
                <div class="odontogram-toolbar__actions">
                  <UiButton variant="secondary" size="sm" @click="dialogLegendOpen = true">
                    <template #start><Info :size="15" aria-hidden="true" /></template>
                    Legenda
                  </UiButton>
                  <UiButton variant="secondary" size="sm" @click="openHistory">
                    <template #start><History :size="15" aria-hidden="true" /></template>
                    Histórico
                  </UiButton>
                </div>
              </div>

              <div v-if="!hasVisibleRecords && !isDirty" class="odontogram-no-records" role="status">
                <Info :size="16" aria-hidden="true" />
                Ainda não existem condições ou procedimentos registrados para este paciente.
              </div>
              <div class="odontogram-orientation">
                <span>Vista do profissional · lado direito do paciente à esquerda</span>
                <span class="odontogram-orientation__scroll-hint">Deslize horizontalmente para ver toda a arcada</span>
                <span><i></i> Superior <i class="odontogram-orientation__lower"></i> Inferior</span>
              </div>
              <div class="odontogram-arches" aria-label="Odontograma FDI">
                <div v-for="arch in visibleArches" :key="arch.id" class="odontogram-arch">
                  <h3>{{ arch.label }}</h3>
                  <div class="odontogram-arch__teeth" :class="{ 'odontogram-arch__teeth--primary': arch.teeth.length === 10 }">
                    <div class="odontogram-quadrant">
                      <button
                        v-for="number in arch.teeth.slice(0, arch.teeth.length / 2)"
                        :key="number"
                        type="button"
                        class="odontogram-tooth"
                        :class="[
                          `odontogram-tooth--${toothState(number)}`,
                          { 'odontogram-tooth--selected': selectedTooth === number },
                        ]"
                        :aria-label="toothDescription(number)"
                        :aria-pressed="selectedTooth === number"
                        :title="toothDescription(number)"
                        @click="selectTooth(number)"
                      >
                        <span>{{ number }}</span>
                        <UiToothIcon :size="24" />
                        <i v-if="toothState(number) !== 'clear'" aria-hidden="true">{{ toothState(number) === 'absent' ? '×' : '•' }}</i>
                      </button>
                    </div>
                    <span class="odontogram-midline" aria-hidden="true"></span>
                    <div class="odontogram-quadrant">
                      <button
                        v-for="number in arch.teeth.slice(arch.teeth.length / 2)"
                        :key="number"
                        type="button"
                        class="odontogram-tooth"
                        :class="[
                          `odontogram-tooth--${toothState(number)}`,
                          { 'odontogram-tooth--selected': selectedTooth === number },
                        ]"
                        :aria-label="toothDescription(number)"
                        :aria-pressed="selectedTooth === number"
                        :title="toothDescription(number)"
                        @click="selectTooth(number)"
                      >
                        <span>{{ number }}</span>
                        <UiToothIcon :size="24" />
                        <i v-if="toothState(number) !== 'clear'" aria-hidden="true">{{ toothState(number) === 'absent' ? '×' : '•' }}</i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="odontogram-legend-inline" aria-label="Resumo da legenda">
                <span><i class="legend-dot legend-dot--clear"></i> Sem registro</span>
                <span><i class="legend-dot legend-dot--condition"></i> Condição</span>
                <span><i class="legend-dot legend-dot--planned"></i> Planejado</span>
                <span><i class="legend-dot legend-dot--completed"></i> Concluído</span>
                <span><i class="legend-dot legend-dot--pending"></i> Não salvo</span>
              </div>
            </div>

            <aside class="odontogram-tooth-panel" aria-live="polite">
              <template v-if="selectedTooth">
                <div class="odontogram-tooth-panel__heading">
                  <UiToothIcon :size="30" aria-hidden="true" />
                  <div><span>DENTE {{ selectedTooth }}</span><h2>{{ toothName(selectedTooth) }}</h2></div>
                </div>
                <div v-if="selectedToothEntries.length" class="odontogram-entry-list">
                  <h3>Registros deste dente</h3>
                  <article
                    v-for="entry in selectedToothEntries"
                    :key="entry.request_id || entry.id"
                    class="odontogram-entry"
                    :class="{ 'odontogram-entry--pending': entry._pending }"
                  >
                    <div class="odontogram-entry__top">
                      <strong>{{ entry.label }}</strong>
                      <UiBadge :variant="entry._pending ? 'warning' : entry.status === 'completed' ? 'success' : 'neutral'">
                        {{ entry._pending ? 'Não salvo' : statusNames[entry.status] }}
                      </UiBadge>
                    </div>
                    <span>{{ entry.record_type === 'condition' ? 'Condição clínica' : 'Procedimento' }} · {{ formatDate(entry.record_date) }}</span>
                    <span v-if="entry.surfaces?.length">Superfícies: {{ entry.surfaces.map((surface) => surfaceNames[surface]).join(', ') }}</span>
                    <span v-if="entry.dentist_name">Profissional: {{ entry.dentist_name }} · Registrado em {{ formatDateTime(entry.created_at) }}</span>
                    <p v-if="entry.note">{{ entry.note }}</p>
                    <UiButton
                      v-if="entry.record_type === 'procedure' && ['planned', 'in_progress'].includes(entry.status) && !entry._pending"
                      variant="tertiary"
                      size="sm"
                      @click="updateProcedureStatus(entry)"
                    >Atualizar situação</UiButton>
                  </article>
                </div>
                <p v-else-if="selectedSurfaceFilter && selectedToothAllEntries.length" class="odontogram-tooth-empty">
                  Nenhum registro associado à superfície {{ surfaceNames[selectedSurfaceFilter] }}.
                </p>
                <p v-else class="odontogram-tooth-empty">Nenhum registro associado a este dente.</p>

                <section class="odontogram-surface-section" aria-labelledby="surface-title">
                  <h3 id="surface-title">Superfícies dentárias</h3>
                  <p>Selecione uma ou mais superfícies no formulário de registro.</p>
                  <p v-if="selectedSurfaceFilter" class="odontogram-surface-selected">
                    Consultando: {{ surfaceNames[selectedSurfaceFilter] }}
                    <button type="button" @click="selectedSurfaceFilter = ''">Limpar</button>
                  </p>
                  <div class="odontogram-surface-map" aria-label="Superfícies aplicáveis ao dente">
                    <button
                      v-for="surface in currentSurfaces()"
                      :key="surface"
                      type="button"
                      :class="{ 'odontogram-surface-map__center': ['O', 'I'].includes(surface) }"
                      :aria-label="`${surfaceNames[surface]}: consultar registros`"
                      :title="surfaceNames[surface]"
                      :aria-pressed="selectedSurfaceFilter === surface"
                      @click="selectedSurfaceFilter = selectedSurfaceFilter === surface ? '' : surface"
                    >{{ surface }}</button>
                  </div>
                </section>

                <div class="odontogram-tooth-actions">
                  <UiButton size="sm" @click="openRecordForm('condition')">Registrar condição</UiButton>
                  <UiButton variant="secondary" size="sm" @click="openRecordForm('procedure')">Adicionar procedimento</UiButton>
                  <UiButton variant="tertiary" size="sm" @click="openHistory">Ver histórico do dente</UiButton>
                </div>
                <p class="odontogram-module-note">
                  Planos de tratamento e prontuário ainda não estão integrados. Procedimentos planejados são registros do odontograma e não criam um plano.
                </p>
              </template>
              <div v-else class="odontogram-tooth-placeholder">
                <UiToothIcon :size="32" aria-hidden="true" />
                <strong>Selecione um dente</strong>
                <span>Os detalhes e registros do dente aparecerão aqui.</span>
              </div>
            </aside>
          </section>

          <section class="odontogram-savebar" aria-live="polite">
            <span v-if="isDirty" class="odontogram-unsaved"><i></i> {{ pendingEntries.length ? `${pendingEntries.length} alteração(ões) não salva(s)` : 'Registro em edição' }}</span>
            <span v-else-if="saveSuccess" class="odontogram-saved"><Check :size="16" aria-hidden="true" /> {{ saveSuccess }}</span>
            <span v-else class="odontogram-savebar__quiet">Registros gravados são mantidos no histórico.</span>
            <span v-if="saveError" class="odontogram-save-error" role="alert">{{ saveError }}</span>
            <div class="odontogram-savebar__actions">
              <UiButton v-if="isDirty" variant="secondary" :disabled="saving" @click="undoLastChange">
                <template #start><Undo2 :size="15" aria-hidden="true" /></template>
                Desfazer
              </UiButton>
              <UiButton :disabled="!isDirty || saving" @click="saveChanges">
                <template #start><Save :size="15" aria-hidden="true" /></template>
                {{ saving ? 'Salvando...' : 'Salvar alterações' }}
              </UiButton>
            </div>
          </section>
        </template>
      </template>

      <p class="odontogram-footnote">
        <ShieldCheck :size="15" aria-hidden="true" />
        Cada registro é associado à dentista autenticada e preservado no histórico. Revise a identificação do paciente antes de salvar.
      </p>
    </main>

    <UiDialog v-model="dialogRecordOpen" :before-close="closeRecordForm" :title="supersedesEntryId ? 'Atualizar situação do procedimento' : recordDraft.record_type === 'condition' ? 'Registrar condição clínica' : 'Registrar procedimento'">
      <form class="odontogram-record-form" @submit.prevent="queueRecord" @input="recordFormTouched = true" @change="recordFormTouched = true">
        <div class="odontogram-record-context">
          <UiToothIcon :size="20" aria-hidden="true" />
          <span>Dente {{ selectedTooth }} · {{ toothName(selectedTooth) }}</span>
        </div>
        <label>
          <span>Tipo de registro</span>
          <select v-model="recordDraft.record_type" :disabled="saving">
            <option value="condition">Condição clínica observada</option>
            <option value="procedure">Procedimento</option>
          </select>
        </label>
        <label>
          <span>{{ recordDraft.record_type === 'condition' ? 'Condição' : 'Procedimento' }}</span>
          <select v-if="recordDraft.record_type === 'condition'" v-model="recordDraft.label" :disabled="saving">
            <option v-for="condition in conditionOptions" :key="condition" :value="condition">{{ condition }}</option>
          </select>
          <input v-else v-model="recordDraft.label" maxlength="120" required placeholder="Descreva o procedimento" :disabled="saving" />
        </label>
        <fieldset v-if="canChooseSurface" class="odontogram-surface-fieldset">
          <legend>Superfícies (opcional)</legend>
          <div>
            <label v-for="surface in currentSurfaces()" :key="surface" class="odontogram-surface-option">
              <input
                type="checkbox"
                :value="surface"
                :checked="recordDraft.surfaces.includes(surface)"
                :disabled="saving"
                @change="toggleSurface(surface)"
              />
              <span>{{ surfaceNames[surface] }}</span>
            </label>
          </div>
        </fieldset>
        <label v-if="recordDraft.record_type === 'procedure'">
          <span>Situação</span>
          <select v-model="recordDraft.status" :disabled="saving">
            <option v-for="option in procedureStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label>
          <span>{{ recordDraft.status === 'completed' ? 'Atendimento concluído relacionado' : 'Atendimento relacionado (opcional)' }}</span>
          <select v-model="recordDraft.appointment_id" :required="recordDraft.status === 'completed'" :disabled="saving">
            <option value="">{{ recordDraft.status === 'completed' ? 'Selecione um atendimento concluído' : 'Sem vínculo com atendimento' }}</option>
            <option v-for="appointment in appointmentOptions" :key="appointment.id" :value="String(appointment.id)">
              {{ formatDate(appointment.appointment_date) }} · {{ appointment.appointment_time.slice(0, 5) }} · {{ appointment.procedure }} · {{ appointment.status }}
            </option>
          </select>
          <small v-if="recordDraft.status === 'completed' && !appointmentOptions.length">Não há atendimento concluído disponível para vincular.</small>
        </label>
        <label>
          <span>Data do exame/registro</span>
          <input v-model="recordDraft.record_date" type="date" :max="getLocalDateKey()" required :disabled="saving" />
        </label>
        <label>
          <span>Observação clínica (opcional)</span>
          <textarea v-model="recordDraft.note" maxlength="2000" rows="3" placeholder="Anotação relevante para este registro" :disabled="saving"></textarea>
        </label>
        <p class="odontogram-form-note">
          {{ recordDraft.record_type === 'condition'
            ? 'A condição será registrada como observação clínica, sem diagnóstico automático.'
            : 'O registro não altera nem cria um plano de tratamento. Procedimentos concluídos exigem vínculo a um atendimento concluído.' }}
        </p>
        <footer class="odontogram-form-actions">
          <UiButton type="button" variant="secondary" :disabled="saving" @click="closeRecordForm">Cancelar</UiButton>
          <UiButton type="submit" :disabled="saving || !recordDraft.label.trim() || (recordDraft.status === 'completed' && !recordDraft.appointment_id)">
            {{ supersedesEntryId ? 'Adicionar atualização' : 'Adicionar às alterações' }}
          </UiButton>
        </footer>
      </form>
    </UiDialog>

    <UiDialog v-model="dialogLegendOpen" title="Legenda do odontograma">
      <ul class="odontogram-legend-dialog">
        <li><i class="legend-dot legend-dot--clear"></i><span><strong>Sem registro</strong><small>Nenhuma condição ou procedimento registrado.</small></span></li>
        <li><i class="legend-dot legend-dot--condition"></i><span><strong>Condição clínica</strong><small>Condição observada e registrada pela dentista.</small></span></li>
        <li><i class="legend-dot legend-dot--planned"></i><span><strong>Planejado / em andamento</strong><small>Procedimento registrado no odontograma, sem vínculo a um plano.</small></span></li>
        <li><i class="legend-dot legend-dot--completed"></i><span><strong>Procedimento concluído</strong><small>Vinculado a um atendimento concluído.</small></span></li>
        <li><i class="legend-dot legend-dot--pending"></i><span><strong>Alteração não salva</strong><small>Registro local aguardando confirmação da API.</small></span></li>
        <li><i class="legend-dot legend-dot--selected"></i><span><strong>Dente selecionado</strong><small>Realçado com contorno azul e indicador de foco.</small></span></li>
        <li><span class="odontogram-legend-dialog__cross">×</span><span><strong>Dente ausente</strong><small>Indicação textual registrada no dente.</small></span></li>
      </ul>
      <p class="odontogram-form-note">A numeração segue FDI. Os quadrantes 1–4 são permanentes e 5–8 decíduos; a representação é da perspectiva do profissional.</p>
    </UiDialog>

    <UiDialog v-model="dialogHistoryOpen" title="Histórico do odontograma">
      <div class="odontogram-history">
        <form class="odontogram-history-filters" @submit.prevent="loadHistory">
          <label><span>Dente</span><input v-model="historyFilters.tooth_number" inputmode="numeric" pattern="[1-8][1-8]" placeholder="Todos" /></label>
          <label>
            <span>Tipo de registro</span>
            <select v-model="historyFilters.record_type">
              <option value="">Todos</option><option value="condition">Condições</option><option value="procedure">Procedimentos</option>
            </select>
          </label>
          <label>
            <span>Profissional</span>
            <select v-model="historyFilters.dentist_id">
              <option value="">Todos</option>
              <option v-for="provider in historyDentists" :key="provider.id" :value="String(provider.id)">{{ provider.name }}</option>
            </select>
          </label>
          <label><span>De</span><input v-model="historyFilters.since" type="date" /></label>
          <label><span>Até</span><input v-model="historyFilters.until" type="date" /></label>
          <UiButton type="submit" size="sm">Filtrar</UiButton>
        </form>
        <p v-if="historyState === 'loading'" class="odontogram-history-state" role="status">Carregando histórico...</p>
        <div v-else-if="historyState === 'error'" class="odontogram-history-state odontogram-history-state--error" role="alert">
          <span>{{ historyError }}</span>
          <UiButton variant="secondary" size="sm" @click="loadHistory">Tentar novamente</UiButton>
        </div>
        <p v-else-if="historyState === 'empty'" class="odontogram-history-state">Nenhum registro encontrado para os filtros selecionados.</p>
        <ol v-else class="odontogram-history-list">
          <li v-for="entry in historyEntries" :key="entry.id">
            <span class="odontogram-history-list__marker" aria-hidden="true"></span>
            <div>
              <div class="odontogram-history-list__top"><strong>Dente {{ entry.tooth_number }} · {{ entry.label }}</strong><UiBadge variant="neutral">{{ statusNames[entry.status] }}</UiBadge></div>
              <span>{{ formatDateTime(entry.created_at) }} · {{ formatDate(entry.record_date) }} · {{ entry.record_type === 'condition' ? 'Condição clínica' : entry.supersedes_entry_id ? `Atualização do registro #${entry.supersedes_entry_id}` : 'Procedimento' }}</span>
              <span>Profissional: {{ entry.dentist_name }}</span>
              <span v-if="entry.appointment_date"><CalendarDays :size="13" aria-hidden="true" /> Atendimento de {{ formatDate(entry.appointment_date) }}</span>
              <p v-if="entry.note">{{ entry.note }}</p>
            </div>
          </li>
        </ol>
        <p class="odontogram-form-note">Exibindo até 200 registros mais recentes. Consultar o histórico não altera o estado atual.</p>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped>
.dentist-odontogram-page { min-height: 100vh; background: var(--color-page); }
.odontogram-main { width: min(100%, 100rem); margin-inline: auto; padding: clamp(var(--space-4), 3vw, var(--space-10)); }
.odontogram-intro, .odontogram-patient-card, .odontogram-patient-identity, .odontogram-patient-meta, .odontogram-toolbar, .odontogram-toolbar__actions, .odontogram-savebar, .odontogram-savebar__actions, .odontogram-tooth-panel__heading, .odontogram-entry__top, .odontogram-history-list__top { display: flex; align-items: center; }
.odontogram-intro { justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.odontogram-intro h1 { margin: 0; color: var(--color-text); font-family: var(--font-heading); font-size: clamp(1.75rem, 3vw, 2.25rem); letter-spacing: -.035em; }
.odontogram-intro p:not(.odontogram-eyebrow) { margin: var(--space-1) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.odontogram-eyebrow { margin: 0 0 var(--space-1); color: var(--color-text-muted); font-size: .65rem; font-weight: var(--font-weight-bold); letter-spacing: .12em; }
.odontogram-access-note { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-full); color: var(--color-text-secondary); font-size: var(--font-size-xs); white-space: nowrap; }
.odontogram-access-note svg { color: var(--color-success); }
.odontogram-picker-card { display: grid; justify-items: center; gap: var(--space-3); max-width: 44rem; margin: clamp(2rem, 8vh, 6rem) auto; padding: clamp(var(--space-5), 5vw, var(--space-10)); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); text-align: center; box-shadow: var(--shadow-sm); }
.odontogram-empty-icon { display: grid; width: 3.25rem; height: 3.25rem; place-items: center; border-radius: 50%; background: var(--color-primary-subtle); color: var(--color-primary); }
.odontogram-picker-card h2 { margin: 0; color: var(--color-text); font-size: var(--font-size-lg); }
.odontogram-picker-card > p { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.odontogram-patient-search { display: flex; width: min(100%, 36rem); min-height: 2.875rem; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-muted); }
.odontogram-patient-search:focus-within { border-color: var(--color-primary); outline: 3px solid color-mix(in srgb, var(--color-primary) 20%, transparent); }
.odontogram-patient-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-sm); }
.odontogram-search-state { display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-search-state--error { color: var(--color-danger); }
.odontogram-patient-results { display: grid; width: min(100%, 36rem); max-height: 18rem; gap: var(--space-1); overflow: auto; margin: 0; padding: 0; list-style: none; text-align: left; }
.odontogram-patient-results li > button { display: flex; width: 100%; min-height: 3.5rem; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid transparent; border-radius: var(--radius-md); background: var(--color-background); color: var(--color-text); cursor: pointer; text-align: left; }
.odontogram-patient-results li > button:hover, .odontogram-patient-results li > button:focus-visible { border-color: var(--color-primary); outline: 0; }
.odontogram-patient-results li > button > span:nth-child(2) { display: grid; flex: 1; gap: 2px; }
.odontogram-patient-results strong { font-size: var(--font-size-sm); }
.odontogram-patient-results small { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.odontogram-patient-results__action { display: flex; align-items: center; gap: 4px; color: var(--color-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); }
.odontogram-patient-results__action svg { transform: rotate(-90deg); }
.odontogram-patient-card { justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); padding: var(--space-4) var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.odontogram-patient-identity { min-width: 0; gap: var(--space-3); }
.odontogram-patient-identity > div { min-width: 0; }
.odontogram-patient-identity h2 { margin: 0; overflow-wrap: anywhere; color: var(--color-text); font-size: var(--font-size-lg); }
.odontogram-patient-identity p { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin: var(--space-1) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-patient-identity p span + span::before { content: '·'; margin-right: var(--space-3); color: var(--color-text-muted); }
.odontogram-patient-meta { flex-wrap: wrap; justify-content: flex-end; gap: var(--space-3); }
.odontogram-patient-meta > span { display: flex; align-items: center; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-inline-picker { display: grid; grid-template-columns: 1fr auto; gap: var(--space-2); margin-bottom: var(--space-4); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.odontogram-inline-picker .odontogram-patient-search, .odontogram-inline-picker .odontogram-patient-results, .odontogram-inline-picker > p { grid-column: 1 / -1; width: 100%; }
.odontogram-picker-close { justify-self: end; border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.odontogram-workspace { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(17rem, .8fr); align-items: start; gap: var(--space-4); }
.odontogram-chart-panel, .odontogram-tooth-panel { min-width: 0; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.odontogram-toolbar { flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--color-border); }
.odontogram-toolbar > label, .odontogram-record-form > label, .odontogram-history-filters > label { display: grid; min-width: 9rem; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-toolbar select, .odontogram-record-form select, .odontogram-record-form input, .odontogram-record-form textarea, .odontogram-history-filters input, .odontogram-history-filters select { min-height: 2.375rem; min-width: 0; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--font-size-xs); }
.odontogram-toolbar__actions { flex: 1; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
.odontogram-no-records { display: flex; align-items: flex-start; gap: var(--space-2); margin: var(--space-4) var(--space-4) 0; padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-background); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.45; }
.odontogram-no-records svg { flex: 0 0 auto; color: var(--color-primary); }
.odontogram-orientation { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4) 0; color: var(--color-text-muted); font-size: .6875rem; }
.odontogram-orientation__scroll-hint { display: none; }
.odontogram-orientation > span:last-child { display: flex; align-items: center; gap: var(--space-1); }
.odontogram-orientation i, .legend-dot { display: inline-block; width: .65rem; height: .65rem; border: 1px solid var(--color-border-strong, var(--color-border)); border-radius: 50%; background: var(--color-surface); }
.odontogram-orientation__lower { margin-left: var(--space-2); background: var(--color-background) !important; }
.odontogram-arches { display: grid; gap: var(--space-4); overflow-x: auto; padding: var(--space-4); }
.odontogram-arch { min-width: 39rem; }
.odontogram-arch h3 { margin: 0 0 var(--space-2); color: var(--color-text-secondary); font-size: .6875rem; font-weight: var(--font-weight-semibold); text-align: center; }
.odontogram-arch__teeth { display: grid; grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr); align-items: stretch; gap: clamp(3px, .6vw, var(--space-2)); }
.odontogram-quadrant { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
.odontogram-arch__teeth--primary .odontogram-quadrant { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.odontogram-midline { width: 1px; background: var(--color-border); }
.odontogram-tooth { position: relative; display: grid; min-width: 0; min-height: 4.5rem; justify-items: center; align-content: center; gap: 2px; padding: 3px 0; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); cursor: pointer; transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast); }
.odontogram-tooth > span { color: var(--color-text-muted); font-size: .6rem; font-variant-numeric: tabular-nums; }
.odontogram-tooth > svg { color: var(--color-text-muted); }
.odontogram-tooth > i { position: absolute; top: 0; right: 2px; color: var(--color-warning); font-size: .9rem; font-style: normal; font-weight: var(--font-weight-bold); line-height: 1; }
.odontogram-tooth:hover, .odontogram-tooth:focus-visible { border-color: var(--color-primary); outline: 0; background: var(--color-primary-subtle); }
.odontogram-tooth--selected { border-color: var(--color-primary) !important; background: var(--color-primary-subtle); color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 18%, transparent); }
.odontogram-tooth--selected > svg { color: var(--color-primary); }
.odontogram-tooth--condition > svg { color: var(--color-warning); }
.odontogram-tooth--planned > svg { color: var(--color-info, var(--color-primary)); }
.odontogram-tooth--completed > svg { color: var(--color-success); }
.odontogram-tooth--cancelled > svg { color: var(--color-text-muted); opacity: .7; }
.odontogram-tooth--pending { border-style: dashed; border-color: var(--color-warning); }
.odontogram-tooth--absent > svg { opacity: .3; }
.odontogram-tooth--absent > i { color: var(--color-danger); font-size: 1.3rem; }
.odontogram-legend-inline { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: .6875rem; }
.odontogram-legend-inline span { display: inline-flex; align-items: center; gap: var(--space-1); }
.legend-dot--clear { background: var(--color-surface); }
.legend-dot--condition { border-color: var(--color-warning); background: var(--color-warning); }
.legend-dot--planned { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.legend-dot--completed { border-color: var(--color-success); background: var(--color-success); }
.legend-dot--pending { border-style: dashed; border-color: var(--color-warning); background: transparent; }
.legend-dot--selected { border: 2px solid var(--color-primary); background: var(--color-primary-subtle); }
.odontogram-tooth-panel { position: sticky; top: var(--space-4); display: grid; gap: var(--space-4); padding: var(--space-4); }
.odontogram-tooth-panel__heading { gap: var(--space-3); color: var(--color-primary); }
.odontogram-tooth-panel__heading > div > span { color: var(--color-text-muted); font-size: .625rem; font-weight: var(--font-weight-bold); letter-spacing: .1em; }
.odontogram-tooth-panel__heading h2 { margin: 2px 0 0; color: var(--color-text); font-size: var(--font-size-sm); text-transform: capitalize; }
.odontogram-entry-list { display: grid; gap: var(--space-2); }
.odontogram-entry-list h3, .odontogram-surface-section h3 { margin: 0; color: var(--color-text); font-size: var(--font-size-xs); }
.odontogram-entry { display: grid; gap: 5px; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.odontogram-entry--pending { border-style: dashed; border-color: var(--color-warning); }
.odontogram-entry__top { justify-content: space-between; gap: var(--space-2); }
.odontogram-entry__top strong { color: var(--color-text); font-size: var(--font-size-xs); }
.odontogram-entry > span { color: var(--color-text-secondary); font-size: .6875rem; }
.odontogram-entry p { margin: 0; color: var(--color-text); font-size: var(--font-size-xs); line-height: 1.45; overflow-wrap: anywhere; }
.odontogram-tooth-empty, .odontogram-surface-section > p { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.45; }
.odontogram-surface-section { display: grid; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.odontogram-surface-map { display: grid; grid-template-columns: repeat(3, 2.5rem); grid-template-rows: repeat(3, 2.5rem); justify-content: center; gap: 2px; }
.odontogram-surface-map button { border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-background); color: var(--color-text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-xs); }
.odontogram-surface-map button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 1px; }
.odontogram-surface-map button[aria-pressed="true"] { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); }
.odontogram-surface-selected { display: flex; align-items: center; gap: var(--space-2); color: var(--color-primary) !important; }
.odontogram-surface-selected button { padding: 0; border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; text-decoration: underline; }
.odontogram-surface-map button:first-child { grid-area: 2 / 1; }
.odontogram-surface-map button:nth-child(2) { grid-area: 2 / 3; }
.odontogram-surface-map button:nth-child(3) { grid-area: 1 / 2; }
.odontogram-surface-map button:nth-child(4) { grid-area: 3 / 2; }
.odontogram-surface-map button:nth-child(5) { grid-area: 2 / 2; }
.odontogram-surface-map__center { border-color: var(--color-primary) !important; background: var(--color-primary-subtle) !important; color: var(--color-primary) !important; font-weight: var(--font-weight-bold) !important; }
.odontogram-tooth-actions { display: grid; gap: var(--space-2); }
.odontogram-module-note { margin: 0; padding: var(--space-2); border-radius: var(--radius-sm); background: var(--color-background); color: var(--color-text-muted); font-size: .6875rem; line-height: 1.45; }
.odontogram-tooth-placeholder { display: grid; min-height: 18rem; align-content: center; justify-items: center; gap: var(--space-2); color: var(--color-text-muted); text-align: center; }
.odontogram-tooth-placeholder strong { color: var(--color-text); font-size: var(--font-size-sm); }
.odontogram-tooth-placeholder span { max-width: 15rem; font-size: var(--font-size-xs); line-height: 1.45; }
.odontogram-savebar { flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.odontogram-unsaved, .odontogram-saved, .odontogram-savebar__quiet { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-unsaved { color: var(--color-warning-text, var(--color-text)); font-weight: var(--font-weight-semibold); }
.odontogram-unsaved i { width: .55rem; height: .55rem; border-radius: 50%; background: var(--color-warning); }
.odontogram-saved { color: var(--color-success); }
.odontogram-save-error { flex: 1 1 100%; color: var(--color-danger); font-size: var(--font-size-xs); }
.odontogram-savebar__actions { justify-content: flex-end; gap: var(--space-2); }
.odontogram-footnote { display: flex; align-items: flex-start; gap: var(--space-2); margin: var(--space-4) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.5; }
.odontogram-footnote svg { flex: 0 0 auto; color: var(--color-success); }
.odontogram-loading { display: grid; min-height: 18rem; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.odontogram-loading span { min-height: 3rem; border-radius: var(--radius-md); background: linear-gradient(90deg, var(--color-background), var(--color-border), var(--color-background)); background-size: 200% 100%; animation: odontogram-shimmer 1.4s ease-in-out infinite; }
.odontogram-state { display: flex; align-items: center; gap: var(--space-3); min-height: 10rem; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.odontogram-state--error { color: var(--color-danger); }
.odontogram-state > div { flex: 1; }
.odontogram-state strong { color: var(--color-text); }
.odontogram-state p { margin: var(--space-1) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.odontogram-record-form { display: grid; gap: var(--space-3); }
.odontogram-record-context { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--color-background); color: var(--color-primary); font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
.odontogram-record-form > label { min-width: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-record-form > label small { color: var(--color-text-muted); line-height: 1.4; }
.odontogram-record-form textarea { padding-block: var(--space-2); resize: vertical; }
.odontogram-surface-fieldset { margin: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.odontogram-surface-fieldset legend { padding-inline: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.odontogram-surface-fieldset > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.odontogram-surface-option { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text); font-size: var(--font-size-xs); }
.odontogram-surface-option input { width: 1rem; min-height: auto; height: 1rem; accent-color: var(--color-primary); }
.odontogram-form-note { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.5; }
.odontogram-form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); padding-top: var(--space-2); }
.odontogram-legend-dialog { display: grid; gap: var(--space-3); margin: 0 0 var(--space-4); padding: 0; list-style: none; }
.odontogram-legend-dialog li { display: flex; align-items: center; gap: var(--space-3); }
.odontogram-legend-dialog li > span:nth-child(2) { display: grid; gap: 2px; }
.odontogram-legend-dialog strong { color: var(--color-text); font-size: var(--font-size-sm); }
.odontogram-legend-dialog small { color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 1.4; }
.odontogram-legend-dialog__cross { display: grid; width: .8rem; height: .8rem; place-items: center; color: var(--color-danger); font-size: 1.2rem; font-weight: var(--font-weight-bold); }
.odontogram-history { display: grid; gap: var(--space-4); }
.odontogram-history-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-background); }
.odontogram-history-filters > label { min-width: 0; }
.odontogram-history-filters > button { grid-column: 1 / -1; justify-self: end; }
.odontogram-history-state { display: grid; min-height: 8rem; place-content: center; gap: var(--space-2); margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); text-align: center; }
.odontogram-history-state--error { color: var(--color-danger); }
.odontogram-history-list { display: grid; max-height: 24rem; gap: var(--space-3); overflow: auto; margin: 0; padding: 0; list-style: none; }
.odontogram-history-list li { position: relative; display: grid; grid-template-columns: .75rem minmax(0, 1fr); gap: var(--space-3); }
.odontogram-history-list li:not(:last-child)::after { position: absolute; top: .75rem; bottom: calc(-1 * var(--space-3)); left: .31rem; width: 1px; background: var(--color-border); content: ''; }
.odontogram-history-list__marker { z-index: 1; width: .65rem; height: .65rem; margin-top: .3rem; border: 2px solid var(--color-primary); border-radius: 50%; background: var(--color-surface); }
.odontogram-history-list li > div { display: grid; gap: 4px; min-width: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.odontogram-history-list__top { justify-content: space-between; gap: var(--space-2); }
.odontogram-history-list__top strong { color: var(--color-text); font-size: var(--font-size-xs); }
.odontogram-history-list li > div > span { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-secondary); font-size: .6875rem; }
.odontogram-history-list li p { margin: 0; color: var(--color-text); font-size: var(--font-size-xs); }
@keyframes odontogram-shimmer { to { background-position: -200% 0; } }
@media (max-width: 68rem) { .odontogram-workspace { grid-template-columns: minmax(0, 1fr); } .odontogram-tooth-panel { position: static; } }
@media (max-width: 48rem) {
  .odontogram-main { padding: var(--space-4); }
  .odontogram-intro, .odontogram-patient-card, .odontogram-patient-meta { align-items: flex-start; flex-direction: column; }
  .odontogram-patient-meta { width: 100%; }
  .odontogram-toolbar { align-items: stretch; }
  .odontogram-toolbar > label { flex: 1; min-width: 8rem; }
  .odontogram-toolbar__actions { justify-content: flex-start; }
  .odontogram-orientation { flex-direction: column; }
  .odontogram-arches { padding-inline: var(--space-2); }
  .odontogram-tooth { min-height: 3.65rem; }
  .odontogram-tooth > svg { width: 19px; height: 19px; }
  .odontogram-legend-inline { justify-content: flex-start; }
  .odontogram-savebar { align-items: flex-start; flex-direction: column; }
  .odontogram-savebar__actions { width: 100%; }
  .odontogram-savebar__actions > :deep(button) { flex: 1; }
  .odontogram-state { align-items: flex-start; flex-wrap: wrap; }
  .odontogram-orientation__scroll-hint { display: inline !important; }
}
@media (max-width: 26rem) {
  .odontogram-main { padding: var(--space-3); }
  .odontogram-patient-card { padding: var(--space-3); }
  .odontogram-arch__teeth { gap: 2px; }
  .odontogram-quadrant { gap: 0; }
  .odontogram-tooth { min-height: 3.25rem; }
  .odontogram-tooth > span { font-size: .53rem; }
  .odontogram-tooth > svg { width: 16px; height: 16px; }
  .odontogram-history-filters { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .odontogram-tooth { transition: none; }
  .odontogram-loading span { animation: none; }
}
</style>
