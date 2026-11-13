<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  FileClock,
  History,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-vue-next'
import DentistShell from '../components/DentistShell.vue'
import { dentistNavigationRoutes } from '../router/navigation'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import { getApiErrorMessage } from '../services/api'
import {
  addDentistTreatmentPlanProcedure,
  createDentistTreatmentPlan,
  deleteDentistTreatmentPlanProcedure,
  getDentistPatientOdontogram,
  getDentistPatients,
  getDentistTreatmentPlan,
  getDentistTreatmentPlanHistory,
  getDentistTreatmentPlans,
  updateDentistTreatmentPlan,
  updateDentistTreatmentPlanProcedure,
} from '../services/dentist'

const route = useRoute()
const router = useRouter()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const planStatuses = [
  { value: '', label: 'Todas as situações' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
]
const statusLabels = {
  draft: 'Rascunho',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}
const procedureStatusLabels = {
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}
const statusVariants = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'danger',
}
const priorityLabels = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
const surfaceLabels = {
  M: 'Mesial',
  D: 'Distal',
  B: 'Vestibular',
  L: 'Lingual',
  P: 'Palatina',
  O: 'Oclusal',
  I: 'Incisal',
}
const stepLabels = ['Paciente e plano', 'Procedimentos', 'Organização', 'Revisão']
const allSurfaces = Object.entries(surfaceLabels)
const loadState = ref('loading')
const loadError = ref('')
const plans = ref([])
const total = ref(0)
const metrics = ref(null)
const search = ref('')
const filtersOpen = ref(false)
const activeFilters = reactive(emptyFilters())
const filterDraft = reactive(emptyFilters())
const planPatientSearch = ref('')
const planPatientOptions = ref([])
const planPatientSearchOpen = ref(false)
const patientSearchState = ref('idle')
const selectedPatient = ref(null)
const editorOpen = ref(false)
const editorStep = ref(0)
const editorMode = ref('create')
const editorBusy = ref(false)
const editorError = ref('')
const editor = reactive(emptyEditor())
const procedureEditorOpen = ref(false)
const procedureEditorBusy = ref(false)
const procedureEditorError = ref('')
const procedureEditor = reactive(emptyProcedure())
const editingProcedureId = ref(null)
const detailOpen = ref(false)
const detailPlan = ref(null)
const detailTab = ref('overview')
const detailState = ref('idle')
const detailError = ref('')
const planHistory = ref([])
const historyState = ref('idle')
const historyError = ref('')
const odontogramEntries = ref([])
const odontogramState = ref('idle')
const pendingCompletion = ref(null)
const completionEntryId = ref('')
const saveNotice = ref('')
const saveNoticeType = ref('success')
let searchTimer
let patientTimer
let requestId = 0
let patientRequestId = 0
let noticeTimer

function emptyFilters() {
  return { status: '', patient_id: '', procedure_status: '', category: '', has_pending: '', date_from: '', date_to: '' }
}

async function editPlanFromList(plan) {
  await openPlan(plan.id)
  if (detailState.value === 'ready' && detailPlan.value) openEditEditor(detailPlan.value)
}

async function openPlanHistory(plan) {
  await openPlan(plan.id)
  if (detailState.value === 'ready') changeDetailTab('history')
}

function goToPlanOdontogram(plan) {
  void router.push({
    name: 'dentist-odontogram',
    query: { patientId: String(plan.patient.id) },
  })
}

function goToPlanPatient(plan) {
  void router.push({
    name: 'dentist-patients',
    query: { patientId: String(plan.patient.id) },
  })
}

function emptyEditor() {
  return { patient_id: '', name: '', notes: '', procedures: [] }
}

function emptyProcedure() {
  return {
    name: '',
    category: '',
    description: '',
    tooth_number: '',
    surfaces: [],
    priority: 'normal',
    stage: 'Etapa inicial',
    notes: '',
    sort_order: 0,
  }
}

const page = ref(1)
const pageSize = ref(10)
const sortBy = ref('created_at')
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const firstVisible = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0)
const lastVisible = computed(() => Math.min(page.value * pageSize.value, total.value))
const selectedPatientPlan = computed(() =>
  planPatientOptions.value.find((patient) => patient.id === Number(editor.patient_id))
    || selectedPatient.value,
)
const editorIsDirty = computed(() => editorMode.value === 'create'
  ? Boolean(editor.patient_id || editor.name || editor.notes || editor.procedures.length || draftProcedure.name)
  : Boolean(
      detailPlan.value
      && (editor.name !== detailPlan.value.name || editor.notes !== (detailPlan.value.notes || '')),
    ))
const procedureEligibleCount = computed(() =>
  editor.procedures.filter((procedure) => procedure.status !== 'cancelled').length,
)
const procedureCompletedCount = computed(() =>
  editor.procedures.filter((procedure) => procedure.status === 'completed').length,
)
const matchingCompletionEntries = computed(() => {
  const procedure = pendingCompletion.value
  if (!procedure) return []
  return odontogramEntries.value.filter((entry) =>
    entry.record_type === 'procedure'
    && entry.status === 'completed'
    && entry.label.trim().toLocaleLowerCase('pt-BR') === procedure.name.trim().toLocaleLowerCase('pt-BR')
    && (!procedure.tooth_number || entry.tooth_number === procedure.tooth_number)
    && (!procedure.tooth_number || JSON.stringify(entry.surfaces) === JSON.stringify(procedure.surfaces))
    && !odontogramEntries.value.some((candidate) => candidate.supersedes_entry_id === entry.id),
  )
})

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', options).format(parsed)
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function formatSurfaces(surfaces) {
  return surfaces?.length ? surfaces.map((surface) => surfaceLabels[surface] || surface).join(', ') : 'Sem superfície'
}

function queryParams() {
  return {
    q: search.value.trim() || undefined,
    status: activeFilters.status || undefined,
    patient_id: activeFilters.patient_id || undefined,
    procedure_status: activeFilters.procedure_status || undefined,
    category: activeFilters.category.trim() || undefined,
    has_pending: activeFilters.has_pending === '' ? undefined : activeFilters.has_pending === 'yes',
    date_from: activeFilters.date_from || undefined,
    date_to: activeFilters.date_to || undefined,
    sort_by: sortBy.value,
    offset: (page.value - 1) * pageSize.value,
    limit: pageSize.value,
  }
}

async function loadPlans() {
  const currentRequest = ++requestId
  loadState.value = plans.value.length ? 'refreshing' : 'loading'
  loadError.value = ''
  try {
    const response = await getDentistTreatmentPlans(queryParams())
    if (currentRequest !== requestId) return
    plans.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    loadState.value = 'ready'
  } catch (error) {
    if (currentRequest !== requestId) return
    loadState.value = 'error'
    loadError.value = error.response?.status === 403
      ? 'Sua conta não tem autorização para consultar planos de tratamento.'
      : getApiErrorMessage(error, 'Não foi possível carregar os planos de tratamento.')
  }
}

function applyFilters() {
  Object.assign(activeFilters, filterDraft)
  page.value = 1
  void loadPlans()
}

function clearFilters() {
  Object.assign(activeFilters, emptyFilters())
  Object.assign(filterDraft, emptyFilters())
  search.value = ''
  sortBy.value = 'created_at'
  page.value = 1
  void loadPlans()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadPlans()
}

function changePageSize(event) {
  pageSize.value = Number(event.target.value)
  page.value = 1
  void loadPlans()
}

function changeSort(value) {
  sortBy.value = value
  page.value = 1
  void loadPlans()
}

function showNotice(message, type = 'success') {
  saveNotice.value = message
  saveNoticeType.value = type
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { saveNotice.value = '' }, 5000)
}

async function searchPatients(term, target = 'editor') {
  const currentRequest = ++patientRequestId
  patientSearchState.value = 'loading'
  try {
    const response = await getDentistPatients({ q: term.trim() || undefined, limit: 100 })
    if (currentRequest !== patientRequestId) return
    if (target === 'filter') {
      planPatientOptions.value = response.items
    } else {
      planPatientOptions.value = response.items
    }
    patientSearchState.value = 'ready'
  } catch (error) {
    if (currentRequest !== patientRequestId) return
    patientSearchState.value = 'error'
    editorError.value = getApiErrorMessage(error, 'Não foi possível buscar pacientes autorizados.')
  }
}

function openCreateEditor() {
  editorMode.value = 'create'
  editorStep.value = 0
  editorError.value = ''
  Object.assign(editor, emptyEditor())
  selectedPatient.value = null
  planPatientSearch.value = ''
  editorOpen.value = true
  void searchPatients(typeof route.query.patientId === 'string' ? route.query.patientId : '')
  if (typeof route.query.patientId === 'string') {
    window.setTimeout(async () => {
      const requestedId = Number(route.query.patientId)
      const result = await getDentistPatients({ q: String(requestedId), limit: 100 })
      const patient = result.items.find((item) => item.id === requestedId)
      if (patient) selectPatient(patient)
    }, 0)
  }
}

function confirmEditorClose() {
  if (editorBusy.value) return true
  if (!editorIsDirty.value) return true
  return window.confirm('Há alterações não salvas no plano. Deseja descartá-las?')
}

function closeEditor() {
  if (confirmEditorClose()) editorOpen.value = false
}

function openEditEditor(plan) {
  editorMode.value = 'edit'
  editorStep.value = 0
  editorError.value = ''
  Object.assign(editor, {
    patient_id: String(plan.patient.id),
    name: plan.name,
    notes: plan.notes || '',
    procedures: [],
  })
  selectedPatient.value = plan.patient
  planPatientSearch.value = plan.patient.name
  editorOpen.value = true
}

function selectPatient(patient) {
  selectedPatient.value = patient
  editor.patient_id = String(patient.id)
  planPatientSearch.value = patient.name
  planPatientSearchOpen.value = false
}

function onPatientSearch(value, target = 'editor') {
  if (target === 'editor') {
    planPatientSearch.value = value
    planPatientSearchOpen.value = Boolean(value.trim())
    if (selectedPatient.value && value !== selectedPatient.value.name) {
      selectedPatient.value = null
      editor.patient_id = ''
    }
  } else {
    planPatientSearch.value = value
  }
  window.clearTimeout(patientTimer)
  patientTimer = window.setTimeout(() => {
    void searchPatients(value, target)
  }, 250)
}

function setEditorStep(nextStep) {
  if (nextStep < editorStep.value && editorMode.value === 'create') {
    editorStep.value = nextStep
    return
  }
  if (nextStep === 1 && !editor.patient_id) {
    editorError.value = 'Selecione um paciente autorizado antes de continuar.'
    return
  }
  if (nextStep === 2 && !editor.procedures.length && editorMode.value === 'create') {
    editorError.value = 'Adicione ao menos um procedimento para organizar o plano.'
    return
  }
  editorError.value = ''
  editorStep.value = nextStep
}

function addProcedureToDraft() {
  if (procedureEditorOpen.value) return
  if (!draftProcedure.name.trim()) {
    editorError.value = 'Informe o nome do procedimento.'
    return
  }
  editor.procedures.push({
    ...draftProcedure,
    name: draftProcedure.name.trim(),
    sort_order: editor.procedures.length,
    status: 'planned',
  })
  Object.assign(draftProcedure, emptyProcedure())
  editorError.value = ''
}

const draftProcedure = reactive(emptyProcedure())

