<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CalendarDays,
  CheckCheck,
  Clock3,
  FileClock,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-vue-next'
import { getApiErrorMessage } from '../services/api'
import { getSessionUser } from '../services/auth-session'
import { getDentistDashboard } from '../services/dentist'
import DentistShell from '../components/DentistShell.vue'
import { dentistNavigationRoutes } from '../router/navigation'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'

const user = ref(getSessionUser())
const router = useRouter()
const clock = ref(new Date())
const dateLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(clock.value),
)
const dateKey = computed(() => toDateInput(clock.value))
const state = ref('loading')
const errorMessage = ref('')
const appointments = ref([])
const search = ref('')
const range = ref('today')
let refreshTimer
let requestId = 0

function toDateInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function dayFromToday(offset) {
  const date = new Date(clock.value)
  date.setDate(date.getDate() + offset)
  return toDateInput(date)
}

function appointmentDate(appointment) {
  return new Date(`${appointment.appointment_date}T${appointment.appointment_time}`)
}

function isCancelled(appointment) {
  return ['Cancelada', 'Reagendada'].includes(appointment.status)
}

function isCheckedIn(appointment) {
  return Boolean(appointment.arrival_at) && appointment.status === 'Em espera'
}

const greeting = computed(() => {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const nameParts = user.value?.name?.trim().split(/\s+/).filter(Boolean) || []
  const hasTitle = /^dr(a)?\.?$/i.test(nameParts[0] || '')
  const firstName = hasTitle ? nameParts[1] : nameParts[0]
  const salutation = hasTitle
    ? nameParts.slice(0, 2).join(' ')
    : firstName
      ? `Dra. ${firstName}`
      : 'doutora'
  return `${period}, ${salutation}`
})

const searchResults = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  if (!term) return appointments.value
  return appointments.value.filter((appointment) =>
    appointment.patient_name.toLocaleLowerCase('pt-BR').includes(term)
    || String(appointment.patient_id).includes(term)
    || String(appointment.id).includes(term),
  )
})

const todayAppointments = computed(() =>
  searchResults.value.filter((appointment) =>
    appointment.appointment_date === dateKey.value && !isCancelled(appointment),
  ),
)
const waitingAppointments = computed(() =>
  todayAppointments.value.filter(isCheckedIn).sort((left, right) =>
    new Date(left.arrival_at) - new Date(right.arrival_at),
  ),
)
const completedAppointments = computed(() =>
  todayAppointments.value.filter((appointment) => appointment.status === 'Concluída'),
)
const futureAppointments = computed(() =>
  searchResults.value
    .filter((appointment) => !isCancelled(appointment) && appointment.status !== 'Concluída')
    .filter((appointment) => appointmentDate(appointment) >= clock.value)
    .filter((appointment) => range.value === 'today'
      ? appointment.appointment_date === dateKey.value
      : range.value === 'tomorrow'
        ? appointment.appointment_date === dayFromToday(1)
        : true,
    ),
)
const nextTodayCount = computed(() =>
  todayAppointments.value.filter((appointment) =>
    appointment.status !== 'Concluída' && appointmentDate(appointment) >= clock.value,
  ).length,
)
const metrics = computed(() => [
  {
    label: 'Consultas de hoje',
    value: state.value === 'ready' ? todayAppointments.value.length : '—',
    caption: 'na sua agenda',
    icon: CalendarDays,
    tone: 'blue',
    target: 'today-schedule',
  },
  {
    label: 'Próximos atendimentos',
    value: state.value === 'ready' ? nextTodayCount.value : '—',
    caption: 'restante do dia',
    icon: Clock3,
    tone: 'violet',
    target: 'upcoming-visits',
  },
  {
    label: 'Pacientes aguardando',
    value: state.value === 'ready' ? waitingAppointments.value.length : '—',
    caption: 'check-in registrado',
    icon: UserRoundCheck,
    tone: 'amber',
    target: 'waiting-list',
  },
  {
    label: 'Atendimentos concluídos',
    value: state.value === 'ready' ? completedAppointments.value.length : '—',
    caption: 'finalizados hoje',
    icon: CheckCheck,
    tone: 'green',
    target: 'recent-visits',
  },
  {
    label: 'Pendências clínicas',
    value: '—',
    caption: 'módulo clínico não integrado',
    icon: FileClock,
    tone: 'slate',
    target: 'clinical-pending',
  },
])

