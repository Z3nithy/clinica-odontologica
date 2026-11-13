<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Clock3,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Stethoscope,
  XCircle,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  getReceptionAppointments,
  getReceptionDentists,
  updateReceptionAppointment,
} from '../services/reception'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiFormField from '../components/ui/UiFormField.vue'
import UiTextarea from '../components/ui/UiTextarea.vue'
import UiToast from '../components/ui/UiToast.vue'

const router = useRouter()
const today = new Date()
const todayValue = toDateInput(today)
const period = ref('today')
const customStart = ref(todayValue)
const customEnd = ref(todayValue)
const search = ref('')
const dentistFilter = ref('')
const statusFilter = ref('')
const procedureFilter = ref('')
const channelFilter = ref('')
const noResponseOnly = ref(false)
const appointments = ref([])
const dentists = ref([])
const state = ref('loading')
const errorMessage = ref('')
const requestId = ref(0)
const page = ref(1)
const pageSize = 10
const selectedIds = ref([])
const selectedAppointment = ref(null)
const detailOpen = ref(false)
const responseOpen = ref(false)
const reminderOpen = ref(false)
const cancelOpen = ref(false)
const responseValue = ref('')
const responseChannel = ref('Telefone')
const responseNote = ref('')
const cancellationReason = ref('')
const mutationLoading = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
let searchTimer

const dateRange = computed(() => {
  if (period.value === 'custom') return [customStart.value, customEnd.value]
  const start = fromDateInput(todayValue)
  const end = new Date(start)
  if (period.value === 'tomorrow') end.setDate(end.getDate() + 1)
  if (period.value === 'week') end.setDate(end.getDate() + 6)
  return [toDateInput(start), toDateInput(end)]
})

const dateLabel = computed(() => {
  const [start, end] = dateRange.value
  if (!start) return 'Selecione um período'
  if (start === end) return formatDate(start, { dateStyle: 'full' })
  return `${formatDate(start)} – ${formatDate(end)}`
})

const procedures = computed(() =>
  [...new Set(appointments.value.map((appointment) => appointment.procedure).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  ),
)

function confirmationLabel(appointment) {
  if (appointment.status === 'Cancelada') return 'Cancelada'
  if (appointment.confirmation_status === 'Cancelada') return 'Cancelada'
  if (appointment.confirmation_status === 'Confirmada') return 'Confirmada'
  if (appointment.confirmation_status === 'Reagendamento solicitado') return 'Reagendamento solicitado'
  if (appointment.confirmation_status === 'Não comparecerá') return 'Não comparecerá'
  if (appointment.confirmation_status === 'Aguardando resposta') return 'Aguardando resposta'
  return 'Pendente'
}

function badgeVariant(label) {
  if (label === 'Confirmada') return 'success'
  if (label === 'Não comparecerá' || label === 'Cancelada') return 'danger'
  if (label === 'Reagendamento solicitado' || label === 'Aguardando resposta') return 'warning'
  return 'neutral'
}

function canFollowUp(appointment) {
  return !['Cancelada', 'Concluída', 'Em espera', 'Em atendimento'].includes(appointment.status)
}

const filteredAppointments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return [...appointments.value]
    .filter((item) => !dentistFilter.value || String(item.dentist_id) === dentistFilter.value)
    .filter((item) => !statusFilter.value || confirmationLabel(item) === statusFilter.value)
    .filter((item) => !procedureFilter.value || item.procedure === procedureFilter.value)
    .filter(
      (item) =>
        !channelFilter.value || (item.contact_channel || 'Não informado') === channelFilter.value,
    )
    .filter((item) => !noResponseOnly.value || confirmationLabel(item) === 'Aguardando resposta')
    .filter((item) => {
      if (!query) return true
      return [item.patient_name, item.patient_phone, item.id]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query))
    })
    .sort((a, b) =>
      `${a.appointment_date} ${a.appointment_time}`.localeCompare(
        `${b.appointment_date} ${b.appointment_time}`,
      ),
    )
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredAppointments.value.length / pageSize)))
const paginatedAppointments = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredAppointments.value.slice(start, start + pageSize)
})
const selectableOnPage = computed(() =>
  paginatedAppointments.value.filter(canFollowUp),
)
const allOnPageSelected = computed({
  get: () =>
    selectableOnPage.value.length > 0 &&
    selectableOnPage.value.every((appointment) => selectedIds.value.includes(appointment.id)),
  set(value) {
    const pageIds = selectableOnPage.value.map((appointment) => appointment.id)
    selectedIds.value = value
      ? [...new Set([...selectedIds.value, ...pageIds])]
      : selectedIds.value.filter((id) => !pageIds.includes(id))
  },
})
const selectedAppointments = computed(() =>
  appointments.value.filter((appointment) => selectedIds.value.includes(appointment.id)),
)
const reminderAppointments = computed(() =>
  selectedAppointments.value.length
    ? selectedAppointments.value
    : selectedAppointment.value
      ? [selectedAppointment.value]
      : [],
)
const metrics = computed(() => {
  const list = appointments.value
  const active = list.filter((item) => !['Cancelada', 'Concluída'].includes(item.status))
  return [
    { label: 'Total de consultas', value: list.length, icon: CalendarDays, tone: 'blue' },
    {
      label: 'Confirmadas',
      value: active.filter((item) => confirmationLabel(item) === 'Confirmada').length,
      icon: CheckCheck,
      tone: 'green',
    },
    {
      label: 'Pendentes',
      value: active.filter((item) => confirmationLabel(item) === 'Pendente').length,
      icon: Clock3,
      tone: 'amber',
    },
    {
      label: 'Sem resposta',
      value: active.filter((item) => confirmationLabel(item) === 'Aguardando resposta').length,
      icon: MessageCircle,
      tone: 'violet',
    },
    {
      label: 'Não confirmadas',
      value: active.filter((item) => confirmationLabel(item) === 'Não comparecerá').length,
      icon: XCircle,
      tone: 'red',
    },
  ]
})

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function fromDateInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', options).format(fromDateInput(value))
}