function removeDraftProcedure(index) {
  editor.procedures.splice(index, 1)
  editor.procedures.forEach((procedure, position) => { procedure.sort_order = position })
}

function moveDraftProcedure(index, direction) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= editor.procedures.length) return
  const [procedure] = editor.procedures.splice(index, 1)
  editor.procedures.splice(nextIndex, 0, procedure)
  editor.procedures.forEach((item, position) => { item.sort_order = position })
}

async function saveEditor(requireProcedures) {
  if (!editor.patient_id && editorMode.value === 'create') {
    editorStep.value = 0
    editorError.value = 'Selecione um paciente autorizado.'
    return
  }
  if (!editor.name.trim()) {
    editorStep.value = 0
    editorError.value = 'Informe um nome ou uma descrição para o plano.'
    return
  }
  if (requireProcedures && !editor.procedures.length && editorMode.value === 'create') {
    editorStep.value = 1
    editorError.value = 'Inclua ao menos um procedimento para salvar o plano.'
    return
  }
  editorBusy.value = true
  editorError.value = ''
  try {
    if (editorMode.value === 'create') {
      const plan = await createDentistTreatmentPlan({
        patient_id: Number(editor.patient_id),
        name: editor.name.trim(),
        notes: editor.notes.trim() || null,
        procedures: editor.procedures.map((procedure) => ({
          name: procedure.name,
          category: procedure.category || null,
          description: procedure.description || null,
          tooth_number: procedure.tooth_number || null,
          surfaces: procedure.surfaces,
          priority: procedure.priority,
          stage: procedure.stage,
          notes: procedure.notes || null,
          sort_order: procedure.sort_order,
        })),
      })
      editorOpen.value = false
      await loadPlans()
      showNotice('Plano salvo como rascunho. Nenhuma aprovação ou execução foi presumida.')
      await openPlan(plan.id)
    } else {
      const plan = await updateDentistTreatmentPlan(detailPlan.value.id, {
        version: detailPlan.value.version,
        name: editor.name.trim(),
        notes: editor.notes.trim() || null,
      })
      editorOpen.value = false
      detailPlan.value = plan
      await loadPlans()
      showNotice('Dados do plano atualizados.')
    }
  } catch (error) {
    editorError.value = error.response?.status === 409
      ? 'Este plano foi alterado em outra sessão. Atualize antes de tentar novamente.'
      : getApiErrorMessage(error, 'Não foi possível salvar o plano. Os dados preenchidos foram mantidos.')
  } finally {
    editorBusy.value = false
  }
}

async function openPlan(planId) {
  detailOpen.value = true
  detailState.value = 'loading'
  detailError.value = ''
  detailTab.value = 'overview'
  planHistory.value = []
  historyState.value = 'idle'
  odontogramEntries.value = []
  odontogramState.value = 'idle'
  try {
    detailPlan.value = await getDentistTreatmentPlan(planId)
    detailState.value = 'ready'
  } catch (error) {
    detailState.value = 'error'
    detailError.value = getApiErrorMessage(error, 'Não foi possível abrir este plano.')
  }
}

async function refreshPlan() {
  if (!detailPlan.value) return
  detailState.value = 'loading'
  detailError.value = ''
  try {
    detailPlan.value = await getDentistTreatmentPlan(detailPlan.value.id)
    detailState.value = 'ready'
  } catch (error) {
    detailState.value = 'error'
    detailError.value = getApiErrorMessage(error, 'Não foi possível atualizar este plano.')
  }
}

async function changePlanStatus(action) {
  if (!detailPlan.value) return
  const confirmation = action === 'start'
    ? 'Iniciar este plano? Isso muda a situação para “Em andamento”; não registra procedimentos como realizados.'
    : 'Cancelar este plano? O histórico será preservado.'
  if (!window.confirm(confirmation)) return
  try {
    detailPlan.value = await updateDentistTreatmentPlan(detailPlan.value.id, {
      version: detailPlan.value.version,
      action,
    })
    await loadPlans()
    showNotice(action === 'start' ? 'Plano iniciado.' : 'Plano cancelado.', action === 'start' ? 'success' : 'warning')
  } catch (error) {
    if (error.response?.status === 409) await refreshPlan()
    showNotice(getApiErrorMessage(error, 'Não foi possível atualizar a situação do plano.'), 'danger')
  }
}

function openProcedureEditor(procedure = null) {
  if (!detailPlan.value || !['draft', 'in_progress'].includes(detailPlan.value.status)) return
  editingProcedureId.value = procedure?.id ?? null
  procedureEditorError.value = ''
  Object.assign(procedureEditor, procedure
    ? {
        name: procedure.name,
        category: procedure.category || '',
        description: procedure.description || '',
        tooth_number: procedure.tooth_number || '',
        surfaces: [...procedure.surfaces],
        priority: procedure.priority,
        stage: procedure.stage,
        notes: procedure.notes || '',
        sort_order: procedure.sort_order,
        status: procedure.status,
        version: procedure.version,
      }
    : { ...emptyProcedure(), sort_order: detailPlan.value.procedure_count, status: 'planned', version: 1 })
  procedureEditorOpen.value = true
}

async function savePlanProcedure() {
  if (!procedureEditor.name.trim()) {
    procedureEditorError.value = 'Informe o nome do procedimento.'
    return
  }
  if (!procedureEditor.tooth_number && procedureEditor.surfaces.length) {
    procedureEditorError.value = 'Selecione um dente antes de indicar superfícies.'
    return
  }
  procedureEditorBusy.value = true
  procedureEditorError.value = ''
  const payload = {
    name: procedureEditor.name.trim(),
    category: procedureEditor.category.trim() || null,
    description: procedureEditor.description.trim() || null,
    tooth_number: procedureEditor.tooth_number || null,
    surfaces: procedureEditor.surfaces,
    priority: procedureEditor.priority,
    stage: procedureEditor.stage.trim() || 'Etapa inicial',
    notes: procedureEditor.notes.trim() || null,
    sort_order: Number(procedureEditor.sort_order) || 0,
    status: procedureEditor.status,
    version: procedureEditor.version,
  }
  try {
    if (editingProcedureId.value) {
      await updateDentistTreatmentPlanProcedure(
        detailPlan.value.id,
        editingProcedureId.value,
        { ...payload, plan_version: detailPlan.value.version, completed_odontogram_entry_id: null },
      )
    } else {
      const createPayload = {
        name: payload.name,
        category: payload.category,
        description: payload.description,
        tooth_number: payload.tooth_number,
        surfaces: payload.surfaces,
        priority: payload.priority,
        stage: payload.stage,
        notes: payload.notes,
        sort_order: payload.sort_order,
        plan_version: detailPlan.value.version,
      }
      await addDentistTreatmentPlanProcedure(detailPlan.value.id, createPayload)
    }
    procedureEditorOpen.value = false
    await refreshPlan()
    await loadPlans()
    showNotice(editingProcedureId.value ? 'Procedimento atualizado.' : 'Procedimento adicionado.')
  } catch (error) {
    procedureEditorError.value = error.response?.status === 409
      ? 'O plano ou procedimento foi alterado em outra sessão. Atualize os dados.'
      : getApiErrorMessage(error, 'Não foi possível salvar o procedimento.')
  } finally {
    procedureEditorBusy.value = false
  }
}

async function startProcedure(procedure) {
  try {
    await updateDentistTreatmentPlanProcedure(detailPlan.value.id, procedure.id, {
      ...procedure,
      plan_version: detailPlan.value.version,
      version: procedure.version,
      status: 'in_progress',
      completed_odontogram_entry_id: null,
    })
    await refreshPlan()
    await loadPlans()
    showNotice('Procedimento marcado como em andamento.')
  } catch (error) {
    showNotice(getApiErrorMessage(error, 'Não foi possível atualizar o procedimento.'), 'danger')
  }
}

async function cancelProcedure(procedure) {
  if (!window.confirm(`Cancelar “${procedure.name}”? O evento será preservado no histórico.`)) return
  try {
    await updateDentistTreatmentPlanProcedure(detailPlan.value.id, procedure.id, {
      ...procedure,
      plan_version: detailPlan.value.version,
      version: procedure.version,
      status: 'cancelled',
      completed_odontogram_entry_id: null,
    })
    await refreshPlan()
    await loadPlans()
    showNotice('Procedimento cancelado; o histórico foi preservado.', 'warning')
  } catch (error) {
    showNotice(getApiErrorMessage(error, 'Não foi possível cancelar o procedimento.'), 'danger')
  }
}

async function removeProcedure(procedure) {
  if (!window.confirm(`Remover “${procedure.name}” deste plano? A ação ficará registrada no histórico.`)) return
  try {
    await deleteDentistTreatmentPlanProcedure(
      detailPlan.value.id,
      procedure.id,
      procedure.version,
      detailPlan.value.version,
    )
    await refreshPlan()
    await loadPlans()
    showNotice('Procedimento removido do planejamento.')
  } catch (error) {
    showNotice(getApiErrorMessage(error, 'Não foi possível remover o procedimento.'), 'danger')
  }
}

async function loadHistory() {
  if (!detailPlan.value) return
  historyState.value = 'loading'
  try {
    planHistory.value = await getDentistTreatmentPlanHistory(detailPlan.value.id)
    historyState.value = planHistory.value.length ? 'ready' : 'empty'
  } catch (error) {
    historyState.value = 'error'
    historyError.value = getApiErrorMessage(error, 'Não foi possível carregar o histórico.')
  }
}

async function loadOdontogram() {
  if (!detailPlan.value) return
  odontogramState.value = 'loading'
  try {
    const chart = await getDentistPatientOdontogram(detailPlan.value.patient.id)
    odontogramEntries.value = chart.entries
    odontogramState.value = 'ready'
  } catch (error) {
    odontogramState.value = 'error'
    detailError.value = getApiErrorMessage(error, 'Não foi possível consultar o odontograma.')
  }
}

function changeDetailTab(tab) {
  detailTab.value = tab
  if (tab === 'history' && historyState.value === 'idle') void loadHistory()
  if (tab === 'odontogram' && odontogramState.value === 'idle') void loadOdontogram()
}

function beginCompletion(procedure) {
  pendingCompletion.value = procedure
  completionEntryId.value = ''
  if (odontogramState.value !== 'ready') void loadOdontogram()
}

async function confirmProcedureCompletion() {
  const procedure = pendingCompletion.value
  if (!procedure || !completionEntryId.value) return
  try {
    await updateDentistTreatmentPlanProcedure(detailPlan.value.id, procedure.id, {
      ...procedure,
      plan_version: detailPlan.value.version,
      version: procedure.version,
      status: 'completed',
      completed_odontogram_entry_id: Number(completionEntryId.value),
    })
    pendingCompletion.value = null
    await refreshPlan()
    await loadPlans()
    showNotice('Conclusão clínica vinculada ao odontograma.')
  } catch (error) {
    showNotice(getApiErrorMessage(error, 'Não foi possível confirmar a conclusão clínica.'), 'danger')
  }
}

function goToOdontogram() {
  if (!detailPlan.value) return
  void router.push({
    name: 'dentist-odontogram',
    query: { patientId: String(detailPlan.value.patient.id) },
  })
}

function goToPatient() {
  if (!detailPlan.value) return
  void router.push({
    name: 'dentist-patients',
    query: { patientId: String(detailPlan.value.patient.id) },
  })
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
    void loadPlans()
  }, 300)
})