const recentAppointments = ref([])
const recentState = ref('loading')
const recentError = ref('')

async function loadDashboard() {
  const currentRequest = ++requestId
  state.value = appointments.value.length ? 'refreshing' : 'loading'
  recentState.value = recentAppointments.value.length ? 'refreshing' : 'loading'
  const [dashboardResult, recentResult] = await Promise.allSettled([
    getDentistDashboard({ date: dateKey.value, days: 7 }),
    getDentistDashboard({ date: dayFromToday(-6), days: 7 }),
  ])
  if (currentRequest !== requestId) return

  if (dashboardResult.status === 'fulfilled') {
    appointments.value = dashboardResult.value.appointments
    errorMessage.value = ''
    state.value = 'ready'
  } else {
    errorMessage.value = getApiErrorMessage(
      dashboardResult.reason,
      'Não foi possível carregar sua agenda.',
    )
    state.value = 'error'
  }

  if (recentResult.status === 'fulfilled') {
    recentAppointments.value = recentResult.value.appointments
      .filter((appointment) => appointment.status === 'Concluída')
      .sort((left, right) => appointmentDate(right) - appointmentDate(left))
      .slice(0, 5)
    recentState.value = 'ready'
    recentError.value = ''
  } else {
    recentError.value = getApiErrorMessage(
      recentResult.reason,
      'Não foi possível carregar atendimentos recentes.',
    )
    recentState.value = 'error'
  }
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function formatTime(value) {
  return value.slice(0, 5)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    new Date(`${value}T12:00:00`),
  )
}

