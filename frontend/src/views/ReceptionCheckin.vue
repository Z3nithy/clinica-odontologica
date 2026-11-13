<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
  UserRoundCheck,
  Users,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  checkInReceptionAppointment,
  getReceptionAppointments,
  getReceptionDentists,
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
const selectedDate = ref(toDateInput(today))
const appointments = ref([])
const dentists = ref([])
const state = ref('loading')
const errorMessage = ref('')
const requestId = ref(0)
const search = ref('')
const dentistFilter = ref('')
const statusFilter = ref('')
const periodFilter = ref('')
const lateOnly = ref(false)
const checkedInOnly = ref(false)
const queueOrder = ref('arrival')
const now = ref(Date.now())
const checkinDialogOpen = ref(false)
const detailsDialogOpen = ref(false)
const selectedAppointment = ref(null)
const selectedId = ref('')
const receptionNote = ref('')
const presenceConfirmed = ref(false)
const saving = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
let searchTimer
let clockTimer

const dateLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fromDateInput(selectedDate.value)),
)

const appointmentsWithStatus = computed(() =>
  appointments.value.map((appointment) => ({
    ...appointment,
    displayStatus: displayStatus(appointment),
  })),
)

const metrics = computed(() => {
  const list = appointmentsWithStatus.value
  return [
    { label: 'Consultas de hoje', value: list.length, icon: CalendarDays, tone: 'blue' },
    {
      label: 'Aguardando chegada',
      value: list.filter((item) => ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(item.status) && item.displayStatus !== 'Atrasado').length,
      icon: UserRound,
      tone: 'amber',
    },
    {
      label: 'Aguardando atendimento',
      value: list.filter((item) => item.status === 'Em espera').length,
      icon: UserRoundCheck,
      tone: 'violet',
    },
    {
      label: 'Em atendimento',
      value: list.filter((item) => item.status === 'Em atendimento').length,
      icon: Stethoscope,
      tone: 'green',
    },
    {
      label: 'Atrasados',
      value: list.filter((item) => item.displayStatus === 'Atrasado').length,
      icon: Clock3,
      tone: 'red',
    },
  ]
})

const visibleAppointments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return appointmentsWithStatus.value
    .filter((item) => !dentistFilter.value || String(item.dentist_id) === dentistFilter.value)
    .filter((item) => !statusFilter.value || item.displayStatus === statusFilter.value)
    .filter((item) => {
      if (!periodFilter.value) return true
      const hour = Number(item.time.slice(0, 2))
      if (periodFilter.value === 'morning') return hour < 12
      if (periodFilter.value === 'afternoon') return hour >= 12 && hour < 18
      return hour >= 18
    })
    .filter((item) => !lateOnly.value || item.displayStatus === 'Atrasado')
    .filter((item) => !checkedInOnly.value || Boolean(item.arrival_at))
    .filter((item) => {
      if (!query) return true
      return [item.id, item.patient_name, item.patient_phone, item.dentist_name, item.cpf]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query))
    })
})

const waitingQueue = computed(() => {
  const queue = visibleAppointments.value.filter((item) => item.status === 'Em espera')
  return [...queue].sort((a, b) => {
    if (queueOrder.value === 'scheduled') return `${a.appointment_time}`.localeCompare(b.appointment_time)
    if (queueOrder.value === 'wait') return waitMinutes(b) - waitMinutes(a)
    return new Date(a.arrival_at || 0) - new Date(b.arrival_at || 0)
  })
})

const checkinChoices = computed(() =>
  appointmentsWithStatus.value.filter((item) =>
    ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(item.status),
  ),
)
const chosenAppointment = computed(() =>
  checkinChoices.value.find((item) => String(item.id) === selectedId.value),
)

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function fromDateInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function formatPhone(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value || '—'
}

function mapAppointment(item) {
  return { ...item, time: item.appointment_time.slice(0, 5) }
}

function minutesSince(value) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? Math.max(0, Math.floor((now.value - time) / 60_000)) : 0
}

function waitMinutes(item) {
  return item.arrival_at ? minutesSince(item.arrival_at) : 0
}

function displayStatus(item) {
  if (item.status === 'Em espera') return 'Aguardando atendimento'
  if (item.status === 'Em atendimento') return 'Em atendimento'
  if (item.status === 'Concluída') return 'Concluído'
  if (item.status === 'Cancelada') return 'Cancelado'
  if (item.status === 'Não compareceu') return 'Não compareceu'
  const startsAt = new Date(`${item.appointment_date}T${item.time}:00`).getTime()
  if (!item.arrival_at && startsAt < now.value) return 'Atrasado'
  return 'Agendado'
}