watch(
  () => [route.query.patientId, route.query.new],
  ([patientId, shouldCreate]) => {
    if (shouldCreate === '1') openCreateEditor()
    else if (patientId && detailPlan.value?.patient.id !== Number(patientId)) {
      const match = plans.value.find((plan) => plan.patient.id === Number(patientId))
      if (match) void openPlan(match.id)
    }
  },
)

onBeforeRouteLeave(() => {
  if (!editorOpen.value || !editorIsDirty.value) return true
  return window.confirm('Há alterações não salvas no plano. Deseja sair sem salvar?')
})

onMounted(() => {
  void loadPlans()
  if (route.query.new === '1') openCreateEditor()
})
onBeforeUnmount(() => {
  requestId += 1
  patientRequestId += 1
  window.clearTimeout(searchTimer)
  window.clearTimeout(patientTimer)
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="treatment-page">
    <DentistShell active-page="treatment-plans" :date-label="dateLabel" @navigate="handleNavigation" />

    <main class="treatment-main">
      <header class="treatment-intro">
        <div>
          <p class="treatment-eyebrow">PORTAL CLÍNICO</p>
          <h1>Planos de Tratamento</h1>
          <p>Planeje procedimentos e acompanhe a evolução clínica dos pacientes</p>
        </div>
        <div class="treatment-intro__actions">
          <span class="treatment-access-note">
            <ShieldCheck :size="16" aria-hidden="true" />
            Planos vinculados à sua agenda
          </span>
          <UiButton @click="openCreateEditor">
            <template #start><Plus :size="17" aria-hidden="true" /></template>
            Novo plano de tratamento
          </UiButton>
        </div>
      </header>

      <section class="treatment-metrics" aria-label="Indicadores dos planos">
        <article class="treatment-metric">
          <span class="treatment-metric__icon"><ClipboardList :size="18" aria-hidden="true" /></span>
          <div>
            <span>Total de planos</span>
            <strong v-if="loadState === 'ready' || loadState === 'refreshing'">{{ metrics?.total ?? 0 }}</strong>
            <i v-else class="treatment-metric__skeleton" aria-hidden="true"></i>
            <small>disponíveis para você</small>
          </div>
        </article>
        <article class="treatment-metric">
          <span class="treatment-metric__icon treatment-metric__icon--blue"><Activity :size="18" aria-hidden="true" /></span>
          <div>
            <span>Em andamento</span>
            <strong v-if="loadState === 'ready' || loadState === 'refreshing'">{{ metrics?.in_progress ?? 0 }}</strong>
            <i v-else class="treatment-metric__skeleton" aria-hidden="true"></i>
            <small>execução iniciada explicitamente</small>
          </div>
        </article>
        <article class="treatment-metric">
          <span class="treatment-metric__icon treatment-metric__icon--amber"><Clock3 :size="18" aria-hidden="true" /></span>
          <div>
            <span>Aguardando aprovação</span>
            <strong v-if="loadState === 'ready' || loadState === 'refreshing'">{{ metrics?.awaiting_approval ?? '—' }}</strong>
            <i v-else class="treatment-metric__skeleton" aria-hidden="true"></i>
            <small>fluxo de aprovação não configurado</small>
          </div>
        </article>
        <article class="treatment-metric">
          <span class="treatment-metric__icon treatment-metric__icon--green"><Check :size="18" aria-hidden="true" /></span>
          <div>
            <span>Concluídos</span>
            <strong v-if="loadState === 'ready' || loadState === 'refreshing'">{{ metrics?.completed ?? 0 }}</strong>
            <i v-else class="treatment-metric__skeleton" aria-hidden="true"></i>
            <small>procedimentos clínicos encerrados</small>
          </div>
        </article>
      </section>

      <section class="treatment-panel" aria-labelledby="plans-title">
        <div class="treatment-panel__heading">
          <div>
            <p class="treatment-eyebrow">ACOMPANHAMENTO</p>
            <h2 id="plans-title">Planos de tratamento</h2>
            <p>{{ total }} plano(s) encontrado(s)</p>
          </div>
          <label class="treatment-search">
            <Search :size="18" aria-hidden="true" />
            <span class="visually-hidden">Buscar por paciente, código ou nome do plano</span>
            <input
              v-model="search"
              type="search"
              placeholder="Buscar por paciente, código ou nome do plano..."
            />
            <button v-if="search" type="button" aria-label="Limpar busca" @click="search = ''">
              <X :size="15" aria-hidden="true" />
            </button>
          </label>
        </div>

        <div class="treatment-toolbar">
          <button
            class="treatment-filter-trigger"
            type="button"
            :aria-expanded="filtersOpen"
            @click="filtersOpen = !filtersOpen"
          >
            <Search :size="16" aria-hidden="true" />
            Filtros
            <span v-if="Object.values(activeFilters).some(Boolean)" class="treatment-filter-dot"></span>
          </button>
          <label class="treatment-sort">
            <span>Ordenar por</span>
            <select :value="sortBy" @change="changeSort($event.target.value)">
              <option value="created_at">Data de criação</option>
              <option value="name">Nome do plano</option>
              <option value="patient">Paciente</option>
            </select>
          </label>
        </div>

        <form v-if="filtersOpen" class="treatment-filters" @submit.prevent="applyFilters">
          <label>
            <span>Situação do plano</span>
            <select v-model="filterDraft.status">
              <option v-for="option in planStatuses" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Situação dos procedimentos</span>
            <select v-model="filterDraft.procedure_status">
              <option value="">Todas</option>
              <option value="planned">Planejados</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </label>
          <label>
            <span>Categoria do procedimento</span>
            <input v-model="filterDraft.category" maxlength="80" placeholder="Categoria cadastrada no plano" />
          </label>
          <label>
            <span>Com procedimentos pendentes</span>
            <select v-model="filterDraft.has_pending">
              <option value="">Todos</option>
              <option value="yes">Com pendências</option>
              <option value="no">Sem pendências</option>
            </select>
          </label>
          <label>
            <span>Criado a partir de</span>
            <input v-model="filterDraft.date_from" type="date" />
          </label>
          <label>
            <span>Criado até</span>
            <input v-model="filterDraft.date_to" type="date" />
          </label>
          <label>
            <span>Código do paciente</span>
            <input v-model="filterDraft.patient_id" type="number" min="1" placeholder="Todos os pacientes" />
          </label>
          <p class="treatment-filter-note">
            A aprovação clínica ou do paciente não está configurada nesta clínica. Os planos são salvos como rascunho até que a dentista os inicie.
          </p>
          <div class="treatment-filter-actions">
            <UiButton type="button" variant="secondary" size="sm" @click="clearFilters">Limpar filtros</UiButton>
            <UiButton type="submit" size="sm">Filtrar</UiButton>
          </div>
        </form>

        <div v-if="loadState === 'error'" class="treatment-state treatment-state--error" role="alert">
          <div>
            <strong>{{ loadError.includes('autorização') ? 'Acesso não autorizado' : 'Não foi possível atualizar' }}</strong>
            <p>{{ loadError }}</p>
          </div>
          <UiButton variant="secondary" @click="loadPlans">
            <template #start><RefreshCw :size="15" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </div>
        <div v-else-if="loadState === 'loading'" class="treatment-loading" role="status" aria-label="Carregando planos">
          <span class="visually-hidden">Carregando planos...</span>
          <div v-for="row in 5" :key="row" class="treatment-skeleton-row">
            <i v-for="cell in 6" :key="cell"></i>
          </div>
        </div>
        <div v-else-if="!plans.length" class="treatment-empty">
          <span class="treatment-empty__icon">
            <ClipboardList v-if="!search && !Object.values(activeFilters).some(Boolean)" :size="22" aria-hidden="true" />
            <Search v-else :size="22" aria-hidden="true" />
          </span>
          <strong>{{ search || Object.values(activeFilters).some(Boolean) ? 'Nenhum plano encontrado para esta busca' : 'Nenhum plano de tratamento disponível' }}</strong>
          <p>{{ search || Object.values(activeFilters).some(Boolean) ? 'Revise o termo pesquisado ou os filtros aplicados.' : 'Crie um rascunho para começar a organizar os procedimentos de um paciente autorizado.' }}</p>
          <UiButton v-if="!search && !Object.values(activeFilters).some(Boolean)" size="sm" @click="openCreateEditor">
            <template #start><Plus :size="15" aria-hidden="true" /></template>
            Novo plano de tratamento
          </UiButton>
          <UiButton v-else variant="secondary" size="sm" @click="clearFilters">Limpar busca e filtros</UiButton>
        </div>
        <div v-else class="treatment-table-wrap" :aria-busy="loadState === 'refreshing'">
          <table class="treatment-table">
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Plano</th>
                <th scope="col">Criado em</th>
                <th scope="col">Dentista</th>
                <th scope="col">Procedimentos</th>
                <th scope="col">Progresso</th>
                <th scope="col">Situação</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plan in plans" :key="plan.id">
                <td>
                  <div class="treatment-patient-cell">
                    <UiAvatar :name="plan.patient.name" size="sm" />
                    <div><strong>{{ plan.patient.name }}</strong><span>Paciente #{{ plan.patient.id }}</span></div>
                  </div>
                </td>
                <td>
                  <button class="treatment-plan-link" type="button" @click="openPlan(plan.id)">{{ plan.name }}</button>
                  <span class="treatment-plan-code">Plano #{{ plan.id }}</span>
                </td>
                <td>{{ formatDate(plan.created_at) }}</td>
                <td><span class="treatment-dentist"><Stethoscope :size="14" aria-hidden="true" />{{ plan.dentist_name }}</span></td>
                <td>
                  <strong>{{ plan.procedure_count }}</strong>
                  <span class="treatment-cell-muted">{{ plan.completed_count }} concluído(s)</span>
                </td>
                <td>
                  <template v-if="plan.progress_percent !== null">
                    <div class="treatment-progress-copy"><strong>{{ plan.progress_percent }}%</strong><span>{{ plan.completed_count }}/{{ plan.procedure_count }}</span></div>
                    <div class="treatment-progress" role="progressbar" :aria-valuenow="plan.progress_percent" aria-valuemin="0" aria-valuemax="100" :aria-label="`Progresso de ${plan.name}`">
                      <span :style="{ width: `${plan.progress_percent}%` }"></span>
                    </div>
                  </template>
                  <span v-else class="treatment-cell-muted">Sem procedimentos</span>
                </td>
                <td><UiBadge :variant="statusVariants[plan.status]">{{ statusLabels[plan.status] }}</UiBadge></td>
                <td class="treatment-actions-cell">
                  <button class="treatment-action-primary" type="button" @click="openPlan(plan.id)">Visualizar</button>
                  <details class="treatment-actions-menu">
                    <summary :aria-label="`Mais ações para ${plan.name}`">•••</summary>
                    <div class="treatment-actions-menu__content">
                      <button type="button" @click="openPlan(plan.id)">Visualizar plano</button>
                      <button v-if="plan.status === 'draft' || plan.status === 'in_progress'" type="button" @click="editPlanFromList(plan)">Editar plano</button>
                      <button type="button" @click="openPlanHistory(plan)">Ver histórico</button>
                      <button type="button" @click="goToPlanOdontogram(plan)">Abrir odontograma</button>
                      <button type="button" @click="goToPlanPatient(plan)">Abrir paciente</button>
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer v-if="loadState === 'ready' && total" class="treatment-pagination">
          <span>Exibindo {{ firstVisible }}–{{ lastVisible }} de {{ total }}</span>
          <label>Por página
            <select :value="pageSize" @change="changePageSize">
              <option :value="10">10</option><option :value="25">25</option><option :value="50">50</option>
            </select>
          </label>
          <div class="treatment-page-buttons">
            <button type="button" aria-label="Página anterior" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="17" aria-hidden="true" /></button>
            <span>Página {{ page }} de {{ pageCount }}</span>
            <button type="button" aria-label="Próxima página" :disabled="page >= pageCount" @click="changePage(page + 1)"><ChevronRight :size="17" aria-hidden="true" /></button>
          </div>
        </footer>
      </section>
    </main>

    <p v-if="saveNotice" class="treatment-toast" :class="`treatment-toast--${saveNoticeType}`" role="status" aria-live="polite">
      <Check v-if="saveNoticeType === 'success'" :size="17" aria-hidden="true" />
      <CircleAlert v-else :size="17" aria-hidden="true" />
      {{ saveNotice }}
      <button type="button" aria-label="Fechar aviso" @click="saveNotice = ''"><X :size="16" aria-hidden="true" /></button>
    </p>

    <UiDialog
      v-model="editorOpen"
      :title="editorMode === 'create' ? 'Novo plano de tratamento' : 'Editar dados do plano'"
      :before-close="confirmEditorClose"
    >
      <div class="treatment-editor">
        <ol class="treatment-steps" aria-label="Etapas do plano">
          <li v-for="(label, index) in stepLabels" :key="label">
            <button
              type="button"
              :class="{ 'is-current': editorStep === index, 'is-complete': editorStep > index }"
              :disabled="editorMode === 'edit' && index > 0"
              :aria-current="editorStep === index ? 'step' : undefined"
              @click="setEditorStep(index)"
            >
              <span>{{ index + 1 }}</span><span>{{ label }}</span>
            </button>
          </li>
        </ol>
        <p v-if="editorError" class="treatment-form-error" role="alert">{{ editorError }}</p>

        <section v-if="editorStep === 0" class="treatment-editor-section" aria-labelledby="plan-editor-identification">
          <div class="treatment-section-heading">
            <div><p class="treatment-eyebrow">ETAPA 1</p><h3 id="plan-editor-identification">Identificação</h3></div>
            <span><ShieldCheck :size="15" aria-hidden="true" /> Dados autorizados</span>
          </div>
          <label class="treatment-form-field treatment-patient-picker">
            <span>Paciente <b>*</b></span>
            <input
              :value="planPatientSearch"
              type="search"
              autocomplete="off"
              :disabled="editorMode === 'edit'"
              placeholder="Buscar paciente autorizado pelo nome ou código"
              @input="onPatientSearch($event.target.value)"
              @focus="planPatientSearchOpen = Boolean(planPatientSearch)"
            />
            <span v-if="selectedPatientPlan" class="treatment-selected-patient">
              <UiAvatar :name="selectedPatientPlan.name" size="sm" />
              <span><strong>{{ selectedPatientPlan.name }}</strong><small>Paciente #{{ selectedPatientPlan.id }}</small></span>
              <Check :size="16" aria-hidden="true" />
            </span>
            <span v-if="planPatientSearchOpen && editorMode === 'create'" class="treatment-patient-results">
              <button v-for="patient in planPatientOptions" :key="patient.id" type="button" @click="selectPatient(patient)">
                <UiAvatar :name="patient.name" size="sm" /><span><strong>{{ patient.name }}</strong><small>Paciente #{{ patient.id }}</small></span>
              </button>
              <span v-if="patientSearchState === 'loading'" class="treatment-picker-message">Buscando pacientes autorizados…</span>
              <span v-else-if="patientSearchState === 'ready' && !planPatientOptions.length" class="treatment-picker-message">Nenhum paciente autorizado encontrado.</span>
              <span v-else-if="patientSearchState === 'error'" class="treatment-picker-message">{{ editorError }}</span>
            </span>
          </label>
          <label class="treatment-form-field">
            <span>Nome ou descrição do plano <b>*</b></span>
            <input v-model="editor.name" maxlength="160" placeholder="Ex.: Plano de reabilitação" />
          </label>
          <label class="treatment-form-field">
            <span>Observações gerais</span>
            <textarea v-model="editor.notes" rows="3" maxlength="4000" placeholder="Anotações de planejamento clínico"></textarea>
          </label>
          <div class="treatment-form-note"><Stethoscope :size="17" aria-hidden="true" />Dentista responsável: sua sessão autenticada. O plano permanecerá como rascunho até ser iniciado.</div>
          <div v-if="selectedPatientPlan" class="treatment-patient-shortcuts">
            <button type="button" @click="router.push({ name: 'dentist-odontogram', query: { patientId: String(selectedPatientPlan.id) } })">
              <Activity :size="15" aria-hidden="true" /> Consultar odontograma
            </button>
            <span><FileClock :size="15" aria-hidden="true" /> Prontuário odontológico ainda não integrado</span>
          </div>
        </section>

        <section v-else-if="editorStep === 1 && editorMode === 'create'" class="treatment-editor-section" aria-labelledby="plan-editor-procedures">
          <div class="treatment-section-heading">
            <div><p class="treatment-eyebrow">ETAPA 2</p><h3 id="plan-editor-procedures">Procedimentos previstos</h3></div>
            <span>{{ editor.procedures.length }} adicionado(s)</span>
          </div>
          <p class="treatment-inline-note">Não há catálogo clínico configurado. Informe a nomenclatura adotada pela clínica, sem códigos ou preços presumidos.</p>
          <div class="treatment-procedure-form">
            <label class="treatment-form-field">
              <span>Nome do procedimento <b>*</b></span>
              <input v-model="draftProcedure.name" maxlength="160" placeholder="Nome clínico do procedimento" />
            </label>
            <label class="treatment-form-field">
              <span>Categoria (opcional)</span>
              <input v-model="draftProcedure.category" maxlength="80" placeholder="Categoria da clínica" />
            </label>
            <label class="treatment-form-field">
              <span>Dente FDI (opcional)</span>
              <input v-model="draftProcedure.tooth_number" inputmode="numeric" maxlength="2" placeholder="Ex.: 16" />
            </label>
            <label class="treatment-form-field">
              <span>Prioridade</span>
              <select v-model="draftProcedure.priority">
                <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select>
            </label>
            <label class="treatment-form-field">
              <span>Etapa</span>
              <input v-model="draftProcedure.stage" maxlength="100" placeholder="Etapa definida pela dentista" />
            </label>
            <label class="treatment-form-field treatment-form-field--wide">
              <span>Descrição clínica</span>
              <textarea v-model="draftProcedure.description" rows="2" maxlength="2000" placeholder="Descrição e contexto clínico"></textarea>
            </label>
            <fieldset v-if="draftProcedure.tooth_number" class="treatment-surfaces">
              <legend>Superfícies dentárias</legend>
              <label v-for="[key, label] in allSurfaces" :key="key">
                <input v-model="draftProcedure.surfaces" type="checkbox" :value="key" />
                <span>{{ label }}</span>
              </label>
            </fieldset>
            <label class="treatment-form-field treatment-form-field--wide">
              <span>Observações</span>
              <textarea v-model="draftProcedure.notes" rows="2" maxlength="2000" placeholder="Observações do procedimento"></textarea>
            </label>
            <div class="treatment-procedure-form__actions">
              <UiButton variant="secondary" size="sm" @click="addProcedureToDraft">
                <template #start><Plus :size="15" aria-hidden="true" /></template>
                Adicionar procedimento
              </UiButton>
            </div>
          </div>
          <div v-if="editor.procedures.length" class="treatment-draft-list">
            <article v-for="(procedure, index) in editor.procedures" :key="`${procedure.name}-${index}`" class="treatment-draft-item">
              <div class="treatment-draft-item__order">
                <button type="button" :disabled="index === 0" :aria-label="`Mover ${procedure.name} para cima`" @click="moveDraftProcedure(index, -1)"><ArrowUp :size="14" aria-hidden="true" /></button>
                <button type="button" :disabled="index === editor.procedures.length - 1" :aria-label="`Mover ${procedure.name} para baixo`" @click="moveDraftProcedure(index, 1)"><ArrowDown :size="14" aria-hidden="true" /></button>
              </div>
              <div><strong>{{ procedure.name }}</strong><span>{{ procedure.tooth_number ? `Dente ${procedure.tooth_number} · ${formatSurfaces(procedure.surfaces)}` : 'Sem dente associado' }} · {{ procedure.stage }} · prioridade {{ priorityLabels[procedure.priority].toLowerCase() }}</span></div>
              <button class="treatment-icon-action treatment-icon-action--danger" type="button" :aria-label="`Remover ${procedure.name}`" @click="removeDraftProcedure(index)"><Trash2 :size="16" aria-hidden="true" /></button>
            </article>
          </div>
        </section>

        <section v-else-if="editorStep === 2 && editorMode === 'create'" class="treatment-editor-section" aria-labelledby="plan-editor-organization">
          <div class="treatment-section-heading">
            <div><p class="treatment-eyebrow">ETAPA 3</p><h3 id="plan-editor-organization">Organização do plano</h3></div>
            <span>Ordem definida por você</span>
          </div>
          <p class="treatment-inline-note">Etapas e prioridades são editáveis; o sistema não impõe uma sequência clínica. Use os controles para ordenar e agrupar os procedimentos.</p>
          <div v-if="editor.procedures.length" class="treatment-organize-list">
            <article v-for="(procedure, index) in editor.procedures" :key="`${procedure.name}-organization-${index}`">
              <div class="treatment-organize-list__index">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="treatment-organize-list__main"><strong>{{ procedure.name }}</strong><span>{{ procedure.tooth_number ? `Dente ${procedure.tooth_number} · ${formatSurfaces(procedure.surfaces)}` : 'Sem dente associado' }}</span></div>
              <label><span>Etapa</span><input v-model="procedure.stage" maxlength="100" /></label>
              <label><span>Prioridade</span><select v-model="procedure.priority"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
              <div><button type="button" :disabled="index === 0" :aria-label="`Mover ${procedure.name} para cima`" @click="moveDraftProcedure(index, -1)"><ArrowUp :size="15" aria-hidden="true" /></button><button type="button" :disabled="index === editor.procedures.length - 1" :aria-label="`Mover ${procedure.name} para baixo`" @click="moveDraftProcedure(index, 1)"><ArrowDown :size="15" aria-hidden="true" /></button></div>
            </article>
          </div>
          <div v-else class="treatment-empty-inline">Nenhum procedimento incluído.</div>
        </section>

        <section v-else-if="editorStep === 3 && editorMode === 'create'" class="treatment-editor-section" aria-labelledby="plan-editor-review">
          <div class="treatment-section-heading">
            <div><p class="treatment-eyebrow">ETAPA 4</p><h3 id="plan-editor-review">Revisão</h3></div>
            <UiBadge variant="neutral">Rascunho</UiBadge>
          </div>
          <div class="treatment-review-card">
            <dl>
              <div><dt>Paciente</dt><dd>{{ selectedPatientPlan?.name || 'Selecione um paciente' }} <small v-if="selectedPatientPlan">#{{ selectedPatientPlan.id }}</small></dd></div>
              <div><dt>Dentista responsável</dt><dd>Sessão autenticada</dd></div>
              <div><dt>Plano</dt><dd>{{ editor.name || 'Sem nome' }}</dd></div>
              <div><dt>Procedimentos</dt><dd>{{ editor.procedures.length }} previsto(s) · {{ procedureCompletedCount }} concluído(s) · {{ procedureEligibleCount }} elegível(is)</dd></div>
            </dl>
            <p v-if="editor.notes"><strong>Observações gerais</strong><br />{{ editor.notes }}</p>
          </div>
          <div v-if="editor.procedures.length" class="treatment-review-procedures">
            <h4>Etapas e procedimentos</h4>
            <article v-for="(procedure, index) in editor.procedures" :key="`review-${procedure.name}-${index}`">
              <span>{{ index + 1 }}</span>
              <div><strong>{{ procedure.name }}</strong><small>{{ procedure.tooth_number ? `Dente ${procedure.tooth_number} · ${formatSurfaces(procedure.surfaces)}` : 'Sem dente associado' }} · {{ procedure.stage }} · prioridade {{ priorityLabels[procedure.priority].toLowerCase() }}</small></div>
            </article>
          </div>
          <p class="treatment-form-note"><ShieldCheck :size="16" aria-hidden="true" />Salvar não aprova nem inicia o plano. A execução exige uma ação explícita posterior.</p>
        </section>

        <section v-else class="treatment-editor-section" aria-labelledby="plan-editor-edit">
          <div class="treatment-section-heading">
            <div><p class="treatment-eyebrow">DADOS GERAIS</p><h3 id="plan-editor-edit">Editar plano</h3></div>
            <UiBadge :variant="statusVariants[detailPlan?.status]">{{ statusLabels[detailPlan?.status] }}</UiBadge>
          </div>
          <label class="treatment-form-field"><span>Nome do plano</span><input v-model="editor.name" maxlength="160" /></label>
          <label class="treatment-form-field"><span>Observações gerais</span><textarea v-model="editor.notes" rows="4" maxlength="4000"></textarea></label>
          <p class="treatment-inline-note">Os procedimentos e os registros clínicos são editados separadamente para manter o histórico e a rastreabilidade.</p>
        </section>

        <footer class="treatment-editor-footer">
          <UiButton variant="tertiary" @click="closeEditor">Cancelar</UiButton>
          <span class="treatment-editor-footer__spacer"></span>
          <UiButton v-if="editorMode === 'create' && editorStep > 0" variant="secondary" @click="setEditorStep(editorStep - 1)">
            <template #start><ChevronLeft :size="16" aria-hidden="true" /></template>Voltar
          </UiButton>
          <UiButton v-if="editorMode === 'create' && editorStep < 3" @click="setEditorStep(editorStep + 1)">
            Continuar<template #end><ChevronRight :size="16" aria-hidden="true" /></template>
          </UiButton>
          <template v-else>
            <UiButton v-if="editorMode === 'create' && editorStep === 3" variant="secondary" :loading="editorBusy" @click="saveEditor(false)">Salvar como rascunho</UiButton>
            <UiButton :loading="editorBusy" @click="saveEditor(editorMode === 'create' && editorStep === 3)">
              {{ editorMode === 'create' ? 'Salvar plano' : 'Salvar alterações' }}
            </UiButton>
          </template>
        </footer>
      </div>
    </UiDialog>

    <UiDialog v-model="procedureEditorOpen" :title="editingProcedureId ? 'Editar procedimento' : 'Adicionar procedimento'">
      <div class="treatment-procedure-editor">
        <p v-if="procedureEditorError" class="treatment-form-error" role="alert">{{ procedureEditorError }}</p>
        <label class="treatment-form-field"><span>Nome do procedimento <b>*</b></span><input v-model="procedureEditor.name" maxlength="160" /></label>
        <label class="treatment-form-field"><span>Categoria (opcional)</span><input v-model="procedureEditor.category" maxlength="80" /></label>
        <label class="treatment-form-field"><span>Dente FDI</span><input v-model="procedureEditor.tooth_number" maxlength="2" inputmode="numeric" placeholder="Opcional" /></label>
        <label class="treatment-form-field"><span>Prioridade</span><select v-model="procedureEditor.priority"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        <label class="treatment-form-field treatment-form-field--wide"><span>Etapa</span><input v-model="procedureEditor.stage" maxlength="100" /></label>
        <label class="treatment-form-field"><span>Ordem no plano</span><input v-model.number="procedureEditor.sort_order" type="number" min="0" max="999" /></label>
        <fieldset v-if="procedureEditor.tooth_number" class="treatment-surfaces treatment-form-field--wide">
          <legend>Superfícies dentárias</legend>
          <label v-for="[key, label] in allSurfaces" :key="key"><input v-model="procedureEditor.surfaces" type="checkbox" :value="key" /><span>{{ label }}</span></label>
        </fieldset>
        <label class="treatment-form-field treatment-form-field--wide"><span>Descrição clínica</span><textarea v-model="procedureEditor.description" rows="3" maxlength="2000"></textarea></label>
        <label class="treatment-form-field treatment-form-field--wide"><span>Observações</span><textarea v-model="procedureEditor.notes" rows="3" maxlength="2000"></textarea></label>
        <footer class="treatment-editor-footer">
          <UiButton variant="tertiary" @click="procedureEditorOpen = false">Cancelar</UiButton>
          <span class="treatment-editor-footer__spacer"></span>
          <UiButton :loading="procedureEditorBusy" @click="savePlanProcedure">Salvar procedimento</UiButton>
        </footer>
      </div>
    </UiDialog>

    <UiDialog v-model="detailOpen" :title="detailPlan ? `Plano: ${detailPlan.name}` : 'Detalhes do plano'">
      <div v-if="detailState === 'loading'" class="treatment-detail-loading" role="status">Carregando detalhes do plano…</div>
      <div v-else-if="detailState === 'error'" class="treatment-state treatment-state--error" role="alert">
        <p>{{ detailError }}</p><UiButton variant="secondary" @click="detailPlan && openPlan(detailPlan.id)">Tentar novamente</UiButton>
      </div>
      <div v-else-if="detailPlan" class="treatment-detail">
        <header class="treatment-detail-header">
          <div class="treatment-detail-header__person"><UiAvatar :name="detailPlan.patient.name" size="lg" /><div><span>Paciente #{{ detailPlan.patient.id }}</span><button type="button" @click="goToPatient">{{ detailPlan.patient.name }}</button></div></div>
          <div class="treatment-detail-header__meta">
            <span><Stethoscope :size="14" aria-hidden="true" />{{ detailPlan.dentist_name }}</span>
            <span><CalendarDays :size="14" aria-hidden="true" />Criado em {{ formatDate(detailPlan.created_at) }}</span>
            <span><Clock3 :size="14" aria-hidden="true" />Atualizado em {{ formatDateTime(detailPlan.updated_at) }}</span>
          </div>
          <div class="treatment-detail-header__status"><UiBadge :variant="statusVariants[detailPlan.status]">{{ statusLabels[detailPlan.status] }}</UiBadge><span>Plano #{{ detailPlan.id }}</span></div>
        </header>

        <div class="treatment-detail-actions">
          <UiButton v-if="['draft', 'in_progress'].includes(detailPlan.status)" variant="secondary" size="sm" @click="openEditEditor(detailPlan)">Editar dados</UiButton>
          <UiButton v-if="detailPlan.status === 'draft'" size="sm" @click="changePlanStatus('start')">Iniciar plano</UiButton>
          <UiButton v-if="['draft', 'in_progress'].includes(detailPlan.status)" variant="tertiary" size="sm" @click="changePlanStatus('cancel')">Cancelar plano</UiButton>
          <UiButton variant="tertiary" size="sm" @click="goToOdontogram"><template #start><Activity :size="15" aria-hidden="true" /></template>Odontograma</UiButton>
        </div>

        <div class="treatment-detail-stats">
          <article><span>Procedimentos</span><strong>{{ detailPlan.procedure_count }}</strong></article>
          <article><span>Concluídos</span><strong>{{ detailPlan.completed_count }}</strong></article>
          <article><span>Em andamento</span><strong>{{ detailPlan.in_progress_count }}</strong></article>
          <article><span>Pendentes</span><strong>{{ detailPlan.pending_count }}</strong></article>
        </div>
        <div v-if="detailPlan.progress_percent !== null" class="treatment-detail-progress">
          <div><strong>Progresso clínico</strong><span>{{ detailPlan.progress_percent }}%</span></div>
          <div class="treatment-progress treatment-progress--large" role="progressbar" :aria-valuenow="detailPlan.progress_percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${detailPlan.progress_percent}%` }"></span></div>
          <small>Somente procedimentos vinculados a registros concluídos no odontograma entram no progresso.</small>
        </div>
        <div v-else class="treatment-detail-no-progress"><CircleAlert :size="16" aria-hidden="true" />{{ detailPlan.procedure_count ? 'Não há procedimentos elegíveis para calcular o progresso.' : 'Este plano ainda não possui procedimentos.' }}</div>

        <div class="treatment-detail-tabs" role="tablist" aria-label="Seções do plano">
          <button id="plan-tab-overview" type="button" role="tab" :aria-selected="detailTab === 'overview'" @click="changeDetailTab('overview')">Visão geral</button>
          <button id="plan-tab-procedures" type="button" role="tab" :aria-selected="detailTab === 'procedures'" @click="changeDetailTab('procedures')">Procedimentos</button>
          <button id="plan-tab-odontogram" type="button" role="tab" :aria-selected="detailTab === 'odontogram'" @click="changeDetailTab('odontogram')">Odontograma</button>
          <button id="plan-tab-history" type="button" role="tab" :aria-selected="detailTab === 'history'" @click="changeDetailTab('history')">Histórico</button>
        </div>

        <section v-if="detailTab === 'overview'" class="treatment-detail-section" role="tabpanel" aria-labelledby="plan-tab-overview">
          <div class="treatment-overview-card"><h3>Observações gerais</h3><p v-if="detailPlan.notes">{{ detailPlan.notes }}</p><p v-else class="treatment-muted">Nenhuma observação registrada.</p></div>
          <div class="treatment-overview-card"><h3>Fluxo de aprovação</h3><p>Não configurado. O plano não será marcado como aprovado automaticamente.</p></div>
          <div class="treatment-overview-card"><h3>Responsável</h3><p>{{ detailPlan.dentist_name }} · Dentista responsável</p></div>
        </section>
        <section v-else-if="detailTab === 'procedures'" class="treatment-detail-section" role="tabpanel" aria-labelledby="plan-tab-procedures">
          <div class="treatment-procedures-heading"><div><h3>Procedimentos planejados</h3><p>Conclusões clínicas permanecem vinculadas ao odontograma.</p></div><UiButton v-if="['draft', 'in_progress'].includes(detailPlan.status)" size="sm" @click="openProcedureEditor()"><template #start><Plus :size="15" aria-hidden="true" /></template>Adicionar</UiButton></div>
          <div v-if="!detailPlan.procedures.length" class="treatment-empty-inline">Este plano ainda não possui procedimentos.</div>
          <article v-for="procedure in detailPlan.procedures" :key="procedure.id" class="treatment-procedure-card">
            <div class="treatment-procedure-card__top">
              <div><span class="treatment-procedure-card__order">{{ String(procedure.sort_order + 1).padStart(2, '0') }}</span><h4>{{ procedure.name }}</h4></div>
              <UiBadge :variant="procedure.status === 'completed' ? 'success' : procedure.status === 'in_progress' ? 'info' : procedure.status === 'cancelled' ? 'danger' : 'neutral'">{{ procedureStatusLabels[procedure.status] }}</UiBadge>
            </div>
            <p v-if="procedure.description">{{ procedure.description }}</p>
            <div class="treatment-procedure-card__meta">
              <span>{{ procedure.tooth_number ? `Dente ${procedure.tooth_number} · ${formatSurfaces(procedure.surfaces)}` : 'Sem dente associado' }}</span>
              <span>Etapa: {{ procedure.stage }}</span><span>Prioridade: {{ priorityLabels[procedure.priority] }}</span>
              <span v-if="procedure.category">Categoria: {{ procedure.category }}</span>
            </div>
            <p v-if="procedure.notes" class="treatment-procedure-card__notes">{{ procedure.notes }}</p>
            <div v-if="procedure.completed_odontogram_entry_id" class="treatment-linked-entry"><Check :size="14" aria-hidden="true" />Conclusão clínica vinculada ao registro #{{ procedure.completed_odontogram_entry_id }}</div>
            <div v-if="['draft', 'in_progress'].includes(detailPlan.status) && !['completed', 'cancelled'].includes(procedure.status)" class="treatment-procedure-card__actions">
              <button type="button" @click="openProcedureEditor(procedure)">Editar</button>
              <button v-if="detailPlan.status === 'in_progress' && procedure.status === 'planned'" type="button" @click="startProcedure(procedure)">Iniciar</button>
              <button v-if="procedure.status === 'in_progress'" type="button" @click="beginCompletion(procedure)">Registrar conclusão</button>
              <button type="button" @click="cancelProcedure(procedure)">Cancelar etapa</button>
              <button v-if="procedure.status === 'planned'" class="is-danger" type="button" @click="removeProcedure(procedure)">Remover</button>
            </div>
          </article>
        </section>
        <section v-else-if="detailTab === 'odontogram'" class="treatment-detail-section" role="tabpanel" aria-labelledby="plan-tab-odontogram">
          <div class="treatment-procedures-heading"><div><h3>Registros do odontograma</h3><p>As condições e execuções são mantidas no módulo clínico.</p></div><UiButton variant="secondary" size="sm" @click="goToOdontogram">Abrir odontograma</UiButton></div>
          <div v-if="odontogramState === 'loading'" class="treatment-empty-inline" role="status">Carregando registros do paciente…</div>
          <div v-else-if="odontogramState === 'error'" class="treatment-empty-inline" role="alert">{{ detailError }} <button type="button" @click="loadOdontogram">Tentar novamente</button></div>
          <div v-else-if="!odontogramEntries.length" class="treatment-empty-inline">Não há registros no odontograma para este paciente.</div>
          <article v-for="entry in odontogramEntries.slice(0, 12)" v-else :key="entry.id" class="treatment-history-item">
            <span class="treatment-history-item__icon"><Activity :size="16" aria-hidden="true" /></span>
            <div><strong>{{ entry.label }} · dente {{ entry.tooth_number }}</strong><p>{{ formatSurfaces(entry.surfaces) }} · {{ procedureStatusLabels[entry.status] || entry.status }} · {{ entry.dentist_name }}</p></div>
            <time>{{ formatDateTime(entry.created_at) }}</time>
          </article>
        </section>
        <section v-else class="treatment-detail-section" role="tabpanel" aria-labelledby="plan-tab-history">
          <div v-if="historyState === 'loading'" class="treatment-empty-inline" role="status">Carregando histórico…</div>
          <div v-else-if="historyState === 'error'" class="treatment-empty-inline" role="alert">{{ historyError }} <button type="button" @click="loadHistory">Tentar novamente</button></div>
          <div v-else-if="historyState === 'empty'" class="treatment-empty-inline">Nenhuma alteração registrada.</div>
          <article v-for="event in planHistory" v-else :key="event.id" class="treatment-history-item">
            <span class="treatment-history-item__icon"><History :size="16" aria-hidden="true" /></span>
            <div><strong>{{ event.summary }}</strong><p>{{ event.dentist_name }}<span v-if="event.procedure_id"> · procedimento #{{ event.procedure_id }}</span></p></div>
            <time>{{ formatDateTime(event.created_at) }}</time>
          </article>
        </section>

        <div v-if="pendingCompletion" class="treatment-completion-box">
          <div><h3>Vincular conclusão clínica</h3><p>Selecione um registro concluído no odontograma, do mesmo dente e superfícies, ligado a atendimento concluído.</p></div>
          <div v-if="odontogramState === 'loading'" class="treatment-empty-inline">Carregando registros…</div>
          <div v-else-if="!matchingCompletionEntries.length" class="treatment-empty-inline">Nenhum registro correspondente. Registre e conclua o procedimento no odontograma após o atendimento.</div>
          <label v-else class="treatment-form-field"><span>Registro clínico</span>
            <select v-model="completionEntryId">
              <option value="">Selecione um registro</option>
              <option v-for="entry in matchingCompletionEntries" :key="entry.id" :value="String(entry.id)">{{ entry.label }} · {{ formatDate(entry.record_date) }} · registro #{{ entry.id }}</option>
            </select>
          </label>
          <div class="treatment-completion-box__actions">
            <UiButton variant="tertiary" size="sm" @click="pendingCompletion = null">Cancelar</UiButton>
            <UiButton size="sm" :disabled="!completionEntryId" @click="confirmProcedureCompletion">Confirmar conclusão</UiButton>
          </div>
        </div>
      </div>
    </UiDialog>
  </div>
</template>

<style>
.treatment-page {
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--color-background);
  color: var(--color-text);
}

html:has(.treatment-page),
body:has(.treatment-page) {
  overflow-x: hidden;
}

.treatment-main {
  width: min(100% - 2.5rem, 90rem);
  margin: 0 auto;
  padding: 2.25rem 0 3.5rem;
}

.treatment-intro,
.treatment-intro__actions,
.treatment-panel__heading,
.treatment-toolbar,
.treatment-filter-actions,
.treatment-pagination,
.treatment-page-buttons,
.treatment-section-heading,
.treatment-editor-footer,
.treatment-procedure-form__actions,
.treatment-procedures-heading,
.treatment-detail-header,
.treatment-detail-actions,
.treatment-detail-progress > div:first-child,
.treatment-completion-box__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.treatment-intro {
  align-items: flex-end;
  margin-bottom: 1.5rem;
}

.treatment-eyebrow {
  margin: 0 0 0.4rem;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.11em;
}

.treatment-intro h1 {
  margin: 0;
  font-size: clamp(1.7rem, 3vw, 2.25rem);
  letter-spacing: -0.045em;
  line-height: 1.14;
}

.treatment-intro > div:first-child > p:last-child {
  margin: 0.55rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.92rem;
}

.treatment-intro__actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.treatment-access-note {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.treatment-access-note svg {
  color: var(--color-success);
}

.treatment-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}

.treatment-metric {
  display: flex;
  min-height: 106px;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.treatment-metric__icon,
.treatment-empty__icon,
.treatment-history-item__icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.7rem;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.treatment-metric__icon--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.treatment-metric__icon--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.treatment-metric__icon--green { background: var(--color-success-subtle); color: var(--color-success); }

.treatment-metric > div { display: grid; gap: 0.18rem; }
.treatment-metric > div > span { color: var(--color-text-secondary); font-size: 0.76rem; }
.treatment-metric strong { font-size: 1.45rem; line-height: 1.2; letter-spacing: -0.04em; }
.treatment-metric small { color: var(--color-text-muted); font-size: 0.68rem; line-height: 1.35; }
.treatment-metric__skeleton { width: 2.8rem; height: 1.4rem; border-radius: 0.4rem; background: var(--color-surface-subtle); animation: treatment-pulse 1.2s ease-in-out infinite; }

.treatment-panel {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.treatment-panel__heading {
  align-items: flex-end;
  padding: 1.3rem 1.35rem 1rem;
}

.treatment-panel__heading h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.025em; }
.treatment-panel__heading > div > p:last-child { margin: 0.32rem 0 0; color: var(--color-text-muted); font-size: 0.76rem; }

.treatment-search {
  display: flex;
  width: min(100%, 31rem);
  min-height: 2.75rem;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.treatment-search:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-subtle); }
.treatment-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: 0.78rem; }
.treatment-search input::placeholder { color: var(--color-text-muted); }
.treatment-search button,
.treatment-page-buttons button,
.treatment-draft-item__order button,
.treatment-organize-list article > div:last-child button {
  display: grid;
  width: 1.8rem;
  height: 1.8rem;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.treatment-search button:hover,
.treatment-page-buttons button:not(:disabled):hover,
.treatment-draft-item__order button:not(:disabled):hover,
.treatment-organize-list article > div:last-child button:not(:disabled):hover { background: var(--color-surface-subtle); color: var(--color-primary); }

.treatment-toolbar {
  justify-content: flex-start;
  gap: 1.25rem;
  padding: 0 1.35rem 0.9rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.treatment-filter-trigger {
  position: relative;
  display: inline-flex;
  min-height: 2.2rem;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
}
.treatment-filter-trigger:hover,
.treatment-filter-trigger[aria-expanded="true"] { border-color: var(--color-primary); color: var(--color-primary); }
.treatment-filter-dot { width: 0.42rem; height: 0.42rem; border-radius: 50%; background: var(--color-primary); }
.treatment-sort { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); font-size: 0.74rem; }
.treatment-sort select,
.treatment-filters select,
.treatment-filters input,
.treatment-form-field input,
.treatment-form-field select,
.treatment-form-field textarea,
.treatment-organize-list input,
.treatment-organize-list select {
  min-height: 2.45rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.78rem;
}
.treatment-sort select { padding-block: 0.25rem; }

.treatment-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
  padding: 1rem 1.35rem;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface-subtle);
}
.treatment-filters > label { display: grid; gap: 0.35rem; color: var(--color-text-secondary); font-size: 0.72rem; font-weight: 600; }
.treatment-filters input:focus,
.treatment-filters select:focus,
.treatment-form-field input:focus,
.treatment-form-field select:focus,
.treatment-form-field textarea:focus,
.treatment-organize-list input:focus,
.treatment-organize-list select:focus { outline: 3px solid var(--color-primary-subtle); border-color: var(--color-primary); }
.treatment-filter-note { grid-column: 1 / -1; margin: 0; color: var(--color-text-muted); font-size: 0.72rem; }
.treatment-filter-actions { grid-column: 1 / -1; justify-content: flex-end; }