function waitingTime(value) {
  const minutes = Math.max(0, Math.floor((clock.value.getTime() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'menos de 1 min'
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
  return `${minutes} min`
}

function displayStatus(status) {
  if (status === 'Em espera') return 'Aguardando atendimento'
  return status
}

function statusVariant(status) {
  if (status === 'Concluída') return 'success'
  if (status === 'Em atendimento') return 'info'
  if (status === 'Em espera') return 'warning'
  if (status === 'Cancelada' || status === 'Reagendada') return 'neutral'
  return 'neutral'
}

function openPatientSearch() {
  document.getElementById('patient-search')?.focus()
}

function handleNavigation(page) {
  if (dentistNavigationRoutes[page]) {
    void router.push({ name: dentistNavigationRoutes[page] })
  }
}

function openAgenda() {
  void router.push({ name: 'dentist-agenda' })
}

function openPatients() {
  void router.push({ name: 'dentist-patients' })
}

function refreshSessionUser() {
  user.value = getSessionUser()
}

onMounted(() => {
  void loadDashboard()
  refreshTimer = window.setInterval(() => {
    clock.value = new Date()
    void loadDashboard()
  }, 60_000)
  window.addEventListener('zen:session-changed', refreshSessionUser)
})

onBeforeUnmount(() => {
  requestId += 1
  window.clearInterval(refreshTimer)
  window.removeEventListener('zen:session-changed', refreshSessionUser)
})
</script>

<template>
  <div class="dentist-dashboard">
    <DentistShell
      active-page="overview"
      :date-label="dateLabel"
      @navigate="handleNavigation"
    />

    <main class="dentist-main">
      <section class="dentist-intro" aria-labelledby="dentist-title">
        <div>
          <p class="dentist-eyebrow">PORTAL CLÍNICO</p>
          <p class="dentist-greeting">{{ greeting }}</p>
          <h1 id="dentist-title">Dashboard</h1>
          <p class="dentist-intro__date">{{ dateLabel }}</p>
        </div>
        <label class="dentist-search">
          <Search :size="18" aria-hidden="true" />
          <span class="visually-hidden">Buscar paciente por nome ou código de consulta</span>
          <input
            v-model="search"
            type="search"
            id="patient-search"
            placeholder="Buscar paciente ou código..."
            aria-describedby="search-hint"
          />
          <span id="search-hint" class="visually-hidden">
            Busca limitada aos atendimentos da sua agenda dos próximos sete dias.
          </span>
        </label>
      </section>

      <section class="dentist-quick-actions" aria-labelledby="quick-actions-title">
        <div class="dentist-quick-actions__heading">
          <p class="dentist-kicker">ACESSO RÁPIDO</p>
          <h2 id="quick-actions-title">Ações da rotina</h2>
        </div>
        <div class="dentist-quick-actions__buttons">
          <UiButton variant="secondary" @click="openPatientSearch">
            <template #start><Search :size="16" aria-hidden="true" /></template>
            Localizar paciente na agenda
          </UiButton>
          <UiButton variant="secondary" @click="openAgenda">
            <template #start><CalendarDays :size="16" aria-hidden="true" /></template>
            Abrir agenda
          </UiButton>
          <UiButton variant="secondary" @click="openPatients">
            <template #start><UsersRound :size="16" aria-hidden="true" /></template>
            Consultar pacientes
          </UiButton>
          <UiButton variant="secondary" @click="scrollTo('waiting-list')">
            <template #start><UsersRound :size="16" aria-hidden="true" /></template>
            Ver fila de atendimento
          </UiButton>
        </div>
      </section>

      <div v-if="state === 'error'" class="dentist-error" role="alert">
        <div>
          <strong>Não foi possível carregar o dashboard</strong>
          <p>{{ errorMessage }}</p>
        </div>
        <UiButton variant="secondary" @click="loadDashboard">Tentar novamente</UiButton>
      </div>

      <section class="dentist-metrics" aria-label="Indicadores da rotina clínica">
        <button
          v-for="metric in metrics"
          :key="metric.label"
          class="dentist-metric"
          type="button"
          @click="scrollTo(metric.target)"
        >
          <span class="dentist-metric__icon" :class="`dentist-metric__icon--${metric.tone}`">
            <component :is="metric.icon" :size="19" aria-hidden="true" />
          </span>
          <span class="dentist-metric__body">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.caption }}</small>
          </span>
        </button>
      </section>

      <section class="dentist-panel dentist-agenda" id="today-schedule" aria-labelledby="today-title">
        <div class="dentist-panel__heading">
          <div>
            <p class="dentist-kicker">SUA ROTINA</p>
            <h2 id="today-title">Agenda de hoje</h2>
          </div>
          <span class="dentist-count">{{ todayAppointments.length }} consultas</span>
        </div>

        <div v-if="state === 'loading'" class="dentist-state" role="status">
          Carregando sua agenda...
        </div>
        <div v-else-if="state === 'error'" class="dentist-state">
          Agenda indisponível. Tente novamente para atualizar os dados.
        </div>
        <div v-else-if="!todayAppointments.length" class="dentist-state dentist-state--empty">
          <CalendarDays :size="23" aria-hidden="true" />
          <strong>{{ search ? 'Nenhum atendimento encontrado' : 'Nenhuma consulta para hoje' }}</strong>
          <span>
            {{ search ? 'Tente outro nome ou código dentro dos próximos sete dias.' : 'Sua agenda está livre por enquanto.' }}
          </span>
        </div>
        <div v-else class="dentist-appointment-list">
          <article
            v-for="appointment in todayAppointments"
            :key="appointment.id"
            class="dentist-appointment"
          >
            <div class="dentist-appointment__time">
              <strong>{{ formatTime(appointment.appointment_time) }}</strong>
              <span>{{ appointment.duration_minutes }} min</span>
            </div>
            <span class="dentist-appointment__line" aria-hidden="true"></span>
            <UiAvatar :name="appointment.patient_name" size="sm" />
            <div class="dentist-appointment__person">
              <strong>{{ appointment.patient_name }}</strong>
              <span>{{ appointment.procedure }}</span>
            </div>
            <div class="dentist-appointment__meta">
              <UiBadge :variant="statusVariant(appointment.status)">
                {{ displayStatus(appointment.status) }}
              </UiBadge>
              <span v-if="isCheckedIn(appointment)" class="arrival-indicator">
                <UserRoundCheck :size="14" aria-hidden="true" />
                Chegou às {{ new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.arrival_at)) }}
              </span>
              <span v-else class="arrival-indicator arrival-indicator--muted">
                {{ appointment.confirmation_status || 'Confirmação não informada' }}
              </span>
            </div>
          </article>
        </div>

        <div class="dentist-panel__footer">
          <span>A agenda é atualizada automaticamente a cada minuto.</span>
          <UiButton variant="secondary" @click="openAgenda">
            <template #start><CalendarDays :size="16" aria-hidden="true" /></template>
            Ver agenda completa
          </UiButton>
        </div>
      </section>

      <div class="dentist-secondary-grid">
        <section class="dentist-panel" id="waiting-list" aria-labelledby="waiting-title">
          <div class="dentist-panel__heading">
            <div>
              <p class="dentist-kicker">RECEPÇÃO</p>
              <h2 id="waiting-title">Fila de atendimento</h2>
            </div>
            <span class="dentist-count">{{ waitingAppointments.length }} aguardando</span>
          </div>
          <div v-if="state === 'loading'" class="dentist-state">Carregando fila...</div>
          <div v-else-if="!waitingAppointments.length" class="dentist-state dentist-state--empty">
            <UserRoundCheck :size="22" aria-hidden="true" />
            <strong>Nenhum paciente aguardando atendimento no momento</strong>
            <span>A chegada dos pacientes é atualizada pelo check-in da recepção.</span>
          </div>
          <ul v-else class="dentist-compact-list">
            <li v-for="appointment in waitingAppointments" :key="appointment.id">
              <UiAvatar :name="appointment.patient_name" size="sm" />
              <div class="dentist-compact-list__content">
                <strong>{{ appointment.patient_name }}</strong>
                <span>{{ formatTime(appointment.appointment_time) }} · {{ appointment.procedure }}</span>
              </div>
              <span class="wait-time"><Clock3 :size="14" aria-hidden="true" /> {{ waitingTime(appointment.arrival_at) }}</span>
            </li>
          </ul>
        </section>

        <section class="dentist-panel" id="upcoming-visits" aria-labelledby="upcoming-title">
          <div class="dentist-panel__heading dentist-panel__heading--stack">
            <div>
              <p class="dentist-kicker">AGENDA</p>
              <h2 id="upcoming-title">Próximas consultas</h2>
            </div>
            <div class="dentist-range" role="group" aria-label="Período das próximas consultas">
              <button type="button" :aria-pressed="range === 'today'" @click="range = 'today'">Hoje</button>
              <button type="button" :aria-pressed="range === 'tomorrow'" @click="range = 'tomorrow'">Amanhã</button>
              <button type="button" :aria-pressed="range === 'week'" @click="range = 'week'">7 dias</button>
            </div>
          </div>
          <div v-if="state === 'loading'" class="dentist-state">Carregando próximas consultas...</div>
          <div v-else-if="!futureAppointments.length" class="dentist-state dentist-state--empty">
            <Clock3 :size="22" aria-hidden="true" />
            <strong>Nenhuma consulta neste período</strong>
            <span>Consultas futuras aparecerão aqui quando forem agendadas.</span>
          </div>
          <ul v-else class="dentist-compact-list dentist-compact-list--upcoming">
            <li v-for="appointment in futureAppointments.slice(0, 6)" :key="appointment.id">
              <span class="upcoming-date">
                <strong>{{ appointment.appointment_date === dateKey ? 'Hoje' : formatDate(appointment.appointment_date) }}</strong>
                <span>{{ formatTime(appointment.appointment_time) }}</span>
              </span>
              <div class="dentist-compact-list__content">
                <strong>{{ appointment.patient_name }}</strong>
                <span>{{ appointment.procedure }}</span>
              </div>
              <UiBadge :variant="appointment.confirmation_status === 'Confirmada' ? 'success' : 'neutral'">
                {{ appointment.confirmation_status || 'Sem confirmação' }}
              </UiBadge>
            </li>
          </ul>
          <div class="dentist-panel__footer">
            <span>Exibindo agendamentos autorizados para seu perfil.</span>
          </div>
        </section>
      </div>

      <div class="dentist-bottom-grid">
        <section class="dentist-panel" id="clinical-pending" aria-labelledby="pending-title">
          <div class="dentist-panel__heading">
            <div>
              <p class="dentist-kicker">ATENÇÃO CLÍNICA</p>
              <h2 id="pending-title">Pendências clínicas</h2>
            </div>
            <FileClock :size="19" class="dentist-heading-icon" aria-hidden="true" />
          </div>
          <div class="dentist-integration-note" role="note">
            <ShieldCheck :size="19" aria-hidden="true" />
            <div>
              <strong>Módulo clínico ainda não integrado</strong>
              <p>
                O sistema não disponibiliza prontuários, planos de tratamento ou documentos clínicos
                para este dashboard. Nenhuma pendência é presumida.
              </p>
            </div>
          </div>
        </section>

        <section class="dentist-panel" id="recent-visits" aria-labelledby="recent-title">
          <div class="dentist-panel__heading">
            <div>
              <p class="dentist-kicker">REGISTROS DO DIA</p>
              <h2 id="recent-title">Atendimentos recentes</h2>
            </div>
            <CheckCheck :size="19" class="dentist-heading-icon" aria-hidden="true" />
          </div>
          <div v-if="recentState === 'loading'" class="dentist-state dentist-state--compact" role="status">
            Carregando atendimentos dos últimos sete dias...
          </div>
          <div v-else-if="recentState === 'error'" class="dentist-state dentist-state--compact" role="alert">
            <span>{{ recentError }}</span>
            <UiButton variant="secondary" @click="loadDashboard">Tentar novamente</UiButton>
          </div>
          <div v-else-if="!recentAppointments.length" class="dentist-state dentist-state--compact">
            Ainda não há atendimentos concluídos nos últimos sete dias.
          </div>
          <ul v-else class="dentist-compact-list">
            <li v-for="appointment in recentAppointments" :key="appointment.id">
              <UiAvatar :name="appointment.patient_name" size="sm" />
              <div class="dentist-compact-list__content">
                <strong>{{ appointment.patient_name }}</strong>
                <span>{{ formatDate(appointment.appointment_date) }} · {{ formatTime(appointment.appointment_time) }} · {{ appointment.procedure }}</span>
              </div>
              <UiBadge variant="success">Concluído</UiBadge>
            </li>
          </ul>
          <div class="dentist-panel__footer">
            <span>Últimos sete dias · somente consultas marcadas como concluídas.</span>
          </div>
        </section>
      </div>

    </main>
  </div>