function formatPhone(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value || '—'
}

function formatTime(value) {
  return value ? value.slice(0, 5) : '—'
}

function contactLabel(value) {
  return value || 'Não informado'
}

function reminderMessage(appointment) {
  const date = formatDate(appointment.appointment_date, { day: 'numeric', month: 'long' })
  return `Olá, ${appointment.patient_name}! Você tem uma consulta agendada para ${date} às ${formatTime(appointment.appointment_time)}, com ${appointment.dentist_name}. Por favor, confirme sua presença ou informe se precisa remarcar.`
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function loadAppointments() {
  const [start, end] = dateRange.value
  if (!start || !end || end < start) {
    requestId.value += 1
    state.value = 'error'
    errorMessage.value = 'A data final deve ser igual ou posterior à data inicial.'
    showToast(errorMessage.value, 'danger')
    return
  }
  const id = ++requestId.value
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getReceptionAppointments({
      date: start,
      date_to: end,
      q: search.value.trim() || undefined,
    })
    if (id !== requestId.value) return
    appointments.value = response.items
    selectedIds.value = selectedIds.value.filter((selectedId) =>
      response.items.some((appointment) => appointment.id === selectedId),
    )
    if (selectedAppointment.value) {
      selectedAppointment.value =
        response.items.find((item) => item.id === selectedAppointment.value.id) || null
    }
    state.value = 'ready'
    page.value = 1
  } catch (error) {
    if (id !== requestId.value) return
    state.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar as confirmações.')
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

function openDetails(appointment) {
  selectedAppointment.value = appointment
  detailOpen.value = true
}

async function closeDetailsBeforeNextDialog() {
  if (!detailOpen.value) return
  detailOpen.value = false
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function openResponse(appointment) {
  await closeDetailsBeforeNextDialog()
  selectedAppointment.value = appointment
  responseValue.value = ''
  responseChannel.value = appointment.contact_channel || 'Telefone'
  responseNote.value = ''
  responseOpen.value = true
}

async function openReminders(appointment = null) {
  await closeDetailsBeforeNextDialog()
  if (appointment) {
    if (!canFollowUp(appointment)) {
      showToast('Não é possível preparar lembretes para uma consulta encerrada.', 'warning')
      return
    }
    selectedAppointment.value = appointment
    selectedIds.value = []
  }
  if (!reminderAppointments.value.length) {
    showToast('Selecione ao menos uma consulta para preparar os lembretes.', 'warning')
    return
  }
  if (reminderAppointments.value.some((item) => !canFollowUp(item))) {
    showToast('Remova consultas encerradas da seleção antes de preparar os lembretes.', 'warning')
    return
  }
  reminderOpen.value = true
}

async function copyReminder(appointment) {
  try {
    await navigator.clipboard.writeText(reminderMessage(appointment))
    showToast(`Mensagem de ${appointment.patient_name} copiada. O envio não foi realizado.`, 'success')
  } catch {
    showToast('Não foi possível copiar a mensagem. Verifique a permissão da área de transferência.', 'danger')
  }
}

async function copyAllReminders() {
  try {
    const text = reminderAppointments.value
      .map((appointment) => reminderMessage(appointment))
      .join('\n\n')
    await navigator.clipboard.writeText(text)
    reminderOpen.value = false
    showToast(
      `${reminderAppointments.value.length} mensagem(ns) copiada(s). Nenhum envio foi realizado.`,
      'success',
    )
  } catch {
    showToast('Não foi possível copiar as mensagens. Verifique a permissão da área de transferência.', 'danger')
  }
}

async function updateAppointment(appointment, updates, successMessage) {
  if (mutationLoading.value) return false
  mutationLoading.value = true
  try {
    await updateReceptionAppointment(appointment.id, updates)
    await loadAppointments()
    detailOpen.value = false
    responseOpen.value = false
    showToast(successMessage, 'success')
    return true
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível atualizar a confirmação.'), 'danger')
    return false
  } finally {
    mutationLoading.value = false
  }
}

function confirmManually(appointment) {
  void updateAppointment(
    appointment,
    { confirmation_status: 'Confirmada' },
    'Confirmação registrada. O horário da consulta não foi alterado.',
  )
}

async function saveResponse() {
  const appointment = selectedAppointment.value
  if (!appointment || !responseValue.value) return
  const timestamp = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date())
  const record = `[Retorno ${timestamp} · ${responseChannel.value}] ${responseNote.value.trim() || responseValue.value}`
  const previousNotes = appointment.administrative_notes?.trim() || ''
  const notes = [previousNotes, record].filter(Boolean).join('\n')
  if (notes.length > 2000) {
    showToast('As observações administrativas atingiram o limite. Revise-as na Agenda antes de registrar outro retorno.', 'warning')
    return
  }
  await updateAppointment(
    appointment,
    { confirmation_status: responseValue.value, administrative_notes: notes },
    'Resposta registrada. A consulta não foi cancelada nem reagendada automaticamente.',
  )
}

async function openCancellation(appointment) {
  await closeDetailsBeforeNextDialog()
  selectedAppointment.value = appointment
  cancellationReason.value = ''
  cancelOpen.value = true
}

async function cancelAppointment() {
  const appointment = selectedAppointment.value
  if (!appointment || !cancellationReason.value.trim()) return
  const previousNotes = appointment.administrative_notes?.trim() || ''
  const record = `Motivo do cancelamento: ${cancellationReason.value.trim()}`
  const notes = [previousNotes, record].filter(Boolean).join('\n')
  if (notes.length > 2000) {
    showToast('As observações administrativas atingiram o limite. Revise-as na Agenda antes de cancelar.', 'warning')
    return
  }
  const cancelled = await updateAppointment(
    appointment,
    { status: 'Cancelada', confirmation_status: 'Cancelada', administrative_notes: notes },
    'Consulta cancelada e motivo registrado.',
  )
  if (cancelled) cancelOpen.value = false
}

function reschedule(appointment) {
  detailOpen.value = false
  void router.push({
    name: 'reception-agenda',
    query: { editAppointmentId: String(appointment.id), date: appointment.appointment_date },
  })
}

function handleNavigation(id) {
  if (id === 'overview') void router.push({ name: 'reception-dashboard' })
  else if (id === 'schedule') void router.push({ name: 'reception-agenda' })
  else if (id === 'patient-list') void router.push({ name: 'reception-patients' })
  else if (id === 'checkin') void router.push({ name: 'reception-checkin' })
  else if (id === 'history') void router.push({ name: 'reception-history' })
  else if (id !== 'confirmations') showToast('Esta área ainda não está disponível.', 'info')
}

function clearFilters() {
  period.value = 'today'
  customStart.value = todayValue
  customEnd.value = todayValue
  search.value = ''
  dentistFilter.value = ''
  statusFilter.value = ''
  procedureFilter.value = ''
  channelFilter.value = ''
  noResponseOnly.value = false
  selectedIds.value = []
  void loadAppointments()
}

function setPage(nextPage) {
  page.value = Math.min(pageCount.value, Math.max(1, nextPage))
}

watch([period, customStart, customEnd], () => {
  if (period.value !== 'custom' || (customStart.value && customEnd.value)) {
    void loadAppointments()
  }
})
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadAppointments(), 300)
})
watch([dentistFilter, statusFilter, procedureFilter, channelFilter, noResponseOnly], () => {
  page.value = 1
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
  <div class="confirmations-page">
    <ReceptionShell
      active-page="confirmations"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="confirmations-main">
      <section class="confirmations-intro" aria-labelledby="confirmations-title">
        <div>
          <p class="confirmations-eyebrow">ORGANIZAÇÃO DA AGENDA</p>
          <h1 id="confirmations-title">Confirmação de Consultas</h1>
          <p>Acompanhe as confirmações e prepare a agenda da clínica</p>
        </div>
        <div class="confirmations-intro__actions">
          <UiButton variant="secondary" :disabled="!selectedIds.length" @click="openReminders()">
            <template #start><Send :size="16" aria-hidden="true" /></template>
            Preparar lembretes<span v-if="selectedIds.length"> ({{ selectedIds.length }})</span>
          </UiButton>
          <UiButton @click="router.push({ name: 'reception-agenda', query: { create: '1' } })">
            <template #start><Plus :size="17" aria-hidden="true" /></template>
            Nova consulta
          </UiButton>
        </div>
      </section>

      <section class="confirmations-toolbar" aria-label="Período e pesquisa">
        <label class="confirmations-period">
          <CalendarDays :size="17" aria-hidden="true" />
          <span class="visually-hidden">Período das consultas</span>
          <select v-model="period">
            <option value="today">Hoje</option>
            <option value="tomorrow">Amanhã</option>
            <option value="week">Próximos 7 dias</option>
            <option value="custom">Intervalo personalizado</option>
          </select>
        </label>
        <label v-if="period === 'custom'" class="confirmations-date">
          <span class="visually-hidden">Data inicial</span>
          <input v-model="customStart" type="date" />
        </label>
        <label v-if="period === 'custom'" class="confirmations-date">
          <span class="visually-hidden">Data final</span>
          <input v-model="customEnd" type="date" :min="customStart" />
        </label>
        <label class="confirmations-search">
          <Search :size="17" aria-hidden="true" />
          <span class="visually-hidden">Buscar por paciente, telefone ou código da consulta</span>
          <input v-model="search" type="search" placeholder="Paciente, telefone ou código..." />
        </label>
        <button
          class="confirmations-refresh"
          type="button"
          aria-label="Atualizar consultas"
          :disabled="state === 'refreshing'"
          @click="loadAppointments"
        >
          <RefreshCw :size="17" :class="{ 'confirmations-spin': state === 'refreshing' }" />
        </button>
      </section>

      <section class="confirmations-metrics" aria-label="Indicadores do período">
        <article v-for="metric in metrics" :key="metric.label" class="confirmation-metric">
          <span :class="`confirmation-metric__icon confirmation-metric__icon--${metric.tone}`">
            <component :is="metric.icon" :size="18" aria-hidden="true" />
          </span>
          <div>
            <span>{{ metric.label }}</span>
            <strong>{{ state === 'loading' ? '—' : metric.value }}</strong>
          </div>
        </article>
      </section>
      <p class="confirmations-integration-note">
        <CircleAlert :size="15" aria-hidden="true" />
        O sistema ainda não registra envios de lembretes nem respostas pendentes automaticamente.
        As mensagens podem ser copiadas para envio manual.
      </p>

      <section class="confirmations-panel" aria-labelledby="confirmations-list-title">
        <div class="confirmations-panel__heading">
          <div>
            <p class="confirmations-eyebrow">ACOMPANHAMENTO</p>
            <h2 id="confirmations-list-title">Consultas para confirmação</h2>
            <p>{{ filteredAppointments.length }} resultado(s) · {{ dateLabel }}</p>
          </div>
          <label class="confirmations-no-response">
            <input v-model="noResponseOnly" type="checkbox" />
            <span>Sem resposta</span>
          </label>
        </div>

        <div class="confirmations-filters" aria-label="Filtros da lista">
          <label class="confirmation-filter">
            <Stethoscope :size="15" aria-hidden="true" />
            <span class="visually-hidden">Dentista</span>
            <select v-model="dentistFilter">
              <option value="">Todos os dentistas</option>
              <option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">
                {{ dentist.name }}
              </option>
            </select>
          </label>
          <label class="confirmation-filter">
            <Check :size="15" aria-hidden="true" />
            <span class="visually-hidden">Status da confirmação</span>
            <select v-model="statusFilter">
              <option value="">Todos os status</option>
              <option>Pendente</option>
              <option>Confirmada</option>
              <option>Aguardando resposta</option>
              <option>Não comparecerá</option>
              <option>Reagendamento solicitado</option>
              <option>Cancelada</option>
            </select>
          </label>
          <label class="confirmation-filter">
            <CalendarDays :size="15" aria-hidden="true" />
            <span class="visually-hidden">Procedimento</span>
            <select v-model="procedureFilter">
              <option value="">Todos os procedimentos</option>
              <option v-for="procedure in procedures" :key="procedure">{{ procedure }}</option>
            </select>
          </label>
          <label class="confirmation-filter">
            <MessageCircle :size="15" aria-hidden="true" />
            <span class="visually-hidden">Canal de contato</span>
            <select v-model="channelFilter">
              <option value="">Todos os canais</option>
              <option>Telefone</option>
              <option>WhatsApp</option>
              <option>E-mail</option>
              <option>Não informado</option>
            </select>
          </label>
          <UiButton size="sm" variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
        </div>

        <div v-if="state === 'loading'" class="confirmations-state" role="status">
          <span class="confirmations-spinner" aria-hidden="true"></span>
          <strong>Carregando consultas</strong>
        </div>
        <div v-else-if="state === 'error'" class="confirmations-state confirmations-state--error" role="alert">
          <CircleAlert :size="25" aria-hidden="true" />
          <strong>Não foi possível carregar as confirmações</strong>
          <p>{{ errorMessage }}</p>
          <UiButton variant="secondary" size="sm" @click="loadAppointments">Tentar novamente</UiButton>
        </div>
        <div v-else-if="!filteredAppointments.length" class="confirmations-state">
          <CalendarDays :size="27" aria-hidden="true" />
          <strong>{{ appointments.length ? 'Nenhum resultado para estes filtros' : 'Nenhuma consulta neste período' }}</strong>
          <p>{{ appointments.length ? 'Ajuste os filtros ou limpe a pesquisa.' : 'Escolha outro período ou crie um novo agendamento.' }}</p>
        </div>
        <div v-else class="confirmations-table-wrap" :aria-busy="state === 'refreshing'">
          <table class="confirmations-table">
            <thead>
              <tr>
                <th scope="col" class="confirmation-check">
                  <input v-model="allOnPageSelected" type="checkbox" aria-label="Selecionar consultas desta página" />
                </th>
                <th scope="col">Data e horário</th>
                <th scope="col">Paciente</th>
                <th scope="col">Telefone</th>
                <th scope="col">Dentista</th>
                <th scope="col">Procedimento</th>
                <th scope="col">Último contato</th>
                <th scope="col">Confirmação</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="appointment in paginatedAppointments" :key="appointment.id">
                <td data-label="Selecionar" class="confirmation-check">
                  <input
                    v-if="canFollowUp(appointment)"
                    v-model="selectedIds"
                    type="checkbox"
                    :value="appointment.id"
                    :aria-label="`Selecionar consulta de ${appointment.patient_name}`"
                  />
                </td>
                <td data-label="Data e horário">
                  <strong>{{ formatDate(appointment.appointment_date) }}</strong>
                  <small>{{ formatTime(appointment.appointment_time) }}</small>
                </td>
                <td data-label="Paciente">
                  <span class="confirmation-patient">
                    <UiAvatar :name="appointment.patient_name" size="sm" />
                    <span><strong>{{ appointment.patient_name }}</strong><small>#{{ appointment.id }}</small></span>
                  </span>
                </td>
                <td data-label="Telefone">{{ formatPhone(appointment.patient_phone) }}</td>
                <td data-label="Dentista">{{ appointment.dentist_name }}</td>
                <td data-label="Procedimento">{{ appointment.procedure }}</td>
                <td data-label="Último contato" class="confirmation-muted">—</td>
                <td data-label="Confirmação">
                  <UiBadge :variant="badgeVariant(confirmationLabel(appointment))">
                    {{ confirmationLabel(appointment) }}
                  </UiBadge>
                </td>
                <td data-label="Ações" class="confirmation-actions">
                  <UiButton
                    v-if="canFollowUp(appointment) && confirmationLabel(appointment) === 'Pendente'"
                    size="sm"
                    variant="secondary"
                    @click="confirmManually(appointment)"
                  >Confirmar</UiButton>
                  <button
                    v-if="canFollowUp(appointment)"
                    class="confirmation-icon-action"
                    type="button"
                    :aria-label="`Preparar lembrete para ${appointment.patient_name}`"
                    @click="openReminders(appointment)"
                  ><Clipboard :size="16" aria-hidden="true" /></button>
                  <button
                    v-if="canFollowUp(appointment)"
                    class="confirmation-icon-action"
                    type="button"
                    :aria-label="`Registrar resposta de ${appointment.patient_name}`"
                    @click="openResponse(appointment)"
                  ><MessageCircle :size="16" aria-hidden="true" /></button>
                  <button
                    class="confirmation-icon-action"
                    type="button"
                    :aria-label="`Ver detalhes de ${appointment.patient_name}`"
                    @click="openDetails(appointment)"
                  ><Search :size="16" aria-hidden="true" /></button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="confirmations-cards">
            <article v-for="appointment in paginatedAppointments" :key="appointment.id" class="confirmation-card">
              <div class="confirmation-card__head">
                <UiAvatar :name="appointment.patient_name" size="sm" />
                <div><strong>{{ appointment.patient_name }}</strong><span>{{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }}</span></div>
                <UiBadge :variant="badgeVariant(confirmationLabel(appointment))">{{ confirmationLabel(appointment) }}</UiBadge>
              </div>
              <dl>
                <div><dt>Telefone</dt><dd>{{ formatPhone(appointment.patient_phone) }}</dd></div>
                <div><dt>Dentista</dt><dd>{{ appointment.dentist_name }}</dd></div>
                <div><dt>Procedimento</dt><dd>{{ appointment.procedure }}</dd></div>
                <div><dt>Canal previsto</dt><dd>{{ contactLabel(appointment.contact_channel) }}</dd></div>
              </dl>
              <div class="confirmation-card__actions">
                <UiButton v-if="canFollowUp(appointment) && confirmationLabel(appointment) === 'Pendente'" size="sm" variant="secondary" @click="confirmManually(appointment)">Confirmar</UiButton>
                <UiButton v-if="canFollowUp(appointment)" size="sm" variant="secondary" @click="openReminders(appointment)">Lembrete</UiButton>
                <UiButton v-if="canFollowUp(appointment)" size="sm" variant="secondary" @click="openResponse(appointment)">Resposta</UiButton>
                <UiButton size="sm" @click="openDetails(appointment)">Ver detalhes</UiButton>
              </div>
            </article>
          </div>
          <div v-if="filteredAppointments.length > pageSize" class="confirmations-pagination">
            <span>Página {{ page }} de {{ pageCount }}</span>
            <div>
              <UiButton size="sm" variant="secondary" :disabled="page <= 1" @click="setPage(page - 1)"><ChevronLeft :size="15" aria-hidden="true" /> Anterior</UiButton>
              <UiButton size="sm" variant="secondary" :disabled="page >= pageCount" @click="setPage(page + 1)">Próxima <ChevronRight :size="15" aria-hidden="true" /></UiButton>
            </div>
          </div>
        </div>
      </section>

      <footer class="confirmations-footer">
        <span><Phone :size="14" aria-hidden="true" /> Contatos e alterações seguem as permissões da recepção.</span>
        <span>Zen · Gestão odontológica</span>
      </footer>
    </main>

    <UiDialog v-model="detailOpen" title="Detalhes da confirmação">
      <div v-if="selectedAppointment" class="confirmation-dialog-content">
        <div class="confirmation-identity">
          <UiAvatar :name="selectedAppointment.patient_name" size="lg" />
          <div><strong>{{ selectedAppointment.patient_name }}</strong><span>Consulta #{{ selectedAppointment.id }}</span></div>
          <UiBadge :variant="badgeVariant(confirmationLabel(selectedAppointment))">{{ confirmationLabel(selectedAppointment) }}</UiBadge>
        </div>
        <dl class="confirmation-details-grid">
          <div><dt>Telefone</dt><dd>{{ formatPhone(selectedAppointment.patient_phone) }}</dd></div>
          <div><dt>Data e horário</dt><dd>{{ formatDate(selectedAppointment.appointment_date, { dateStyle: 'long' }) }} · {{ formatTime(selectedAppointment.appointment_time) }}</dd></div>
          <div><dt>Dentista</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
          <div><dt>Procedimento</dt><dd>{{ selectedAppointment.procedure }}</dd></div>
          <div><dt>Canal previsto</dt><dd>{{ contactLabel(selectedAppointment.contact_channel) }}</dd></div>
          <div><dt>Último contato</dt><dd>Não registrado pela integração atual</dd></div>
          <div class="confirmation-details-grid__wide"><dt>Observações administrativas</dt><dd>{{ selectedAppointment.administrative_notes || 'Nenhuma observação registrada.' }}</dd></div>
        </dl>
        <p class="confirmation-disclaimer">O sistema ainda não armazena um histórico estruturado de envios, falhas ou usuário responsável por cada alteração. Respostas manuais ficam anotadas nas observações administrativas.</p>
        <div class="confirmation-dialog-actions">
          <UiButton v-if="canFollowUp(selectedAppointment) && confirmationLabel(selectedAppointment) === 'Pendente'" variant="secondary" :disabled="mutationLoading" @click="confirmManually(selectedAppointment)">Confirmar manualmente</UiButton>
          <UiButton v-if="canFollowUp(selectedAppointment)" variant="secondary" @click="openResponse(selectedAppointment)">Registrar resposta</UiButton>
          <UiButton v-if="canFollowUp(selectedAppointment)" variant="secondary" @click="openReminders(selectedAppointment)"><Clipboard :size="15" aria-hidden="true" /> Copiar lembrete</UiButton>
          <UiButton v-if="canFollowUp(selectedAppointment)" variant="secondary" @click="reschedule(selectedAppointment)">Reagendar</UiButton>
          <UiButton v-if="canFollowUp(selectedAppointment)" variant="danger" @click="openCancellation(selectedAppointment)">Cancelar consulta</UiButton>
          <UiButton variant="secondary" @click="router.push({ name: 'reception-agenda', query: { appointmentId: String(selectedAppointment.id), date: selectedAppointment.appointment_date } })">Ver na agenda</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiDialog v-model="responseOpen" title="Registrar resposta recebida">
      <form v-if="selectedAppointment" class="confirmation-form" @submit.prevent="saveResponse">
        <p class="confirmation-form__intro"><strong>{{ selectedAppointment.patient_name }}</strong> · {{ formatDate(selectedAppointment.appointment_date) }} às {{ formatTime(selectedAppointment.appointment_time) }} · {{ selectedAppointment.dentist_name }}</p>
        <UiFormField label="Resposta recebida" required>
          <template #default="{ id }">
            <select :id="id" v-model="responseValue" class="confirmation-select" required>
              <option value="">Selecione a resposta</option>
              <option value="Confirmada">Confirmou presença</option>
              <option value="Não comparecerá">Não poderá comparecer</option>
              <option value="Reagendamento solicitado">Solicitou reagendamento</option>
            </select>
          </template>
        </UiFormField>
        <UiFormField label="Canal de contato" required>
          <template #default="{ id }">
            <select :id="id" v-model="responseChannel" class="confirmation-select" required>
              <option>Telefone</option><option>WhatsApp</option><option>E-mail</option><option>Presencial</option>
            </select>
          </template>
        </UiFormField>
        <UiFormField label="Observações opcionais">
          <template #default="{ id }"><UiTextarea :id="id" v-model="responseNote" :rows="3" maxlength="500" placeholder="Detalhes úteis do retorno, sem dados clínicos." /></template>
        </UiFormField>
        <p v-if="responseValue === 'Não comparecerá'" class="confirmation-warning" role="status">Registrar que o paciente não poderá comparecer não cancela o agendamento. Se a consulta precisar ser removida, use “Cancelar consulta” e informe o motivo.</p>
        <p v-else-if="responseValue === 'Reagendamento solicitado'" class="confirmation-warning" role="status">O status registrará o pedido, mas não alterará data ou horário. Use “Reagendar” para abrir a agenda.</p>
        <div class="confirmation-dialog-actions">
          <UiButton type="button" variant="secondary" @click="responseOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="mutationLoading" :disabled="!responseValue">Salvar resposta</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="reminderOpen" title="Preparar lembretes">
      <div class="confirmation-reminders">
        <p class="confirmation-form__intro">As integrações de envio não estão habilitadas. Copie as mensagens e envie pelo canal autorizado. Nenhuma consulta será marcada como “Aguardando resposta” automaticamente.</p>
        <article v-for="appointment in reminderAppointments" :key="appointment.id" class="reminder-item">
          <div><strong>{{ appointment.patient_name }}</strong><span>{{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }} · {{ contactLabel(appointment.contact_channel) }}</span></div>
          <p>{{ reminderMessage(appointment) }}</p>
          <UiButton size="sm" variant="secondary" @click="copyReminder(appointment)"><Clipboard :size="15" aria-hidden="true" /> Copiar mensagem</UiButton>
        </article>
        <div class="confirmation-dialog-actions">
          <UiButton variant="secondary" @click="reminderOpen = false">Fechar</UiButton>
          <UiButton @click="copyAllReminders"><Clipboard :size="15" aria-hidden="true" /> Copiar todas</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiDialog v-model="cancelOpen" title="Confirmar cancelamento">
      <form v-if="selectedAppointment" class="confirmation-form" @submit.prevent="cancelAppointment">
        <p class="confirmation-warning">Esta ação cancelará o agendamento de <strong>{{ selectedAppointment.patient_name }}</strong> em {{ formatDate(selectedAppointment.appointment_date) }} às {{ formatTime(selectedAppointment.appointment_time) }}. Ela não pode ser desfeita por esta tela.</p>
        <UiFormField label="Motivo do cancelamento" required>
          <template #default="{ id }"><UiTextarea :id="id" v-model="cancellationReason" :rows="3" maxlength="500" required /></template>
        </UiFormField>
        <div class="confirmation-dialog-actions">
          <UiButton type="button" variant="secondary" @click="cancelOpen = false">Manter consulta</UiButton>
          <UiButton type="submit" variant="danger" :loading="mutationLoading" :disabled="!cancellationReason.trim()">Confirmar cancelamento</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiToast :key="toastKey" v-model="toastVisible" :message="toastMessage" :variant="toastVariant" />
  </div>
</template>

<style scoped>
.confirmations-page{min-height:100vh;background:var(--color-page,#f5f7fb);color:var(--color-text,#193343)}
.confirmations-main{width:min(100% - 2 * clamp(var(--space-4),4vw,var(--space-10)),90rem);margin-inline:auto;padding-block:var(--space-6) var(--space-8)}
.confirmations-intro,.confirmations-intro__actions,.confirmations-toolbar,.confirmations-search,.confirmations-period,.confirmations-metrics,.confirmation-metric,.confirmations-panel__heading,.confirmations-filters,.confirmation-filter,.confirmation-patient,.confirmation-pagination,.confirmation-identity,.confirmation-dialog-actions,.confirmation-card__head,.confirmation-card__actions,.confirmations-footer{display:flex;align-items:center}
.confirmations-intro{justify-content:space-between;gap:var(--space-5);margin-bottom:var(--space-5)}
.confirmations-intro__actions{gap:var(--space-2);flex-wrap:wrap}
.confirmations-eyebrow{margin:0 0 var(--space-1);color:var(--color-primary);font-size:.6875rem;font-weight:var(--font-weight-bold);letter-spacing:var(--letter-spacing-wide)}
.confirmations-intro h1{margin:0;font-family:var(--font-heading);font-size:clamp(1.5rem,2.5vw,1.875rem);font-weight:var(--font-weight-semibold);letter-spacing:var(--letter-spacing-tight);line-height:var(--line-height-tight)}
.confirmations-intro>div>p:last-child{margin:.5rem 0 0;color:var(--color-text-secondary);font-size:var(--font-size-sm)}
.confirmations-toolbar{gap:var(--space-2);margin-bottom:var(--space-4);flex-wrap:wrap}
.confirmations-period,.confirmations-date,.confirmations-search{min-height:2.7rem;gap:.55rem;padding-inline:.75rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-secondary)}
.confirmations-period select,.confirmations-date input,.confirmations-search input{min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-xs)}
.confirmations-search{flex:1;min-width:min(100%,15rem);max-width:25rem;margin-left:auto}
.confirmations-search input{width:100%}
.confirmations-refresh,.confirmation-icon-action{display:grid;width:2.65rem;height:2.65rem;flex:none;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer}
.confirmations-refresh:hover,.confirmation-icon-action:hover{border-color:var(--color-primary);background:var(--color-blue-50);color:var(--color-primary)}
.confirmations-refresh:disabled{cursor:wait;opacity:.6}
.confirmations-spin{animation:confirmation-spin .8s linear infinite}@keyframes confirmation-spin{to{transform:rotate(360deg)}}
.confirmations-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--space-3);margin-bottom:var(--space-3)}
.confirmation-metric{min-width:0;min-height:5.8rem;gap:var(--space-3);padding:var(--space-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-xs)}
.confirmation-metric__icon{display:grid;width:2.5rem;height:2.5rem;flex:none;place-items:center;border-radius:var(--radius-sm)}
.confirmation-metric__icon--blue{background:var(--color-blue-50);color:var(--color-primary)}.confirmation-metric__icon--green{background:var(--color-success-subtle);color:var(--color-success)}.confirmation-metric__icon--amber{background:var(--color-warning-subtle);color:var(--color-warning)}.confirmation-metric__icon--violet{background:var(--color-violet-subtle);color:var(--color-violet)}.confirmation-metric__icon--red{background:var(--color-danger-subtle);color:var(--color-danger)}
.confirmation-metric div{display:grid;min-width:0;gap:.2rem}.confirmation-metric div>span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.confirmation-metric strong{color:var(--color-text);font-size:var(--font-size-xl);line-height:1.1}
.confirmations-integration-note{display:flex;align-items:flex-start;gap:.5rem;margin:0 0 var(--space-5);color:var(--color-text-muted);font-size:var(--font-size-xs);line-height:1.5}.confirmations-integration-note svg{flex:none;color:var(--color-primary)}
.confirmations-panel{overflow:hidden;padding:var(--space-5);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-xs)}
.confirmations-panel__heading{justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-4)}
.confirmations-panel__heading h2{margin:0;font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold)}
.confirmations-panel__heading>div>p:last-child{margin:.35rem 0 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.confirmations-no-response,.confirmation-check{display:flex;align-items:center;gap:.45rem;color:var(--color-text-secondary);font-size:var(--font-size-xs)}
.confirmations-filters{gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-4)}
.confirmation-filter{min-height:2.35rem;gap:.4rem;padding:0 .65rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-muted)}
.confirmation-filter select{max-width:12rem;border:0;outline:0;background:transparent;color:var(--color-text-secondary);font:inherit;font-size:var(--font-size-xs)}
.confirmations-table-wrap{width:100%;overflow-x:auto}
.confirmations-table{width:100%;border-collapse:collapse;text-align:left;font-size:var(--font-size-xs)}
.confirmations-table th{padding:.7rem .55rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-weight:var(--font-weight-medium);white-space:nowrap}
.confirmations-table td{padding:.7rem .55rem;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);vertical-align:middle}
.confirmations-table tbody tr:last-child td{border-bottom:0}
.confirmations-table td strong{color:var(--color-text);font-weight:var(--font-weight-medium)}
.confirmations-table td small{display:block;margin-top:.2rem;color:var(--color-text-muted)}
.confirmation-patient{gap:.5rem;min-width:10rem}
.confirmation-patient>span{display:grid;min-width:0;gap:.15rem}
.confirmation-muted{color:var(--color-text-muted)!important}
.confirmation-actions{display:flex;justify-content:flex-end;align-items:center;gap:.35rem;white-space:nowrap}
.confirmation-icon-action{width:2rem;height:2rem}
.confirmations-cards{display:none}
.confirmations-pagination{justify-content:space-between;gap:var(--space-3);padding-top:var(--space-4);color:var(--color-text-muted);font-size:var(--font-size-xs)}
.confirmations-pagination>div{display:flex;gap:.5rem}
.confirmations-state{display:grid;min-height:13rem;align-content:center;justify-items:center;gap:.55rem;color:var(--color-text-muted);text-align:center}
.confirmations-state strong{color:var(--color-text);font-size:var(--font-size-sm)}
.confirmations-state p{max-width:30rem;margin:0 0 .3rem;font-size:var(--font-size-xs)}
.confirmations-state--error>svg{color:var(--color-danger)}
.confirmations-spinner{width:1.4rem;height:1.4rem;border:2px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;animation:confirmation-spin .7s linear infinite}
.confirmations-footer{justify-content:space-between;gap:var(--space-3);padding:var(--space-4) 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.confirmation-dialog-content,.confirmation-form,.confirmation-reminders{display:grid;gap:var(--space-4)}
.confirmation-identity{gap:var(--space-3);padding-bottom:var(--space-3);border-bottom:1px solid var(--color-border)}
.confirmation-identity>div{display:grid;flex:1;gap:.15rem}.confirmation-identity strong{color:var(--color-text);font-size:var(--font-size-base)}.confirmation-identity span{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.confirmation-details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin:0}
.confirmation-details-grid div{min-width:0}.confirmation-details-grid dt{color:var(--color-text-muted);font-size:var(--font-size-xs)}.confirmation-details-grid dd{margin:.25rem 0 0;color:var(--color-text);font-size:var(--font-size-sm);overflow-wrap:anywhere}
.confirmation-details-grid__wide{grid-column:1/-1}
.confirmation-disclaimer,.confirmation-warning{margin:0;padding:.75rem;border-radius:var(--radius-sm);background:var(--color-warning-subtle);color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5}
.confirmation-warning{color:var(--color-text)}
.confirmation-dialog-actions{justify-content:flex-end;gap:var(--space-2);flex-wrap:wrap;padding-top:var(--space-2)}
.confirmation-form__intro{margin:0;color:var(--color-text-secondary);font-size:var(--font-size-sm);line-height:1.5}
.confirmation-select{width:100%;min-height:2.7rem;padding:.5rem .7rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font:inherit}
.reminder-item{display:grid;gap:.65rem;padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-page)}
.reminder-item>div{display:grid;gap:.15rem}.reminder-item strong{color:var(--color-text);font-size:var(--font-size-sm)}.reminder-item span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.reminder-item p{margin:0;color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5}
.confirmations-page :deep(button),.confirmations-page :deep(input),.confirmations-page :deep(select),.confirmations-page :deep(textarea){font-family:inherit}
.confirmations-page :deep(button:focus-visible),.confirmations-page input:focus-visible,.confirmations-page select:focus-visible,.confirmations-page textarea:focus-visible{outline:3px solid color-mix(in srgb,var(--color-primary) 42%,transparent);outline-offset:2px}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1150px){.confirmations-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.confirmations-table{min-width:68rem}}
@media(max-width:720px){.confirmations-main{width:calc(100% - 2 * var(--space-3));padding-block:var(--space-4)}.confirmations-intro{align-items:flex-start;flex-direction:column;gap:var(--space-3)}.confirmations-intro__actions{width:100%}.confirmations-intro__actions>*{flex:1}.confirmations-toolbar{align-items:stretch}.confirmations-period,.confirmations-date{flex:1}.confirmations-search{order:2;max-width:none;margin:0}.confirmations-refresh{order:3}.confirmations-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2)}.confirmation-metric{min-height:5rem;padding:var(--space-3);gap:.65rem}.confirmation-metric__icon{width:2.1rem;height:2.1rem}.confirmation-metric strong{font-size:var(--font-size-lg)}.confirmations-panel{padding:var(--space-3)}.confirmations-panel__heading{align-items:flex-start}.confirmations-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.confirmation-filter{min-width:0}.confirmation-filter select{max-width:100%;width:100%}.confirmations-filters :deep(button){grid-column:1/-1;justify-self:end}.confirmations-table{display:none}.confirmations-cards{display:grid;gap:var(--space-3)}.confirmation-card{display:grid;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)}.confirmation-card__head{gap:.6rem}.confirmation-card__head>div{display:grid;flex:1;min-width:0;gap:.15rem}.confirmation-card__head strong{color:var(--color-text);font-size:var(--font-size-sm)}.confirmation-card__head span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.confirmation-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:0}.confirmation-card dl div{min-width:0}.confirmation-card dt{color:var(--color-text-muted);font-size:.68rem}.confirmation-card dd{margin:.15rem 0 0;color:var(--color-text);font-size:var(--font-size-xs);overflow-wrap:anywhere}.confirmation-card__actions{flex-wrap:wrap;gap:.4rem}.confirmations-pagination{align-items:flex-start;flex-direction:column}.confirmations-footer{align-items:flex-start;flex-direction:column}.confirmation-dialog-actions>*{flex:1}.confirmation-details-grid{grid-template-columns:minmax(0,1fr)}.confirmation-details-grid__wide{grid-column:auto}}
@media(max-width:420px){.confirmations-intro__actions{align-items:stretch;flex-direction:column}.confirmations-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto}.confirmations-period{grid-column:1/-1}.confirmations-date{min-width:0}.confirmations-date input{width:100%;font-size:.68rem}.confirmations-search{grid-column:1/-1}.confirmations-refresh{grid-column:2;grid-row:3}.confirmations-metrics{gap:.5rem}.confirmation-metric{align-items:flex-start;padding:.65rem}.confirmation-metric__icon{width:1.85rem;height:1.85rem}.confirmation-metric div>span{font-size:.67rem}.confirmations-filters{grid-template-columns:minmax(0,1fr)}.confirmations-filters :deep(button){grid-column:auto}.confirmation-card__head{flex-wrap:wrap}.confirmation-card__head .ui-badge{margin-left:2.5rem}.confirmation-card__actions>*{flex:1}.confirmation-dialog-actions{align-items:stretch;flex-direction:column}}
@media(prefers-reduced-motion:reduce){.confirmations-page *, .confirmations-page *:before,.confirmations-page *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