.treatment-table-wrap { overflow-x: auto; }
.treatment-table { width: 100%; border-collapse: collapse; min-width: 72rem; text-align: left; }
.treatment-table th { padding: 0.8rem 0.75rem; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 0.66rem; font-weight: 700; white-space: nowrap; }
.treatment-table th:first-child,
.treatment-table td:first-child { padding-left: 1.35rem; }
.treatment-table th:last-child,
.treatment-table td:last-child { padding-right: 1.2rem; }
.treatment-table td { padding: 0.85rem 0.75rem; border-bottom: 1px solid var(--color-border-subtle); color: var(--color-text-secondary); font-size: 0.75rem; vertical-align: middle; }
.treatment-table tbody tr:last-child td { border-bottom: 0; }
.treatment-table tbody tr:hover { background: var(--color-surface-subtle); }
.treatment-patient-cell { display: flex; min-width: 10rem; align-items: center; gap: 0.6rem; }
.treatment-patient-cell > div { display: grid; gap: 0.2rem; }
.treatment-patient-cell strong { color: var(--color-text); font-size: 0.76rem; }
.treatment-patient-cell span,
.treatment-plan-code,
.treatment-cell-muted { display: block; color: var(--color-text-muted); font-size: 0.67rem; }
.treatment-plan-link { max-width: 13rem; overflow: hidden; padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; font-size: 0.76rem; font-weight: 700; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.treatment-plan-link:hover { text-decoration: underline; }
.treatment-plan-code { margin-top: 0.22rem; }
.treatment-dentist { display: flex; min-width: 8rem; align-items: center; gap: 0.35rem; }
.treatment-dentist svg { color: var(--color-text-muted); }
.treatment-progress-copy { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.3rem; font-size: 0.66rem; }
.treatment-progress-copy strong { color: var(--color-text); }
.treatment-progress-copy span { color: var(--color-text-muted); }
.treatment-progress { overflow: hidden; width: 5.5rem; height: 0.38rem; border-radius: 999px; background: var(--color-surface-subtle); }
.treatment-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--color-success); transition: width 220ms ease; }
.treatment-actions-cell { display: flex; align-items: center; gap: 0.45rem; white-space: nowrap; }
.treatment-action-primary { padding: 0.42rem 0.65rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); font: inherit; font-size: 0.7rem; font-weight: 700; cursor: pointer; }
.treatment-action-primary:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }
.treatment-actions-menu { position: relative; }
.treatment-actions-menu summary { display: grid; width: 1.9rem; height: 1.9rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: 1rem; list-style: none; cursor: pointer; }
.treatment-actions-menu summary::-webkit-details-marker { display: none; }
.treatment-actions-menu__content { position: absolute; z-index: 5; top: calc(100% + 0.3rem); right: 0; display: grid; min-width: 11rem; padding: 0.35rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
.treatment-actions-menu__content button { padding: 0.55rem 0.65rem; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); font: inherit; font-size: 0.74rem; text-align: left; cursor: pointer; }
.treatment-actions-menu__content button:hover { background: var(--color-surface-subtle); color: var(--color-primary); }