function statusVariant(status) {
  if (status === 'Aguardando atendimento' || status === 'Concluído') return 'success'
  if (status === 'Atrasado') return 'danger'
  if (status === 'Cancelado' || status === 'Não compareceu') return 'neutral'
  if (status === 'Em atendimento') return 'info'
  return 'warning'
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function loadAppointments() {
  const id = ++requestId.value
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  errorMessage.value = ''
  try {
    const response = await getReceptionAppointments({
      date: selectedDate.value,
      date_to: selectedDate.value,
      q: search.value.trim() || undefined,
    })
    if (id !== requestId.value) return
    appointments.value = response.items.map(mapAppointment)
    state.value = 'ready'
    if (selectedAppointment.value) {
      selectedAppointment.value =
        appointments.value.find((item) => item.id === selectedAppointment.value.id) || null
    }
  } catch (error) {
    if (id !== requestId.value) return
    state.value = 'error'
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível carregar os check-ins.')
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

function refreshSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadAppointments(), 300)
}

function openCheckin(appointment = null) {
  selectedAppointment.value = appointment
  selectedId.value = appointment ? String(appointment.id) : ''
  receptionNote.value = ''
  presenceConfirmed.value = false
  checkinDialogOpen.value = true
}

function canCheckin(appointment) {
  return ['Agendada', 'Confirmada', 'Aguardando chegada'].includes(appointment.status)
}

async function confirmCheckin() {
  const appointment = chosenAppointment.value
  if (!appointment || !presenceConfirmed.value || !canCheckin(appointment)) return
  saving.value = true
  try {
    await checkInReceptionAppointment(appointment.id, receptionNote.value.trim())
    checkinDialogOpen.value = false
    await loadAppointments()
    showToast('Check-in realizado com sucesso.', 'success')
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível registrar o check-in.'), 'danger')
  } finally {
    saving.value = false
  }
}

function openDetails(appointment) {
  selectedAppointment.value = appointment
  detailsDialogOpen.value = true
}

function openPatient(appointment) {
  void router.push({ name: 'reception-patients', query: { patientId: String(appointment.patient_id) } })
}

function openAppointment(appointment) {
  void router.push({
    name: 'reception-agenda',
    query: { date: selectedDate.value, appointmentId: String(appointment.id) },
  })
}

function handleNavigation(id) {
  if (id === 'overview') void router.push({ name: 'reception-dashboard' })
  else if (id === 'schedule') void router.push({ name: 'reception-agenda' })
  else if (id === 'patient-list') void router.push({ name: 'reception-patients' })
  else if (id === 'confirmations') void router.push({ name: 'reception-confirmations' })
  else if (id === 'history') void router.push({ name: 'reception-history' })
  else if (id !== 'checkin') showToast('Esta área ainda não está disponível.', 'info')
}

function shiftDate(amount) {
  const date = fromDateInput(selectedDate.value)
  date.setDate(date.getDate() + amount)
  selectedDate.value = toDateInput(date)
}

function clearFilters() {
  dentistFilter.value = ''
  statusFilter.value = ''
  periodFilter.value = ''
  lateOnly.value = false
  checkedInOnly.value = false
  search.value = ''
  void loadAppointments()
}

watch(selectedDate, () => void loadAppointments())
watch(search, refreshSearch)

onMounted(() => {
  void loadAppointments()
  void loadDentists()
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearInterval(clockTimer)
  requestId.value += 1
})
</script>

<template>
  <div class="checkin-page">
    <ReceptionShell
      active-page="checkin"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="checkin-main">
      <section class="checkin-intro" aria-labelledby="checkin-title">
        <div>
          <p class="checkin-eyebrow">FLUXO DE ATENDIMENTO</p>
          <h1 id="checkin-title">Check-in de Pacientes</h1>
          <p>Registre a chegada dos pacientes e acompanhe a fila de atendimento</p>
        </div>
        <div class="checkin-intro__actions">
          <button
            class="checkin-refresh"
            type="button"
            aria-label="Atualizar consultas"
            :disabled="state === 'refreshing'"
            @click="loadAppointments"
          >
            <RefreshCw :size="17" :class="{ 'checkin-spin': state === 'refreshing' }" />
          </button>
          <UiButton @click="openCheckin()">
            <template #start><Plus :size="17" aria-hidden="true" /></template>
            Registrar check-in
          </UiButton>
        </div>
      </section>

      <section class="checkin-metrics" aria-label="Indicadores de atendimento">
        <article v-for="metric in metrics" :key="metric.label" class="checkin-metric">
          <span :class="`checkin-metric__icon checkin-metric__icon--${metric.tone}`">
            <component :is="metric.icon" :size="18" aria-hidden="true" />
          </span>
          <div><span>{{ metric.label }}</span><strong>{{ state === 'loading' ? '—' : metric.value }}</strong></div>
        </article>
      </section>

      <section class="checkin-panel" aria-labelledby="checkin-list-title">
        <div class="checkin-panel__heading">
          <div>
            <p class="checkin-eyebrow">RECEPÇÃO</p>
            <h2 id="checkin-list-title">Consultas do dia</h2>
            <p>{{ visibleAppointments.length }} consulta(s) na lista · {{ dateLabel }}</p>
          </div>
          <label class="checkin-search">
            <Search :size="17" aria-hidden="true" />
            <span class="visually-hidden">Buscar por paciente, CPF, telefone ou código da consulta</span>
            <input v-model="search" type="search" placeholder="Paciente, CPF, telefone ou consulta..." />
          </label>
        </div>

        <div class="checkin-controls">
          <div class="checkin-date-controls">
            <button class="checkin-icon-button" type="button" aria-label="Dia anterior" @click="shiftDate(-1)"><ChevronLeft :size="18" /></button>
            <label class="checkin-date-input">
              <span class="visually-hidden">Data das consultas</span>
              <CalendarDays :size="16" aria-hidden="true" />
              <input v-model="selectedDate" type="date" />
            </label>
            <button class="checkin-icon-button" type="button" aria-label="Próximo dia" @click="shiftDate(1)"><ChevronRight :size="18" /></button>
            <UiButton size="sm" variant="secondary" @click="selectedDate = toDateInput(today)">Hoje</UiButton>
          </div>
          <div class="checkin-filter-controls">
            <label class="checkin-select">
              <Stethoscope :size="15" aria-hidden="true" />
              <span class="visually-hidden">Filtrar por dentista</span>
              <select v-model="dentistFilter"><option value="">Todos os dentistas</option><option v-for="dentist in dentists" :key="dentist.id" :value="String(dentist.id)">{{ dentist.name }}</option></select>
            </label>
            <label class="checkin-select">
              <Check :size="15" aria-hidden="true" />
              <span class="visually-hidden">Filtrar por status</span>
              <select v-model="statusFilter">
                <option value="">Todos os status</option>
                <option>Atrasado</option><option>Agendado</option><option>Aguardando atendimento</option>
                <option>Em atendimento</option><option>Concluído</option><option>Cancelado</option><option>Não compareceu</option>
              </select>
            </label>
            <label class="checkin-select">
              <Clock3 :size="15" aria-hidden="true" />
              <span class="visually-hidden">Filtrar por período</span>
              <select v-model="periodFilter"><option value="">Qualquer período</option><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="evening">Noite</option></select>
            </label>
            <label class="checkin-toggle"><input v-model="lateOnly" type="checkbox" /><span>Atrasados</span></label>
            <label class="checkin-toggle"><input v-model="checkedInOnly" type="checkbox" /><span>Com check-in</span></label>
            <UiButton size="sm" variant="secondary" @click="clearFilters">Limpar filtros</UiButton>
          </div>
        </div>

        <div v-if="state === 'loading'" class="checkin-state" role="status">
          <span class="checkin-spinner" aria-hidden="true"></span><strong>Carregando consultas</strong>
        </div>
        <div v-else-if="state === 'error'" class="checkin-state checkin-state--error" role="alert">
          <CircleAlert :size="24" aria-hidden="true" /><strong>Não foi possível carregar a lista</strong>
          <p>{{ errorMessage }}</p><UiButton variant="secondary" size="sm" @click="loadAppointments">Tentar novamente</UiButton>
        </div>
        <div v-else-if="!visibleAppointments.length" class="checkin-state">
          <CalendarDays :size="26" aria-hidden="true" />
          <strong>{{ appointments.length ? 'Nenhum paciente corresponde aos filtros' : 'Nenhuma consulta nesta data' }}</strong>
          <p>{{ appointments.length ? 'Altere os filtros para ver outros pacientes.' : 'Selecione outro dia ou atualize a agenda da clínica.' }}</p>
        </div>
        <div v-else class="checkin-table-wrap" :aria-busy="state === 'refreshing'">
          <table class="checkin-table">
            <thead>
              <tr>
                <th scope="col">Horário</th><th scope="col">Paciente</th><th scope="col">Dentista</th>
                <th scope="col">Procedimento</th><th scope="col">Chegada</th><th scope="col">Espera</th>
                <th scope="col">Status</th><th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="appointment in visibleAppointments" :key="appointment.id">
                <td data-label="Horário" class="checkin-scheduled">{{ appointment.time }}</td>
                <td data-label="Paciente">
                  <div class="checkin-patient"><UiAvatar :name="appointment.patient_name" size="sm" /><span><strong>{{ appointment.patient_name }}</strong><small>{{ formatPhone(appointment.patient_phone) }} · ID {{ appointment.id }}</small></span></div>
                </td>
                <td data-label="Dentista">{{ appointment.dentist_name }}</td>
                <td data-label="Procedimento">{{ appointment.procedure }}</td>
                <td data-label="Chegada">{{ appointment.arrival_at ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.arrival_at)) : '—' }}</td>
                <td data-label="Espera">{{ appointment.status === 'Em espera' ? `${waitMinutes(appointment)} min` : '—' }}</td>
                <td data-label="Status"><UiBadge :variant="statusVariant(appointment.displayStatus)">{{ appointment.displayStatus }}</UiBadge></td>
                <td data-label="Ações" class="checkin-actions">
                  <UiButton v-if="canCheckin(appointment)" size="sm" @click="openCheckin(appointment)">Confirmar chegada</UiButton>
                  <button class="checkin-text-action" type="button" @click="openDetails(appointment)">Ver consulta</button>
                  <button class="checkin-text-action" type="button" @click="openPatient(appointment)">Ver paciente</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="checkin-cards">
            <article v-for="appointment in visibleAppointments" :key="appointment.id" class="checkin-card">
              <div class="checkin-card__heading">
                <UiAvatar :name="appointment.patient_name" size="sm" />
                <div><strong>{{ appointment.patient_name }}</strong><span>{{ appointment.time }} · {{ formatPhone(appointment.patient_phone) }}</span></div>
                <UiBadge :variant="statusVariant(appointment.displayStatus)">{{ appointment.displayStatus }}</UiBadge>
              </div>
              <dl>
                <div><dt>Dentista</dt><dd>{{ appointment.dentist_name }}</dd></div>
                <div><dt>Procedimento</dt><dd>{{ appointment.procedure }}</dd></div>
                <div><dt>Chegada</dt><dd>{{ appointment.arrival_at ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.arrival_at)) : '—' }}</dd></div>
                <div><dt>Espera</dt><dd>{{ appointment.status === 'Em espera' ? `${waitMinutes(appointment)} min` : '—' }}</dd></div>
              </dl>
              <div class="checkin-card__actions">
                <UiButton v-if="canCheckin(appointment)" size="sm" @click="openCheckin(appointment)">Confirmar chegada</UiButton>
                <UiButton size="sm" variant="secondary" @click="openDetails(appointment)">Ver consulta</UiButton>
                <button class="checkin-text-action" type="button" @click="openPatient(appointment)">Ver paciente</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="queue-panel" aria-labelledby="queue-title">
        <div class="queue-panel__heading">
          <div><p class="checkin-eyebrow">ACOMPANHAMENTO</p><h2 id="queue-title">Fila de Atendimento</h2><p>{{ waitingQueue.length }} paciente(s) aguardando</p></div>
          <label class="queue-sort"><span>Ordenar</span><select v-model="queueOrder"><option value="arrival">Horário de chegada</option><option value="scheduled">Horário agendado</option><option value="wait">Maior tempo de espera</option></select></label>
        </div>
        <div v-if="waitingQueue.length" class="queue-list">
          <article v-for="appointment in waitingQueue" :key="appointment.id" class="queue-item">
            <span class="queue-item__time">{{ appointment.arrival_at ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.arrival_at)) : '—' }}</span>
            <UiAvatar :name="appointment.patient_name" size="sm" />
            <div class="queue-item__patient"><strong>{{ appointment.patient_name }}</strong><span>{{ appointment.dentist_name }} · {{ appointment.procedure }}</span></div>
            <span class="queue-item__wait"><Clock3 :size="14" aria-hidden="true" /> {{ waitMinutes(appointment) }} min de espera</span>
            <UiButton size="sm" variant="secondary" @click="openDetails(appointment)">Ver consulta</UiButton>
          </article>
        </div>
        <div v-else class="queue-empty"><Users :size="21" aria-hidden="true" /><span>Nenhum paciente aguardando atendimento no momento.</span></div>
      </section>

      <footer class="checkin-footer">
        <span><FileClock :size="14" aria-hidden="true" /> A chegada é registrada pelo horário do servidor.</span>
        <span>Zen · Gestão odontológica</span>
      </footer>
    </main>

    <UiDialog v-model="checkinDialogOpen" title="Registrar chegada">
      <form class="checkin-form" @submit.prevent="confirmCheckin">
        <p class="checkin-notice">Confirme a consulta e a presença do paciente. O sistema registrará a hora oficial da chegada.</p>
        <label class="checkin-appointment-search">
          <span>Localizar paciente ou consulta</span>
          <span class="checkin-search__control"><Search :size="16" aria-hidden="true" /><input v-model="search" type="search" placeholder="Nome, telefone ou código da consulta" @input="refreshSearch" /></span>
        </label>
        <UiFormField label="Consulta agendada" required>
          <template #default="{ id }">
            <select :id="id" v-model="selectedId" class="checkin-appointment-select" required>
              <option value="">Selecione uma consulta disponível</option>
              <option v-for="appointment in checkinChoices" :key="appointment.id" :value="String(appointment.id)">
                {{ appointment.time }} · {{ appointment.patient_name }} · {{ appointment.dentist_name }} · {{ appointment.status }}
              </option>
            </select>
          </template>
        </UiFormField>
        <dl v-if="chosenAppointment" class="checkin-confirmation">
          <div><dt>Paciente</dt><dd>{{ chosenAppointment.patient_name }}</dd></div>
          <div><dt>Horário</dt><dd>{{ chosenAppointment.time }} · {{ formatDate(selectedDate) }}</dd></div>
          <div><dt>Dentista</dt><dd>{{ chosenAppointment.dentist_name }}</dd></div>
          <div><dt>Procedimento</dt><dd>{{ chosenAppointment.procedure }}</dd></div>
          <div><dt>Telefone</dt><dd>{{ formatPhone(chosenAppointment.patient_phone) }}</dd></div>
        </dl>
        <div v-if="!checkinChoices.length" class="checkin-state checkin-state--compact" role="status">
          <CircleAlert :size="20" aria-hidden="true" /><strong>Nenhuma consulta disponível para check-in</strong>
          <p>Verifique a data selecionada ou consulte a Agenda antes de registrar a chegada.</p>
        </div>
        <UiFormField label="Observações da recepção">
          <template #default="{ id }"><UiTextarea :id="id" v-model="receptionNote" :rows="2" maxlength="2000" /></template>
        </UiFormField>
        <label class="checkin-presence">
          <input v-model="presenceConfirmed" type="checkbox" />
          <span>Confirmo que o paciente está presente na clínica.</span>
        </label>
        <div class="checkin-form__actions">
          <UiButton variant="secondary" @click="checkinDialogOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving" :disabled="!chosenAppointment || !presenceConfirmed">Confirmar chegada</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="detailsDialogOpen" title="Detalhes da consulta">
      <div v-if="selectedAppointment" class="checkin-detail">
        <div class="checkin-detail__identity">
          <UiAvatar :name="selectedAppointment.patient_name" size="lg" />
          <div><strong>{{ selectedAppointment.patient_name }}</strong><span>Consulta #{{ selectedAppointment.id }}</span></div>
          <UiBadge :variant="statusVariant(displayStatus(selectedAppointment))">{{ displayStatus(selectedAppointment) }}</UiBadge>
        </div>
        <dl class="checkin-confirmation">
          <div><dt>Data e horário</dt><dd>{{ formatDate(selectedAppointment.appointment_date) }} · {{ selectedAppointment.time }}</dd></div>
          <div><dt>Telefone</dt><dd>{{ formatPhone(selectedAppointment.patient_phone) }}</dd></div>
          <div><dt>Dentista</dt><dd>{{ selectedAppointment.dentist_name }}</dd></div>
          <div><dt>Procedimento</dt><dd>{{ selectedAppointment.procedure }}</dd></div>
          <div><dt>Chegada</dt><dd>{{ selectedAppointment.arrival_at ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(selectedAppointment.arrival_at)) : 'Ainda não registrada' }}</dd></div>
        </dl>
        <p class="checkin-notice">Iniciar atendimento e desfazer chegada não são oferecidos neste perfil porque o sistema ainda não fornece um fluxo de auditoria/autorização para essas alterações.</p>
        <div class="checkin-form__actions">
          <UiButton variant="secondary" @click="openPatient(selectedAppointment)">Ver cadastro do paciente</UiButton>
          <UiButton variant="secondary" @click="openAppointment(selectedAppointment)">Ver consulta na agenda</UiButton>
          <UiButton v-if="canCheckin(selectedAppointment)" @click="detailsDialogOpen = false; openCheckin(selectedAppointment)">Confirmar chegada</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiToast :key="toastKey" v-model="toastVisible" :message="toastMessage" :variant="toastVariant" />
  </div>