</template>

<style scoped>
.dentist-dashboard {
  min-height: 100vh;
  background: var(--color-page);
}

.dentist-main {
  width: min(100%, 92rem);
  margin-inline: auto;
  padding: clamp(var(--space-5), 3vw, var(--space-10));
}

.dentist-intro {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

.dentist-eyebrow,
.dentist-kicker {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.dentist-greeting {
  margin: 0 0 var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.dentist-intro h1 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  letter-spacing: var(--letter-spacing-tight);
}

.dentist-intro__date {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-transform: capitalize;
}

.dentist-search {
  display: flex;
  width: min(100%, 24rem);
  min-height: 2.9rem;
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.dentist-search:focus-within {
  border-color: var(--color-primary);
  outline: 3px solid var(--color-focus, var(--color-primary));
  outline-offset: 2px;
}

.dentist-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
}

.dentist-search input::placeholder {
  color: var(--color-text-muted);
}

.dentist-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.dentist-metric {
  display: flex;
  min-width: 0;
  min-height: 7.25rem;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.dentist-metric:hover {
  transform: translateY(-1px);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.dentist-metric:focus-visible,
.dentist-range button:focus-visible {
  outline: 3px solid var(--color-focus, var(--color-primary));
  outline-offset: 2px;
}

.dentist-metric__icon {
  display: grid;
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-metric__icon--green { background: var(--color-success-subtle); color: var(--color-success); }
.dentist-metric__icon--amber { background: var(--color-warning-subtle); color: var(--color-warning); }
.dentist-metric__icon--violet { background: var(--color-violet-subtle); color: var(--color-violet); }
.dentist-metric__icon--slate { background: var(--color-background); color: var(--color-text-secondary); }

.dentist-metric__body {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}

.dentist-metric__body > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: 1.35;
}

.dentist-metric__body strong {
  color: var(--color-text);
  font-size: 1.55rem;
  line-height: 1.1;
}

.dentist-metric__body small {
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.35;
}

.dentist-panel {
  min-width: 0;
  padding: clamp(var(--space-4), 2vw, var(--space-6));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  scroll-margin-top: var(--space-6);
}

.dentist-agenda {
  margin-bottom: var(--space-5);
}

.dentist-panel__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.dentist-panel__heading h2,
.dentist-quick-actions h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.dentist-panel__heading .dentist-kicker {
  margin-bottom: var(--space-1);
}

.dentist-count {
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.dentist-appointment-list {
  display: grid;
}

.dentist-appointment {
  display: grid;
  grid-template-columns: 3.3rem 1px 2.25rem minmax(9rem, 1fr) minmax(10rem, auto);
  align-items: center;
  gap: var(--space-4);
  min-height: 5.25rem;
  border-top: 1px solid var(--color-border);
}

.dentist-appointment__time {
  display: grid;
  gap: var(--space-1);
  text-align: right;
}

.dentist-appointment__time strong {
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-variant-numeric: tabular-nums;
}

.dentist-appointment__time span,
.dentist-appointment__person span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.dentist-appointment__line {
  width: 1px;
  height: 2.5rem;
  background: var(--color-border);
}

.dentist-appointment__person,
.dentist-compact-list__content {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}

.dentist-appointment__person strong,
.dentist-compact-list__content strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dentist-appointment__person span,
.dentist-compact-list__content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dentist-appointment__meta {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
}

.arrival-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-success);
  font-size: var(--font-size-xs);
}

.arrival-indicator--muted {
  color: var(--color-text-secondary);
}

.dentist-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.dentist-panel__footer > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.dentist-secondary-grid,
.dentist-bottom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}

.dentist-state {
  display: flex;
  min-height: 6rem;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.dentist-state--empty {
  flex-direction: column;
  padding: var(--space-5);
}

.dentist-state--empty > svg {
  color: var(--color-primary);
}

.dentist-state--empty strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.dentist-state--empty span {
  max-width: 28rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.dentist-state--compact {
  min-height: 4.5rem;
  justify-content: flex-start;
}

.dentist-compact-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dentist-compact-list li {
  display: flex;
  min-width: 0;
  min-height: 4.25rem;
  align-items: center;
  gap: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.dentist-compact-list__content {
  flex: 1;
}

.wait-time {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.upcoming-date {
  display: grid;
  min-width: 3.8rem;
  gap: var(--space-1);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  text-align: center;
}

.upcoming-date span {
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.dentist-range {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.dentist-range button {
  min-height: 2rem;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-xs);
}

.dentist-range button[aria-pressed='true'] {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  font-weight: var(--font-weight-semibold);
}

.dentist-integration-note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-primary);
}

.dentist-integration-note > svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.dentist-integration-note strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.dentist-integration-note p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}

.dentist-heading-icon {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.dentist-quick-actions {
  display: grid;
  grid-template-columns: minmax(12rem, 0.55fr) 1fr;
  align-items: center;
  gap: var(--space-4) var(--space-6);
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.dentist-quick-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.dentist-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-danger-subtle);
  color: var(--color-text);
}

.dentist-error strong {
  font-size: var(--font-size-sm);
}

.dentist-error p {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-sm);
}

@media (max-width: 68rem) {
  .dentist-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 52rem) {
  .dentist-intro {
    align-items: stretch;
    flex-direction: column;
  }

  .dentist-search {
    width: 100%;
  }

  .dentist-secondary-grid,
  .dentist-bottom-grid {
    grid-template-columns: 1fr;
  }

  .dentist-appointment {
    grid-template-columns: 3rem 1px 2.25rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-3);
  }

  .dentist-appointment__meta {
    grid-column: 4;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .dentist-quick-actions {
    grid-template-columns: 1fr;
  }

  .dentist-quick-actions__buttons {
    justify-content: flex-start;
  }

}

@media (max-width: 38rem) {
  .dentist-main {
    padding: var(--space-4);
  }

  .dentist-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .dentist-metric {
    min-height: 6.4rem;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .dentist-metric__icon {
    width: 2rem;
    height: 2rem;
  }

  .dentist-metric__body strong {
    font-size: 1.35rem;
  }

  .dentist-appointment {
    grid-template-columns: 2.8rem 1px minmax(0, 1fr);
    gap: var(--space-2);
  }

  .dentist-appointment > :deep(.avatar) {
    display: none;
  }

  .dentist-appointment__person,
  .dentist-appointment__meta {
    grid-column: 3;
  }

  .dentist-appointment__meta {
    align-items: flex-start;
  }

  .dentist-panel__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .dentist-panel__heading--stack {
    align-items: flex-start;
    flex-direction: column;
  }

  .dentist-compact-list li {
    gap: var(--space-2);
  }

  .dentist-compact-list li > :deep(.badge) {
    max-width: 6.5rem;
    white-space: normal;
  }

  .dentist-quick-actions__buttons {
    align-items: stretch;
    flex-direction: column;
  }

  .dentist-error {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dentist-metric {
    transition: none;
  }
}
</style>