.treatment-pagination { justify-content: flex-end; gap: 1rem; padding: 0.85rem 1.35rem; border-top: 1px solid var(--color-border-subtle); color: var(--color-text-muted); font-size: 0.72rem; }
.treatment-pagination > label { display: flex; align-items: center; gap: 0.4rem; }
.treatment-pagination select { min-height: 1.9rem; padding: 0.2rem 0.35rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; }
.treatment-page-buttons { gap: 0.4rem; }
.treatment-page-buttons button { border: 1px solid var(--color-border); }
.treatment-page-buttons button:disabled,
.treatment-draft-item__order button:disabled,
.treatment-organize-list article > div:last-child button:disabled { opacity: 0.4; cursor: not-allowed; }

.treatment-state,
.treatment-empty { display: flex; min-height: 13rem; align-items: center; justify-content: center; gap: 1rem; padding: 2rem; }
.treatment-state--error { justify-content: space-between; color: var(--color-danger); }
.treatment-state strong { color: var(--color-text); }
.treatment-state p { margin: 0.3rem 0 0; color: var(--color-text-secondary); font-size: 0.8rem; }
.treatment-empty { flex-direction: column; gap: 0.55rem; text-align: center; }
.treatment-empty__icon { width: 2.7rem; height: 2.7rem; }
.treatment-empty strong { color: var(--color-text); font-size: 0.9rem; }
.treatment-empty p { max-width: 27rem; margin: 0 0 0.5rem; color: var(--color-text-muted); font-size: 0.76rem; line-height: 1.5; }
.treatment-loading { display: grid; gap: 0.5rem; padding: 1rem 1.35rem; }
.treatment-skeleton-row { display: grid; min-height: 3.8rem; grid-template-columns: 1.3fr 1.2fr 0.7fr 1fr 0.7fr 0.8fr; align-items: center; gap: 1rem; border-bottom: 1px solid var(--color-border-subtle); }
.treatment-skeleton-row i { height: 0.6rem; border-radius: 1rem; background: var(--color-surface-subtle); animation: treatment-pulse 1.2s ease-in-out infinite; }
@keyframes treatment-pulse { 50% { opacity: 0.48; } }