</template>

<style scoped>
.checkin-page{min-height:100vh;background:var(--color-page,#f5f7fb);color:var(--color-text,#193343)}
.checkin-main{width:min(100% - 2 * clamp(var(--space-4),4vw,var(--space-10)),90rem);margin-inline:auto;padding-block:var(--space-6) var(--space-8)}
.checkin-intro,.checkin-intro__actions,.checkin-panel__heading,.checkin-metric,.checkin-controls,.checkin-date-controls,.checkin-filter-controls,.checkin-search,.checkin-select,.checkin-patient,.checkin-card__heading,.checkin-card__actions,.queue-panel__heading,.queue-item,.checkin-footer,.checkin-detail__identity{display:flex;align-items:center}
.checkin-intro{justify-content:space-between;gap:var(--space-5);margin-bottom:var(--space-6)}
.checkin-eyebrow{margin:0 0 var(--space-1);color:var(--color-primary);font-size:.6875rem;font-weight:var(--font-weight-bold);letter-spacing:var(--letter-spacing-wide)}
.checkin-intro h1{margin:0;font-family:var(--font-heading);font-size:clamp(1.5rem,2.5vw,1.875rem);font-weight:var(--font-weight-semibold);letter-spacing:var(--letter-spacing-tight);line-height:var(--line-height-tight)}
.checkin-intro>div>p:last-child{margin:.5rem 0 0;color:var(--color-text-secondary);font-size:var(--font-size-sm)}
.checkin-intro__actions{gap:var(--space-2)}
.checkin-refresh,.checkin-icon-button{display:grid;width:2.5rem;height:2.5rem;flex:0 0 auto;place-items:center;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer}
.checkin-refresh:hover,.checkin-icon-button:hover{border-color:var(--color-blue-200);background:var(--color-blue-50);color:var(--color-primary)}
.checkin-refresh:focus-visible,.checkin-icon-button:focus-visible,.checkin-text-action:focus-visible,.checkin-pagination button:focus-visible{outline:3px solid var(--color-blue-300);outline-offset:2px}
.checkin-refresh:disabled{opacity:.6;cursor:wait}
.checkin-spin{animation:checkin-spin .8s linear infinite}
@keyframes checkin-spin{to{transform:rotate(360deg)}}
.checkin-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--space-4);margin-bottom:var(--space-5)}
.checkin-metric,.checkin-panel,.queue-panel{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-sm)}
.checkin-metric{min-width:0;min-height:6.5rem;gap:var(--space-3);padding:var(--space-4)}
.checkin-metric__icon{display:grid;width:2.5rem;height:2.5rem;flex:0 0 auto;place-items:center;border-radius:var(--radius-md)}
.checkin-metric__icon--blue{background:var(--color-blue-50);color:var(--color-primary)}.checkin-metric__icon--amber{background:var(--color-warning-subtle);color:var(--color-warning)}.checkin-metric__icon--violet{background:var(--color-violet-subtle);color:var(--color-violet)}.checkin-metric__icon--green{background:var(--color-success-subtle);color:var(--color-success-strong)}.checkin-metric__icon--red{background:var(--color-danger-subtle);color:var(--color-danger)}
.checkin-metric>div{display:grid;min-width:0;gap:.2rem}.checkin-metric>div>span{color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.3}.checkin-metric strong{font-family:var(--font-heading);font-size:var(--font-size-2xl);font-weight:var(--font-weight-semibold);line-height:1.15}
.checkin-panel,.queue-panel{min-width:0;margin-bottom:var(--space-5);padding:var(--space-5)}
.checkin-panel__heading,.queue-panel__heading{justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-4)}
.checkin-panel__heading h2,.queue-panel__heading h2{margin:0;font-family:var(--font-heading);font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold)}
.checkin-panel__heading>div>p:last-child,.queue-panel__heading>div>p:last-child{margin:.3rem 0 0;color:var(--color-text-muted);font-size:var(--font-size-xs);text-transform:capitalize}
.checkin-search{width:min(100%,25rem);min-height:2.65rem;gap:.55rem;padding-inline:.75rem;border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-muted)}
.checkin-search:focus-within{border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-focus-ring)}
.checkin-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-sm)}
.checkin-controls{align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3);margin-bottom:var(--space-4)}
.checkin-date-controls,.checkin-filter-controls{gap:.5rem;flex-wrap:wrap}
.checkin-date-input{position:relative;display:grid;width:2.8rem;height:2.5rem;place-items:center;color:var(--color-text-secondary);cursor:pointer}
.checkin-date-input input{position:absolute;inset:0;width:100%;height:100%;padding:.25rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:transparent;color:transparent;cursor:pointer}
.checkin-date-input input::-webkit-calendar-picker-indicator{width:100%;height:100%;opacity:0;cursor:pointer}
.checkin-date-input:focus-within{border-radius:var(--radius-md);outline:3px solid var(--color-focus-ring);outline-offset:2px}
.checkin-date-input>svg{pointer-events:none}
.checkin-select{min-width:8rem;min-height:2.5rem;gap:.4rem;padding-inline:.6rem;border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-text-muted)}
.checkin-select select{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit;font-size:var(--font-size-xs)}
.checkin-toggle{display:flex;min-height:2.5rem;align-items:center;gap:.4rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);white-space:nowrap;cursor:pointer}.checkin-toggle input,.checkin-presence input{width:1rem;height:1rem;accent-color:var(--color-primary)}
.checkin-state{display:grid;min-height:13rem;align-content:center;justify-items:center;gap:var(--space-2);color:var(--color-text-secondary);text-align:center}
.checkin-state>svg{color:var(--color-primary)}.checkin-state strong{color:var(--color-text);font-size:var(--font-size-sm)}.checkin-state p{max-width:32rem;margin:0 0 var(--space-2);font-size:var(--font-size-sm)}.checkin-state--error>svg{color:var(--color-danger)}.checkin-state--compact{min-height:auto;padding:var(--space-3)}
.checkin-spinner{width:1.5rem;height:1.5rem;border:2px solid var(--color-blue-100);border-top-color:var(--color-primary);border-radius:50%;animation:checkin-spin .8s linear infinite}
.checkin-table-wrap{overflow-x:auto}
.checkin-table{width:100%;border-collapse:collapse;text-align:left;font-size:var(--font-size-xs)}
.checkin-table th{padding:.7rem .55rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-size:.68rem;font-weight:var(--font-weight-semibold);white-space:nowrap}
.checkin-table td{padding:.75rem .55rem;border-bottom:1px solid var(--color-gray-100);color:var(--color-text-secondary);vertical-align:middle}
.checkin-table tbody tr:hover{background:var(--color-page,#f5f7fb)}
.checkin-scheduled{color:var(--color-text)!important;font-weight:var(--font-weight-semibold);white-space:nowrap}
.checkin-patient{gap:.55rem;min-width:11rem}.checkin-patient>span{display:grid;gap:.15rem}.checkin-patient strong{color:var(--color-text);font-size:var(--font-size-xs)}.checkin-patient small{color:var(--color-text-muted);font-size:.65rem}
.checkin-actions{min-width:9rem}
.checkin-text-action{display:block;padding:.3rem;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-primary);font:inherit;font-size:.7rem;font-weight:var(--font-weight-semibold);cursor:pointer}
.checkin-text-action:hover{background:var(--color-blue-50)}
.checkin-cards{display:none}
.queue-panel__heading{align-items:flex-end}
.queue-sort{display:grid;gap:.25rem;color:var(--color-text-muted);font-size:var(--font-size-xs)}
.queue-sort select{min-height:2.4rem;padding-inline:.6rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font:inherit}
.queue-list{display:grid}
.queue-item{gap:var(--space-3);padding:.7rem 0;border-top:1px solid var(--color-gray-100)}
.queue-item__time{min-width:3.25rem;color:var(--color-text);font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold)}
.queue-item__patient{display:grid;min-width:0;flex:1;gap:.2rem}.queue-item__patient strong{color:var(--color-text);font-size:var(--font-size-sm)}.queue-item__patient span{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.queue-item__wait{display:flex;align-items:center;gap:.35rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);white-space:nowrap}
.queue-empty{display:flex;min-height:5rem;align-items:center;justify-content:center;gap:.6rem;color:var(--color-text-muted);font-size:var(--font-size-sm)}
.checkin-footer{justify-content:space-between;gap:var(--space-3);padding:var(--space-4) 0;color:var(--color-text-muted);font-size:var(--font-size-xs)}.checkin-footer span{display:flex;align-items:center;gap:.4rem}
.checkin-form,.checkin-detail{display:grid;gap:var(--space-4)}
.checkin-notice{margin:0;padding:.75rem;border-radius:var(--radius-sm);background:var(--color-blue-50);color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5}
.checkin-appointment-search{display:grid;gap:.35rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);font-weight:var(--font-weight-medium)}
.checkin-search__control{display:flex;min-height:2.6rem;align-items:center;gap:.5rem;padding-inline:.7rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-muted)}
.checkin-search__control input{width:100%;border:0;outline:0;background:transparent;color:var(--color-text);font:inherit}
.checkin-appointment-select{width:100%;min-height:2.6rem;padding-inline:.65rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:var(--font-size-sm)}
.checkin-confirmation{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin:0;padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md)}
.checkin-confirmation div{min-width:0}.checkin-confirmation dt{color:var(--color-text-muted);font-size:var(--font-size-xs)}.checkin-confirmation dd{margin:.25rem 0 0;overflow-wrap:anywhere;color:var(--color-text);font-size:var(--font-size-sm)}
.checkin-presence{display:flex;align-items:flex-start;gap:.6rem;color:var(--color-text-secondary);font-size:var(--font-size-xs);line-height:1.5;cursor:pointer}
.checkin-form__actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:var(--space-2);padding-top:var(--space-2)}
.checkin-detail__identity{gap:var(--space-3);flex-wrap:wrap}.checkin-detail__identity>div{display:grid;flex:1;gap:.2rem}.checkin-detail__identity>div strong{color:var(--color-text)}.checkin-detail__identity>div span{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1100px){.checkin-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.checkin-table{min-width:880px}.checkin-controls{flex-direction:column}}
@media(max-width:720px){.checkin-main{width:calc(100% - 2 * var(--space-3));padding-block:var(--space-4)}.checkin-intro{align-items:flex-start;flex-direction:column;gap:var(--space-3)}.checkin-intro__actions{width:100%}.checkin-intro__actions>.button{flex:1}.checkin-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2)}.checkin-metric{min-height:5.1rem;padding:var(--space-3)}.checkin-metric__icon{width:2.1rem;height:2.1rem}.checkin-metric strong{font-size:var(--font-size-xl)}.checkin-panel,.queue-panel{padding:var(--space-3)}.checkin-panel__heading{align-items:stretch;flex-direction:column}.checkin-search{width:100%}.checkin-filter-controls{width:100%}.checkin-select{flex:1}.checkin-table-wrap{display:none}.checkin-cards{display:grid;gap:var(--space-3)}.checkin-card{display:grid;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface)}.checkin-card__heading{gap:.55rem;flex-wrap:wrap}.checkin-card__heading>div{display:grid;min-width:0;flex:1;gap:.2rem}.checkin-card__heading>div strong{overflow-wrap:anywhere;color:var(--color-text);font-size:var(--font-size-sm)}.checkin-card__heading>div span{color:var(--color-text-muted);font-size:var(--font-size-xs)}.checkin-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin:0}.checkin-card dt{color:var(--color-text-muted);font-size:.68rem}.checkin-card dd{margin:.15rem 0 0;color:var(--color-text);font-size:var(--font-size-xs)}.checkin-card__actions{flex-wrap:wrap}.checkin-card__actions>*{flex:1}.queue-panel__heading{align-items:flex-start;flex-direction:column}.queue-sort{width:100%}.queue-item{align-items:flex-start;flex-wrap:wrap}.queue-item__patient{min-width:calc(100% - 7rem)}.queue-item__wait{margin-left:4rem}.queue-item>button{margin-left:auto}.checkin-footer{align-items:flex-start;flex-direction:column}}
@media(max-width:420px){.checkin-metrics{grid-template-columns:minmax(0,1fr)}.checkin-filter-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.checkin-filter-controls>.button{grid-column:1/-1}.checkin-date-controls{width:100%}.checkin-date-controls>.button{margin-left:auto}.checkin-confirmation{grid-template-columns:minmax(0,1fr)}.checkin-form__actions>*{flex:1}}
@media(prefers-reduced-motion:reduce){.checkin-page *, .checkin-page *::before,.checkin-page *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
