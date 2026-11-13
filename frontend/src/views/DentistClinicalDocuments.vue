<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  History,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-vue-next'
import { getApiErrorMessage } from '../services/api'
import {
  createDentistClinicalDocument,
  getDentistClinicalDocument,
  getDentistClinicalDocumentHistory,
  getDentistClinicalDocuments,
  getDentistPatientAppointments,
  getDentistPatients,
  updateDentistClinicalDocument,
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
const documentTypes = [
  { value: 'prescription', label: 'Receita odontológica', description: 'Rascunho de prescrição para revisão clínica.', icon: FileText },
  { value: 'certificate', label: 'Atestado odontológico', description: 'Rascunho de atestado clínico.', icon: FileCheck2 },
  { value: 'attendance_declaration', label: 'Declaração de comparecimento', description: 'Rascunho de declaração de presença.', icon: CalendarDays },
  { value: 'referral', label: 'Solicitação ou encaminhamento', description: 'Rascunho de solicitação clínica.', icon: UserRound },
  { value: 'other', label: 'Outro documento clínico', description: 'Rascunho de documento complementar.', icon: FilePlus2 },
]
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const documents = ref([])
const total = ref(0)
const metrics = ref({ drafts: null, issued: null })
const page = ref(1)
const pageSize = 10
const search = ref('')
const typeFilter = ref('')
const loadState = ref('loading')
const loadError = ref('')
const editorOpen = ref(false)
const editorMode = ref('create')
const saving = ref(false)
const saveError = ref('')
const selectedDocumentId = ref(null)
const historyEntries = ref([])
const historyState = ref('idle')
const notice = ref('')
const noticeKind = ref('success')
const patientSearch = ref('')
const patientResults = ref([])
const patientState = ref('idle')
const appointmentOptions = ref([])
const appointmentState = ref('idle')
const printDocument = ref(null)
const draft = reactive({
  patient_id: '',
  appointment_id: '',
  document_type: 'prescription',
  title: '',
  content: '',
  version: 1,
})
let listRequestId = 0
let patientRequestId = 0
let searchTimer
let patientSearchTimer
let noticeTimer

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const firstVisible = computed(() => total.value ? (page.value - 1) * pageSize + 1 : 0)
const lastVisible = computed(() => Math.min(page.value * pageSize, total.value))
const selectedPatient = computed(() =>
  patientResults.value.find((patient) => String(patient.id) === String(draft.patient_id)),
)
const selectedType = computed(() =>
  documentTypes.find((type) => type.value === draft.document_type) || documentTypes[0],
)
const hasUnsavedChanges = computed(() =>
  editorOpen.value && Boolean(draft.patient_id || draft.title || draft.content),
)

function documentTypeLabel(value) {
  return documentTypes.find((type) => type.value === value)?.label || 'Documento clínico'
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormatter.format(parsed)
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function showNotice(message, kind = 'success') {
  notice.value = message
  noticeKind.value = kind
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { notice.value = '' }, 4500)
}

async function loadDocuments() {
  const currentRequest = ++listRequestId
  loadState.value = documents.value.length ? 'refreshing' : 'loading'
  loadError.value = ''
  try {
    const response = await getDentistClinicalDocuments({
      q: search.value.trim() || undefined,
      document_type: typeFilter.value || undefined,
      offset: (page.value - 1) * pageSize,
      limit: pageSize,
    })
    if (currentRequest !== listRequestId) return
    documents.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    loadState.value = 'ready'
  } catch (error) {
    if (currentRequest !== listRequestId) return
    loadState.value = 'error'
    loadError.value = error.response?.status === 403
      ? 'Sua conta não tem autorização para consultar estes documentos.'
      : getApiErrorMessage(error, 'Não foi possível carregar os rascunhos.')
  }
}

function resetDraft(documentType = 'prescription') {
  Object.assign(draft, {
    patient_id: '',
    appointment_id: '',
    document_type: documentType,
    title: '',
    content: '',
    version: 1,
  })
  patientSearch.value = ''
  patientResults.value = []
  patientState.value = 'idle'
  appointmentOptions.value = []
  appointmentState.value = 'idle'
  saveError.value = ''
  historyEntries.value = []
  historyState.value = 'idle'
}

async function openCreateEditor(documentType = 'prescription', patientId = null) {
  editorMode.value = 'create'
  selectedDocumentId.value = null
  resetDraft(documentType)
  editorOpen.value = true
  if (patientId) {
    patientSearch.value = String(patientId)
    await searchPatients()
    const match = patientResults.value.find((patient) => patient.id === Number(patientId))
    if (match) await selectPatient(match)
  }
}

async function openDraft(documentSummary) {
  editorMode.value = 'edit'
  selectedDocumentId.value = documentSummary.id
  resetDraft(documentSummary.document_type)
  editorOpen.value = true
  historyState.value = 'loading'
  try {
    const [document, history] = await Promise.all([
      getDentistClinicalDocument(documentSummary.id),
      getDentistClinicalDocumentHistory(documentSummary.id),
    ])
    if (selectedDocumentId.value !== documentSummary.id) return
    Object.assign(draft, {
      patient_id: String(document.patient_id),
      appointment_id: document.appointment_id ? String(document.appointment_id) : '',
      document_type: document.document_type,
      title: document.title,
      content: document.content,
      version: document.version,
    })
    patientSearch.value = document.patient.name
    patientResults.value = [document.patient]
    historyEntries.value = history
    historyState.value = history.length ? 'ready' : 'empty'
    await loadAppointments(document.patient_id)
  } catch (error) {
    historyState.value = 'error'
    saveError.value = getApiErrorMessage(error, 'Não foi possível abrir este rascunho.')
  }
}

async function beforeCloseEditor() {
  if (!hasUnsavedChanges.value || saving.value) return !saving.value
  return window.confirm('O rascunho pode conter alterações não salvas. Deseja fechar mesmo assim?')
}

async function closeEditor() {
  if (saving.value) return
  if (!(await beforeCloseEditor())) return
  editorOpen.value = false
}

async function searchPatients() {
  const request = ++patientRequestId
  const term = patientSearch.value.trim()
  if (!term) {
    patientResults.value = []
    patientState.value = 'idle'
    return
  }
  patientState.value = 'loading'
  try {
    const response = await getDentistPatients({ q: term, limit: 20 })
    if (request !== patientRequestId) return
    patientResults.value = response.items
    patientState.value = response.items.length ? 'ready' : 'empty'
  } catch (error) {
    if (request !== patientRequestId) return
    patientState.value = 'error'
    saveError.value = getApiErrorMessage(error, 'Não foi possível pesquisar pacientes.')
  }
}

function schedulePatientSearch() {
  window.clearTimeout(patientSearchTimer)
  patientSearchTimer = window.setTimeout(() => void searchPatients(), 250)
}

function handlePatientSearchInput() {
  if (selectedPatient.value && patientSearch.value.trim() !== selectedPatient.value.name) {
    draft.patient_id = ''
    draft.appointment_id = ''
    appointmentOptions.value = []
    patientResults.value = []
  }
  schedulePatientSearch()
}

async function selectPatient(patient) {
  patientRequestId += 1
  draft.patient_id = String(patient.id)
  patientSearch.value = patient.name
  patientResults.value = [patient]
  patientState.value = 'ready'
  draft.appointment_id = ''
  await loadAppointments(patient.id)
}

async function loadAppointments(patientId) {
  appointmentState.value = 'loading'
  try {
    appointmentOptions.value = await getDentistPatientAppointments(patientId)
    appointmentState.value = appointmentOptions.value.length ? 'ready' : 'empty'
  } catch (error) {
    appointmentOptions.value = []
    appointmentState.value = 'error'
    saveError.value = getApiErrorMessage(error, 'Não foi possível carregar os atendimentos.')
  }
}

function payloadFromDraft() {
  return {
    patient_id: Number(draft.patient_id),
    appointment_id: draft.appointment_id ? Number(draft.appointment_id) : null,
    document_type: draft.document_type,
    title: draft.title.trim(),
    content: draft.content.trim(),
  }
}

async function saveDraft() {
  if (!draft.patient_id || !draft.title.trim() || !draft.content.trim()) {
    saveError.value = 'Selecione um paciente e preencha o título e o conteúdo do rascunho.'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    if (editorMode.value === 'edit' && selectedDocumentId.value) {
      await updateDentistClinicalDocument(selectedDocumentId.value, {
        ...payloadFromDraft(),
        version: draft.version,
      })
      showNotice('Rascunho atualizado.')
    } else {
      await createDentistClinicalDocument(payloadFromDraft())
      showNotice('Rascunho salvo com segurança.')
    }
    editorOpen.value = false
    await loadDocuments()
  } catch (error) {
    saveError.value = error.response?.status === 409
      ? 'Este rascunho foi alterado em outra sessão. Feche e abra novamente para carregar a versão mais recente.'
      : getApiErrorMessage(error, 'Não foi possível salvar. Seus dados continuam no formulário.')
  } finally {
    saving.value = false
  }
}

function clearFilters() {
  search.value = ''
  typeFilter.value = ''
  page.value = 1
  void loadDocuments()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadDocuments()
}

function printDraft(document = null) {
  if (document) {
    printDocument.value = document
  } else {
    printDocument.value = {
      title: draft.title || selectedType.value.label,
      content: draft.content,
      document_type: draft.document_type,
      patient: selectedPatient.value || { name: patientSearch.value || 'Paciente não selecionado' },
      dentist_name: 'Profissional autenticado',
      updated_at: new Date().toISOString(),
    }
  }
  window.setTimeout(() => window.print(), 80)
}

function handleNavigation(id) {
  const routeName = dentistNavigationRoutes[id]
  if (!routeName || (editorOpen.value && !window.confirm('Fechar o editor? O rascunho não salvo será perdido.'))) return
  editorOpen.value = false
  void router.push({ name: routeName })
}

watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    void loadDocuments()
  }, 300)
})