.treatment-toast { position: fixed; z-index: 80; right: 1.25rem; bottom: 1.25rem; display: flex; max-width: min(32rem, calc(100vw - 2rem)); align-items: flex-start; gap: 0.65rem; padding: 0.85rem 0.9rem; border: 1px solid var(--color-success); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); color: var(--color-text); font-size: 0.78rem; }
.treatment-toast > svg { flex: 0 0 auto; color: var(--color-success); }
.treatment-toast--warning { border-color: var(--color-warning); }.treatment-toast--warning > svg { color: var(--color-warning); }
.treatment-toast--danger { border-color: var(--color-danger); }.treatment-toast--danger > svg { color: var(--color-danger); }
.treatment-toast button { display: grid; width: 1.5rem; height: 1.5rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }

.treatment-editor { display: grid; gap: 1.1rem; }
.treatment-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.treatment-steps button { display: flex; width: 100%; min-height: 2.6rem; align-items: center; gap: 0.45rem; padding: 0.35rem 0.4rem; border: 1px solid transparent; border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); font: inherit; font-size: 0.68rem; text-align: left; cursor: pointer; }
.treatment-steps button > span:first-child { display: grid; width: 1.55rem; height: 1.55rem; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--color-surface-subtle); color: var(--color-text-secondary); font-size: 0.7rem; font-weight: 700; }
.treatment-steps button.is-current { border-color: var(--color-primary-subtle); background: var(--color-primary-subtle); color: var(--color-primary); font-weight: 700; }
.treatment-steps button.is-current > span:first-child,
.treatment-steps button.is-complete > span:first-child { background: var(--color-primary); color: white; }
.treatment-steps button:disabled { cursor: default; }
.treatment-editor-section { display: grid; gap: 0.9rem; }
.treatment-section-heading { align-items: flex-start; margin-bottom: 0.15rem; }
.treatment-section-heading h3 { margin: 0; font-size: 1.05rem; }
.treatment-section-heading > span { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--color-text-muted); font-size: 0.72rem; }
.treatment-section-heading > span svg { color: var(--color-success); }
.treatment-form-field { position: relative; display: grid; gap: 0.35rem; color: var(--color-text-secondary); font-size: 0.74rem; font-weight: 600; }
.treatment-form-field b { color: var(--color-danger); }
.treatment-form-field input,
.treatment-form-field select,
.treatment-form-field textarea { width: 100%; min-width: 0; font-weight: 400; }
.treatment-form-field textarea { resize: vertical; }
.treatment-form-field textarea::placeholder,
.treatment-form-field input::placeholder { color: var(--color-text-muted); }
.treatment-patient-picker { z-index: 4; }
.treatment-selected-patient { display: flex; align-items: center; gap: 0.55rem; padding: 0.6rem; border: 1px solid var(--color-success); border-radius: var(--radius-md); background: var(--color-success-subtle); }
.treatment-selected-patient > span { display: grid; flex: 1; gap: 0.15rem; }
.treatment-selected-patient strong { color: var(--color-text); font-size: 0.76rem; }
.treatment-selected-patient small { color: var(--color-text-muted); font-size: 0.66rem; }
.treatment-selected-patient > svg { color: var(--color-success); }
.treatment-patient-results { position: absolute; z-index: 8; top: calc(100% - 0.15rem); right: 0; left: 0; display: grid; max-height: 15rem; overflow-y: auto; padding: 0.3rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
.treatment-patient-results button { display: flex; align-items: center; gap: 0.55rem; padding: 0.5rem; border: 0; border-radius: var(--radius-sm); background: transparent; text-align: left; cursor: pointer; }
.treatment-patient-results button:hover { background: var(--color-surface-subtle); }
.treatment-patient-results button > span { display: grid; gap: 0.15rem; }
.treatment-patient-results strong { color: var(--color-text); font-size: 0.74rem; }
.treatment-patient-results small,.treatment-picker-message { color: var(--color-text-muted); font-size: 0.67rem; }
.treatment-picker-message { padding: 0.55rem; }
.treatment-form-note,.treatment-inline-note { display: flex; align-items: flex-start; gap: 0.45rem; margin: 0; color: var(--color-text-muted); font-size: 0.72rem; line-height: 1.5; }
.treatment-form-note svg { flex: 0 0 auto; color: var(--color-primary); }
.treatment-inline-note { display: block; padding: 0.65rem 0.75rem; border-left: 3px solid var(--color-primary); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; background: var(--color-primary-subtle); }
.treatment-patient-shortcuts { display: flex; flex-wrap: wrap; gap: 0.8rem; }
.treatment-patient-shortcuts button,.treatment-patient-shortcuts > span { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; font-size: 0.72rem; text-decoration: none; cursor: pointer; }
.treatment-patient-shortcuts > span { color: var(--color-text-muted); cursor: default; }
.treatment-form-error { margin: 0; padding: 0.65rem 0.75rem; border: 1px solid var(--color-danger); border-radius: var(--radius-md); background: var(--color-danger-subtle); color: var(--color-danger); font-size: 0.75rem; }

.treatment-procedure-form,.treatment-procedure-editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.treatment-form-field--wide { grid-column: 1 / -1; }
.treatment-surfaces { display: flex; flex-wrap: wrap; gap: 0.45rem; grid-column: 1 / -1; margin: 0; padding: 0.65rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.treatment-surfaces legend { padding: 0 0.3rem; color: var(--color-text-secondary); font-size: 0.72rem; font-weight: 600; }
.treatment-surfaces label { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.45rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: 0.68rem; cursor: pointer; }
.treatment-surfaces input { accent-color: var(--color-primary); }
.treatment-procedure-form__actions { grid-column: 1 / -1; justify-content: flex-end; }
.treatment-draft-list,.treatment-organize-list { display: grid; gap: 0.5rem; }
.treatment-draft-item { display: flex; align-items: center; gap: 0.65rem; padding: 0.6rem; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); }
.treatment-draft-item__order { display: grid; gap: 0.1rem; }
.treatment-draft-item > div:nth-child(2) { display: grid; flex: 1; gap: 0.18rem; min-width: 0; }
.treatment-draft-item > div:nth-child(2) strong { color: var(--color-text); font-size: 0.76rem; }
.treatment-draft-item > div:nth-child(2) span { color: var(--color-text-muted); font-size: 0.66rem; }
.treatment-icon-action { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.treatment-icon-action--danger:hover { background: var(--color-danger-subtle); color: var(--color-danger); }
.treatment-organize-list article { display: grid; grid-template-columns: 2.5rem minmax(8rem, 1fr) minmax(8rem, 0.9fr) minmax(7rem, 0.7fr) 4rem; align-items: end; gap: 0.65rem; padding: 0.7rem; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); }
.treatment-organize-list__index { align-self: center; color: var(--color-primary); font-size: 0.78rem; font-weight: 700; }
.treatment-organize-list__main { display: grid; gap: 0.2rem; align-self: center; }
.treatment-organize-list__main strong { color: var(--color-text); font-size: 0.76rem; }
.treatment-organize-list__main span,.treatment-organize-list label span { color: var(--color-text-muted); font-size: 0.64rem; }
.treatment-organize-list label { display: grid; gap: 0.25rem; }
.treatment-organize-list article > div:last-child { display: flex; align-self: center; justify-content: flex-end; }
.treatment-empty-inline { padding: 1rem; border: 1px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); font-size: 0.75rem; text-align: center; }
.treatment-review-card { padding: 0.9rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); }
.treatment-review-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; margin: 0; }
.treatment-review-card dl > div { display: grid; gap: 0.25rem; }
.treatment-review-card dt { color: var(--color-text-muted); font-size: 0.67rem; }
.treatment-review-card dd { margin: 0; color: var(--color-text); font-size: 0.76rem; font-weight: 600; }
.treatment-review-card dd small { color: var(--color-text-muted); font-weight: 400; }
.treatment-review-card > p { margin: 0.85rem 0 0; color: var(--color-text-secondary); font-size: 0.74rem; line-height: 1.5; }
.treatment-review-procedures { display: grid; gap: 0.45rem; }
.treatment-review-procedures h4 { margin: 0; color: var(--color-text-secondary); font-size: 0.74rem; }
.treatment-review-procedures article { display: flex; align-items: center; gap: 0.55rem; padding: 0.55rem 0; border-bottom: 1px solid var(--color-border-subtle); }
.treatment-review-procedures article > span { display: grid; width: 1.5rem; height: 1.5rem; place-items: center; border-radius: 50%; background: var(--color-primary-subtle); color: var(--color-primary); font-size: 0.65rem; font-weight: 700; }
.treatment-review-procedures article > div { display: grid; gap: 0.15rem; }
.treatment-review-procedures strong { color: var(--color-text); font-size: 0.73rem; }
.treatment-review-procedures small { color: var(--color-text-muted); font-size: 0.66rem; }
.treatment-editor-footer { justify-content: flex-end; padding-top: 0.85rem; border-top: 1px solid var(--color-border-subtle); }
.treatment-editor-footer__spacer { flex: 1; }

.treatment-detail { display: grid; gap: 1rem; }
.treatment-detail-header { align-items: flex-start; padding-bottom: 0.85rem; border-bottom: 1px solid var(--color-border-subtle); }
.treatment-detail-header__person { display: flex; min-width: 11rem; align-items: center; gap: 0.6rem; }
.treatment-detail-header__person > div { display: grid; gap: 0.2rem; }
.treatment-detail-header__person span,.treatment-detail-header__meta { color: var(--color-text-muted); font-size: 0.68rem; }
.treatment-detail-header__person button { padding: 0; border: 0; background: none; color: var(--color-primary); font: inherit; font-size: 0.82rem; font-weight: 700; text-align: left; cursor: pointer; }
.treatment-detail-header__meta { display: grid; gap: 0.35rem; }
.treatment-detail-header__meta span { display: inline-flex; align-items: center; gap: 0.35rem; }
.treatment-detail-header__status { display: grid; justify-items: end; gap: 0.3rem; }
.treatment-detail-header__status > span { color: var(--color-text-muted); font-size: 0.66rem; }
.treatment-detail-actions { justify-content: flex-end; flex-wrap: wrap; gap: 0.45rem; }
.treatment-detail-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; }
.treatment-detail-stats article { display: grid; gap: 0.2rem; padding: 0.7rem; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); }
.treatment-detail-stats span { color: var(--color-text-muted); font-size: 0.67rem; }
.treatment-detail-stats strong { color: var(--color-text); font-size: 1.1rem; }
.treatment-detail-progress { display: grid; gap: 0.45rem; }
.treatment-detail-progress > div:first-child { color: var(--color-text-secondary); font-size: 0.73rem; }
.treatment-detail-progress > div:first-child span { color: var(--color-success); font-weight: 750; }
.treatment-progress--large { width: 100%; height: 0.55rem; }
.treatment-detail-progress small { color: var(--color-text-muted); font-size: 0.65rem; }
.treatment-detail-no-progress { display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem; border-radius: var(--radius-sm); background: var(--color-surface-subtle); color: var(--color-text-muted); font-size: 0.7rem; }
.treatment-detail-tabs { display: flex; gap: 0.3rem; overflow-x: auto; border-bottom: 1px solid var(--color-border); }
.treatment-detail-tabs button { min-height: 2.45rem; padding: 0 0.75rem; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--color-text-muted); font: inherit; font-size: 0.73rem; white-space: nowrap; cursor: pointer; }
.treatment-detail-tabs button[aria-selected="true"] { border-bottom-color: var(--color-primary); color: var(--color-primary); font-weight: 700; }
.treatment-detail-section { display: grid; gap: 0.65rem; min-height: 8rem; }
.treatment-overview-card { padding: 0.8rem; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); }
.treatment-overview-card h3 { margin: 0 0 0.4rem; color: var(--color-text); font-size: 0.76rem; }
.treatment-overview-card p { margin: 0; color: var(--color-text-secondary); font-size: 0.73rem; line-height: 1.5; }
.treatment-muted { color: var(--color-text-muted) !important; }
.treatment-procedures-heading { align-items: flex-start; }
.treatment-procedures-heading h3 { margin: 0; color: var(--color-text); font-size: 0.83rem; }
.treatment-procedures-heading p { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.68rem; }
.treatment-procedure-card { display: grid; gap: 0.55rem; padding: 0.8rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.treatment-procedure-card__top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.treatment-procedure-card__top > div { display: flex; align-items: center; gap: 0.5rem; }
.treatment-procedure-card__top h4 { margin: 0; color: var(--color-text); font-size: 0.8rem; }
.treatment-procedure-card__order { display: grid; width: 1.55rem; height: 1.55rem; place-items: center; border-radius: 50%; background: var(--color-primary-subtle); color: var(--color-primary); font-size: 0.65rem; font-weight: 700; }
.treatment-procedure-card > p { margin: 0; color: var(--color-text-secondary); font-size: 0.72rem; line-height: 1.5; }
.treatment-procedure-card__meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; color: var(--color-text-muted); font-size: 0.66rem; }
.treatment-procedure-card__notes { padding-top: 0.45rem; border-top: 1px solid var(--color-border-subtle); }
.treatment-linked-entry { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--color-success); font-size: 0.68rem; }
.treatment-procedure-card__actions { display: flex; flex-wrap: wrap; gap: 0.35rem; padding-top: 0.45rem; border-top: 1px solid var(--color-border-subtle); }
.treatment-procedure-card__actions button { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); font: inherit; font-size: 0.66rem; cursor: pointer; }
.treatment-procedure-card__actions button:hover { background: var(--color-primary-subtle); }
.treatment-procedure-card__actions button.is-danger { color: var(--color-danger); }
.treatment-history-item { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; padding: 0.65rem 0; border-bottom: 1px solid var(--color-border-subtle); }
.treatment-history-item__icon { width: 1.8rem; height: 1.8rem; border-radius: 50%; }
.treatment-history-item > div { min-width: 0; }
.treatment-history-item strong { color: var(--color-text); font-size: 0.72rem; }
.treatment-history-item p { margin: 0.2rem 0 0; color: var(--color-text-muted); font-size: 0.65rem; }
.treatment-history-item time { color: var(--color-text-muted); font-size: 0.64rem; text-align: right; }
.treatment-history-item button,
.treatment-empty-inline button { padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; cursor: pointer; }
.treatment-completion-box { display: grid; gap: 0.7rem; padding: 0.85rem; border: 1px solid var(--color-warning); border-radius: var(--radius-md); background: var(--color-warning-subtle); }
.treatment-completion-box h3 { margin: 0; color: var(--color-text); font-size: 0.8rem; }
.treatment-completion-box p { margin: 0.25rem 0 0; color: var(--color-text-secondary); font-size: 0.7rem; line-height: 1.45; }
.treatment-completion-box__actions { justify-content: flex-end; }
.treatment-detail-loading { padding: 2rem; color: var(--color-text-muted); text-align: center; }