watch(typeFilter, () => {
  page.value = 1
  void loadDocuments()
})

watch(
  () => route.query.patientId,
  (value) => {
    const patientId = Number(value)
    if (patientId > 0) void openCreateEditor('prescription', patientId)
  },
  { immediate: true },
)

onMounted(() => void loadDocuments())
onBeforeUnmount(() => {
  listRequestId += 1
  patientRequestId += 1
  window.clearTimeout(searchTimer)
  window.clearTimeout(patientSearchTimer)
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="clinical-documents-page">
    <DentistShell
      active-page="clinical-documents"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="documents-main">
      <header class="documents-intro">
        <div>
          <p class="documents-eyebrow">PORTAL CLÍNICO</p>
          <h1>Receitas e Documentos</h1>
          <p>Crie, emita e consulte documentos clínicos dos pacientes</p>
        </div>
        <span class="documents-access-note">
          <ShieldCheck :size="16" aria-hidden="true" />
          Pacientes vinculados à sua agenda
        </span>
      </header>

      <section class="documents-notice" aria-label="Limitação de emissão">
        <span class="documents-notice__icon"><AlertTriangle :size="18" aria-hidden="true" /></span>
        <div>
          <strong>Emissão oficial ainda não configurada</strong>
          <p>
            Você pode salvar rascunhos no sistema. Assinatura, emissão oficial, modelos aprovados e
            PDF final dependem da configuração e validação clínica da instituição. Rascunhos não
            substituem documentos emitidos.
          </p>
        </div>
      </section>

      <section class="documents-metrics" aria-label="Indicadores de documentos">
        <article class="documents-metric">
          <span class="documents-metric__icon"><FileClock :size="19" aria-hidden="true" /></span>
          <div>
            <span>Rascunhos salvos</span>
            <strong v-if="loadState === 'ready' || loadState === 'refreshing'">{{ metrics.drafts ?? 0 }}</strong>
            <i v-else class="documents-metric__skeleton" aria-hidden="true"></i>
            <small>editáveis e vinculados ao paciente</small>
          </div>
        </article>
        <article class="documents-metric">
          <span class="documents-metric__icon documents-metric__icon--muted"><FileCheck2 :size="19" aria-hidden="true" /></span>
          <div>
            <span>Documentos emitidos</span>
            <strong>—</strong>
            <small>fluxo de emissão ainda não configurado</small>
          </div>
        </article>
        <article class="documents-metric documents-metric--helper">
          <span class="documents-metric__icon documents-metric__icon--green"><ShieldCheck :size="19" aria-hidden="true" /></span>
          <div>
            <span>Rastreabilidade</span>
            <strong>Ativa</strong>
            <small>rascunhos e alterações ficam registrados</small>
          </div>
        </article>
      </section>

      <section class="documents-type-section" aria-labelledby="document-types-title">
        <div class="documents-section-heading">
          <div>
            <p class="documents-eyebrow">NOVO DOCUMENTO</p>
            <h2 id="document-types-title">Comece um rascunho</h2>
            <p>Os campos começam em branco; revise o conteúdo antes de qualquer uso clínico.</p>
          </div>
          <span class="documents-draft-label"><Clock3 :size="14" aria-hidden="true" /> Salvo como rascunho</span>
        </div>
        <div class="documents-type-grid">
          <button
            v-for="type in documentTypes"
            :key="type.value"
            class="documents-type-card"
            type="button"
            @click="openCreateEditor(type.value)"
          >
            <span class="documents-type-card__icon"><component :is="type.icon" :size="19" aria-hidden="true" /></span>
            <span class="documents-type-card__copy">
              <strong>{{ type.label }}</strong>
              <small>{{ type.description }}</small>
            </span>
            <ChevronRight :size="17" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section class="documents-panel" aria-labelledby="documents-list-title">
        <div class="documents-panel__heading">
          <div>
            <p class="documents-eyebrow">CENTRAL DE DOCUMENTOS</p>
            <h2 id="documents-list-title">Rascunhos</h2>
            <p>{{ total }} rascunho(s) encontrado(s)</p>
          </div>
          <label class="documents-search">
            <Search :size="17" aria-hidden="true" />
            <span class="visually-hidden">Buscar por paciente, código ou título</span>
            <input
              v-model="search"
              type="search"
              placeholder="Buscar por paciente, código ou título..."
            />
            <button v-if="search" type="button" aria-label="Limpar busca" @click="search = ''">
              <X :size="15" aria-hidden="true" />
            </button>
          </label>
        </div>

        <div class="documents-toolbar">
          <label class="documents-filter">
            <span>Tipo de documento</span>
            <select v-model="typeFilter">
              <option value="">Todos os tipos</option>
              <option v-for="type in documentTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
            </select>
          </label>
          <button class="documents-clear-filter" type="button" @click="clearFilters">Limpar filtros</button>
        </div>

        <div v-if="loadState === 'error'" class="documents-state documents-state--error" role="alert">
          <div>
            <strong>Não foi possível carregar os rascunhos</strong>
            <p>{{ loadError }}</p>
          </div>
          <UiButton variant="secondary" @click="loadDocuments">
            <template #start><RefreshCw :size="15" aria-hidden="true" /></template>
            Tentar novamente
          </UiButton>
        </div>
        <div v-else-if="loadState === 'loading'" class="documents-loading" role="status" aria-label="Carregando rascunhos">
          <span class="visually-hidden">Carregando rascunhos...</span>
          <i v-for="row in 4" :key="row"></i>
        </div>
        <div v-else-if="!documents.length" class="documents-empty">
          <span class="documents-empty__icon"><FileText :size="23" aria-hidden="true" /></span>
          <h3>{{ search || typeFilter ? 'Nenhum rascunho encontrado' : 'Ainda não há rascunhos' }}</h3>
          <p>
            {{ search || typeFilter
              ? 'Tente ajustar os termos da busca ou o tipo selecionado.'
              : 'Comece um rascunho acima. Documentos emitidos só aparecerão quando o fluxo oficial da clínica estiver disponível.' }}
          </p>
          <UiButton v-if="!search && !typeFilter" variant="secondary" @click="openCreateEditor()">
            <template #start><FilePlus2 :size="16" aria-hidden="true" /></template>
            Criar rascunho
          </UiButton>
        </div>
        <div v-else class="documents-list" :aria-busy="loadState === 'refreshing'">
          <article v-for="document in documents" :key="document.id" class="documents-row">
            <span class="documents-row__icon"><FileText :size="19" aria-hidden="true" /></span>
            <button class="documents-row__main" type="button" @click="openDraft(document)">
              <span class="documents-row__heading">
                <strong>{{ document.title }}</strong>
                <span class="documents-status"><i aria-hidden="true"></i> Rascunho</span>
              </span>
              <span class="documents-row__meta">
                {{ document.patient.name }} · {{ documentTypeLabel(document.document_type) }}
              </span>
              <span class="documents-row__meta">
                Atualizado em {{ formatDate(document.updated_at) }} · {{ document.dentist_name }}
              </span>
            </button>
            <button
              class="documents-row__open"
              type="button"
              :aria-label="`Abrir rascunho ${document.title}`"
              @click="openDraft(document)"
            >
              <ChevronRight :size="18" aria-hidden="true" />
            </button>
          </article>
        </div>

        <footer v-if="total" class="documents-pagination">
          <span>Exibindo {{ firstVisible }}–{{ lastVisible }} de {{ total }}</span>
          <div>
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
    </main>

    <UiDialog
      v-model="editorOpen"
      :title="editorMode === 'create' ? 'Novo rascunho clínico' : 'Editar rascunho clínico'"
      :before-close="beforeCloseEditor"
    >
      <form class="documents-editor" @submit.prevent="saveDraft">
        <div class="documents-editor__warning" role="note">
          <AlertTriangle :size="17" aria-hidden="true" />
          <p>Este conteúdo será salvo somente como rascunho. Não é uma receita, atestado ou documento emitido, assinado ou válido para apresentação.</p>
        </div>
        <label class="documents-field">
          <span>Tipo de documento <b aria-hidden="true">*</b></span>
          <select v-model="draft.document_type" required>
            <option v-for="type in documentTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
          </select>
        </label>
        <label class="documents-field">
          <span>Paciente autorizado <b aria-hidden="true">*</b></span>
          <input
            v-model="patientSearch"
            type="search"
            autocomplete="off"
            placeholder="Busque pelo nome ou código do paciente"
            required
            @input="handlePatientSearchInput"
          />
        </label>
        <div v-if="patientState === 'loading'" class="documents-field-note" role="status">Pesquisando pacientes autorizados...</div>
        <div v-else-if="patientState === 'empty'" class="documents-field-note">Nenhum paciente autorizado encontrado.</div>
        <div v-else-if="patientState === 'error'" class="documents-field-note documents-field-note--error">{{ saveError }}</div>
        <ul v-else-if="patientResults.length && !selectedPatient" class="documents-patient-results">
          <li v-for="patient in patientResults" :key="patient.id">
            <button type="button" @click="selectPatient(patient)">
              <span>{{ patient.name }}</span><small>Paciente #{{ patient.id }}</small>
            </button>
          </li>
        </ul>
        <div v-if="selectedPatient" class="documents-selected-patient">
          <Check :size="16" aria-hidden="true" />
          <strong>{{ selectedPatient.name }}</strong>
          <span>Paciente #{{ selectedPatient.id }}</span>
          <button type="button" aria-label="Trocar paciente" @click="draft.patient_id = ''; draft.appointment_id = ''; patientSearch = ''; patientResults = []; appointmentOptions = []">
            <X :size="15" aria-hidden="true" />
          </button>
        </div>
        <label v-if="draft.patient_id" class="documents-field">
          <span>Atendimento relacionado <small>(opcional)</small></span>
          <select v-model="draft.appointment_id" :disabled="appointmentState === 'loading' || !appointmentOptions.length">
            <option value="">
              {{ appointmentState === 'loading' ? 'Carregando atendimentos...' : 'Sem vínculo com atendimento' }}
            </option>
            <option v-for="appointment in appointmentOptions" :key="appointment.id" :value="String(appointment.id)">
              {{ formatDate(appointment.appointment_date) }} · {{ appointment.procedure }} · #{{ appointment.id }}
            </option>
          </select>
          <small v-if="appointmentState === 'empty'" class="documents-field-hint">Nenhum atendimento concluído disponível para vínculo.</small>
          <small v-else-if="appointmentState === 'error'" class="documents-field-hint documents-field-hint--error">Não foi possível carregar atendimentos. Você ainda pode salvar sem vínculo.</small>
        </label>
        <label class="documents-field">
          <span>Título do rascunho <b aria-hidden="true">*</b></span>
          <input v-model="draft.title" type="text" maxlength="160" minlength="2" required placeholder="Descreva o documento em elaboração" />
        </label>
        <label class="documents-field">
          <span>Conteúdo clínico <b aria-hidden="true">*</b></span>
          <textarea v-model="draft.content" rows="8" maxlength="12000" required placeholder="Escreva o conteúdo que será revisado. Nenhum modelo, medicamento, protocolo ou informação clínica é preenchido automaticamente."></textarea>
          <small>{{ draft.content.length }}/12000 caracteres · conteúdo armazenado como dado clínico restrito</small>
        </label>
        <div v-if="editorMode === 'edit'" class="documents-history" aria-label="Histórico do rascunho">
          <div class="documents-history__heading"><History :size="16" aria-hidden="true" /><strong>Histórico de alterações</strong></div>
          <p v-if="historyState === 'loading'">Carregando histórico...</p>
          <p v-else-if="historyState === 'error'">Histórico indisponível: {{ saveError }}</p>
          <p v-else-if="historyState === 'empty'">Ainda não há alterações registradas.</p>
          <ul v-else>
            <li v-for="entry in historyEntries" :key="entry.id">
              <span>{{ entry.summary }}</span>
              <small>{{ entry.dentist_name }} · {{ formatDateTime(entry.created_at) }}</small>
            </li>
          </ul>
        </div>
        <p v-if="saveError && patientState !== 'error'" class="documents-form-error" role="alert">{{ saveError }}</p>
        <div class="documents-editor__actions">
          <UiButton type="button" variant="secondary" :disabled="saving" @click="closeEditor">Cancelar</UiButton>
          <UiButton type="button" variant="secondary" :disabled="!draft.content.trim()" @click="printDraft()">
            <template #start><Printer :size="16" aria-hidden="true" /></template>
            Imprimir cópia do rascunho
          </UiButton>
          <UiButton type="submit" :loading="saving">
            <template #start><Check :size="16" aria-hidden="true" /></template>
            Salvar rascunho
          </UiButton>
        </div>
      </form>
    </UiDialog>

    <Transition name="documents-toast">
      <div v-if="notice" class="documents-toast" :class="`documents-toast--${noticeKind}`" role="status" aria-live="polite">
        <Check :size="17" aria-hidden="true" /> {{ notice }}
      </div>
    </Transition>

    <section v-if="printDocument" class="documents-print-view" aria-label="Cópia de rascunho para impressão">
      <div class="documents-print-view__watermark">RASCUNHO · NÃO EMITIDO</div>
      <header>
        <p>ZEN · PORTAL CLÍNICO</p>
        <span>{{ documentTypeLabel(printDocument.document_type) }}</span>
      </header>
      <h1>{{ printDocument.title || documentTypeLabel(printDocument.document_type) }}</h1>
      <p class="documents-print-view__patient">Paciente: {{ printDocument.patient?.name }}</p>
      <div class="documents-print-view__content">{{ printDocument.content }}</div>
      <footer>
        <span>Rascunho não assinado, não emitido e sem validade como documento clínico oficial.</span>
        <span>{{ printDocument.dentist_name }} · {{ formatDateTime(printDocument.updated_at) }}</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.clinical-documents-page { min-height: 100vh; background: var(--color-background); color: var(--color-text); }
.documents-main { width: min(100% - 3rem, 1280px); margin-inline: auto; padding: 2rem 0 3rem; }
.documents-intro, .documents-section-heading, .documents-panel__heading, .documents-toolbar, .documents-pagination, .documents-pagination > div, .documents-editor__actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.documents-intro { margin-bottom: 1.4rem; }
.documents-eyebrow { margin: 0 0 .4rem; color: var(--color-text-muted); font-size: .68rem; font-weight: 750; letter-spacing: .11em; }
.documents-intro h1 { margin: 0; font-size: clamp(1.7rem, 3vw, 2.25rem); letter-spacing: -.045em; line-height: 1.15; }
.documents-intro > div > p:last-child { margin: .55rem 0 0; color: var(--color-text-secondary); font-size: .92rem; }
.documents-access-note { display: inline-flex; align-items: center; gap: .45rem; color: var(--color-text-muted); font-size: .78rem; }
.documents-access-note svg { color: var(--color-success); }
.documents-notice { display: flex; align-items: flex-start; gap: .8rem; padding: 1rem 1.1rem; border: 1px solid var(--color-warning); border-radius: var(--radius-lg); background: var(--color-warning-subtle); }
.documents-notice__icon { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-warning); }
.documents-notice strong { font-size: .88rem; }
.documents-notice p { margin: .25rem 0 0; color: var(--color-text-secondary); font-size: .78rem; line-height: 1.55; }
.documents-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .85rem; margin: 1rem 0 1.25rem; }
.documents-metric { display: flex; min-height: 104px; align-items: flex-start; gap: .8rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.documents-metric__icon, .documents-type-card__icon, .documents-row__icon, .documents-empty__icon { display: grid; width: 2.3rem; height: 2.3rem; flex: 0 0 auto; place-items: center; border-radius: .7rem; background: var(--color-primary-subtle); color: var(--color-primary); }
.documents-metric__icon--muted { background: var(--color-surface-muted); color: var(--color-text-muted); }
.documents-metric__icon--green { background: var(--color-success-subtle); color: var(--color-success); }
.documents-metric > div { display: grid; gap: .2rem; }
.documents-metric > div > span { color: var(--color-text-secondary); font-size: .77rem; }
.documents-metric strong { font-size: 1.35rem; letter-spacing: -.03em; }
.documents-metric small { color: var(--color-text-muted); font-size: .68rem; line-height: 1.4; }
.documents-metric__skeleton { width: 2rem; height: 1.25rem; border-radius: .35rem; background: var(--color-surface-subtle); animation: documents-pulse 1.2s ease-in-out infinite; }
.documents-type-section, .documents-panel { padding: 1.2rem; border: 1px solid var(--color-border); border-radius: var(--radius-xl); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.documents-type-section { margin-bottom: 1.2rem; }
.documents-section-heading { align-items: flex-start; margin-bottom: 1rem; }
.documents-section-heading h2, .documents-panel__heading h2 { margin: 0; font-size: 1.12rem; letter-spacing: -.025em; }
.documents-section-heading > div > p:last-child, .documents-panel__heading > div > p:last-child { margin: .35rem 0 0; color: var(--color-text-secondary); font-size: .76rem; }
.documents-draft-label { display: inline-flex; align-items: center; gap: .35rem; padding: .4rem .6rem; border-radius: var(--radius-pill); background: var(--color-warning-subtle); color: var(--color-warning); font-size: .68rem; font-weight: 700; white-space: nowrap; }
.documents-type-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem; }
.documents-type-card { display: flex; min-width: 0; align-items: center; gap: .7rem; padding: .75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); text-align: left; cursor: pointer; transition: border-color 150ms ease, background 150ms ease, transform 150ms ease; }
.documents-type-card:hover { transform: translateY(-1px); border-color: var(--color-primary); background: var(--color-primary-subtle); }
.documents-type-card:focus-visible, .documents-row__main:focus-visible, .documents-row__open:focus-visible, .documents-pagination button:focus-visible, .documents-clear-filter:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.documents-type-card__icon { width: 2.1rem; height: 2.1rem; }
.documents-type-card__copy { display: grid; min-width: 0; flex: 1; gap: .2rem; }
.documents-type-card__copy strong { font-size: .76rem; }
.documents-type-card__copy small { color: var(--color-text-muted); font-size: .66rem; line-height: 1.4; }
.documents-type-card > svg { flex: 0 0 auto; color: var(--color-text-muted); }
.documents-panel { overflow: hidden; padding: 0; }
.documents-panel__heading { align-items: flex-end; padding: 1.2rem; }
.documents-search { display: flex; width: min(100%, 24rem); align-items: center; gap: .55rem; padding: .62rem .7rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.documents-search:focus-within { border-color: var(--color-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-focus) 15%, transparent); }
.documents-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; font-size: .75rem; }
.documents-search button, .documents-selected-patient button { display: grid; width: 1.7rem; height: 1.7rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.documents-search button:hover, .documents-selected-patient button:hover { background: var(--color-surface-muted); color: var(--color-text); }
.documents-toolbar { justify-content: flex-start; padding: 0 1.2rem 1rem; }
.documents-filter { display: flex; align-items: center; gap: .55rem; color: var(--color-text-secondary); font-size: .72rem; }
.documents-filter select, .documents-field select, .documents-field input, .documents-field textarea, .documents-editor input, .documents-editor select, .documents-editor textarea { width: 100%; min-height: 2.65rem; padding: .62rem .7rem; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: .78rem; }
.documents-filter select { width: auto; min-width: 12rem; }
.documents-field input:focus, .documents-field select:focus, .documents-field textarea:focus, .documents-editor input:focus, .documents-editor select:focus, .documents-editor textarea:focus { border-color: var(--color-focus); outline: 3px solid color-mix(in srgb, var(--color-focus) 18%, transparent); }
.documents-clear-filter { padding: .5rem .65rem; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-primary); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
.documents-state, .documents-empty { display: grid; min-height: 210px; justify-items: center; align-content: center; gap: .55rem; padding: 1.5rem; border-top: 1px solid var(--color-border); text-align: center; }
.documents-state--error { color: var(--color-danger); }
.documents-state strong, .documents-empty h3 { margin: 0; color: var(--color-text); font-size: .92rem; }
.documents-state p, .documents-empty p { max-width: 32rem; margin: 0; color: var(--color-text-secondary); font-size: .75rem; line-height: 1.55; }
.documents-empty__icon { width: 3rem; height: 3rem; }
.documents-empty h3 { margin-top: .2rem; }
.documents-empty .button { margin-top: .35rem; }
.documents-loading { display: grid; gap: .6rem; padding: 1rem 1.2rem; }
.documents-loading i { display: block; height: 4.1rem; border-radius: var(--radius-md); background: linear-gradient(90deg, var(--color-surface-muted), var(--color-surface-subtle), var(--color-surface-muted)); background-size: 200% 100%; animation: documents-shimmer 1.3s linear infinite; }
.documents-row { display: flex; align-items: center; gap: .75rem; padding: .9rem 1.2rem; border-top: 1px solid var(--color-border); }
.documents-row__icon { width: 2.2rem; height: 2.2rem; }
.documents-row__main { display: grid; min-width: 0; flex: 1; gap: .28rem; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.documents-row__heading { display: flex; min-width: 0; align-items: center; gap: .55rem; }
.documents-row__heading > strong { overflow: hidden; font-size: .81rem; text-overflow: ellipsis; white-space: nowrap; }
.documents-status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .3rem; padding: .2rem .42rem; border-radius: var(--radius-pill); background: var(--color-warning-subtle); color: var(--color-warning); font-size: .63rem; font-weight: 750; }
.documents-status i { width: .38rem; height: .38rem; border-radius: 50%; background: currentColor; }
.documents-row__meta { overflow: hidden; color: var(--color-text-muted); font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
.documents-row__open { display: grid; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; place-items: center; border: 1px solid transparent; border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.documents-row__open:hover { border-color: var(--color-border); background: var(--color-surface-subtle); color: var(--color-primary); }
.documents-pagination { padding: .85rem 1.2rem; border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: .7rem; }
.documents-pagination > div { gap: .6rem; }
.documents-pagination button { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); cursor: pointer; }
.documents-pagination button:disabled { opacity: .45; cursor: not-allowed; }
.documents-editor { display: grid; gap: .9rem; }
.documents-editor__warning { display: flex; align-items: flex-start; gap: .55rem; padding: .7rem; border-radius: var(--radius-md); background: var(--color-warning-subtle); color: var(--color-warning); }
.documents-editor__warning svg { flex: 0 0 auto; margin-top: .08rem; }
.documents-editor__warning p { margin: 0; font-size: .73rem; line-height: 1.5; }
.documents-field { display: grid; gap: .38rem; }
.documents-field > span { color: var(--color-text-secondary); font-size: .73rem; font-weight: 700; }
.documents-field b { color: var(--color-danger); }
.documents-field > span small { font-weight: 400; }
.documents-field textarea { min-height: 9rem; resize: vertical; line-height: 1.55; }
.documents-field > small, .documents-field-hint { color: var(--color-text-muted); font-size: .66rem; line-height: 1.45; }
.documents-field-hint--error, .documents-field-note--error { color: var(--color-danger); }
.documents-field-note { color: var(--color-text-muted); font-size: .72rem; }
.documents-patient-results { display: grid; max-height: 12rem; overflow: auto; margin: -.55rem 0 0; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); list-style: none; }
.documents-patient-results button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: .8rem; padding: .65rem .75rem; border: 0; border-bottom: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); text-align: left; cursor: pointer; }
.documents-patient-results li:last-child button { border-bottom: 0; }
.documents-patient-results button:hover { background: var(--color-primary-subtle); }
.documents-patient-results button span { font-size: .76rem; font-weight: 700; }
.documents-patient-results button small { color: var(--color-text-muted); font-size: .66rem; }
.documents-selected-patient { display: flex; align-items: center; gap: .5rem; padding: .55rem .65rem; border: 1px solid var(--color-success); border-radius: var(--radius-md); background: var(--color-success-subtle); }
.documents-selected-patient > svg { color: var(--color-success); }
.documents-selected-patient strong { font-size: .76rem; }
.documents-selected-patient span { flex: 1; color: var(--color-text-muted); font-size: .66rem; }
.documents-history { padding: .75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-subtle); }
.documents-history__heading { display: flex; align-items: center; gap: .4rem; font-size: .74rem; }
.documents-history > p { margin: .55rem 0 0; color: var(--color-text-muted); font-size: .68rem; }
.documents-history ul { display: grid; gap: .55rem; margin: .65rem 0 0; padding: 0; list-style: none; }
.documents-history li { display: grid; gap: .2rem; }
.documents-history li span { font-size: .7rem; }
.documents-history li small { color: var(--color-text-muted); font-size: .64rem; }
.documents-form-error { margin: 0; padding: .65rem; border: 1px solid var(--color-danger); border-radius: var(--radius-md); background: var(--color-danger-subtle); color: var(--color-danger); font-size: .74rem; }
.documents-editor__actions { justify-content: flex-end; flex-wrap: wrap; padding-top: .25rem; }
.documents-toast { position: fixed; z-index: 90; right: 1rem; bottom: 1rem; display: flex; align-items: center; gap: .5rem; max-width: min(30rem, calc(100vw - 2rem)); padding: .8rem .9rem; border: 1px solid var(--color-success); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); color: var(--color-text); font-size: .76rem; }
.documents-toast svg { color: var(--color-success); }
.documents-toast-enter-active, .documents-toast-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.documents-toast-enter-from, .documents-toast-leave-to { transform: translateY(.35rem); opacity: 0; }
.documents-print-view { display: none; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
@keyframes documents-pulse { 50% { opacity: .45; } }
@keyframes documents-shimmer { to { background-position: -200% 0; } }
@media (max-width: 900px) { .documents-type-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) {
  .documents-main { width: min(100% - 1.25rem, 1280px); padding-top: 1.25rem; }
  .documents-intro, .documents-panel__heading { align-items: flex-start; flex-direction: column; }
  .documents-access-note { align-self: flex-start; }
  .documents-metrics { grid-template-columns: 1fr; }
  .documents-metric { min-height: 86px; }
  .documents-type-grid { grid-template-columns: 1fr; }
  .documents-section-heading { align-items: flex-start; flex-direction: column; }
  .documents-panel__heading { gap: .8rem; }
  .documents-search { width: 100%; }
  .documents-toolbar { align-items: flex-start; flex-wrap: wrap; }
  .documents-filter { width: 100%; align-items: flex-start; flex-direction: column; }
  .documents-filter select { width: 100%; }
  .documents-row { align-items: flex-start; padding-inline: .8rem; }
  .documents-row__heading { align-items: flex-start; flex-direction: column; gap: .32rem; }
  .documents-pagination { align-items: flex-start; flex-direction: column; }
  .documents-editor__actions { align-items: stretch; flex-direction: column-reverse; }
  .documents-editor__actions > * { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
@media print {
  @page { margin: 18mm; }
  .clinical-documents-page > :not(.documents-print-view) { display: none !important; }
  .documents-print-view { position: relative; display: block !important; color: #17212b; font-family: Arial, sans-serif; }
  .documents-print-view header { display: grid; gap: .25rem; padding-bottom: 1rem; border-bottom: 1px solid #9aa5b1; }
  .documents-print-view header p { margin: 0; font-size: 10pt; font-weight: 700; letter-spacing: .12em; }
  .documents-print-view header span, .documents-print-view__patient { font-size: 10pt; }
  .documents-print-view h1 { margin: 1.5rem 0 .7rem; font-size: 18pt; }
  .documents-print-view__content { min-height: 8rem; margin-top: 1.5rem; white-space: pre-wrap; font-size: 11pt; line-height: 1.6; }
  .documents-print-view footer { display: grid; gap: .45rem; margin-top: 3rem; padding-top: .8rem; border-top: 1px solid #9aa5b1; font-size: 9pt; }
  .documents-print-view__watermark { position: absolute; top: 45%; right: 0; left: 0; transform: rotate(-24deg); color: rgb(180 35 24 / 14%); font-size: 34pt; font-weight: 800; text-align: center; }
}
</style>