@media (max-width: 1050px) {
  .treatment-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .treatment-intro { align-items: flex-start; }
  .treatment-intro__actions { align-items: flex-end; flex-direction: column-reverse; }
}

@media (max-width: 720px) {
  .treatment-main { width: min(100% - 1.2rem, 90rem); padding-top: 1.35rem; }
  .treatment-intro { align-items: flex-start; flex-direction: column; gap: 0.9rem; }
  .treatment-intro__actions { width: 100%; align-items: stretch; flex-direction: column-reverse; }
  .treatment-access-note { font-size: 0.7rem; }
  .treatment-metrics { gap: 0.55rem; }
  .treatment-metric { min-height: 96px; gap: 0.5rem; padding: 0.7rem; }
  .treatment-metric__icon { width: 1.9rem; height: 1.9rem; }
  .treatment-metric > div > span { font-size: 0.68rem; }
  .treatment-metric small { font-size: 0.62rem; }
  .treatment-panel__heading { align-items: stretch; flex-direction: column; padding: 1rem; }
  .treatment-search { width: 100%; }
  .treatment-toolbar { padding-inline: 1rem; }
  .treatment-filters { grid-template-columns: 1fr; padding: 0.85rem 1rem; }
  .treatment-filter-note,.treatment-filter-actions { grid-column: 1; }
  .treatment-table { min-width: 68rem; }
  .treatment-pagination { justify-content: center; flex-wrap: wrap; padding-inline: 0.75rem; }
  .treatment-state { align-items: flex-start; flex-direction: column; padding: 1.2rem; }
  .treatment-editor { gap: 0.85rem; }
  .treatment-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .treatment-steps button { font-size: 0.65rem; }
  .treatment-procedure-form,.treatment-procedure-editor { grid-template-columns: 1fr; }
  .treatment-form-field--wide,.treatment-surfaces,.treatment-procedure-form__actions { grid-column: 1; }
  .treatment-organize-list article { grid-template-columns: 2rem minmax(0, 1fr) 3.5rem; }
  .treatment-organize-list article > label { grid-column: 2 / -1; }
  .treatment-organize-list article > div:last-child { grid-column: 3; grid-row: 1; }
  .treatment-detail-header { display: grid; grid-template-columns: 1fr auto; }
  .treatment-detail-header__meta { grid-column: 1 / -1; grid-row: 2; }
  .treatment-detail-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .treatment-detail-actions { justify-content: flex-start; }
  .treatment-history-item { grid-template-columns: 1.8rem minmax(0, 1fr); }
  .treatment-history-item time { grid-column: 2; text-align: left; }
}

@media (max-width: 420px) {
  .treatment-main { width: min(100% - 0.8rem, 90rem); }
  .treatment-metric { flex-direction: column; }
  .treatment-metric small { max-width: 8rem; }
  .treatment-review-card dl { grid-template-columns: 1fr; }
  .treatment-editor-footer { flex-wrap: wrap; }
  .treatment-editor-footer__spacer { flex-basis: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .treatment-progress > span,
  .treatment-metric__skeleton,
  .treatment-skeleton-row i { animation: none; transition: none; }
}
</style>
